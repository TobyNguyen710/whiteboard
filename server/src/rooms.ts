import type { Point, Stroke, StrokeStartPayload } from "@whiteboard/shared";

export const MAX_STROKES_PER_ROOM = 10_000;
export const MAX_POINTS_PER_STROKE = 20_000;
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
  emptySince: number | null;
};

/** In-memory boards. Holds no socket code so the logic can be tested on its own. */
export class RoomStore {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly now: () => number = Date.now) {}

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  get size(): number {
    return this.rooms.size;
  }

  join(roomId: string, userId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        id: roomId,
        strokes: [],
        users: new Set(),
        activeStrokeIds: new Set(),
        strokesById: new Map(),
        emptySince: null,
      };
      this.rooms.set(roomId, room);
    }
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
    if (room.users.size === 0) room.emptySince = this.now();
  }

  startStroke(roomId: string, userId: string, payload: StrokeStartPayload): Stroke | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.users.has(userId)) return null;
    if (room.strokesById.has(payload.strokeId)) return null;
    if (room.strokes.length >= MAX_STROKES_PER_ROOM) return null;

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
    return stroke;
  }

  /** Append points to the user's in-progress stroke. Returns the points accepted (may be trimmed), or null. */
  addPoints(roomId: string, userId: string, strokeId: string, points: Point[]): Point[] | null {
    const stroke = this.getActiveStroke(roomId, userId, strokeId);
    if (!stroke) return null;

    const accepted = points.slice(0, MAX_POINTS_PER_STROKE - stroke.points.length);
    if (accepted.length === 0) return null;
    stroke.points.push(...accepted);
    return accepted;
  }

  endStroke(roomId: string, userId: string, strokeId: string): boolean {
    if (!this.getActiveStroke(roomId, userId, strokeId)) return false;
    this.rooms.get(roomId)!.activeStrokeIds.delete(strokeId);
    return true;
  }

  /** Delete boards that have been empty longer than the TTL. Returns the deleted IDs. */
  sweep(): string[] {
    const cutoff = this.now() - EMPTY_ROOM_TTL_MS;
    const deleted: string[] = [];
    for (const [id, room] of this.rooms) {
      if (room.emptySince !== null && room.emptySince <= cutoff) {
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
}
