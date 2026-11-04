import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("board passwords", () => {
  it("matches the right password only", async () => {
    const hash = await hashPassword("open sesame");
    expect(await verifyPassword("open sesame", hash)).toBe(true);
    expect(await verifyPassword("open sesame ", hash)).toBe(false);
    expect(await verifyPassword("Open Sesame", hash)).toBe(false);
  });

  it("never stores the password, and hashes it differently each time", async () => {
    const [first, second] = await Promise.all([hashPassword("open sesame"), hashPassword("open sesame")]);
    expect(first).not.toContain("open sesame");
    expect(first).not.toBe(second);
  });

  it("never matches a malformed hash", async () => {
    for (const stored of ["", "plain", "scrypt$", "scrypt$abcd$", "scrypt$abcd$1234", "md5$abcd$1234"]) {
      expect(await verifyPassword("open sesame", stored)).toBe(false);
    }
  });
});
