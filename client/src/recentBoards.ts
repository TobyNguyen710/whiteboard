import { isValidRoomId } from "@whiteboard/shared";

/** A board this browser has opened. Stored locally until boards are saved to accounts. */
export type RecentBoard = {
  id: string;
  name: string;
  /** When it was last opened (ms since epoch). */
  lastOpened: number;
  /** Small JPEG data URL of the board, if one has been captured. */
  thumbnail?: string;
};

export const DEFAULT_BOARD_NAME = "Untitled board";
export const MAX_RECENT_BOARDS = 24;
export const MAX_NAME_LENGTH = 60;

const STORAGE_KEY = "whiteboard:recent-boards";

function isRecentBoard(v: unknown): v is RecentBoard {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    isValidRoomId(b.id) &&
    typeof b.name === "string" &&
    typeof b.lastOpened === "number" &&
    Number.isFinite(b.lastOpened) &&
    (b.thumbnail === undefined || (typeof b.thumbnail === "string" && b.thumbnail.startsWith("data:image/")))
  );
}

/** Recent boards, most recently opened first. Invalid saved entries are dropped. */
export function loadRecentBoards(): RecentBoard[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(isRecentBoard).sort((a, b) => b.lastOpened - a.lastOpened);
  } catch {
    return [];
  }
}

function save(boards: RecentBoard[]): void {
  const sorted = [...boards].sort((a, b) => b.lastOpened - a.lastOpened).slice(0, MAX_RECENT_BOARDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // Storage full or blocked: retry without thumbnails (the bulk of the data), else give up.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted.map(({ thumbnail: _t, ...rest }) => rest)));
    } catch {
      // The list just won't be remembered.
    }
  }
}

function update(id: string, change: (board: RecentBoard | undefined) => RecentBoard | null): void {
  const boards = loadRecentBoards();
  const index = boards.findIndex((b) => b.id === id);
  const next = change(boards[index]);
  if (index >= 0) boards.splice(index, 1);
  if (next) boards.push(next);
  save(boards);
}

/** Note that a board was opened now (adding it if new). Returns its stored entry. */
export function recordVisit(id: string, now = Date.now()): RecentBoard {
  const existing = loadRecentBoards().find((b) => b.id === id);
  const board: RecentBoard = { ...(existing ?? { id, name: DEFAULT_BOARD_NAME }), lastOpened: now };
  update(id, () => board);
  return board;
}

/** Trim, collapse spaces, cap length; empty names fall back to the default. */
export function cleanBoardName(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  return cleaned || DEFAULT_BOARD_NAME;
}

export function renameBoard(id: string, name: string): void {
  update(id, (board) => (board ? { ...board, name: cleanBoardName(name) } : null));
}

/** Store a board's thumbnail, or pass null to remove it (an empty board shows a placeholder). */
export function saveThumbnail(id: string, thumbnail: string | null): void {
  if (thumbnail !== null && !thumbnail.startsWith("data:image/")) return;
  update(id, (board) => {
    if (!board) return null;
    if (thumbnail !== null) return { ...board, thumbnail };
    const { thumbnail: _old, ...rest } = board;
    return rest;
  });
}

export function removeRecentBoard(id: string): void {
  update(id, () => null);
}
