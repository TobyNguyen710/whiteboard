import { COLORS, SIZES, type ToolSettings } from "./tools";

type Props = {
  settings: ToolSettings;
  onChange: (settings: ToolSettings) => void;
};

// Size dots are drawn at a fixed screen scale so the smallest stays visible and the largest fits.
const dotDiameter = (size: number) => Math.min(4 + size * 0.6, 22);

export function Toolbar({ settings, onChange }: Props) {
  const isPreset = (COLORS as readonly string[]).includes(settings.color);

  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing tools">
      <div className="tool-group" role="group" aria-label="Color">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{ background: color }}
            aria-label={`Color ${color}`}
            aria-pressed={settings.color === color}
            onClick={() => onChange({ ...settings, color })}
          />
        ))}
        <label
          className="swatch custom-color"
          aria-pressed={!isPreset}
          title="Custom color"
          style={isPreset ? undefined : { background: settings.color }}
        >
          <input
            type="color"
            aria-label="Custom color"
            value={settings.color}
            onChange={(e) => onChange({ ...settings, color: e.target.value })}
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
                background: settings.color,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
