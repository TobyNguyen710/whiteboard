import { useEffect, useRef } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Point, type Stroke } from "@whiteboard/shared";
import { fitBoard, isOnBoard, screenToBoard, type Viewport } from "./board";
import { drawDot, drawLatestSegment, drawStroke, drawStrokeTail } from "./render";

const DEFAULT_COLOR = "#1e1e1e";
const DEFAULT_SIZE = 4;
const BOARD_COLOR = "#ffffff";

// Local stand-in until the server assigns IDs.
const LOCAL_USER_ID = crypto.randomUUID();

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 });
  const strokesRef = useRef<Stroke[]>([]);
  // Active strokes keyed by pointerId, so multi-touch draws several lines at once.
  const activeRef = useRef(new Map<number, Stroke>());

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
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeRef.current.get(e.pointerId);
    const ctx = getContext();
    if (!stroke || !ctx) return;

    // Coalesced events recover the in-between samples the browser merged into this one.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples = events.length > 0 ? events : [e.nativeEvent];

    for (const sample of samples) {
      stroke.points.push(toBoardPoint(sample));
      drawLatestSegment(ctx, stroke);
    }
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeRef.current.get(e.pointerId);
    if (!stroke) return;
    activeRef.current.delete(e.pointerId);

    const ctx = getContext();
    if (ctx) drawStrokeTail(ctx, stroke);
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
