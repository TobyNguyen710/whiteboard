export type Point = { x: number; y: number };

export type Tool = "pen" | "eraser";

export type Stroke = {
  id: string;
  userId: string;
  color: string;
  size: number;
  tool: Tool;
  points: Point[];
};

/** Allowed brush sizes in logical board pixels (whole numbers). Enforced by the server. */
export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 100;

/** Logical canvas size. Coordinates are stored in this space so boards look the same on every screen. */
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
