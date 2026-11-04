import { useState, type FormEvent } from "react";
import { isValidBoardPassword, MAX_BOARD_PASSWORD_LENGTH, MIN_BOARD_PASSWORD_LENGTH } from "@whiteboard/shared";
import { usePopover } from "./usePopover";

type Props = {
  boardId: string;
  shared: boolean;
  hasPassword: boolean;
  onSharedChange: (shared: boolean) => void;
  /** Resolves to false if the password couldn't be saved. */
  onSetPassword: (password: string | null) => Promise<boolean>;
};

export function ShareIcon() {
  return (
    <svg className="share-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the text can still be selected.
    }
  };

  return (
    <div className="setting-row">
      <span className="share-value">
        <span className="setting-name">{label}</span>
        <span className="setting-help share-text">{value}</span>
      </span>
      <button type="button" className="text-button" onClick={() => void copy()}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function PasswordRow({ hasPassword, onSetPassword }: Pick<Props, "hasPassword" | "onSetPassword">) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);

  const save = async (password: string | null) => {
    setFailed(false);
    const ok = await onSetPassword(password);
    setFailed(!ok);
    if (ok) {
      setEditing(false);
      setDraft("");
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isValidBoardPassword(draft)) void save(draft);
  };

  if (editing) {
    return (
      <form className="setting-row password-form" onSubmit={submit}>
        <input
          autoFocus
          className="password-input"
          aria-label="Board password"
          placeholder={`At least ${MIN_BOARD_PASSWORD_LENGTH} characters`}
          autoComplete="off"
          maxLength={MAX_BOARD_PASSWORD_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="text-button" disabled={!isValidBoardPassword(draft)}>
          Save
        </button>
        <button type="button" className="text-button" onClick={() => setEditing(false)}>
          Cancel
        </button>
        {failed && <span className="password-error">Couldn't save the password. Try again.</span>}
      </form>
    );
  }

  return (
    <div className="setting-row">
      <span>
        <span className="setting-name">Password</span>
        <span className="setting-help">{hasPassword ? "New people need it to join" : "None (optional)"}</span>
        {failed && <span className="password-error">Couldn't save the change. Try again.</span>}
      </span>
      <span className="password-actions">
        <button type="button" className="text-button" onClick={() => setEditing(true)}>
          {hasPassword ? "Change" : "Add"}
        </button>
        {hasPassword && (
          <button type="button" className="text-button" onClick={() => void save(null)}>
            Remove
          </button>
        )}
      </span>
    </div>
  );
}

/** Host only: open the board to others, get its link and ID, and set an optional password. */
export function ShareMenu({ boardId, shared, hasPassword, onSharedChange, onSetPassword }: Props) {
  const { open, toggle, ref } = usePopover<HTMLDivElement>();

  return (
    <div className="settings-menu" ref={ref}>
      <button
        type="button"
        className="share-button"
        aria-label="Share"
        title="Share this board"
        aria-expanded={open}
        onClick={toggle}
      >
        <ShareIcon />
        <span className="share-label">Share</span>
      </button>

      {open && (
        <div className="popover settings-popover" role="dialog" aria-label="Share this board">
          <p className="popover-title">Share this board</p>

          <label className="setting-row">
            <span>
              <span className="setting-name">Sharing</span>
              <span className="setting-help">
                {shared ? "Anyone with the link or board ID can join" : "Only people who already joined can open it"}
              </span>
            </span>
            <input
              type="checkbox"
              className="setting-switch"
              role="switch"
              checked={shared}
              onChange={(e) => onSharedChange(e.target.checked)}
            />
          </label>

          {shared && (
            <>
              <CopyRow label="Link" value={window.location.href} />
              <CopyRow label="Board ID" value={boardId} />
              <PasswordRow hasPassword={hasPassword} onSetPassword={onSetPassword} />
            </>
          )}

          <p className="popover-hint">Turning sharing off keeps out new people. Anyone already in stays.</p>
        </div>
      )}
    </div>
  );
}
