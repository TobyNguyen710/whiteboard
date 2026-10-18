import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BRUSH_SIZE, MIN_BRUSH_SIZE } from "@whiteboard/shared";
import { clampSize, DEFAULT_SETTINGS, loadSettings, saveSettings } from "./tools";

const STORAGE_KEY = "whiteboard:tool-settings";

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

describe("clampSize", () => {
  it("rounds to a whole size", () => {
    expect(clampSize(7.4)).toBe(7);
    expect(clampSize(7.6)).toBe(8);
  });

  it("keeps sizes inside the allowed range", () => {
    expect(clampSize(0)).toBe(MIN_BRUSH_SIZE);
    expect(clampSize(-50)).toBe(MIN_BRUSH_SIZE);
    expect(clampSize(9999)).toBe(MAX_BRUSH_SIZE);
  });
});

describe("loadSettings / saveSettings", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the defaults when nothing is saved", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips saved settings", () => {
    const settings = { tool: "eraser" as const, color: "#e03131", size: 42 };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it("replaces each invalid saved field with its default", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tool: "laser", color: "red", size: "big" }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps an out-of-range saved size", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tool: "pen", color: "#1e1e1e", size: 500 }));
    expect(loadSettings().size).toBe(MAX_BRUSH_SIZE);
  });

  it("survives corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
