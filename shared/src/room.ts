/** Room IDs are short lowercase codes so links stay readable, e.g. /board/k7m2x9qa4h. */
export const ROOM_ID_PATTERN = /^[a-z0-9]{4,32}$/;

/** Accepts unknown because payloads arriving over the socket are untrusted. */
export function isValidRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}
