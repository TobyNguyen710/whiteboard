/**
 * Roles on a board. The host is always the board's owner; the host can make anyone else an
 * editor (can draw) or a viewer (watch only).
 */
export type Role = "host" | "editor" | "viewer";

/** Roles the host can give to other people. */
export type AssignableRole = Exclude<Role, "host">;

export const DEFAULT_ROLE: AssignableRole = "editor";

export function isAssignableRole(value: unknown): value is AssignableRole {
  return value === "editor" || value === "viewer";
}

export type Permissions = {
  /** Draw, erase, and undo/redo your own strokes. */
  canDraw: boolean;
  /** Clear the whole board for everyone. */
  canClear: boolean;
  /** Rename or delete the board. */
  canManageBoard: boolean;
  /** Change other people's roles. */
  canManagePeople: boolean;
};

/**
 * What a role is allowed to do. Boards created before accounts existed have no host, so their
 * editors keep the old rule: anyone who can draw can also clear.
 */
export function permissionsFor(role: Role, boardHasHost: boolean): Permissions {
  const isHost = role === "host";
  return {
    canDraw: role !== "viewer",
    canClear: isHost || (!boardHasHost && role === "editor"),
    canManageBoard: isHost,
    canManagePeople: isHost,
  };
}
