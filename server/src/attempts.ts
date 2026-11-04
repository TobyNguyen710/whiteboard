const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };

/** Counts tries per key in a one-minute window, so passwords can't be guessed quickly. */
export class AttemptLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Use up one try. Returns false if this key is out of tries for now. */
  take(key: string, limit: number): boolean {
    const now = this.now();
    for (const [other, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(other);
    }
    const bucket = this.buckets.get(key) ?? { count: 0, resetAt: now + WINDOW_MS };
    this.buckets.set(key, bucket);
    if (bucket.count >= limit) return false;
    bucket.count++;
    return true;
  }

  /** Give a try back (it succeeded), so people joining correctly never use up the limit. */
  refund(key: string): void {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.count > 0) bucket.count--;
  }
}
