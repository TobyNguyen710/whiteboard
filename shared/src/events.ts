import type { Point, Stroke, Tool } from "./types.js";

export type StrokeStartPayload = {
  strokeId: string;
  color: string;
  size: number;
  tool: Tool;
  point: Point;
};

export type StrokePointsPayload = { strokeId: string; points: Point[] };

export type StrokeEndPayload = { strokeId: string };

export interface ClientToServerEvents {
  "room:join": (payload: { roomId: string }) => void;
  "stroke:start": (payload: StrokeStartPayload) => void;
  "stroke:points": (payload: StrokePointsPayload) => void;
  "stroke:end": (payload: StrokeEndPayload) => void;
  "board:clear": (payload: { roomId: string }) => void;
  /** Undo / redo your own most recent stroke on the current board. */
  "stroke:undo": () => void;
  "stroke:redo": () => void;
}

export interface ServerToClientEvents {
  "room:state": (payload: { strokes: Stroke[] }) => void;
  "stroke:start": (payload: StrokeStartPayload & { userId: string }) => void;
  "stroke:points": (payload: StrokePointsPayload) => void;
  "stroke:end": (payload: StrokeEndPayload) => void;
  "board:cleared": (payload: Record<string, never>) => void;
  "room:users": (payload: { count: number }) => void;
  /** A stroke was undone. Sent to everyone on the board, including its author. */
  "stroke:removed": (payload: { strokeId: string }) => void;
  /** A stroke was redone. Insert it after afterId (null = at the very bottom) to keep drawing order. */
  "stroke:restored": (payload: { stroke: Stroke; afterId: string | null }) => void;
}
