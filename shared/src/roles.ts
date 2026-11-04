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

/** Who can clear the whole board. */
export type ClearPolicy = "host" | "editors";

/** Board-wide rules the host controls. */
export type BoardSettings = {
  /** Role for anyone the host hasn't given a role yet (including new joiners). */
  defaultRole: AssignableRole;
  /** When locked, only the host can draw; everyone keeps their role for when it's unlocked. */
  locked: boolean;
  clearPolicy: ClearPolicy;
  /** When shared, anyone with the link or board ID can join (with the password, if there is one). */
  shared: boolean;
};

export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  defaultRole: DEFAULT_ROLE,
  locked: false,
  clearPolicy: "host",
  shared: false,
};

export const MIN_BOARD_PASSWORD_LENGTH = 4;
export const MAX_BOARD_PASSWORD_LENGTH = 64;

/** Accepts unknown because passwords arriving over the socket are untrusted. */
export function isValidBoardPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= MIN_BOARD_PASSWORD_LENGTH &&
    value.length <= MAX_BOARD_PASSWORD_LENGTH
  );
}

/** Keep only valid fields from an untrusted settings change. */
export function parseSettingsChange(value: unknown): Partial<BoardSettings> {
  if (typeof value !== "object" || value === null) return {};
  const v = value as Record<string, unknown>;
  const change: Partial<BoardSettings> = {};
  if (isAssignableRole(v.defaultRole)) change.defaultRole = v.defaultRole;
  if (typeof v.locked === "boolean") change.locked = v.locked;
  if (v.clearPolicy === "host" || v.clearPolicy === "editors") change.clearPolicy = v.clearPolicy;
  if (typeof v.shared === "boolean") change.shared = v.shared;
  return change;
}

export type Permissions = {
  /** Draw, erase, and undo/redo your own strokes. */
  canDraw: boolean;
  /** Clear the whole board for everyone. */
  canClear: boolean;
  /** Rename or delete the board, and change its settings. */
  canManageBoard: boolean;
  /** Change other people's roles and remove people. */
  canManagePeople: boolean;
};

/**
 * What a role is allowed to do on a board. Boards created before accounts existed have no host,
 * so their editors keep the old rule: anyone who can draw can also clear.
 */
export function permissionsFor(
  role: Role,
  boardHasHost: boolean,
  settings: BoardSettings = DEFAULT_BOARD_SETTINGS,
): Permissions {
  const isHost = role === "host";
  const canDraw = isHost || (role === "editor" && !settings.locked);
  return {
    canDraw,
    canClear: isHost || (canDraw && (!boardHasHost || settings.clearPolicy === "editors")),
    canManageBoard: isHost,
    canManagePeople: isHost,
  };
}
