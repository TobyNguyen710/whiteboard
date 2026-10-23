import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import { isValidRoomId } from "@whiteboard/shared";
import { BoardTopBar } from "../BoardTopBar";
import { Canvas, type CanvasHandle } from "../Canvas";
import { cleanBoardName, recordVisit, renameBoard, saveThumbnail } from "../recentBoards";
import { Toolbar } from "../Toolbar";
import { loadSettings, saveSettings, type ToolSettings } from "../tools";
import { useRoomConnection } from "../useRoomConnection";
import { useUndoShortcuts } from "../useUndoShortcuts";

const THUMBNAIL_INTERVAL_MS = 15_000;

export function BoardPage() {
  const { roomId } = useParams();
  if (!isValidRoomId(roomId)) return <Navigate to="/" replace />;
  // A new key per board, so switching boards starts a fresh connection and canvas.
  return <Board key={roomId} roomId={roomId} />;
}

function Board({ roomId }: { roomId: string }) {
  const { status, socket, userCount } = useRoomConnection(roomId);
  const [settings, setSettings] = useState<ToolSettings>(loadSettings);
  const [name, setName] = useState(() => recordVisit(roomId).name);
  const canvasRef = useRef<CanvasHandle>(null);
  const connected = status === "connected";

  useEffect(() => {
    document.title = `${name} · Whiteboard`;
    return () => {
      document.title = "Whiteboard";
    };
  }, [name]);

  // Keep the dashboard thumbnail fresh: every so often, when the tab is hidden, and on leaving.
  const captureThumbnail = useCallback(() => {
    const thumbnail = canvasRef.current?.getThumbnail();
    // undefined = board not loaded yet: keep whatever thumbnail we had.
    if (thumbnail !== undefined) saveThumbnail(roomId, thumbnail);
  }, [roomId]);

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
    const cleaned = cleanBoardName(next);
    setName(cleaned);
    renameBoard(roomId, cleaned);
  };

  // The canvas updates when the server broadcasts the result back to everyone (including us).
  const clearBoard = () => socket?.emit("board:clear", { roomId });
  const undo = useCallback(() => {
    if (socket?.connected) socket.emit("stroke:undo");
  }, [socket]);
  const redo = useCallback(() => {
    if (socket?.connected) socket.emit("stroke:redo");
  }, [socket]);

  useUndoShortcuts(undo, redo);

  return (
    <div className="board-page">
      <BoardTopBar name={name} onRename={rename} status={status} userCount={userCount} />
      <div className="board-area">
        <Canvas
          ref={canvasRef}
          socket={socket}
          tool={settings.tool}
          color={settings.color}
          size={settings.size}
        />
      </div>
      <Toolbar
        settings={settings}
        onChange={changeSettings}
        connected={connected}
        onUndo={undo}
        onRedo={redo}
        onClear={clearBoard}
      />
    </div>
  );
}
