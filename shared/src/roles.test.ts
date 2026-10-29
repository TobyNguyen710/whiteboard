import { describe, expect, it } from "vitest";
import { isAssignableRole, permissionsFor } from "./roles.js";

describe("permissionsFor", () => {
  it("lets the host do everything", () => {
    expect(permissionsFor("host", true)).toEqual({
      canDraw: true,
      canClear: true,
      canManageBoard: true,
      canManagePeople: true,
    });
  });

  it("lets editors draw but not clear, rename, or manage people", () => {
    expect(permissionsFor("editor", true)).toEqual({
      canDraw: true,
      canClear: false,
      canManageBoard: false,
      canManagePeople: false,
    });
  });

  it("lets viewers only watch", () => {
    expect(permissionsFor("viewer", true)).toEqual({
      canDraw: false,
      canClear: false,
      canManageBoard: false,
      canManagePeople: false,
    });
  });

  it("keeps the old rule on boards with no host: editors can clear", () => {
    expect(permissionsFor("editor", false).canClear).toBe(true);
    expect(permissionsFor("viewer", false).canClear).toBe(false);
  });
});

describe("isAssignableRole", () => {
  it("allows editor and viewer, never host", () => {
    expect(isAssignableRole("editor")).toBe(true);
    expect(isAssignableRole("viewer")).toBe(true);
    expect(isAssignableRole("host")).toBe(false);
    expect(isAssignableRole("admin")).toBe(false);
    expect(isAssignableRole(undefined)).toBe(false);
  });
});
