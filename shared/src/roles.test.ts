import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD_SETTINGS, isAssignableRole, parseSettingsChange, permissionsFor } from "./roles.js";

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

describe("board settings", () => {
  const locked = { ...DEFAULT_BOARD_SETTINGS, locked: true };
  const editorsClear = { ...DEFAULT_BOARD_SETTINGS, clearPolicy: "editors" as const };

  it("locking stops editors drawing, but not the host", () => {
    expect(permissionsFor("editor", true, locked).canDraw).toBe(false);
    expect(permissionsFor("host", true, locked).canDraw).toBe(true);
  });

  it("can let everyone who can draw clear", () => {
    expect(permissionsFor("editor", true, editorsClear).canClear).toBe(true);
    expect(permissionsFor("viewer", true, editorsClear).canClear).toBe(false);
    // ...but not while the board is locked (they can't draw then)
    expect(permissionsFor("editor", true, { ...editorsClear, locked: true }).canClear).toBe(false);
  });
});

describe("parseSettingsChange", () => {
  it("keeps only valid fields", () => {
    expect(parseSettingsChange({ defaultRole: "viewer", locked: true, clearPolicy: "editors" })).toEqual({
      defaultRole: "viewer",
      locked: true,
      clearPolicy: "editors",
    });
    expect(parseSettingsChange({ defaultRole: "host", locked: "yes", clearPolicy: "everyone", extra: 1 })).toEqual({});
    expect(parseSettingsChange(null)).toEqual({});
  });
});
