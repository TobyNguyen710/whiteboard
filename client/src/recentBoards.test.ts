import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanBoardName,
  DEFAULT_BOARD_NAME,
  loadRecentBoards,
  MAX_NAME_LENGTH,
  MAX_RECENT_BOARDS,
  recordVisit,
  removeRecentBoard,
  renameBoard,
  saveThumbnail,
} from "./recentBoards";

const STORAGE_KEY = "whiteboard:recent-boards";
const THUMB = "data:image/jpeg;base64,AAAA";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recordVisit", () => {
  it("adds a new board with the default name", () => {
    expect(recordVisit("board1111", 100)).toEqual({ id: "board1111", name: DEFAULT_BOARD_NAME, lastOpened: 100 });
    expect(loadRecentBoards()).toHaveLength(1);
  });

  it("keeps the name and thumbnail when revisiting, and updates the time", () => {
    recordVisit("board1111", 100);
    renameBoard("board1111", "Plans");
    saveThumbnail("board1111", THUMB);
    expect(recordVisit("board1111", 200)).toEqual({
      id: "board1111",
      name: "Plans",
      lastOpened: 200,
      thumbnail: THUMB,
    });
    expect(loadRecentBoards()).toHaveLength(1);
  });

  it("lists the most recently opened first", () => {
    recordVisit("board1111", 100);
    recordVisit("board2222", 300);
    recordVisit("board3333", 200);
    expect(loadRecentBoards().map((b) => b.id)).toEqual(["board2222", "board3333", "board1111"]);
  });

  it(`keeps only the ${MAX_RECENT_BOARDS} most recent`, () => {
    for (let i = 0; i < MAX_RECENT_BOARDS + 5; i++) recordVisit(`board${1000 + i}`, i);
    const boards = loadRecentBoards();
    expect(boards).toHaveLength(MAX_RECENT_BOARDS);
    expect(boards.at(-1)!.id).toBe("board1005"); // the 5 oldest were dropped
  });
});

describe("rename, thumbnail, remove", () => {
  it("renames with a cleaned-up name", () => {
    recordVisit("board1111", 100);
    renameBoard("board1111", "   Weekly   sync  ");
    expect(loadRecentBoards()[0]!.name).toBe("Weekly sync");
  });

  it("ignores boards that aren't in the list", () => {
    renameBoard("board9999", "Ghost");
    saveThumbnail("board9999", THUMB);
    expect(loadRecentBoards()).toEqual([]);
  });

  it("only accepts image data URLs as thumbnails", () => {
    recordVisit("board1111", 100);
    saveThumbnail("board1111", "javascript:alert(1)");
    expect(loadRecentBoards()[0]!.thumbnail).toBeUndefined();
  });

  it("removes the thumbnail when given null (empty or cleared board)", () => {
    recordVisit("board1111", 100);
    saveThumbnail("board1111", THUMB);
    saveThumbnail("board1111", null);
    expect(loadRecentBoards()[0]).toEqual({ id: "board1111", name: DEFAULT_BOARD_NAME, lastOpened: 100 });
  });

  it("removes a board", () => {
    recordVisit("board1111", 100);
    recordVisit("board2222", 200);
    removeRecentBoard("board1111");
    expect(loadRecentBoards().map((b) => b.id)).toEqual(["board2222"]);
  });
});

describe("loadRecentBoards", () => {
  it("drops invalid saved entries", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "board1111", name: "Good", lastOpened: 1 },
        { id: "../bad", name: "Bad id", lastOpened: 2 },
        { id: "board2222", name: 42, lastOpened: 3 },
        { id: "board3333", name: "Bad thumb", lastOpened: 4, thumbnail: "https://evil.example/x.png" },
        "junk",
      ]),
    );
    expect(loadRecentBoards().map((b) => b.name)).toEqual(["Good"]);
  });

  it("survives corrupt or blocked storage", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadRecentBoards()).toEqual([]);

    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadRecentBoards()).toEqual([]);
    expect(() => recordVisit("board1111")).not.toThrow();
  });
});

describe("cleanBoardName", () => {
  it("falls back to the default for blank names", () => {
    expect(cleanBoardName("   ")).toBe(DEFAULT_BOARD_NAME);
  });

  it("caps the length", () => {
    expect(cleanBoardName("x".repeat(500))).toHaveLength(MAX_NAME_LENGTH);
  });
});
