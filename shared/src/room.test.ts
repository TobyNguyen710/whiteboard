import { describe, expect, it } from "vitest";
import { isValidRoomId } from "./room.js";

describe("isValidRoomId", () => {
  it.each(["abcd", "k7m2x9qa4h", "a".repeat(32)])("accepts %s", (id) => {
    expect(isValidRoomId(id)).toBe(true);
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(33)],
    ["uppercase", "ABCD1234"],
    ["symbols", "abc-123"],
    ["path traversal", "../etc"],
    ["empty", ""],
  ])("rejects %s", (_label, id) => {
    expect(isValidRoomId(id)).toBe(false);
  });

  it.each([undefined, null, 1234, {}, ["abcd"]])("rejects non-string %j", (value) => {
    expect(isValidRoomId(value)).toBe(false);
  });
});
