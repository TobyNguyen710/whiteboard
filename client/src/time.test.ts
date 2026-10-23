import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./time";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [MIN, "1 minute ago"],
    [5 * MIN, "5 minutes ago"],
    [HOUR, "1 hour ago"],
    [23 * HOUR, "23 hours ago"],
    [DAY, "yesterday"],
    [6 * DAY, "6 days ago"],
  ])("%i ms ago -> %s", (ago, expected) => {
    expect(formatRelativeTime(NOW - ago, NOW)).toBe(expected);
  });

  it("treats future times as just now", () => {
    expect(formatRelativeTime(NOW + HOUR, NOW)).toBe("just now");
  });

  it("shows a date after a week", () => {
    expect(formatRelativeTime(NOW - 30 * DAY, NOW)).toMatch(/2026/);
  });
});
