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
}

export interface ServerToClientEvents {
  "room:state": (payload: { strokes: Stroke[] }) => void;
  "stroke:start": (payload: StrokeStartPayload & { userId: string }) => void;
  "stroke:points": (payload: StrokePointsPayload) => void;
  "stroke:end": (payload: StrokeEndPayload) => void;
  "board:cleared": (payload: Record<string, never>) => void;
  "room:users": (payload: { count: number }) => void;
}
