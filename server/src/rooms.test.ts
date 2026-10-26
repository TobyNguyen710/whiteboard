import { beforeEach, describe, expect, it } from "vitest";
import type { StrokeStartPayload } from "@whiteboard/shared";
import {
  EMPTY_ROOM_TTL_MS,
  MAX_POINTS_PER_ROOM,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_ROOM,
  RoomStore,
} from "./rooms.js";

const ROOM = "room1234";

const start = (strokeId: string): StrokeStartPayload => ({
  strokeId,
  color: "#1e1e1e",
  size: 4,
  tool: "pen",
  point: { x: 0, y: 0 },
});

const ids = (store: RoomStore) => store.get(ROOM)!.strokes.map((s) => s.id);

describe("RoomStore", () => {
  let now: number;
  let store: RoomStore;

  beforeEach(() => {
    now = 1_000_000;
    store = new RoomStore(() => now);
    store.join(ROOM, "alice");
    store.join(ROOM, "bob");
  });

  describe("joining and leaving", () => {
    it("tracks who is on the board", () => {
      expect([...store.get(ROOM)!.users]).toEqual(["alice", "bob"]);
      store.leave(ROOM, "alice");
      expect([...store.get(ROOM)!.users]).toEqual(["bob"]);
    });

    it("keeps an empty board until the TTL, then sweeps it", () => {
      store.leave(ROOM, "alice");
      store.leave(ROOM, "bob");

      now += EMPTY_ROOM_TTL_MS - 1;
      expect(store.sweep()).toEqual([]);
      now += 1;
      expect(store.sweep()).toEqual([ROOM]);
      expect(store.get(ROOM)).toBeUndefined();
    });

    it("does not sweep a board someone rejoined", () => {
      store.leave(ROOM, "alice");
      store.leave(ROOM, "bob");
      now += EMPTY_ROOM_TTL_MS / 2;
      store.join(ROOM, "carol");
      now += EMPTY_ROOM_TTL_MS;
      expect(store.sweep()).toEqual([]);
    });
  });

  describe("strokes", () => {
    it("records a stroke with its points", () => {
      store.startStroke(ROOM, "alice", start("s1"));
      expect(store.addPoints(ROOM, "alice", "s1", [{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
      expect(store.endStroke(ROOM, "alice", "s1")).toBe(true);

      const [stroke] = store.get(ROOM)!.strokes;
      expect(stroke).toMatchObject({ id: "s1", userId: "alice", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    });

    it("only lets the author add to a stroke", () => {
      store.startStroke(ROOM, "alice", start("s1"));
      expect(store.addPoints(ROOM, "bob", "s1", [{ x: 9, y: 9 }])).toBeNull();
      expect(store.endStroke(ROOM, "bob", "s1")).toBe(false);
    });

    it("rejects points after the stroke ended", () => {
      store.startStroke(ROOM, "alice", start("s1"));
      store.endStroke(ROOM, "alice", "s1");
      expect(store.addPoints(ROOM, "alice", "s1", [{ x: 1, y: 1 }])).toBeNull();
    });

    it("rejects reused stroke IDs and users not on the board", () => {
      store.startStroke(ROOM, "alice", start("s1"));
      expect(store.startStroke(ROOM, "bob", start("s1"))).toBeNull();
      expect(store.startStroke(ROOM, "mallory", start("s2"))).toBeNull();
    });

    it("finishes a leaving user's in-progress stroke", () => {
      store.startStroke(ROOM, "alice", start("s1"));
      store.leave(ROOM, "alice");
      expect(store.get(ROOM)!.activeStrokeIds.size).toBe(0);
      expect(ids(store)).toEqual(["s1"]);
    });

    it("caps the number of points per stroke", () => {
      store.startStroke(ROOM, "alice", start("s1"));
      const points = Array.from({ length: MAX_POINTS_PER_STROKE + 10 }, (_, i) => ({ x: i, y: i }));
      const accepted = store.addPoints(ROOM, "alice", "s1", points);
      expect(accepted).toHaveLength(MAX_POINTS_PER_STROKE - 1); // the start point counts too
      expect(store.addPoints(ROOM, "alice", "s1", [{ x: 0, y: 0 }])).toBeNull();
    });

    it("caps the number of strokes per board", () => {
      for (let i = 0; i < MAX_STROKES_PER_ROOM; i++) store.startStroke(ROOM, "alice", start(`s${i}`));
      expect(store.startStroke(ROOM, "alice", start("one-too-many"))).toBeNull();
    });
  });

  describe("undo / redo", () => {
    beforeEach(() => {
      store.startStroke(ROOM, "alice", start("a1"));
      store.startStroke(ROOM, "alice", start("a2"));
      store.startStroke(ROOM, "bob", start("b1"));
    });

    it("undoes only your own strokes, newest first", () => {
      expect(store.undo(ROOM, "alice")).toBe("a2");
      expect(store.undo(ROOM, "alice")).toBe("a1");
      expect(store.undo(ROOM, "alice")).toBeNull();
      expect(ids(store)).toEqual(["b1"]);
    });

    it("redo puts strokes back in their original drawing order", () => {
      store.undo(ROOM, "alice");
      store.undo(ROOM, "alice");

      expect(store.redo(ROOM, "alice")).toMatchObject({ stroke: { id: "a1" }, afterId: null });
      expect(store.redo(ROOM, "alice")).toMatchObject({ stroke: { id: "a2" }, afterId: "a1" });
      expect(store.redo(ROOM, "alice")).toBeNull();
      expect(ids(store)).toEqual(["a1", "a2", "b1"]);
    });

    it("can undo a redone stroke again", () => {
      store.undo(ROOM, "alice");
      store.redo(ROOM, "alice");
      expect(store.undo(ROOM, "alice")).toBe("a2");
    });

    it("a new stroke clears your redo list but not other people's", () => {
      store.undo(ROOM, "alice");
      store.undo(ROOM, "bob");
      store.startStroke(ROOM, "alice", start("a3"));

      expect(store.redo(ROOM, "alice")).toBeNull();
      expect(store.redo(ROOM, "bob")).toMatchObject({ stroke: { id: "b1" } });
    });

    it("an undone stroke's ID can't be reused while it can still be redone", () => {
      store.undo(ROOM, "alice");
      expect(store.startStroke(ROOM, "alice", start("a2"))).toBeNull();
    });

    it("undoing mid-stroke ends the stroke", () => {
      store.startStroke(ROOM, "alice", start("a3"));
      expect(store.undo(ROOM, "alice")).toBe("a3");
      expect(store.addPoints(ROOM, "alice", "a3", [{ x: 1, y: 1 }])).toBeNull();
    });

    it("leaving forgets your history", () => {
      store.undo(ROOM, "alice");
      store.leave(ROOM, "alice");
      store.join(ROOM, "alice");
      expect(store.redo(ROOM, "alice")).toBeNull();
      expect(store.undo(ROOM, "alice")).toBeNull();
    });
  });

  describe("saved boards", () => {
    const saved = (id: string, points = 1) => ({
      id,
      userId: "someone",
      color: "#1e1e1e",
      size: 4,
      tool: "pen" as const,
      points: Array.from({ length: points }, (_, i) => ({ x: i, y: i })),
    });

    it("creates a board from saved strokes, keeping their order for redo", () => {
      store.create("saved1234", [saved("old1"), saved("old2")]);
      store.join("saved1234", "alice");
      store.startStroke("saved1234", "alice", start("new1"));
      store.undo("saved1234", "alice");
      expect(store.redo("saved1234", "alice")).toMatchObject({ afterId: "old2" });
      expect(store.get("saved1234")!.strokes.map((s) => s.id)).toEqual(["old1", "old2", "new1"]);
    });

    it("counts points from saved strokes", () => {
      expect(store.create("saved1234", [saved("a", 3), saved("b", 4)]).pointCount).toBe(7);
    });

    it("doesn't replace a board that's already in memory", () => {
      store.startStroke(ROOM, "alice", start("s1"));
      store.create(ROOM, []);
      expect(ids(store)).toEqual(["s1"]);
    });

    it("bumps the revision on every change, not on joins", () => {
      const room = store.get(ROOM)!;
      const seen = [room.revision];
      store.join(ROOM, "carol");
      seen.push(room.revision);
      store.startStroke(ROOM, "alice", start("s1"));
      seen.push(room.revision);
      store.addPoints(ROOM, "alice", "s1", [{ x: 1, y: 1 }]);
      seen.push(room.revision);
      store.undo(ROOM, "alice");
      seen.push(room.revision);
      store.redo(ROOM, "alice");
      seen.push(room.revision);
      store.clear(ROOM, "alice");
      seen.push(room.revision);
      expect(seen).toEqual([0, 0, 1, 2, 3, 4, 5]);
    });

    it("caps the total points on a board", () => {
      store.create("big12345", [saved("huge", MAX_POINTS_PER_ROOM - 2)]);
      store.join("big12345", "alice");
      store.startStroke("big12345", "alice", start("s1")); // 1 point left after this
      const accepted = store.addPoints("big12345", "alice", "s1", [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]);
      expect(accepted).toHaveLength(1);
      expect(store.startStroke("big12345", "alice", start("s2"))).toBeNull();
    });

    it("tracks points through undo, redo, and clear", () => {
      store.startStroke(ROOM, "alice", start("s1"));
      store.addPoints(ROOM, "alice", "s1", [{ x: 1, y: 1 }]);
      const room = store.get(ROOM)!;
      expect(room.pointCount).toBe(2);
      store.undo(ROOM, "alice");
      expect(room.pointCount).toBe(0);
      store.redo(ROOM, "alice");
      expect(room.pointCount).toBe(2);
      store.clear(ROOM, "alice");
      expect(room.pointCount).toBe(0);
    });
  });

  describe("clear", () => {
    it("wipes strokes and everyone's undo/redo history", () => {
      store.startStroke(ROOM, "alice", start("a1"));
      store.startStroke(ROOM, "alice", start("a2"));
      store.undo(ROOM, "alice");

      expect(store.clear(ROOM, "bob")).toBe(true);
      expect(ids(store)).toEqual([]);
      expect(store.undo(ROOM, "alice")).toBeNull();
      expect(store.redo(ROOM, "alice")).toBeNull();
    });

    it("only someone on the board can clear it", () => {
      store.startStroke(ROOM, "alice", start("a1"));
      expect(store.clear(ROOM, "mallory")).toBe(false);
      expect(ids(store)).toEqual(["a1"]);
    });
  });
});
