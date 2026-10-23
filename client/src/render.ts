import { CANVAS_HEIGHT, CANVAS_WIDTH, type Point, type Stroke } from "@whiteboard/shared";

// Strokes are smoothed with quadratic curves: each point is a control point and the curve
// passes through the midpoints between neighbours. drawStroke (full redraw) and the incremental
// drawLatestSegment + drawStrokeTail produce exactly the same path.

export const BOARD_COLOR = "#ffffff";

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  // The eraser paints the board color, so it replays in order like any other stroke.
  const color = stroke.tool === "eraser" ? BOARD_COLOR : stroke.color;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
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

/** Fill the board and draw every stroke. Assumes the context is already in board coordinates. */
export function paintBoard(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  for (const stroke of strokes) drawStroke(ctx, stroke);
}

/** Small JPEG of the whole board (for dashboard cards), drawn from the strokes, not the screen. */
export function renderThumbnail(strokes: Stroke[], width = 320): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((width * CANVAS_HEIGHT) / CANVAS_WIDTH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.scale(width / CANVAS_WIDTH, width / CANVAS_WIDTH);
  paintBoard(ctx, strokes);
  return canvas.toDataURL("image/jpeg", 0.7);
}
