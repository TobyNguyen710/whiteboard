import type {
  Point,
  StrokeEndPayload,
  StrokePointsPayload,
  StrokeStartPayload,
  Tool,
} from "@whiteboard/shared";

// Everything arriving over the socket is untrusted: these return a clean copy, or null if invalid.

export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 200;
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

function parsePoint(v: unknown): Point | null {
  if (!isObject(v) || !isCoordinate(v.x) || !isCoordinate(v.y)) return null;
  return { x: v.x, y: v.y };
}

export function parseStrokeStart(v: unknown): StrokeStartPayload | null {
  if (!isObject(v) || !isStrokeId(v.strokeId) || !isTool(v.tool)) return null;
  if (typeof v.color !== "string" || !COLOR_PATTERN.test(v.color)) return null;
  if (typeof v.size !== "number" || !(v.size >= MIN_BRUSH_SIZE && v.size <= MAX_BRUSH_SIZE)) {
    return null;
  }
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
