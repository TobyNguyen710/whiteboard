import { useEffect, useRef } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type Point,
  type ServerToClientEvents,
  type Stroke,
} from "@whiteboard/shared";
import { fitBoard, isOnBoard, screenToBoard, type Viewport } from "./board";
import { PointBatcher } from "./pointBatcher";
import { drawDot, drawLatestSegment, drawStroke, drawStrokeTail } from "./render";
import type { BoardSocket } from "./socket";

const DEFAULT_COLOR = "#1e1e1e";
const DEFAULT_SIZE = 4;
const BOARD_COLOR = "#ffffff";

// Local stand-in; the server tags strokes with the real user ID when relaying them.
const LOCAL_USER_ID = crypto.randomUUID();

type Props = { socket: BoardSocket | null };

export function Canvas({ socket }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 });
  /** Every stroke on the board (local and remote) in drawing order, for redraws. */
  const strokesRef = useRef<Stroke[]>([]);
  // Active local strokes keyed by pointerId, so multi-touch draws several lines at once.
  const activeRef = useRef(new Map<number, Stroke>());
  // Other people's in-progress strokes, keyed by stroke ID.
  const remoteRef = useRef(new Map<string, Stroke>());
  const batcherRef = useRef<PointBatcher | null>(null);

  const getContext = () => canvasRef.current?.getContext("2d") ?? null;

  const toBoardPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return screenToBoard(viewportRef.current, e.clientX - rect.left, e.clientY - rect.top);
  };

  // Size the backing store to the element (sharp on high-DPI screens), fit the board, and redraw.
  // After this, the context draws in logical board coordinates, clipped to the board.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const viewport = fitBoard(width, height);
      viewportRef.current = viewport;
      const k = dpr * viewport.scale;
      ctx.setTransform(k, 0, 0, k, dpr * viewport.offsetX, dpr * viewport.offsetY);

      ctx.fillStyle = BOARD_COLOR;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.beginPath();
      ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.clip();

      for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Send local points in batches, and draw other people's strokes as they arrive.
  useEffect(() => {
    if (!socket) return;

    const batcher = new PointBatcher((strokeId, points) => {
      if (socket.connected) socket.emit("stroke:points", { strokeId, points });
    });
    batcherRef.current = batcher;
    const remote = remoteRef.current;

    const onStart: ServerToClientEvents["stroke:start"] = (p) => {
      const stroke: Stroke = {
        id: p.strokeId,
        userId: p.userId,
        color: p.color,
        size: p.size,
        tool: p.tool,
        points: [p.point],
      };
      remote.set(stroke.id, stroke);
      strokesRef.current.push(stroke);
      const ctx = getContext();
      if (ctx) drawDot(ctx, stroke, p.point);
    };

    const onPoints: ServerToClientEvents["stroke:points"] = (p) => {
      const stroke = remote.get(p.strokeId);
      const ctx = getContext();
      if (!stroke || !ctx) return;
      for (const point of p.points) {
        stroke.points.push(point);
        drawLatestSegment(ctx, stroke);
      }
    };

    const onEnd: ServerToClientEvents["stroke:end"] = (p) => {
      const stroke = remote.get(p.strokeId);
      if (!stroke) return;
      remote.delete(p.strokeId);
      const ctx = getContext();
      if (ctx) drawStrokeTail(ctx, stroke);
    };

    socket.on("stroke:start", onStart);
    socket.on("stroke:points", onPoints);
    socket.on("stroke:end", onEnd);

    return () => {
      socket.off("stroke:start", onStart);
      socket.off("stroke:points", onPoints);
      socket.off("stroke:end", onEnd);
      batcher.dispose();
      batcherRef.current = null;
      remote.clear();
    };
  }, [socket]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const point = toBoardPoint(e);
    if (!isOnBoard(point)) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const stroke: Stroke = {
      id: crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      color: DEFAULT_COLOR,
      size: DEFAULT_SIZE,
      tool: "pen",
      points: [point],
    };
    activeRef.current.set(e.pointerId, stroke);
    strokesRef.current.push(stroke);

    const ctx = getContext();
    if (ctx) drawDot(ctx, stroke, point);

    if (socket?.connected) {
      socket.emit("stroke:start", {
        strokeId: stroke.id,
        color: stroke.color,
        size: stroke.size,
        tool: stroke.tool,
        point,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeRef.current.get(e.pointerId);
    const ctx = getContext();
    if (!stroke || !ctx) return;

    // Coalesced events recover the in-between samples the browser merged into this one.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples = events.length > 0 ? events : [e.nativeEvent];

    for (const sample of samples) {
      const point = toBoardPoint(sample);
      stroke.points.push(point);
      drawLatestSegment(ctx, stroke);
      batcherRef.current?.add(stroke.id, point);
    }
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeRef.current.get(e.pointerId);
    if (!stroke) return;
    activeRef.current.delete(e.pointerId);

    const ctx = getContext();
    if (ctx) drawStrokeTail(ctx, stroke);

    // Points must reach the server before the end, so flush this stroke's batch first.
    batcherRef.current?.flush(stroke.id);
    if (socket?.connected) socket.emit("stroke:end", { strokeId: stroke.id });
  };

  return (
    <canvas
      ref={canvasRef}
      className="board"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onLostPointerCapture={endStroke}
    />
  );
}
