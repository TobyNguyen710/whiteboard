import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGuestName, randomGuestName, setGuestName } from "./guestName";

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

describe("guest names", () => {
  it("makes friendly random names", () => {
    expect(randomGuestName()).toMatch(/^Guest [A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it("remembers the generated name", () => {
    const first = getGuestName();
    expect(getGuestName()).toBe(first);
  });

  it("saves a cleaned-up new name", () => {
    expect(setGuestName("  Teal   Otter ")).toBe("Teal Otter");
    expect(getGuestName()).toBe("Teal Otter");
  });

  it("refuses blank names and keeps the old one", () => {
    setGuestName("Keeper");
    expect(setGuestName("   ")).toBeNull();
    expect(getGuestName()).toBe("Keeper");
  });

  it("still works when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(getGuestName()).toMatch(/^Guest /);
    expect(setGuestName("Still fine")).toBe("Still fine");
  });
});
