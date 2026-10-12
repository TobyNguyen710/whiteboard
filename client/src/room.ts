import { isValidRoomId } from "@whiteboard/shared";

// No 0/o, 1/l/i, so IDs are easy to read out loud or type from a screenshot.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const ROOM_ID_LENGTH = 10;
const BOARD_PATH = /^\/board\/([^/]+)\/?$/;

export function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_ID_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function boardPath(roomId: string): string {
  return `/board/${roomId}`;
}

/** Room ID from /board/:roomId, or a new one (and the URL updated to match) if missing or invalid. */
export function getOrCreateRoomId(): string {
  const existing = BOARD_PATH.exec(window.location.pathname)?.[1];
  if (isValidRoomId(existing)) return existing;

  const roomId = generateRoomId();
  window.history.replaceState(null, "", boardPath(roomId));
  return roomId;
}

/** Room ID from what a user typed: either a bare ID or a pasted board link. Null if neither. */
export function parseRoomInput(input: string): string | null {
  const text = input.trim().toLowerCase();
  const fromLink = /\/board\/([^/?#\s]+)/.exec(text)?.[1];
  const candidate = fromLink ?? text;
  return isValidRoomId(candidate) ? candidate : null;
}
