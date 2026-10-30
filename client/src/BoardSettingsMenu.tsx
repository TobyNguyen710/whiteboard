import type { BoardSettings } from "@whiteboard/shared";
import { usePopover } from "./usePopover";

type Props = {
  settings: BoardSettings;
  removedCount: number;
  onChange: (change: Partial<BoardSettings>) => void;
  onAllowRemoved: () => void;
};

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Host-only board settings: role for new people, lock, who can clear, removed people. */
export function BoardSettingsMenu({ settings, removedCount, onChange, onAllowRemoved }: Props) {
  const { open, toggle, ref } = usePopover<HTMLDivElement>();

  return (
    <div className="settings-menu" ref={ref}>
      <button
        type="button"
        className="icon-button"
        aria-label="Board settings"
        title="Board settings"
        aria-expanded={open}
        onClick={toggle}
      >
        <GearIcon />
      </button>

      {open && (
        <div className="popover settings-popover" role="dialog" aria-label="Board settings">
          <p className="popover-title">Board settings</p>

          <label className="setting-row">
            <span>
              <span className="setting-name">New people join as</span>
              <span className="setting-help">Anyone you haven't given a role yet</span>
            </span>
            <select
              className="role-select"
              value={settings.defaultRole}
              onChange={(e) => onChange({ defaultRole: e.target.value === "viewer" ? "viewer" : "editor" })}
            >
              <option value="editor">Can draw</option>
              <option value="viewer">View only</option>
            </select>
          </label>

          <label className="setting-row">
            <span>
              <span className="setting-name">Lock board</span>
              <span className="setting-help">Only you can draw while locked</span>
            </span>
            <input
              type="checkbox"
              className="setting-switch"
              role="switch"
              checked={settings.locked}
              onChange={(e) => onChange({ locked: e.target.checked })}
            />
          </label>

          <label className="setting-row">
            <span>
              <span className="setting-name">Who can clear</span>
              <span className="setting-help">Wipe the board for everyone</span>
            </span>
            <select
              className="role-select"
              value={settings.clearPolicy}
              onChange={(e) => onChange({ clearPolicy: e.target.value === "editors" ? "editors" : "host" })}
            >
              <option value="host">Only me</option>
              <option value="editors">Anyone who can draw</option>
            </select>
          </label>

          {removedCount > 0 && (
            <div className="setting-row">
              <span>
                <span className="setting-name">
                  {removedCount} {removedCount === 1 ? "person" : "people"} removed
                </span>
                <span className="setting-help">They can't rejoin until you allow it</span>
              </span>
              <button type="button" className="text-button" onClick={onAllowRemoved}>
                Allow back
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
