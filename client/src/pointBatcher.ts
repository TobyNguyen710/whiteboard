import type { Point } from "@whiteboard/shared";

export const BATCH_INTERVAL_MS = 25;
export const MAX_BATCH_POINTS = 32;

/**
 * Collects points per stroke and sends them in batches: every intervalMs, or as soon as a
 * stroke has maxPoints waiting, whichever comes first. Keeps drawing smooth and traffic low.
 */
export class PointBatcher {
  private readonly buffers = new Map<string, Point[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (strokeId: string, points: Point[]) => void,
    private readonly intervalMs = BATCH_INTERVAL_MS,
    private readonly maxPoints = MAX_BATCH_POINTS,
  ) {}

  add(strokeId: string, point: Point): void {
    let buffer = this.buffers.get(strokeId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(strokeId, buffer);
    }
    buffer.push(point);

    if (buffer.length >= this.maxPoints) {
      this.flush(strokeId);
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flushAll();
      }, this.intervalMs);
    }
  }

  /** Send whatever is waiting for one stroke (e.g. right before its stroke:end). */
  flush(strokeId: string): void {
    const buffer = this.buffers.get(strokeId);
    this.buffers.delete(strokeId);
    if (buffer && buffer.length > 0) this.send(strokeId, buffer);
  }

  flushAll(): void {
    for (const strokeId of [...this.buffers.keys()]) this.flush(strokeId);
  }

  /** Stop the timer and drop anything unsent. */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.buffers.clear();
  }
}
