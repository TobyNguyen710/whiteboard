import { useState, type FormEvent, type KeyboardEvent } from "react";
import { boardPath, generateRoomId, parseRoomInput } from "./room";
import type { ConnectionStatus } from "./useRoomConnection";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  offline: "Offline",
};

type Props = { roomId: string; status: ConnectionStatus; userCount: number | null };

// Switching boards is a full page load so the canvas and connection start fresh.
function goToBoard(roomId: string) {
  window.location.assign(boardPath(roomId));
}

export function RoomBadge({ roomId, status, userCount }: Props) {
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinValue, setJoinValue] = useState("");
  const [joinError, setJoinError] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the URL bar still works.
    }
  };

  const closeJoin = () => {
    setJoining(false);
    setJoinValue("");
    setJoinError(false);
  };

  const submitJoin = (e: FormEvent) => {
    e.preventDefault();
    const target = parseRoomInput(joinValue);
    if (!target) {
      setJoinError(true);
      return;
    }
    if (target === roomId) closeJoin();
    else goToBoard(target);
  };

  const handleJoinKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") closeJoin();
  };

  return (
    <div className="room-badge">
      <span className={`status-dot status-${status}`} aria-hidden="true" />
      <span>
        {STATUS_LABELS[status]}
        {status === "connected" && userCount !== null && (
          <span className="user-count"> · {userCount} online</span>
        )}
      </span>
      <span className="room-id">{roomId}</span>

      {joining ? (
        <form className="join-form" onSubmit={submitJoin}>
          <input
            autoFocus
            aria-label="Board ID or link"
            aria-invalid={joinError}
            placeholder="Board ID or link"
            value={joinValue}
            onChange={(e) => {
              setJoinValue(e.target.value);
              setJoinError(false);
            }}
            onKeyDown={handleJoinKeyDown}
          />
          <button type="submit">Join</button>
          <button type="button" className="secondary" onClick={closeJoin}>
            Cancel
          </button>
          {joinError && <span className="join-error">Not a valid board</span>}
        </form>
      ) : (
        <>
          <button type="button" onClick={() => void copyLink()}>
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button type="button" className="secondary" onClick={() => setJoining(true)}>
            Join
          </button>
          <button type="button" className="secondary" onClick={() => goToBoard(generateRoomId())}>
            New board
          </button>
        </>
      )}
    </div>
  );
}
