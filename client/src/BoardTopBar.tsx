import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { MAX_BOARD_NAME_LENGTH, type Participant } from "@whiteboard/shared";
import { AccountMenu } from "./AccountMenu";
import { ParticipantList } from "./ParticipantList";
import type { ConnectionStatus } from "./useRoomConnection";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  offline: "Offline",
};

type Props = {
  name: string;
  /** Unset when you can't rename this board (only its owner can). */
  onRename?: (name: string) => void;
  status: ConnectionStatus;
  users: Participant[];
  selfId: string | null;
  /** Set for guests, who can change the name others see. */
  guestName?: string;
  onGuestRename?: (name: string) => void;
};

export function BoardTopBar({
  name,
  onRename,
  status,
  users,
  selfId,
  guestName,
  onGuestRename,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [copied, setCopied] = useState(false);
  const cancelledRef = useRef(false);

  const startEditing = () => {
    setDraft(name);
    setEditing(true);
  };

  // Saving happens in one place, on blur: Enter blurs the input, Escape blurs it as cancelled.
  const finishEditing = () => {
    setEditing(false);
    if (cancelledRef.current) cancelledRef.current = false;
    else if (draft !== name) onRename?.(draft);
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

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the URL bar still works.
    }
  };

  return (
    <header className="board-topbar">
      <div className="topbar-left">
        <Link to="/" className="topbar-back" title="Back to home">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sr-only">Home</span>
        </Link>
        {editing ? (
          <form onSubmit={onSubmit} className="board-name-form">
            <input
              autoFocus
              className="board-name-input"
              aria-label="Board name"
              maxLength={MAX_BOARD_NAME_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={onKeyDown}
            />
          </form>
        ) : onRename ? (
          <button type="button" className="board-name" title="Rename board" onClick={startEditing}>
            {name}
          </button>
        ) : (
          <span className="board-name board-name-static">{name}</span>
        )}
      </div>

      <div className="topbar-right">
        {status === "connected" ? (
          <ParticipantList users={users} selfId={selfId} />
        ) : (
          <span className="connection" aria-live="polite">
            <span className={`status-dot status-${status}`} aria-hidden="true" />
            {STATUS_LABELS[status]}
          </span>
        )}
        <button type="button" className="share-button" onClick={() => void share()}>
          {copied ? "Link copied!" : "Share"}
        </button>
        <AccountMenu guestName={guestName} onGuestRename={onGuestRename} />
      </div>
    </header>
  );
}
