import {
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  type Point,
  type Stroke,
  type StrokeEndPayload,
  type StrokePointsPayload,
  type StrokeStartPayload,
  type Tool,
} from "@whiteboard/shared";

// Everything arriving over the socket is untrusted: these return a clean copy, or null if invalid.

export const MAX_POINTS_PER_BATCH = 1000;
const MAX_COORDINATE = 10_000;
const MAX_STROKE_ID_LENGTH = 64;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const TOOLS: readonly Tool[] = ["pen", "eraser"];

type Unknown = Record<string, unknown>;

const isObject = (v: unknown): v is Unknown => typeof v === "object" && v !== null;

const isCoordinate = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_COORDINATE;

const isStrokeId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_STROKE_ID_LENGTH;

const isTool = (v: unknown): v is Tool => TOOLS.includes(v as Tool);

const isBrushSize = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= MIN_BRUSH_SIZE && (v as number) <= MAX_BRUSH_SIZE;

/** Round to 0.1 board px: invisible on screen, and keeps stored boards and messages small. */
const round = (n: number) => Math.round(n * 10) / 10;

function parsePoint(v: unknown): Point | null {
  if (!isObject(v) || !isCoordinate(v.x) || !isCoordinate(v.y)) return null;
  return { x: round(v.x), y: round(v.y) };
}

export function parseStrokeStart(v: unknown): StrokeStartPayload | null {
  if (!isObject(v) || !isStrokeId(v.strokeId) || !isTool(v.tool)) return null;
  if (typeof v.color !== "string" || !COLOR_PATTERN.test(v.color)) return null;
  if (!isBrushSize(v.size)) return null;
  const point = parsePoint(v.point);
  if (!point) return null;
  return { strokeId: v.strokeId, color: v.color, size: v.size, tool: v.tool, point };
}

export function parseStrokePoints(v: unknown): StrokePointsPayload | null {
  if (!isObject(v) || !isStrokeId(v.strokeId) || !Array.isArray(v.points)) return null;
  if (v.points.length === 0 || v.points.length > MAX_POINTS_PER_BATCH) return null;

  const points: Point[] = [];
  for (const raw of v.points) {
    const point = parsePoint(raw);
    if (!point) return null;
    points.push(point);
  }
  return { strokeId: v.strokeId, points };
}

export function parseStrokeEnd(v: unknown): StrokeEndPayload | null {
  if (!isObject(v) || !isStrokeId(v.strokeId)) return null;
  return { strokeId: v.strokeId };
}

/**
 * Strokes loaded from the database. Our own data, but checked anyway so a bad row can't crash
 * the server or reach clients: invalid strokes are dropped, the rest are kept.
 */
export function parseStoredStrokes(v: unknown): Stroke[] {
  if (!Array.isArray(v)) return [];
  const strokes: Stroke[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (!isObject(raw) || !isStrokeId(raw.id) || seen.has(raw.id)) continue;
    if (typeof raw.userId !== "string" || !isTool(raw.tool) || !isBrushSize(raw.size)) continue;
    if (typeof raw.color !== "string" || !COLOR_PATTERN.test(raw.color)) continue;
    if (!Array.isArray(raw.points) || raw.points.length === 0) continue;
    const points = raw.points.map(parsePoint);
    if (points.some((p) => p === null)) continue;
    seen.add(raw.id);
    strokes.push({
      id: raw.id,
      userId: raw.userId,
      color: raw.color,
      size: raw.size,
      tool: raw.tool,
      points: points as Point[],
    });
  }
  return strokes;
}
