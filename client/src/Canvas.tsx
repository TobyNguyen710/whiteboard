import { useEffect, useRef } from "react";
import type { Point, Stroke } from "@whiteboard/shared";

const DEFAULT_COLOR = "#1e1e1e";
const DEFAULT_SIZE = 4;

// Local stand-in until the server assigns IDs.
const LOCAL_USER_ID = crypto.randomUUID();

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function drawDot(ctx: CanvasRenderingContext2D, stroke: Stroke, p: Point) {
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSegment(ctx: CanvasRenderingContext2D, stroke: Stroke, from: Point, to: Point) {
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const [first, ...rest] = stroke.points;
  if (!first) return;
  if (rest.length === 0) {
    drawDot(ctx, stroke, first);
    return;
  }
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (const p of rest) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  // Active strokes keyed by pointerId, so multi-touch draws several lines at once.
  const activeRef = useRef(new Map<number, Stroke>());

  const getContext = () => canvasRef.current?.getContext("2d") ?? null;

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Match the backing store to the element size (sharp on high-DPI screens) and redraw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const stroke of strokesRef.current) drawStroke(ctx, stroke);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const point = toPoint(e);
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
      const point = toPoint(sample);
      const prev = stroke.points[stroke.points.length - 1];
      stroke.points.push(point);
      if (prev) drawSegment(ctx, stroke, prev, point);
    }
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activeRef.current.delete(e.pointerId);
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
