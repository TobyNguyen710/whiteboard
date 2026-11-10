import { describe, expect, it } from "vitest";
import { MAX_BRUSH_SIZE } from "@whiteboard/shared";
import {
  MAX_POINTS_PER_BATCH,
  parseNewElement,
  parseStoredElements,
  parseStrokeEnd,
  parseStrokePoints,
  parseStrokeStart,
} from "./validate.js";

const validStart = {
  strokeId: "s1",
  color: "#1e1e1e",
  size: 4,
  tool: "pen",
  point: { x: 10, y: 20 },
};

describe("parseStrokeStart", () => {
  it("accepts a valid payload", () => {
    expect(parseStrokeStart(validStart)).toEqual(validStart);
  });

  it("strips unknown fields", () => {
    expect(parseStrokeStart({ ...validStart, userId: "spoofed", extra: 1 })).toEqual(validStart);
  });

  it.each([
    ["missing stroke ID", { ...validStart, strokeId: "" }],
    ["stroke ID too long", { ...validStart, strokeId: "x".repeat(65) }],
    ["named color", { ...validStart, color: "red" }],
    ["short hex color", { ...validStart, color: "#fff" }],
    ["unknown tool", { ...validStart, tool: "laser" }],
    ["size 0", { ...validStart, size: 0 }],
    ["size above max", { ...validStart, size: MAX_BRUSH_SIZE + 1 }],
    ["fractional size", { ...validStart, size: 2.5 }],
    ["size as text", { ...validStart, size: "8" }],
    ["point not numbers", { ...validStart, point: { x: "1", y: 2 } }],
    ["point is NaN", { ...validStart, point: { x: NaN, y: 2 } }],
    ["point far off the board", { ...validStart, point: { x: 1e9, y: 2 } }],
  ])("rejects %s", (_label, payload) => {
    expect(parseStrokeStart(payload)).toBeNull();
  });

  it.each([null, undefined, "s1", 42, []])("rejects non-object %j", (payload) => {
    expect(parseStrokeStart(payload)).toBeNull();
  });
});

describe("parseStrokePoints", () => {
  it("accepts a batch of points", () => {
    const payload = { strokeId: "s1", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
    expect(parseStrokePoints(payload)).toEqual(payload);
  });

  it("rounds coordinates to 0.1 px", () => {
    expect(parseStrokePoints({ strokeId: "s1", points: [{ x: 1.23456, y: 9.98 }] })).toEqual({
      strokeId: "s1",
      points: [{ x: 1.2, y: 10 }],
    });
  });

  it("rejects an empty batch", () => {
    expect(parseStrokePoints({ strokeId: "s1", points: [] })).toBeNull();
  });

  it("rejects a batch that is too big", () => {
    const points = Array.from({ length: MAX_POINTS_PER_BATCH + 1 }, () => ({ x: 1, y: 1 }));
    expect(parseStrokePoints({ strokeId: "s1", points })).toBeNull();
  });

  it("rejects the whole batch if any point is bad", () => {
    expect(parseStrokePoints({ strokeId: "s1", points: [{ x: 1, y: 1 }, { x: 1 }] })).toBeNull();
  });
});

describe("parseStrokeEnd", () => {
  it("accepts a stroke ID", () => {
    expect(parseStrokeEnd({ strokeId: "s1", junk: true })).toEqual({ strokeId: "s1" });
  });

  it("rejects a missing stroke ID", () => {
    expect(parseStrokeEnd({})).toBeNull();
  });
});

describe("parseStoredElements", () => {
  const good = { id: "s1", userId: "u1", color: "#1e1e1e", size: 4, tool: "pen", points: [{ x: 1, y: 2 }] };

  it("reads strokes saved before elements had a type", () => {
    expect(parseStoredElements([good])).toEqual([{ type: "stroke", ...good }]);
  });

  it("keeps typed strokes, and drops kinds it doesn't know", () => {
    expect(parseStoredElements([{ ...good, type: "stroke" }])).toEqual([{ type: "stroke", ...good }]);
    expect(parseStoredElements([{ ...good, id: "s2", type: "hologram" }])).toEqual([]);
  });

  it("drops invalid strokes and keeps the rest", () => {
    const strokes = parseStoredElements([
      good,
      { ...good, id: "s2", color: "red" },
      { ...good, id: "s3", points: [] },
      { ...good, id: "s4", points: [{ x: "1", y: 2 }] },
      { ...good, id: "s1" }, // duplicate ID
      "junk",
      { ...good, id: "s5", tool: "eraser" },
    ]);
    expect(strokes.map((s) => s.id)).toEqual(["s1", "s5"]);
  });

  it("returns nothing for non-arrays", () => {
    expect(parseStoredElements(null)).toEqual([]);
    expect(parseStoredElements({ strokes: [] })).toEqual([]);
  });
});

describe("parseNewElement", () => {
  const stroke = { type: "stroke", id: "e1", color: "#1e1e1e", size: 4, tool: "pen", points: [{ x: 1.23, y: 2 }] };

  it("accepts a whole stroke and rounds its points", () => {
    expect(parseNewElement({ element: stroke })).toEqual({ ...stroke, points: [{ x: 1.2, y: 2 }] });
  });

  it("ignores who the client says drew it", () => {
    expect(parseNewElement({ element: { ...stroke, userId: "someone-else" } })).not.toHaveProperty("userId");
  });

  it("rejects unknown kinds, missing types, and bad fields", () => {
    expect(parseNewElement({ element: { ...stroke, type: "hologram" } })).toBeNull();
    expect(parseNewElement({ element: { ...stroke, type: undefined } })).toBeNull();
    expect(parseNewElement({ element: { ...stroke, color: "red" } })).toBeNull();
    expect(parseNewElement({ element: { ...stroke, points: [] } })).toBeNull();
    expect(parseNewElement({ element: { ...stroke, id: "" } })).toBeNull();
    expect(parseNewElement({ element: { ...stroke, points: [{ x: Infinity, y: 0 }] } })).toBeNull();
    expect(parseNewElement(stroke)).toBeNull();
    expect(parseNewElement(null)).toBeNull();
  });

  it("caps the points sent in one go", () => {
    const points = Array.from({ length: MAX_POINTS_PER_BATCH + 1 }, () => ({ x: 0, y: 0 }));
    expect(parseNewElement({ element: { ...stroke, points } })).toBeNull();
  });
});
