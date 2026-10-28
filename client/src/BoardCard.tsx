import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { MAX_BOARD_NAME_LENGTH } from "@whiteboard/shared";
import { ApiError } from "./api";
import { boardPath } from "./room";

type Props = {
  id: string;
  name: string;
  thumbnail: string | null;
  /** Small line under the name, e.g. "Opened 5 minutes ago". */
  meta: ReactNode;
  /** Shown when renaming is allowed (your own boards). */
  onRename?: (name: string) => void | Promise<void>;
  /** Shown for boards you own: deletes for everyone, after a confirmation. */
  onDelete?: () => void | Promise<void>;
  /** Shown for boards on your list you don't own: takes it off your list. */
  onRemove?: () => void | Promise<void>;
  removeLabel?: string;
};

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BoardCard({
  id,
  name,
  thumbnail,
  meta,
  onRename,
  onDelete,
  onRemove,
  removeLabel = "Remove from list",
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  /** Run an action, showing a friendly error on the card if it fails. */
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Same pattern as the board top bar: Enter and Escape both blur; blur saves unless cancelled.
  const finishEditing = () => {
    setEditing(false);
    if (cancelledRef.current) cancelledRef.current = false;
    else if (onRename && draft.trim() && draft !== name) void run(() => onRename(draft));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.currentTarget.querySelector("input")?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      cancelledRef.current = true;
      e.currentTarget.blur();
    }
  };

  return (
    <article className="board-card" aria-busy={busy}>
      <Link to={boardPath(id)} className="board-card-thumb" aria-label={`Open ${name}`}>
        {thumbnail ? <img src={thumbnail} alt="" /> : <span className="thumb-placeholder" aria-hidden="true" />}
      </Link>

      <div className="board-card-info">
        {editing ? (
          <form onSubmit={onSubmit}>
            <input
              autoFocus
              className="board-card-input"
              aria-label="Board name"
              maxLength={MAX_BOARD_NAME_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={onKeyDown}
            />
          </form>
        ) : (
          <Link to={boardPath(id)} className="board-card-name">
            {name}
          </Link>
        )}
        <span className="board-card-meta">{meta}</span>
        {error && <span className="board-card-error">{error}</span>}
      </div>

      {confirmingDelete ? (
        <div className="board-card-confirm" role="alertdialog" aria-label={`Delete ${name}?`}>
          <p>Delete for everyone?</p>
          <p className="confirm-hint">This can't be undone.</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={() => {
                setConfirmingDelete(false);
                void run(() => onDelete?.());
              }}
            >
              Delete
            </button>
            <button type="button" className="text-button" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="board-card-actions">
          {onRename && (
            <button
              type="button"
              className="card-action"
              title="Rename"
              aria-label={`Rename ${name}`}
              disabled={busy}
              onClick={() => {
                setDraft(name);
                setEditing(true);
              }}
            >
              <PencilIcon />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="card-action"
              title="Delete board"
              aria-label={`Delete ${name}`}
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              <TrashIcon />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className="card-action"
              title={removeLabel}
              aria-label={`${removeLabel}: ${name}`}
              disabled={busy}
              onClick={() => void run(onRemove)}
            >
              <CrossIcon />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
