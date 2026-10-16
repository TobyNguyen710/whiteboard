import { useEffect, useRef } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  type Point,
  type ServerToClientEvents,
  type Stroke,
  type Tool,
} from "@whiteboard/shared";
import { fitBoard, isOnBoard, screenToBoard, type Viewport } from "./board";
import { PointBatcher } from "./pointBatcher";
import { BOARD_COLOR, drawDot, drawLatestSegment, drawStroke, drawStrokeTail } from "./render";
import type { BoardSocket } from "./socket";


/** Smallest brush preview on screen, so tiny brushes on a zoomed-out board stay visible. */
const MIN_CURSOR_DIAMETER = 4;

// Local stand-in; the server tags strokes with the real user ID when relaying them.
const LOCAL_USER_ID = crypto.randomUUID();

type Props = {
  socket: BoardSocket | null;
  /** Tool, color, and brush size for new strokes. */
  tool: Tool;
  color: string;
  size: number;
};

/** Fill the board and draw every stroke. Assumes the context is already in board coordinates. */
function paintBoard(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

export function Canvas({ socket, tool, color, size }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  /** Last hovering mouse/pen position (client px), so the preview can follow brush changes too. */
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const viewportRef = useRef<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 });
  /** Every stroke on the board (local and remote) in drawing order, for redraws. */
  const strokesRef = useRef<Stroke[]>([]);
  // Active local strokes keyed by pointerId, so multi-touch draws several lines at once.
  const activeRef = useRef(new Map<number, Stroke>());
  /** Same strokes as strokesRef, by ID, so incoming points find their stroke. */
  const strokesByIdRef = useRef(new Map<string, Stroke>());
  const batcherRef = useRef<PointBatcher | null>(null);

  const getContext = () => canvasRef.current?.getContext("2d") ?? null;

  const addStroke = (stroke: Stroke) => {
    strokesRef.current.push(stroke);
    strokesByIdRef.current.set(stroke.id, stroke);
  };

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
      ctx.beginPath();
      ctx.rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.clip();

      paintBoard(ctx, strokesRef.current);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Load the board's history on join, send local points in batches, and draw other people's
  // strokes as they arrive.
  useEffect(() => {
    if (!socket) return;

    const batcher = new PointBatcher((strokeId, points) => {
      if (socket.connected) socket.emit("stroke:points", { strokeId, points });
    });
    batcherRef.current = batcher;

    // Sent on every (re)join. The server's history replaces ours, except strokes this tab is
    // drawing right now, which stay on top.
    const onState: ServerToClientEvents["room:state"] = ({ strokes }) => {
      const serverIds = new Set(strokes.map((s) => s.id));
      const drawing = [...activeRef.current.values()].filter((s) => !serverIds.has(s.id));
      strokesRef.current = [...strokes, ...drawing];
      strokesByIdRef.current = new Map(strokesRef.current.map((s) => [s.id, s]));
      const ctx = getContext();
      if (ctx) paintBoard(ctx, strokesRef.current);
    };

    const onStart: ServerToClientEvents["stroke:start"] = (p) => {
      const stroke: Stroke = {
        id: p.strokeId,
        userId: p.userId,
        color: p.color,
        size: p.size,
        tool: p.tool,
        points: [p.point],
      };
      addStroke(stroke);
      const ctx = getContext();
      if (ctx) drawDot(ctx, stroke, p.point);
    };

    // Looks strokes up among all strokes, so ones still in progress when we joined keep growing.
    const onPoints: ServerToClientEvents["stroke:points"] = (p) => {
      const stroke = strokesByIdRef.current.get(p.strokeId);
      const ctx = getContext();
      if (!stroke || !ctx) return;
      for (const point of p.points) {
        stroke.points.push(point);
        drawLatestSegment(ctx, stroke);
      }
    };

    const onEnd: ServerToClientEvents["stroke:end"] = (p) => {
      const stroke = strokesByIdRef.current.get(p.strokeId);
      const ctx = getContext();
      if (stroke && ctx) drawStrokeTail(ctx, stroke);
    };

    // Everyone, including whoever pressed Clear, wipes the board when the server confirms.
    // Strokes mid-draw are dropped too: the server no longer knows them.
    const onCleared: ServerToClientEvents["board:cleared"] = () => {
      strokesRef.current = [];
      strokesByIdRef.current = new Map();
      activeRef.current.clear();
      batcher.dispose();
      const ctx = getContext();
      if (ctx) paintBoard(ctx, []);
    };

    // Undo: drop the stroke and repaint (strokes drawn after it may overlap it, so a full repaint
    // is the simple, correct option). If it's the one we're drawing right now, stop drawing it.
    const onRemoved: ServerToClientEvents["stroke:removed"] = ({ strokeId }) => {
      if (!strokesByIdRef.current.delete(strokeId)) return;
      strokesRef.current = strokesRef.current.filter((s) => s.id !== strokeId);
      for (const [pointerId, s] of activeRef.current) {
        if (s.id === strokeId) activeRef.current.delete(pointerId);
      }
      const ctx = getContext();
      if (ctx) paintBoard(ctx, strokesRef.current);
    };

    // Redo: put the stroke back in its original place in the drawing order, so it layers
    // correctly with strokes and eraser marks drawn after it.
    const onRestored: ServerToClientEvents["stroke:restored"] = ({ stroke, afterId }) => {
      if (strokesByIdRef.current.has(stroke.id)) return;
      const list = strokesRef.current;
      const afterIndex = afterId === null ? -1 : list.findIndex((s) => s.id === afterId);
      const index = afterId !== null && afterIndex < 0 ? list.length : afterIndex + 1;
      list.splice(index, 0, stroke);
      strokesByIdRef.current.set(stroke.id, stroke);
      const ctx = getContext();
      if (ctx) paintBoard(ctx, list);
    };

    socket.on("room:state", onState);
    socket.on("board:cleared", onCleared);
    socket.on("stroke:removed", onRemoved);
    socket.on("stroke:restored", onRestored);
    socket.on("stroke:start", onStart);
    socket.on("stroke:points", onPoints);
    socket.on("stroke:end", onEnd);

    return () => {
      socket.off("room:state", onState);
      socket.off("board:cleared", onCleared);
      socket.off("stroke:removed", onRemoved);
      socket.off("stroke:restored", onRestored);
      socket.off("stroke:start", onStart);
      socket.off("stroke:points", onPoints);
      socket.off("stroke:end", onEnd);
      batcher.dispose();
      batcherRef.current = null;
    };
  }, [socket]);

  // Brush preview: a circle the size the brush will draw, positioned directly via the DOM so it
  // doesn't re-render React on every mouse move. Hidden for touch (no hover) and off the board.
  const updateBrushCursor = () => {
    const cursor = cursorRef.current;
    const canvas = canvasRef.current;
    if (!cursor || !canvas) return;

    const hover = hoverRef.current;
    const onBoard = hover !== null && isOnBoard(toBoardPoint({ clientX: hover.x, clientY: hover.y }));
    cursor.hidden = !onBoard;
    canvas.style.cursor = onBoard ? "none" : "";
    if (!hover || !onBoard) return;

    const diameter = Math.max(size * viewportRef.current.scale, MIN_CURSOR_DIAMETER);
    const isEraser = tool === "eraser";
    cursor.style.width = `${diameter}px`;
    cursor.style.height = `${diameter}px`;
    cursor.style.transform = `translate(${hover.x - diameter / 2}px, ${hover.y - diameter / 2}px)`;
    cursor.classList.toggle("eraser", isEraser);
    cursor.style.borderColor = isEraser ? "" : color;
    cursor.style.backgroundColor = isEraser ? "" : `${color}26`; // ~15% opacity
  };

  // Re-style the preview when the brush changes while the mouse is still.
  useEffect(updateBrushCursor, [tool, color, size]);

  const trackHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    hoverRef.current = e.pointerType === "touch" ? null : { x: e.clientX, y: e.clientY };
    updateBrushCursor();
  };

  const handlePointerLeave = () => {
    hoverRef.current = null;
    updateBrushCursor();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    trackHover(e);
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const point = toBoardPoint(e);
    if (!isOnBoard(point)) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const stroke: Stroke = {
      id: crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      color,
      size,
      tool,
      points: [point],
    };
    activeRef.current.set(e.pointerId, stroke);
    addStroke(stroke);

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
    trackHover(e);
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
    <>
      <canvas
        ref={canvasRef}
        className="board"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onLostPointerCapture={endStroke}
        onPointerLeave={handlePointerLeave}
      />
      <div ref={cursorRef} className="brush-cursor" hidden aria-hidden="true" />
    </>
  );
}
