import type { Participant } from "./participant.js";
import type { AssignableRole, BoardSettings, Role } from "./roles.js";
import type { BoardElement, NewElement } from "./elements.js";
import type { Point, Tool } from "./types.js";

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
  /** `password` is only needed the first time, on a shared board that has one. */
  "room:join": (payload: { roomId: string; password?: string }) => void;
  "stroke:start": (payload: StrokeStartPayload) => void;
  "stroke:points": (payload: StrokePointsPayload) => void;
  "stroke:end": (payload: StrokeEndPayload) => void;
  /** Add a finished element in one go (text, generated drawings). */
  "element:add": (payload: { element: NewElement }) => void;
  "board:clear": (payload: { roomId: string }) => void;
  /** Undo / redo your own most recent element on the current board. */
  "board:undo": () => void;
  "board:redo": () => void;
  /** Guests can change the name others see. Signed-in users use their account name. */
  "user:rename": (payload: { name: string }) => void;
  /** Rename the board (owner only). */
  "board:rename": (payload: { name: string }) => void;
  /** A fresh preview of the board for dashboards (signed-in users on the board). */
  "board:thumbnail": (payload: { image: string }) => void;
  /** Host only: change someone's role. `participantId` is their connection ID from room:users. */
  "member:set-role": (payload: { participantId: string; role: AssignableRole }) => void;
  /** Host only: take someone off the board; they can't rejoin until allowed back. */
  "member:remove": (payload: { participantId: string }) => void;
  /** Host only: let everyone who was removed join again. */
  "board:allow-removed": () => void;
  /** Host only: change board settings (any subset of fields). */
  "board:update-settings": (payload: Partial<BoardSettings>) => void;
  /** Host: set the board's password, or remove it with null. */
  "board:set-password": (payload: { password: string | null }, done: (result: { ok: boolean }) => void) => void;
}

/** Why the server refused to put you on a board. */
export type RoomErrorReason =
  /** The board is closed: the host hasn't shared it, and you haven't joined it before. */
  | "private"
  /** The board is shared with a password; ask for it. */
  | "password-needed"
  | "password-wrong"
  /** Too many wrong passwords; try again in a minute. */
  | "too-many-tries"
  /** The board doesn't exist, and only signed-in users can create boards. */
  | "not-found"
  /** The host removed you from this board. */
  | "removed";

export interface ServerToClientEvents {
  /**
   * Sent when you join: the board's drawing, its name, your role, and whether the board has a
   * host (boards from before accounts don't).
   */
  "room:state": (payload: {
    elements: BoardElement[];
    name: string;
    role: Role;
    hasHost: boolean;
    settings: BoardSettings;
    hasPassword: boolean;
  }) => void;
  /** Board settings changed. `removedCount` is how many people are currently kept off it. */
  "board:settings": (payload: { settings: BoardSettings; removedCount: number; hasPassword: boolean }) => void;
  /** Your role changed (the host changed it). */
  "member:role": (payload: { role: Role }) => void;
  "board:renamed": (payload: { name: string }) => void;
  /** The owner deleted the board. Everyone on it is removed. */
  "board:deleted": (payload: Record<string, never>) => void;
  "stroke:start": (payload: StrokeStartPayload & { userId: string }) => void;
  "stroke:points": (payload: StrokePointsPayload) => void;
  "stroke:end": (payload: StrokeEndPayload) => void;
  /** Someone added a finished element. */
  "element:added": (payload: { element: BoardElement }) => void;
  "board:cleared": (payload: Record<string, never>) => void;
  /** Everyone on the board (including you). Sent whenever someone joins, leaves, or renames. */
  "room:users": (payload: { count: number; users: Participant[] }) => void;
  "room:error": (payload: { reason: RoomErrorReason }) => void;
  /** An element was undone. Sent to everyone on the board, including its author. */
  "element:removed": (payload: { elementId: string }) => void;
  /** An element was redone. Insert it after afterId (null = at the very bottom) to keep drawing order. */
  "element:restored": (payload: { element: BoardElement; afterId: string | null }) => void;
}
