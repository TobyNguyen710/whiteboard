/** Someone on a board, as shown to everyone else there. */
export type Participant = {
  /** Connection ID: unique per open tab, not an account ID. */
  id: string;
  name: string;
  /** Profile picture from Google/GitHub, or null for guests. */
  avatarUrl: string | null;
  isGuest: boolean;
};

/** Sent with the socket connection (Socket.IO `auth` option). */
export type HandshakeAuth = {
  /** Supabase access token when signed in. */
  token?: string;
  /** Display name when not signed in. */
  guestName?: string;
};

export const MAX_DISPLAY_NAME_LENGTH = 32;
export const DEFAULT_GUEST_NAME = "Guest";

/**
 * Trim, collapse whitespace, drop control characters, cap length. Returns null if nothing
 * usable is left. Accepts unknown because names arrive from the network.
 */
export function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH)
    .trim();
  return cleaned || null;
}

/**
 * Display name and picture for a signed-in account, from what Google / GitHub shared at sign-in
 * (Supabase `user_metadata`). Used by the server (trusted) and client (display only).
 */
export function accountDisplay(
  meta: Record<string, unknown>,
  email?: string,
): { name: string; avatarUrl: string | null } {
  const pick = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return null;
  };
  const name =
    cleanDisplayName(pick(["full_name", "name", "user_name", "preferred_username"])) ??
    cleanDisplayName(email?.split("@")[0]) ??
    DEFAULT_GUEST_NAME;
  const avatar = pick(["avatar_url", "picture"]);
  return { name, avatarUrl: avatar?.startsWith("https://") ? avatar : null };
}
