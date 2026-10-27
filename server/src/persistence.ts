import type { Stroke } from "@whiteboard/shared";
import type { RoomStore } from "./rooms.js";

export type SavedBoard = { strokes: Stroke[]; ownerId?: string | null };

/** Where boards are saved. Supabase in production; in memory for tests. */
export interface BoardStore {
  /** The saved board, or null if it was never saved. Throws if the store can't be reached. */
  load(boardId: string): Promise<SavedBoard | null>;
  save(boardId: string, board: SavedBoard): Promise<void>;
  /** Cheap request that throws if the store can't be reached. */
  ping(): Promise<void>;
}

/** Keeps saved boards as JSON strings, so callers can't mutate stored data by accident. */
export class MemoryBoardStore implements BoardStore {
  readonly boards = new Map<string, string>();

  async load(boardId: string): Promise<SavedBoard | null> {
    const json = this.boards.get(boardId);
    return json ? (JSON.parse(json) as SavedBoard) : null;
  }

  async save(boardId: string, board: SavedBoard): Promise<void> {
    this.boards.set(boardId, JSON.stringify(board));
  }

  async ping(): Promise<void> {}
}

/**
 * Loads boards into the RoomStore when first opened and saves changed boards back. Saving is
 * batched (call flush() on a timer) instead of on every point, so drawing stays fast.
 */
export class BoardSaver {
  /** Room ID -> revision that's safely in the store. */
  private readonly savedRevisions = new Map<string, number>();
  /** Boards whose load failed. Never saved, so an empty copy can't overwrite the real one. */
  private readonly unsaveable = new Set<string>();
  private readonly loading = new Map<string, Promise<void>>();
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly store: BoardStore | null,
    private readonly rooms: RoomStore,
    private readonly log: (message: string) => void = console.log,
  ) {}

  get enabled(): boolean {
    return this.store !== null;
  }

  /** Make sure the board is in memory, loading it from the store the first time. */
  ensureLoaded(roomId: string): Promise<void> {
    if (!this.store || this.rooms.get(roomId)) return Promise.resolve();
    // Two people opening the same board at once share a single load.
    let pending = this.loading.get(roomId);
    if (!pending) {
      pending = this.load(this.store, roomId).finally(() => this.loading.delete(roomId));
      this.loading.set(roomId, pending);
    }
    return pending;
  }

  private async load(store: BoardStore, roomId: string): Promise<void> {
    try {
      const saved = await store.load(roomId);
      const room = this.rooms.create(roomId, saved?.strokes ?? [], {
        ownerId: saved?.ownerId ?? null,
        isNew: saved === null,
      });
      this.savedRevisions.set(roomId, room.revision);
    } catch (error) {
      this.log(`could not load board ${roomId}, it won't be saved this session: ${describe(error)}`);
      this.rooms.create(roomId);
      this.unsaveable.add(roomId);
    }
  }

  /** Save every board that changed since its last save. Concurrent calls share one run. */
  flush(): Promise<void> {
    if (!this.store) return Promise.resolve();
    this.flushing ??= this.saveChanged(this.store).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async saveChanged(store: BoardStore): Promise<void> {
    for (const room of [...this.rooms.all()]) {
      if (this.unsaveable.has(room.id)) continue;
      const revision = room.revision;
      if (this.savedRevisions.get(room.id) === revision) continue;

      // Snapshot now: drawing continues while the save is in flight.
      const snapshot: SavedBoard = { strokes: structuredClone(room.strokes), ownerId: room.ownerId };
      try {
        await store.save(room.id, snapshot);
        this.savedRevisions.set(room.id, revision);
      } catch (error) {
        this.log(`could not save board ${room.id}, will retry: ${describe(error)}`);
      }
    }
  }

  /** True if the board can be dropped from memory without losing changes. */
  canEvict(roomId: string): boolean {
    if (!this.store || this.unsaveable.has(roomId)) return true;
    return this.savedRevisions.get(roomId) === this.rooms.get(roomId)?.revision;
  }

  /** Forget bookkeeping for boards dropped from memory (they'll be loaded again next time). */
  forget(roomIds: string[]): void {
    for (const id of roomIds) {
      this.savedRevisions.delete(id);
      this.unsaveable.delete(id);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
