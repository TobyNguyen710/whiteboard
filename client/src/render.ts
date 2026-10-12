import type { Point, Stroke } from "@whiteboard/shared";

// Strokes are smoothed with quadratic curves: each point is a control point and the curve
// passes through the midpoints between neighbours. drawStroke (full redraw) and the incremental
// drawLatestSegment + drawStrokeTail produce exactly the same path.

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

export function drawDot(ctx: CanvasRenderingContext2D, stroke: Stroke, p: Point) {
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Start of the curve segment controlled by points[i]. */
function segmentStart(points: Point[], i: number): Point {
  return i === 1 ? points[0]! : mid(points[i - 1]!, points[i]!);
}

/** Draw a whole stroke from scratch. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { points } = stroke;
  const first = points[0];
  if (!first) return;
  if (points.length === 1) {
    drawDot(ctx, stroke, first);
    return;
  }

  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i]!;
    const end = mid(control, points[i + 1]!);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
  }
  const last = points[points.length - 1]!;
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** Draw the curve segment made possible by the point just appended to an in-progress stroke. */
export function drawLatestSegment(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { points } = stroke;
  if (points.length < 3) return;

  const i = points.length - 2;
  const start = segmentStart(points, i);
  const control = points[i]!;
  const end = mid(control, points[i + 1]!);

  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
  ctx.stroke();
}

/** Finish an in-progress stroke: the straight tail from the last midpoint to the final point. */
export function drawStrokeTail(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { points } = stroke;
  if (points.length < 2) return;

  const last = points[points.length - 1]!;
  const start = points.length === 2 ? points[0]! : mid(points[points.length - 2]!, last);

  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}
