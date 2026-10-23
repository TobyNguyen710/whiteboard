import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { MAX_NAME_LENGTH, type RecentBoard } from "./recentBoards";
import { boardPath } from "./room";
import { formatRelativeTime } from "./time";

type Props = {
  board: RecentBoard;
  onRename: (name: string) => void;
  onRemove: () => void;
};

export function BoardCard({ board, onRename, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(board.name);
  const cancelledRef = useRef(false);

  // Same pattern as the board top bar: Enter and Escape both blur; blur saves unless cancelled.
  const finishEditing = () => {
    setEditing(false);
    if (cancelledRef.current) cancelledRef.current = false;
    else if (draft !== board.name) onRename(draft);
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
    <article className="board-card">
      <Link to={boardPath(board.id)} className="board-card-thumb" aria-label={`Open ${board.name}`}>
        {board.thumbnail ? (
          <img src={board.thumbnail} alt="" />
        ) : (
          <span className="thumb-placeholder" aria-hidden="true" />
        )}
      </Link>

      <div className="board-card-info">
        {editing ? (
          <form onSubmit={onSubmit}>
            <input
              autoFocus
              className="board-card-input"
              aria-label="Board name"
              maxLength={MAX_NAME_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={onKeyDown}
            />
          </form>
        ) : (
          <Link to={boardPath(board.id)} className="board-card-name">
            {board.name}
          </Link>
        )}
        <span className="board-card-meta">Opened {formatRelativeTime(board.lastOpened)}</span>
      </div>

      <div className="board-card-actions">
        <button
          type="button"
          className="card-action"
          title="Rename"
          aria-label={`Rename ${board.name}`}
          onClick={() => {
            setDraft(board.name);
            setEditing(true);
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="card-action"
          title="Remove from recent"
          aria-label={`Remove ${board.name} from recent boards`}
          onClick={onRemove}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </article>
  );
}
