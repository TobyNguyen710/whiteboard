import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router";
import {
  cleanBoardName as cleanSharedBoardName,
  DEFAULT_BOARD_NAME,
  isValidRoomId,
  MAX_BOARD_PASSWORD_LENGTH,
  permissionsFor,
  type AssignableRole,
  type BoardSettings,
} from "@whiteboard/shared";
import { useAuth } from "../auth";
import { BoardTopBar } from "../BoardTopBar";
import { Canvas, type CanvasHandle } from "../Canvas";
import { getGuestName, setGuestName } from "../guestName";
import { Logo } from "../Logo";
import {
  cleanBoardName,
  recordVisit,
  removeRecentBoard,
  renameBoard,
  saveThumbnail,
} from "../recentBoards";
import { SignInButtons } from "../SignInButtons";
import { Toolbar } from "../Toolbar";
import { loadSettings, saveSettings, type ToolSettings } from "../tools";
import { useRoomConnection, type ConnectionProblem } from "../useRoomConnection";
import { useUndoShortcuts } from "../useUndoShortcuts";

const THUMBNAIL_INTERVAL_MS = 15_000;
/** How long "Connecting…" can show before we explain that the free server may be asleep. */
const WAKE_HINT_DELAY_MS = 5_000;
const SET_PASSWORD_TIMEOUT_MS = 10_000;

export function BoardPage() {
  const { roomId } = useParams();
  const { loading, account } = useAuth();
  if (!isValidRoomId(roomId)) return <Navigate to="/" replace />;
  if (loading) return <div className="page-loading">Loading…</div>;
  // A new key per board and per login, so switching either starts a fresh connection
  // (signing in or out mid-board reconnects as the new you).
  return <Board key={`${roomId}:${account?.id ?? "guest"}`} roomId={roomId} />;
}

function Board({ roomId }: { roomId: string }) {
  const { enabled: accounts, account, signOut } = useAuth();
  const [guestName, setGuestNameState] = useState(getGuestName);
  const {
    status,
    socket,
    users,
    selfId,
    problem,
    boardName,
    role,
    hasHost,
    settings: boardSettings,
    removedCount,
    hasPassword,
    joinWithPassword,
  } = useRoomConnection(roomId);
  const permissions = permissionsFor(role, hasHost, boardSettings);
  const [settings, setSettings] = useState<ToolSettings>(loadSettings);
  // Without accounts (login not configured), names and previews are kept in this browser.
  const [localName, setLocalName] = useState(() => (accounts ? DEFAULT_BOARD_NAME : recordVisit(roomId).name));
  const name = accounts ? (boardName ?? DEFAULT_BOARD_NAME) : localName;
  const canRename = accounts ? permissions.canManageBoard : true;
  const canvasRef = useRef<CanvasHandle>(null);
  const lastSentThumbnailRef = useRef<string | null>(null);
  const connected = status === "connected";
  const [slowConnect, setSlowConnect] = useState(false);

  // The free server sleeps when idle and takes up to a minute to wake: say so instead of
  // leaving people looking at "Connecting…".
  useEffect(() => {
    if (status !== "connecting") return;
    const timer = setTimeout(() => setSlowConnect(true), WAKE_HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setSlowConnect(false);
    };
  }, [status]);

  // The server rejected our login (expired or revoked): sign out and come back as a guest.
  useEffect(() => {
    if (problem === "unauthorized") void signOut();
  }, [problem, signOut]);

  // A board that doesn't exist shouldn't linger in the recent boards list.
  useEffect(() => {
    if (problem === "not-found") removeRecentBoard(roomId);
  }, [problem, roomId]);

  useEffect(() => {
    document.title = `${name} · Whiteboard`;
    return () => {
      document.title = "Whiteboard";
    };
  }, [name]);

  // Keep the dashboard preview fresh: every so often, when the tab is hidden, and on leaving.
  // With accounts it's sent to the server (only when it changed); otherwise kept in this browser.
  const captureThumbnail = useCallback(() => {
    const thumbnail = canvasRef.current?.getThumbnail();
    // undefined = board not loaded yet: keep whatever preview we had.
    if (thumbnail === undefined) return;
    if (!accounts) {
      saveThumbnail(roomId, thumbnail);
      return;
    }
    if (!account || !socket?.connected || !thumbnail || thumbnail === lastSentThumbnailRef.current) return;
    lastSentThumbnailRef.current = thumbnail;
    socket.emit("board:thumbnail", { image: thumbnail });
  }, [accounts, account, roomId, socket]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") captureThumbnail();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", captureThumbnail);
    const timer = setInterval(captureThumbnail, THUMBNAIL_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", captureThumbnail);
      clearInterval(timer);
    };
  }, [captureThumbnail]);

  // Layout-effect cleanup runs while the canvas handle is still attached, so leaving for the
  // dashboard (an in-app navigation) captures the final state too.
  useLayoutEffect(() => captureThumbnail, [captureThumbnail]);

  const changeSettings = (next: ToolSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const rename = (next: string) => {
    if (accounts) {
      // The server checks you're the owner and tells everyone on the board.
      const cleaned = cleanSharedBoardName(next);
      if (cleaned && permissions.canManageBoard) socket?.emit("board:rename", { name: cleaned });
      return;
    }
    const cleaned = cleanBoardName(next);
    setLocalName(cleaned);
    renameBoard(roomId, cleaned);
  };

  // The canvas updates when the server broadcasts the result back to everyone (including us).
  const clearBoard = () => socket?.emit("board:clear", { roomId });
  const { canDraw } = permissions;
  const undo = useCallback(() => {
    if (canDraw && socket?.connected) socket.emit("board:undo");
  }, [canDraw, socket]);
  const redo = useCallback(() => {
    if (canDraw && socket?.connected) socket.emit("board:redo");
  }, [canDraw, socket]);

  // Host only (the server checks): make someone an editor or a viewer.
  const setRole = (participantId: string, next: AssignableRole) =>
    socket?.emit("member:set-role", { participantId, role: next });
  const removePerson = (participantId: string) => socket?.emit("member:remove", { participantId });
  const updateSettings = (change: Partial<BoardSettings>) => socket?.emit("board:update-settings", change);
  const allowRemoved = () => socket?.emit("board:allow-removed");
  const setPassword = (password: string | null) =>
    new Promise<boolean>((resolve) => {
      if (!socket?.connected) return resolve(false);
      socket
        .timeout(SET_PASSWORD_TIMEOUT_MS)
        .emit("board:set-password", { password }, (error, result) => resolve(!error && result.ok));
    });

  useUndoShortcuts(undo, redo);

  const renameGuest = (next: string) => {
    const cleaned = setGuestName(next);
    if (!cleaned) return;
    setGuestNameState(cleaned);
    socket?.emit("user:rename", { name: cleaned });
  };

  if (problem === "not-found" || problem === "deleted") {
    return <BoardNotFound deleted={problem === "deleted"} />;
  }
  if (problem === "removed") return <RemovedFromBoard />;

  const isHost = permissions.canManageBoard && hasHost;

  return (
    <div className="board-page">
      {/* Over the board, not instead of it: the canvas must be listening when we get in. */}
      {problem === "private" && <PrivateBoard />}
      {(problem === "password-needed" || problem === "password-wrong" || problem === "too-many-tries") && (
        <PasswordGate problem={problem} onSubmit={joinWithPassword} />
      )}
      <BoardTopBar
        name={name}
        onRename={canRename ? rename : undefined}
        status={status}
        users={users}
        selfId={selfId}
        guestName={account ? undefined : guestName}
        onGuestRename={account ? undefined : renameGuest}
        canManagePeople={permissions.canManagePeople}
        onSetRole={setRole}
        onRemove={removePerson}
        drawBlocked={canDraw ? null : role === "viewer" ? "viewer" : "locked"}
        settings={
          isHost
            ? { value: boardSettings, removedCount, onChange: updateSettings, onAllowRemoved: allowRemoved }
            : undefined
        }
        sharing={
          isHost
            ? {
                boardId: roomId,
                shared: boardSettings.shared,
                hasPassword,
                onSharedChange: (shared) => updateSettings({ shared }),
                onSetPassword: setPassword,
              }
            : undefined
        }
        canCopyLink={!hasHost || boardSettings.shared}
      />
      <div className="board-area">
        {slowConnect && (
          <p className="wake-hint" role="status">
            The server is waking up (free hosting). This can take up to a minute.
          </p>
        )}
        <Canvas
          ref={canvasRef}
          socket={socket}
          tool={settings.tool}
          color={settings.color}
          size={settings.size}
          readOnly={!canDraw}
        />
      </div>
      {canDraw && (
        <Toolbar
          settings={settings}
          onChange={changeSettings}
          connected={connected}
          onUndo={undo}
          onRedo={redo}
          onClear={clearBoard}
          canClear={permissions.canClear}
        />
      )}
    </div>
  );
}

function BoardNotFound({ deleted }: { deleted: boolean }) {
  const { enabled, account } = useAuth();
  return (
    <div className="message-page">
      <Logo />
      <h1>{deleted ? "This board was deleted" : "This board doesn't exist"}</h1>
      <p>
        {deleted ? "Its owner deleted it." : "The link may be wrong, or the board was deleted."}
        {enabled && !account && " Sign in to create your own boards."}
      </p>
      {enabled && !account && <SignInButtons />}
      <Link to="/" className="message-link">
        Back to home
      </Link>
    </div>
  );
}

function PrivateBoard() {
  const { enabled, account } = useAuth();
  return (
    <div className="board-gate">
      <div className="message-page">
        <Logo />
        <h1>This board is private</h1>
        <p>
          Ask the host to turn on sharing, then open the link again.
          {enabled && !account && " If you've joined it before, sign in."}
        </p>
        {enabled && !account && <SignInButtons />}
        <Link to="/" className="message-link">
          Back to home
        </Link>
      </div>
    </div>
  );
}

const PASSWORD_ERRORS: Partial<Record<ConnectionProblem, string>> = {
  "password-wrong": "That password isn't right.",
  "too-many-tries": "Too many tries. Wait a minute, then try again.",
};

function PasswordGate({ problem, onSubmit }: { problem: ConnectionProblem; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  const error = PASSWORD_ERRORS[problem];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) onSubmit(password);
  };

  return (
    <div className="board-gate">
      <form className="message-page" onSubmit={submit}>
        <Logo />
        <h1>This board has a password</h1>
        <p>Ask the host for it. You'll only need it once.</p>
        <input
          autoFocus
          type="password"
          className="join-input gate-input"
          aria-label="Board password"
          aria-invalid={Boolean(error)}
          autoComplete="off"
          maxLength={MAX_BOARD_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <span className="join-error" role="alert">
            {error}
          </span>
        )}
        <button type="submit" className="join-button">
          Join board
        </button>
        <Link to="/" className="message-link">
          Back to home
        </Link>
      </form>
    </div>
  );
}

function RemovedFromBoard() {
  return (
    <div className="message-page">
      <Logo />
      <h1>You were removed from this board</h1>
      <p>The board's host removed you. You can rejoin if they allow it.</p>
      <Link to="/" className="message-link">
        Back to home
      </Link>
    </div>
  );
}
