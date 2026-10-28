import { describe, expect, it } from "vitest";
import {
  cleanBoardName,
  isValidRoomId,
  isValidThumbnail,
  MAX_BOARD_NAME_LENGTH,
  MAX_THUMBNAIL_LENGTH,
} from "./room.js";

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

describe("cleanBoardName", () => {
  it("tidies whitespace and invisible characters", () => {
    expect(cleanBoardName("  Weekly ​  sync \u0000 ")).toBe("Weekly sync");
  });

  it("caps the length", () => {
    expect(cleanBoardName("x".repeat(500))).toHaveLength(MAX_BOARD_NAME_LENGTH);
  });

  it.each([undefined, null, 42, "", "   "])("rejects %j", (value) => {
    expect(cleanBoardName(value)).toBeNull();
  });
});

describe("isValidThumbnail", () => {
  it("accepts a JPEG data URL", () => {
    expect(isValidThumbnail("data:image/jpeg;base64,/9j/4AAQSkZJRg==")).toBe(true);
  });

  it.each([
    ["another image type", "data:image/png;base64,iVBORw0KGgo="],
    ["SVG (could carry script)", "data:image/svg+xml;base64,PHN2Zz4="],
    ["a web URL", "https://example.com/a.jpg"],
    ["JavaScript", "javascript:alert(1)"],
    ["non-base64 junk", "data:image/jpeg;base64,<script>"],
    ["too long", "data:image/jpeg;base64," + "A".repeat(MAX_THUMBNAIL_LENGTH)],
    ["not a string", 42],
  ])("rejects %s", (_label, value) => {
    expect(isValidThumbnail(value)).toBe(false);
  });
});
