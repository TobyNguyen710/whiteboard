import { describe, expect, it } from "vitest";
import { isValidRoomId } from "@whiteboard/shared";
import { boardPath, generateRoomId, parseRoomInput } from "./room";

describe("generateRoomId", () => {
  it("makes valid 10-character IDs without look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateRoomId();
      expect(id).toHaveLength(10);
      expect(isValidRoomId(id)).toBe(true);
      expect(id).not.toMatch(/[01ilo]/);
    }
  });

  it("makes different IDs each time", () => {
    const ids = new Set(Array.from({ length: 200 }, generateRoomId));
    expect(ids.size).toBe(200);
  });
});

describe("boardPath", () => {
  it("builds the board URL path", () => {
    expect(boardPath("k7m2x9qa4h")).toBe("/board/k7m2x9qa4h");
  });
});

describe("parseRoomInput", () => {
  it.each([
    ["a bare ID", "rr8g8jk3rh", "rr8g8jk3rh"],
    ["an ID with spaces and capitals", "  RR8G8JK3RH ", "rr8g8jk3rh"],
    ["a localhost link", "http://localhost:5173/board/rr8g8jk3rh", "rr8g8jk3rh"],
    ["a live link with a query", "https://example.vercel.app/board/abc123?x=1", "abc123"],
    ["a link with a trailing slash", "https://example.vercel.app/board/abc123/", "abc123"],
  ])("reads %s", (_label, input, expected) => {
    expect(parseRoomInput(input)).toBe(expected);
  });

  it.each([
    ["junk", "hello!"],
    ["too short", "ab"],
    ["empty", ""],
    ["a link to another page", "https://example.com/about"],
  ])("rejects %s", (_label, input) => {
    expect(parseRoomInput(input)).toBeNull();
  });
});
