import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "./attempts.js";

function limiter() {
  let time = 0;
  return { tries: new AttemptLimiter(() => time), wait: (ms: number) => (time += ms) };
}

describe("AttemptLimiter", () => {
  it("allows tries up to the limit, per key", () => {
    const { tries } = limiter();
    expect(tries.take("a", 2)).toBe(true);
    expect(tries.take("a", 2)).toBe(true);
    expect(tries.take("a", 2)).toBe(false);
    expect(tries.take("b", 2)).toBe(true);
  });

  it("starts over after a minute, not before", () => {
    const { tries, wait } = limiter();
    tries.take("a", 1);
    wait(59_999);
    expect(tries.take("a", 1)).toBe(false);
    wait(1);
    expect(tries.take("a", 1)).toBe(true);
  });

  it("gives a try back on refund", () => {
    const { tries } = limiter();
    tries.take("a", 1);
    tries.refund("a");
    expect(tries.take("a", 1)).toBe(true);
  });

  it("ignores a refund for a key with no tries", () => {
    const { tries } = limiter();
    tries.refund("a");
    expect(tries.take("a", 1)).toBe(true);
    expect(tries.take("a", 1)).toBe(false);
  });
});
