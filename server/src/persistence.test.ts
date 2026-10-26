import { beforeEach, describe, expect, it } from "vitest";
import type { StrokeStartPayload } from "@whiteboard/shared";
import { BoardSaver, MemoryBoardStore, type BoardStore, type SavedBoard } from "./persistence.js";
import { EMPTY_ROOM_TTL_MS, RoomStore } from "./rooms.js";

const ROOM = "room1234";

const start = (strokeId: string): StrokeStartPayload => ({
  strokeId,
  color: "#1e1e1e",
  size: 4,
  tool: "pen",
  point: { x: 1, y: 2 },
});

/** A store that can be told to fail, and counts calls. */
class FlakyStore extends MemoryBoardStore {
  failLoads = false;
  failSaves = false;
  loads = 0;
  saves = 0;

  override async load(id: string): Promise<SavedBoard | null> {
    this.loads++;
    if (this.failLoads) throw new Error("database down");
    return super.load(id);
  }

  override async save(id: string, board: SavedBoard): Promise<void> {
    this.saves++;
    if (this.failSaves) throw new Error("database down");
    return super.save(id, board);
  }
}

const savedIds = async (store: BoardStore, id: string) =>
  (await store.load(id))?.strokes.map((s) => s.id);

describe("BoardSaver", () => {
  let now: number;
  let store: FlakyStore;
  let rooms: RoomStore;
  let saver: BoardSaver;

  beforeEach(() => {
    now = 1_000_000;
    store = new FlakyStore();
    rooms = new RoomStore(() => now);
    saver = new BoardSaver(store, rooms, () => {});
  });

  it("loads a saved board the first time it's opened", async () => {
    await store.save(ROOM, {
      strokes: [{ id: "old", userId: "u", color: "#1e1e1e", size: 4, tool: "pen", points: [{ x: 1, y: 1 }] }],
    });
    await saver.ensureLoaded(ROOM);
    expect(rooms.get(ROOM)!.strokes.map((s) => s.id)).toEqual(["old"]);
  });

  it("starts a never-saved board empty", async () => {
    await saver.ensureLoaded(ROOM);
    expect(rooms.get(ROOM)!.strokes).toEqual([]);
  });

  it("shares one load when two people open a board at once", async () => {
    await Promise.all([saver.ensureLoaded(ROOM), saver.ensureLoaded(ROOM)]);
    expect(store.loads).toBe(1);
  });

  it("doesn't reload a board already in memory", async () => {
    await saver.ensureLoaded(ROOM);
    await saver.ensureLoaded(ROOM);
    expect(store.loads).toBe(1);
  });

  it("saves only boards that changed", async () => {
    await saver.ensureLoaded(ROOM);
    await saver.flush();
    expect(store.saves).toBe(0); // loaded, unchanged

    rooms.join(ROOM, "alice");
    rooms.startStroke(ROOM, "alice", start("s1"));
    await saver.flush();
    expect(store.saves).toBe(1);
    expect(await savedIds(store, ROOM)).toEqual(["s1"]);

    await saver.flush();
    expect(store.saves).toBe(1); // nothing new
  });

  it("saves a snapshot, so later drawing doesn't alter what was saved", async () => {
    await saver.ensureLoaded(ROOM);
    rooms.join(ROOM, "alice");
    rooms.startStroke(ROOM, "alice", start("s1"));
    const flushing = saver.flush();
    rooms.addPoints(ROOM, "alice", "s1", [{ x: 5, y: 5 }]);
    await flushing;
    expect((await store.load(ROOM))!.strokes[0]!.points).toHaveLength(1);

    await saver.flush(); // the new point is saved on the next flush
    expect((await store.load(ROOM))!.strokes[0]!.points).toHaveLength(2);
  });

  it("retries a failed save on the next flush", async () => {
    await saver.ensureLoaded(ROOM);
    rooms.join(ROOM, "alice");
    rooms.startStroke(ROOM, "alice", start("s1"));

    store.failSaves = true;
    await saver.flush();
    expect(saver.canEvict(ROOM)).toBe(false);

    store.failSaves = false;
    await saver.flush();
    expect(await savedIds(store, ROOM)).toEqual(["s1"]);
    expect(saver.canEvict(ROOM)).toBe(true);
  });

  it("never overwrites a board whose load failed", async () => {
    await store.save(ROOM, {
      strokes: [{ id: "precious", userId: "u", color: "#1e1e1e", size: 4, tool: "pen", points: [{ x: 1, y: 1 }] }],
    });
    store.saves = 0; // don't count the seeding above
    store.failLoads = true;
    await saver.ensureLoaded(ROOM);

    rooms.join(ROOM, "alice");
    rooms.startStroke(ROOM, "alice", start("s1"));
    store.failLoads = false; // the database is back, but this session must still not save
    await saver.flush();
    expect(store.saves).toBe(0);
    expect(await savedIds(store, ROOM)).toEqual(["precious"]);
  });

  it("keeps unsaved boards in memory when sweeping idle boards", async () => {
    await saver.ensureLoaded(ROOM);
    rooms.join(ROOM, "alice");
    rooms.startStroke(ROOM, "alice", start("s1"));
    rooms.leave(ROOM, "alice");
    now += EMPTY_ROOM_TTL_MS;

    store.failSaves = true;
    await saver.flush();
    expect(rooms.sweep((id) => saver.canEvict(id))).toEqual([]);

    store.failSaves = false;
    await saver.flush();
    expect(rooms.sweep((id) => saver.canEvict(id))).toEqual([ROOM]);
  });

  it("does nothing without a store", async () => {
    const memoryOnly = new BoardSaver(null, rooms, () => {});
    await memoryOnly.ensureLoaded(ROOM);
    expect(rooms.get(ROOM)).toBeUndefined(); // created on join instead, as before
    await expect(memoryOnly.flush()).resolves.toBeUndefined();
    expect(memoryOnly.canEvict(ROOM)).toBe(true);
  });
});
