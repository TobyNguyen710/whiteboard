import { useState } from "react";
import { MAX_BRUSH_SIZE, MIN_BRUSH_SIZE } from "@whiteboard/shared";
import { clampSize, COLORS, SIZES, type ToolSettings } from "./tools";

type Props = {
  settings: ToolSettings;
  onChange: (settings: ToolSettings) => void;
  /** Undo, redo, and clear go through the server, so they are disabled while disconnected. */
  connected: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  /** Only the host (or anyone, on boards without a host) can clear for everyone. */
  canClear: boolean;
};

const ERASER_DOT_COLOR = "#adb5bd";

// Size dots are drawn at a fixed screen scale so the smallest stays visible and the largest fits.
const dotDiameter = (size: number) => Math.min(4 + size * 0.6, 22);

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M8 20h12M5.5 14.5l8-8a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L10.8 19.2a2 2 0 01-1.4.6H8.6a2 2 0 01-1.4-.6l-1.7-1.7a2 2 0 010-3zM9 11l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Toolbar({ settings, onChange, connected, onUndo, onRedo, onClear, canClear }: Props) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const isPreset = (COLORS as readonly string[]).includes(settings.color);
  const isPen = settings.tool === "pen";

  // Picking a color means you want to draw, so it switches back to the pen.
  const pickColor = (color: string) => onChange({ ...settings, tool: "pen", color });

  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing tools">
      <div className="tool-group" role="group" aria-label="History">
        <button
          type="button"
          className="icon-button"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!connected}
          onClick={onUndo}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={!connected}
          onClick={onRedo}
        >
          <RedoIcon />
        </button>
      </div>

      <div className="tool-divider" aria-hidden="true" />

      <div className="tool-group" role="group" aria-label="Tool">
        <button
          type="button"
          className="icon-button"
          aria-label="Pen"
          title="Pen"
          aria-pressed={isPen}
          onClick={() => onChange({ ...settings, tool: "pen" })}
        >
          <PenIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Eraser"
          title="Eraser"
          aria-pressed={!isPen}
          onClick={() => onChange({ ...settings, tool: "eraser" })}
        >
          <EraserIcon />
        </button>
      </div>

      <div className="tool-divider" aria-hidden="true" />

      <div className="tool-group" role="group" aria-label="Color">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{ background: color }}
            aria-label={`Color ${color}`}
            aria-pressed={isPen && settings.color === color}
            onClick={() => pickColor(color)}
          />
        ))}
        <label
          className="swatch custom-color"
          aria-pressed={isPen && !isPreset}
          title="Custom color"
          style={isPreset ? undefined : { background: settings.color }}
        >
          <input
            type="color"
            aria-label="Custom color"
            value={settings.color}
            onChange={(e) => pickColor(e.target.value)}
          />
        </label>
      </div>

      <div className="tool-divider" aria-hidden="true" />

      <div className="tool-group" role="group" aria-label="Brush size">
        {SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className="size-button"
            aria-label={`Brush size ${size}`}
            aria-pressed={settings.size === size}
            onClick={() => onChange({ ...settings, size })}
          >
            <span
              className="size-dot"
              style={{
                width: dotDiameter(size),
                height: dotDiameter(size),
                background: isPen ? settings.color : ERASER_DOT_COLOR,
              }}
            />
          </button>
        ))}
        <input
          type="range"
          className="size-slider"
          aria-label="Brush size"
          min={MIN_BRUSH_SIZE}
          max={MAX_BRUSH_SIZE}
          step={1}
          value={settings.size}
          style={
            {
              "--fill": `${((settings.size - MIN_BRUSH_SIZE) / (MAX_BRUSH_SIZE - MIN_BRUSH_SIZE)) * 100}%`,
            } as React.CSSProperties
          }
          onChange={(e) => onChange({ ...settings, size: clampSize(Number(e.target.value)) })}
        />
        <span className="size-value" aria-hidden="true">
          {settings.size}
        </span>
      </div>

      {canClear && <div className="tool-divider" aria-hidden="true" />}

      {canClear && (
        <div className="tool-group">
          {confirmingClear ? (
            <>
              <span className="clear-prompt">Clear for everyone?</span>
              <button
                type="button"
                className="text-button danger"
                disabled={!connected}
                onClick={() => {
                  onClear();
                  setConfirmingClear(false);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirmingClear(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-button"
              disabled={!connected}
              title={connected ? "Clear the board for everyone" : "Connect to clear the board"}
              onClick={() => setConfirmingClear(true)}
            >
              Clear board
            </button>
          )}
        </div>
      )}
    </div>
  );
}
