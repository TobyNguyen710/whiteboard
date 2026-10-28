/** Room IDs are short lowercase codes so links stay readable, e.g. /board/k7m2x9qa4h. */
export const ROOM_ID_PATTERN = /^[a-z0-9]{4,32}$/;

/** Accepts unknown because payloads arriving over the socket are untrusted. */
export function isValidRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}

export const DEFAULT_BOARD_NAME = "Untitled board";
export const MAX_BOARD_NAME_LENGTH = 60;

/** Trim, collapse whitespace, drop control characters, cap length. Null if nothing usable is left. */
export function cleanBoardName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BOARD_NAME_LENGTH)
    .trim();
  return cleaned || null;
}

/** Board previews are small JPEG data URLs (the database enforces the same limit). */
export const MAX_THUMBNAIL_LENGTH = 200_000;
const THUMBNAIL_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export function isValidThumbnail(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_THUMBNAIL_LENGTH && THUMBNAIL_PATTERN.test(value);
}
