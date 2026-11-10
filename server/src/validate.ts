import {
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
  type BoardElement,
  type NewElement,
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

/** A whole stroke's fields, minus its ID and author. Null if any are invalid. */
function parseStrokeBody(raw: Unknown, maxPoints: number): Omit<Stroke, "id" | "userId"> | null {
  if (!isTool(raw.tool) || !isBrushSize(raw.size)) return null;
  if (typeof raw.color !== "string" || !COLOR_PATTERN.test(raw.color)) return null;
  if (!Array.isArray(raw.points) || raw.points.length === 0 || raw.points.length > maxPoints) return null;
  const points: Point[] = [];
  for (const p of raw.points) {
    const point = parsePoint(p);
    if (!point) return null;
    points.push(point);
  }
  return { type: "stroke", color: raw.color, size: raw.size, tool: raw.tool, points };
}

/**
 * A finished element sent in one piece (element:add). Its author is filled in by the server, so
 * any `userId` sent is ignored. Only strokes exist so far; other kinds come with v3.
 */
export function parseNewElement(v: unknown): NewElement | null {
  if (!isObject(v) || !isObject(v.element)) return null;
  const raw = v.element;
  if (!isStrokeId(raw.id) || raw.type !== "stroke") return null;
  const body = parseStrokeBody(raw, MAX_POINTS_PER_BATCH);
  return body ? { ...body, id: raw.id } : null;
}

/**
 * Elements loaded from the database. Our own data, but checked anyway so a bad row can't crash
 * the server or reach clients: invalid elements are dropped, the rest are kept. Boards saved
 * before elements had a `type` hold only strokes, so a missing type means a stroke.
 */
export function parseStoredElements(v: unknown): BoardElement[] {
  if (!Array.isArray(v)) return [];
  const elements: BoardElement[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (!isObject(raw) || !isStrokeId(raw.id) || seen.has(raw.id) || typeof raw.userId !== "string") continue;
    if (raw.type !== undefined && raw.type !== "stroke") continue;
    const body = parseStrokeBody(raw, Number.POSITIVE_INFINITY);
    if (!body) continue;
    seen.add(raw.id);
    elements.push({ ...body, id: raw.id, userId: raw.userId });
  }
  return elements;
}
