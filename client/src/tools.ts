export const COLORS = [
  "#1e1e1e", // black
  "#e03131", // red
  "#f08c00", // orange
  "#2f9e44", // green
  "#1971c2", // blue
  "#7048e8", // purple
  "#e64980", // pink
  "#868e96", // grey
] as const;

/** Brush sizes in logical board pixels. */
export const SIZES = [2, 4, 8, 16, 32] as const;

export type ToolSettings = { color: string; size: number };

export const DEFAULT_SETTINGS: ToolSettings = { color: COLORS[0], size: SIZES[1] };

const STORAGE_KEY = "whiteboard:tool-settings";
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** Last-used settings on this device, or the defaults. Storage can be missing or blocked. */
export function loadSettings(): ToolSettings {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof saved !== "object" || saved === null) return DEFAULT_SETTINGS;
    const { color, size } = saved as Record<string, unknown>;
    return {
      color: typeof color === "string" && COLOR_PATTERN.test(color) ? color : DEFAULT_SETTINGS.color,
      size: SIZES.includes(size as (typeof SIZES)[number]) ? (size as number) : DEFAULT_SETTINGS.size,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ToolSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not saving is fine; the choice just won't survive a refresh.
  }
}
