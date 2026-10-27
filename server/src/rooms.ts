import type { Point, Stroke, StrokeStartPayload } from "@whiteboard/shared";

export const MAX_STROKES_PER_ROOM = 10_000;
export const MAX_POINTS_PER_STROKE = 20_000;
/** Caps a board's total size (~4 MB saved), so saves and late-join loads stay reasonable. */
export const MAX_POINTS_PER_ROOM = 200_000;
/** Empty boards are kept this long so a refresh or a quick reconnect doesn't wipe them. */
export const EMPTY_ROOM_TTL_MS = 10 * 60_000;

export type Room = {
  id: string;
  /** Full history in drawing order, including strokes still in progress. */
  strokes: Stroke[];
  users: Set<string>;
  /** IDs of strokes still being drawn. */
  activeStrokeIds: Set<string>;
  strokesById: Map<string, Stroke>;
  /** Drawing-order position of every stroke on the board or waiting to be redone. */
  seqById: Map<string, number>;
  nextSeq: number;
  /** Per user: IDs of their strokes, oldest first, that Ctrl+Z can remove. */
  undoStacks: Map<string, string[]>;
  /** Per user: their undone strokes, most recent last, that Ctrl+Y can bring back. */
  redoStacks: Map<string, Stroke[]>;
  /** Total points across `strokes`. */
  pointCount: number;
  /** Bumped on every change to `strokes` or the owner, so the saver can tell what needs saving. */
  revision: number;
  /** Account that created the board, or null (created before login existed, or memory-only). */
  ownerId: string | null;
  /**
   * True for a board that has never been saved and nobody signed in has opened yet. When an
   * account is required to create boards, guests can't join these (the board doesn't exist).
   */
  isNew: boolean;
  emptySince: number | null;
};

export type RestoredStroke = { stroke: Stroke; afterId: string | null };

/** In-memory boards. Holds no socket or database code so the logic can be tested on its own. */
export class RoomStore {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly now: () => number = Date.now) {}

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  get size(): number {
    return this.rooms.size;
  }

  all(): IterableIterator<Room> {
    return this.rooms.values();
  }

  /** Create a board in memory, optionally from a saved one. Replaces nothing if it exists. */
  create(
    roomId: string,
    strokes: Stroke[] = [],
    { ownerId = null, isNew = false }: { ownerId?: string | null; isNew?: boolean } = {},
  ): Room {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;

    const room: Room = {
      id: roomId,
      strokes: [...strokes],
      users: new Set(),
      activeStrokeIds: new Set(),
      strokesById: new Map(strokes.map((s) => [s.id, s])),
      seqById: new Map(),
      nextSeq: 0,
      undoStacks: new Map(),
      redoStacks: new Map(),
      pointCount: strokes.reduce((sum, s) => sum + s.points.length, 0),
      revision: 0,
      ownerId,
      isNew,
      emptySince: this.now(),
    };
    for (const stroke of strokes) room.seqById.set(stroke.id, room.nextSeq++);
    this.rooms.set(roomId, room);
    return room;
  }

  join(roomId: string, userId: string): Room {
    const room = this.create(roomId);
    room.users.add(userId);
    room.emptySince = null;
    return room;
  }

  leave(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || !room.users.delete(userId)) return;

    // Strokes the user was still drawing are finished as they are.
    for (const strokeId of room.activeStrokeIds) {
      if (room.strokesById.get(strokeId)?.userId === userId) room.activeStrokeIds.delete(strokeId);
    }
    // User IDs are per connection, so this user's undo history can never be used again.
    room.undoStacks.delete(userId);
    this.dropRedoStack(room, userId);
    if (room.users.size === 0) room.emptySince = this.now();
  }

  startStroke(roomId: string, userId: string, payload: StrokeStartPayload): Stroke | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.users.has(userId)) return null;
    if (room.strokesById.has(payload.strokeId) || room.seqById.has(payload.strokeId)) return null;
    if (room.strokes.length >= MAX_STROKES_PER_ROOM) return null;
    if (room.pointCount >= MAX_POINTS_PER_ROOM) return null;

    const stroke: Stroke = {
      id: payload.strokeId,
      userId,
      color: payload.color,
      size: payload.size,
      tool: payload.tool,
      points: [payload.point],
    };
    room.strokes.push(stroke);
    room.strokesById.set(stroke.id, stroke);
    room.activeStrokeIds.add(stroke.id);
    room.seqById.set(stroke.id, room.nextSeq++);
    room.pointCount += 1;
    room.revision++;

    // A new stroke starts a new branch of history: what you undid can't be redone anymore.
    this.stackFor(room.undoStacks, userId).push(stroke.id);
    this.dropRedoStack(room, userId);
    return stroke;
  }

  /** Append points to the user's in-progress stroke. Returns the points accepted (may be trimmed), or null. */
  addPoints(roomId: string, userId: string, strokeId: string, points: Point[]): Point[] | null {
    const room = this.rooms.get(roomId);
    const stroke = this.getActiveStroke(roomId, userId, strokeId);
    if (!room || !stroke) return null;

    const roomLeft = MAX_POINTS_PER_ROOM - room.pointCount;
    const strokeLeft = MAX_POINTS_PER_STROKE - stroke.points.length;
    const accepted = points.slice(0, Math.min(roomLeft, strokeLeft));
    if (accepted.length === 0) return null;
    stroke.points.push(...accepted);
    room.pointCount += accepted.length;
    room.revision++;
    return accepted;
  }

  endStroke(roomId: string, userId: string, strokeId: string): boolean {
    if (!this.getActiveStroke(roomId, userId, strokeId)) return false;
    this.rooms.get(roomId)!.activeStrokeIds.delete(strokeId);
    return true;
  }

  /** Remove the user's most recent stroke still on the board. Returns its ID, or null if nothing to undo. */
  undo(roomId: string, userId: string): string | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.users.has(userId)) return null;

    const undoStack = room.undoStacks.get(userId) ?? [];
    while (undoStack.length > 0) {
      const strokeId = undoStack.pop()!;
      const stroke = room.strokesById.get(strokeId);
      if (!stroke) continue; // already gone (e.g. cleared)

      // Undoing mid-stroke ends it; any points still arriving for it are ignored.
      room.activeStrokeIds.delete(strokeId);
      room.strokesById.delete(strokeId);
      room.strokes.splice(room.strokes.indexOf(stroke), 1);
      room.pointCount -= stroke.points.length;
      room.revision++;
      this.stackFor(room.redoStacks, userId).push(stroke);
      return strokeId;
    }
    return null;
  }

  /** Put the user's most recently undone stroke back in its original drawing position. */
  redo(roomId: string, userId: string): RestoredStroke | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.users.has(userId)) return null;
    if (room.strokes.length >= MAX_STROKES_PER_ROOM) return null;

    const redoStack = room.redoStacks.get(userId);
    const stroke = redoStack?.at(-1);
    if (!redoStack || !stroke) return null;
    if (room.pointCount + stroke.points.length > MAX_POINTS_PER_ROOM) return null;
    redoStack.pop();

    const seq = room.seqById.get(stroke.id)!;
    let index = room.strokes.length;
    while (index > 0 && room.seqById.get(room.strokes[index - 1]!.id)! > seq) index--;

    room.strokes.splice(index, 0, stroke);
    room.strokesById.set(stroke.id, stroke);
    room.pointCount += stroke.points.length;
    room.revision++;
    this.stackFor(room.undoStacks, userId).push(stroke.id);
    return { stroke, afterId: index > 0 ? room.strokes[index - 1]!.id : null };
  }

  /** Wipe a board's history, including strokes still being drawn. Only someone on the board can. */
  clear(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.users.has(userId)) return false;
    room.strokes = [];
    room.strokesById.clear();
    room.activeStrokeIds.clear();
    room.seqById.clear();
    // Clearing resets everyone's undo/redo: there is nothing left to step back through.
    room.undoStacks.clear();
    room.redoStacks.clear();
    room.pointCount = 0;
    room.revision++;
    return true;
  }

  /** A signed-in user creates a new board by opening it: they become its owner. */
  claim(roomId: string, ownerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.isNew) return false;
    room.isNew = false;
    room.ownerId = ownerId;
    room.revision++; // save the (possibly still empty) board so it exists from now on
    return true;
  }

  /**
   * Delete boards that have been empty longer than the TTL. `canEvict` lets the saver keep
   * boards with unsaved changes in memory. Returns the deleted IDs.
   */
  sweep(canEvict: (roomId: string) => boolean = () => true): string[] {
    const cutoff = this.now() - EMPTY_ROOM_TTL_MS;
    const deleted: string[] = [];
    for (const [id, room] of this.rooms) {
      if (room.emptySince !== null && room.emptySince <= cutoff && canEvict(id)) {
        this.rooms.delete(id);
        deleted.push(id);
      }
    }
    return deleted;
  }

  private getActiveStroke(roomId: string, userId: string, strokeId: string): Stroke | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.activeStrokeIds.has(strokeId)) return null;
    const stroke = room.strokesById.get(strokeId);
    return stroke?.userId === userId ? stroke : null;
  }

  private stackFor<T>(stacks: Map<string, T[]>, userId: string): T[] {
    let stack = stacks.get(userId);
    if (!stack) {
      stack = [];
      stacks.set(userId, stack);
    }
    return stack;
  }

  /** Forget a user's undone strokes for good. */
  private dropRedoStack(room: Room, userId: string): void {
    for (const stroke of room.redoStacks.get(userId) ?? []) room.seqById.delete(stroke.id);
    room.redoStacks.delete(userId);
  }
}
