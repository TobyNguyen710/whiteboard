import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import {
  cleanBoardName as cleanSharedBoardName,
  DEFAULT_BOARD_NAME,
  isValidRoomId,
  permissionsFor,
  type AssignableRole,
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
import { useRoomConnection } from "../useRoomConnection";
import { useUndoShortcuts } from "../useUndoShortcuts";

const THUMBNAIL_INTERVAL_MS = 15_000;

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
  const { status, socket, users, selfId, problem, boardName, role, hasHost } = useRoomConnection(roomId);
  const permissions = permissionsFor(role, hasHost);
  const [settings, setSettings] = useState<ToolSettings>(loadSettings);
  // Without accounts (login not configured), names and previews are kept in this browser.
  const [localName, setLocalName] = useState(() => (accounts ? DEFAULT_BOARD_NAME : recordVisit(roomId).name));
  const name = accounts ? (boardName ?? DEFAULT_BOARD_NAME) : localName;
  const canRename = accounts ? permissions.canManageBoard : true;
  const canvasRef = useRef<CanvasHandle>(null);
  const lastSentThumbnailRef = useRef<string | null>(null);
  const connected = status === "connected";

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
    if (canDraw && socket?.connected) socket.emit("stroke:undo");
  }, [canDraw, socket]);
  const redo = useCallback(() => {
    if (canDraw && socket?.connected) socket.emit("stroke:redo");
  }, [canDraw, socket]);

  // Host only (the server checks): make someone an editor or a viewer.
  const setRole = (participantId: string, next: AssignableRole) =>
    socket?.emit("member:set-role", { participantId, role: next });

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

  return (
    <div className="board-page">
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
        viewOnly={!canDraw}
      />
      <div className="board-area">
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
