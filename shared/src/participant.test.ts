import { describe, expect, it } from "vitest";
import { accountDisplay, cleanDisplayName, DEFAULT_GUEST_NAME, MAX_DISPLAY_NAME_LENGTH } from "./participant.js";

describe("cleanDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanDisplayName("   Teal    Otter  ")).toBe("Teal Otter");
  });

  it("removes control and invisible formatting characters", () => {
    expect(cleanDisplayName("Ali\u0000ce​")).toBe("Alice");
  });

  it("caps the length", () => {
    expect(cleanDisplayName("x".repeat(100))).toHaveLength(MAX_DISPLAY_NAME_LENGTH);
  });

  it.each([undefined, null, 42, {}, "", "    ", "\u0000\u0001"])("rejects %j", (value) => {
    expect(cleanDisplayName(value)).toBeNull();
  });
});

describe("accountDisplay", () => {
  it("uses the full name and avatar from Google", () => {
    expect(accountDisplay({ full_name: "Toby Nguyen", picture: "https://lh3.googleusercontent.com/a/x" })).toEqual({
      name: "Toby Nguyen",
      avatarUrl: "https://lh3.googleusercontent.com/a/x",
    });
  });

  it("falls back to the GitHub username", () => {
    expect(accountDisplay({ user_name: "tobyn", avatar_url: "https://avatars.githubusercontent.com/u/1" }).name).toBe("tobyn");
  });

  it("falls back to the email name, then a default", () => {
    expect(accountDisplay({}, "toby@example.com").name).toBe("toby");
    expect(accountDisplay({}).name).toBe(DEFAULT_GUEST_NAME);
  });

  it("ignores avatar URLs that aren't https", () => {
    expect(accountDisplay({ name: "X", avatar_url: "javascript:alert(1)" }).avatarUrl).toBeNull();
    expect(accountDisplay({ name: "X", avatar_url: "http://insecure.example/a.png" }).avatarUrl).toBeNull();
  });
});
