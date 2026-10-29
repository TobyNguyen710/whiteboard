import type { Participant } from "./participant.js";
import type { AssignableRole, Role } from "./roles.js";
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
  /** Guests can change the name others see. Signed-in users use their account name. */
  "user:rename": (payload: { name: string }) => void;
  /** Rename the board (owner only). */
  "board:rename": (payload: { name: string }) => void;
  /** A fresh preview of the board for dashboards (signed-in users on the board). */
  "board:thumbnail": (payload: { image: string }) => void;
  /** Host only: change someone's role. `participantId` is their connection ID from room:users. */
  "member:set-role": (payload: { participantId: string; role: AssignableRole }) => void;
}

/** Why the server refused to put you on a board. */
export type RoomErrorReason =
  /** The board doesn't exist, and only signed-in users can create boards. */
  "not-found";

export interface ServerToClientEvents {
  /**
   * Sent when you join: the board's drawing, its name, your role, and whether the board has a
   * host (boards from before accounts don't).
   */
  "room:state": (payload: { strokes: Stroke[]; name: string; role: Role; hasHost: boolean }) => void;
  /** Your role changed (the host changed it). */
  "member:role": (payload: { role: Role }) => void;
  "board:renamed": (payload: { name: string }) => void;
  /** The owner deleted the board. Everyone on it is removed. */
  "board:deleted": (payload: Record<string, never>) => void;
  "stroke:start": (payload: StrokeStartPayload & { userId: string }) => void;
  "stroke:points": (payload: StrokePointsPayload) => void;
  "stroke:end": (payload: StrokeEndPayload) => void;
  "board:cleared": (payload: Record<string, never>) => void;
  /** Everyone on the board (including you). Sent whenever someone joins, leaves, or renames. */
  "room:users": (payload: { count: number; users: Participant[] }) => void;
  "room:error": (payload: { reason: RoomErrorReason }) => void;
  /** A stroke was undone. Sent to everyone on the board, including its author. */
  "stroke:removed": (payload: { strokeId: string }) => void;
  /** A stroke was redone. Insert it after afterId (null = at the very bottom) to keep drawing order. */
  "stroke:restored": (payload: { stroke: Stroke; afterId: string | null }) => void;
}
