import { describe, expect, it } from "vitest";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@whiteboard/shared";
import { fitBoard, isOnBoard, screenToBoard } from "./board";

describe("fitBoard", () => {
  it("fills a window with the board's exact aspect ratio", () => {
    expect(fitBoard(960, 540)).toEqual({ scale: 0.5, offsetX: 0, offsetY: 0 });
  });

  it("centers horizontally in a wide window", () => {
    // Height limits the scale; the extra width is split evenly on both sides.
    expect(fitBoard(1200, 540)).toEqual({ scale: 0.5, offsetX: 120, offsetY: 0 });
  });

  it("centers vertically in a tall window", () => {
    expect(fitBoard(960, 800)).toEqual({ scale: 0.5, offsetX: 0, offsetY: 130 });
  });
});

describe("screenToBoard", () => {
  it("maps the board's screen corners to logical corners", () => {
    const viewport = fitBoard(1200, 540);
    expect(screenToBoard(viewport, 120, 0)).toEqual({ x: 0, y: 0 });
    expect(screenToBoard(viewport, 1080, 540)).toEqual({ x: CANVAS_WIDTH, y: CANVAS_HEIGHT });
  });

  it("gives the same logical point on different screen sizes", () => {
    const small = screenToBoard(fitBoard(960, 540), 480, 270);
    const large = screenToBoard(fitBoard(3840, 2160), 1920, 1080);
    expect(small).toEqual(large);
    expect(small).toEqual({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
  });
});

describe("isOnBoard", () => {
  it("includes the edges", () => {
    expect(isOnBoard({ x: 0, y: 0 })).toBe(true);
    expect(isOnBoard({ x: CANVAS_WIDTH, y: CANVAS_HEIGHT })).toBe(true);
  });

  it("excludes the margins", () => {
    expect(isOnBoard({ x: -1, y: 10 })).toBe(false);
    expect(isOnBoard({ x: 10, y: CANVAS_HEIGHT + 1 })).toBe(false);
  });
});
