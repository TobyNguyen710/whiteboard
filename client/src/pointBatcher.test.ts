import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "@whiteboard/shared";
import { PointBatcher } from "./pointBatcher";

const pt = (n: number): Point => ({ x: n, y: n });

describe("PointBatcher", () => {
  let sent: Array<[string, number]>;
  let batcher: PointBatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    batcher = new PointBatcher((strokeId, points) => sent.push([strokeId, points.length]), 25, 32);
  });

  afterEach(() => {
    batcher.dispose();
    vi.useRealTimers();
  });

  it("waits for the interval before sending a small batch", () => {
    batcher.add("s1", pt(1));
    batcher.add("s1", pt(2));
    expect(sent).toEqual([]);

    vi.advanceTimersByTime(25);
    expect(sent).toEqual([["s1", 2]]);
  });

  it("sends immediately when a batch fills up", () => {
    for (let i = 0; i < 70; i++) batcher.add("s1", pt(i));
    expect(sent).toEqual([
      ["s1", 32],
      ["s1", 32],
    ]);

    vi.advanceTimersByTime(25);
    expect(sent.at(-1)).toEqual(["s1", 6]);
  });

  it("keeps separate batches per stroke", () => {
    batcher.add("s1", pt(1));
    batcher.add("s2", pt(1));
    batcher.add("s2", pt(2));
    vi.advanceTimersByTime(25);
    expect(sent).toEqual([
      ["s1", 1],
      ["s2", 2],
    ]);
  });

  it("flush sends one stroke's waiting points right away", () => {
    batcher.add("s1", pt(1));
    batcher.add("s2", pt(1));
    batcher.flush("s1");
    expect(sent).toEqual([["s1", 1]]);
  });

  it("does not send empty batches", () => {
    batcher.flush("s1");
    batcher.flushAll();
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([]);
  });

  it("dispose drops unsent points", () => {
    batcher.add("s1", pt(1));
    batcher.dispose();
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([]);
  });
});
