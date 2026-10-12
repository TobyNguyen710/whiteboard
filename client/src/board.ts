import { CANVAS_HEIGHT, CANVAS_WIDTH, type Point } from "@whiteboard/shared";

/** How the fixed logical board is placed inside the on-screen canvas (in CSS pixels). */
export type Viewport = { scale: number; offsetX: number; offsetY: number };

/** Fit the logical board inside a width x height area, keeping its aspect ratio and centering it. */
export function fitBoard(width: number, height: number): Viewport {
  const scale = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT);
  return {
    scale,
    offsetX: (width - CANVAS_WIDTH * scale) / 2,
    offsetY: (height - CANVAS_HEIGHT * scale) / 2,
  };
}

/** Convert a position in canvas CSS pixels to logical board coordinates. */
export function screenToBoard(viewport: Viewport, x: number, y: number): Point {
  return {
    x: (x - viewport.offsetX) / viewport.scale,
    y: (y - viewport.offsetY) / viewport.scale,
  };
}

export function isOnBoard(p: Point): boolean {
  return p.x >= 0 && p.x <= CANVAS_WIDTH && p.y >= 0 && p.y <= CANVAS_HEIGHT;
}
