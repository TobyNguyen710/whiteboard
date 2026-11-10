import type { Point, Tool } from "./types.js";

/** A freehand line drawn with the pen or eraser. Streamed point by point while it's drawn. */
export type StrokeElement = {
  type: "stroke";
  id: string;
  userId: string;
  color: string;
  size: number;
  tool: Tool;
  points: Point[];
};

/** Freehand strokes are the only element streamed point by point, so they keep their own name. */
export type Stroke = StrokeElement;

/**
 * Everything that can be on a board, in drawing order. Each kind has a `type`; lines, shapes, and
 * text join this union in v3. (Not called `Element`, which is the browser's DOM element type.)
 */
export type BoardElement = StrokeElement;

export type ElementType = BoardElement["type"];

/** Omit that keeps a union a union (plain Omit would merge its members). */
type WithoutAuthor<E> = E extends unknown ? Omit<E, "userId"> : never;

/** An element as a client sends it in one piece: the server fills in who drew it. */
export type NewElement = WithoutAuthor<BoardElement>;

/**
 * How much of a board's size limit an element uses. Strokes count their points; other elements
 * will count as a few points each, so the limit keeps saves and late-join loads small.
 */
export function elementCost(element: NewElement): number {
  switch (element.type) {
    case "stroke":
      return element.points.length;
  }
}
