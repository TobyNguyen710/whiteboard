import { DEFAULT_BOARD_NAME, type AssignableRole, type Stroke } from "@whiteboard/shared";
import type { RoomStore } from "./rooms.js";

export type SavedBoard = {
  strokes: Stroke[];
  ownerId?: string | null;
  name?: string;
  thumbnail?: string | null;
  /** Roles the host gave signed-in members, by account ID (only non-default roles). */
  memberRoles?: Record<string, AssignableRole>;
};

/** Just enough to check permissions without loading the drawing. */
export type BoardMeta = { ownerId: string | null; name: string };

/** Where boards are saved. Supabase in production; in memory for tests. */
export interface BoardStore {
  /** The saved board, or null if it was never saved. Throws if the store can't be reached. */
  load(boardId: string): Promise<SavedBoard | null>;
  save(boardId: string, board: SavedBoard): Promise<void>;
  /** Owner and name, or null if the board doesn't exist. */
  loadMeta(boardId: string): Promise<BoardMeta | null>;
  rename(boardId: string, name: string): Promise<void>;
  /** Delete the board (and, with it, everyone's membership). */
  remove(boardId: string): Promise<void>;
  /** Remember that this account opened this board, now. The board must already be saved. */
  recordVisit(boardId: string, userId: string): Promise<void>;
  /** Take the board off this account's lists (it reappears if they open it again). */
  removeMember(boardId: string, userId: string): Promise<void>;
  /** Save a signed-in member's role on a board. */
  setMemberRole(boardId: string, userId: string, role: AssignableRole): Promise<void>;
  /** Cheap request that throws if the store can't be reached. */
  ping(): Promise<void>;
}

/** Keeps saved boards as JSON strings, so callers can't mutate stored data by accident. */
export class MemoryBoardStore implements BoardStore {
  readonly boards = new Map<string, string>();
  /** "boardId userId" -> last opened (ms). */
  readonly members = new Map<string, number>();
  /** "boardId userId" -> role, for members whose role isn't the default. */
  readonly roles = new Map<string, AssignableRole>();

  async load(boardId: string): Promise<SavedBoard | null> {
    const json = this.boards.get(boardId);
    if (!json) return null;
    const board = JSON.parse(json) as SavedBoard;
    const memberRoles: Record<string, AssignableRole> = {};
    for (const [key, role] of this.roles) {
      if (key.startsWith(`${boardId} `)) memberRoles[key.slice(boardId.length + 1)] = role;
    }
    return { ...board, memberRoles };
  }

  async save(boardId: string, board: SavedBoard): Promise<void> {
    // Roles are stored separately (like the board_members table), not with the drawing.
    const { memberRoles: _roles, ...rest } = board;
    this.boards.set(boardId, JSON.stringify(rest));
  }

  async loadMeta(boardId: string): Promise<BoardMeta | null> {
    const board = await this.load(boardId);
    return board ? { ownerId: board.ownerId ?? null, name: board.name ?? DEFAULT_BOARD_NAME } : null;
  }

  async rename(boardId: string, name: string): Promise<void> {
    const board = await this.load(boardId);
    if (board) await this.save(boardId, { ...board, name });
  }

  async remove(boardId: string): Promise<void> {
    this.boards.delete(boardId);
    for (const key of this.members.keys()) if (key.startsWith(`${boardId} `)) this.members.delete(key);
    for (const key of this.roles.keys()) if (key.startsWith(`${boardId} `)) this.roles.delete(key);
  }

  async recordVisit(boardId: string, userId: string): Promise<void> {
    if (!this.boards.has(boardId)) throw new Error("board must be saved before recording visits");
    this.members.set(`${boardId} ${userId}`, Date.now());
  }

  async removeMember(boardId: string, userId: string): Promise<void> {
    this.members.delete(`${boardId} ${userId}`);
    this.roles.delete(`${boardId} ${userId}`);
  }

  async setMemberRole(boardId: string, userId: string, role: AssignableRole): Promise<void> {
    if (!this.boards.has(boardId)) throw new Error("board must be saved before setting roles");
    if (role === "editor") this.roles.delete(`${boardId} ${userId}`);
    else this.roles.set(`${boardId} ${userId}`, role);
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
        name: saved?.name,
        thumbnail: saved?.thumbnail ?? null,
        memberRoles: new Map(
          Object.entries(saved?.memberRoles ?? {}).map(([accountId, role]) => [`a:${accountId}`, role]),
        ),
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
      const snapshot: SavedBoard = {
        strokes: structuredClone(room.strokes),
        ownerId: room.ownerId,
        name: room.name,
        thumbnail: room.thumbnail,
      };
      try {
        await store.save(room.id, snapshot);
        this.savedRevisions.set(room.id, revision);
      } catch (error) {
        this.log(`could not save board ${room.id}, will retry: ${describe(error)}`);
      }
    }
  }

  /**
   * Save one board right away (e.g. a brand-new board, so its row exists before anything refers
   * to it). Returns false if it couldn't be saved.
   */
  async saveNow(roomId: string): Promise<boolean> {
    await this.whenIdle();
    await this.flush();
    return this.canEvict(roomId) && !this.unsaveable.has(roomId);
  }

  /** Resolves when no save is in progress, so a deleted board can't be written back. */
  whenIdle(): Promise<void> {
    return this.flushing ?? Promise.resolve();
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
