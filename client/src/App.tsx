import { useCallback, useState } from "react";
import { Canvas } from "./Canvas";
import { RoomBadge } from "./RoomBadge";
import { Toolbar } from "./Toolbar";
import { getOrCreateRoomId } from "./room";
import { loadSettings, saveSettings, type ToolSettings } from "./tools";
import { useRoomConnection } from "./useRoomConnection";
import { useUndoShortcuts } from "./useUndoShortcuts";

export function App() {
  const [roomId] = useState(getOrCreateRoomId);
  const { status, socket, userCount } = useRoomConnection(roomId);
  const [settings, setSettings] = useState<ToolSettings>(loadSettings);
  const connected = status === "connected";

  const changeSettings = (next: ToolSettings) => {
    setSettings(next);
    saveSettings(next);
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
    <>
      <Canvas
        socket={socket}
        tool={settings.tool}
        color={settings.color}
        size={settings.size}
      />
      <RoomBadge roomId={roomId} status={status} userCount={userCount} />
      <Toolbar
        settings={settings}
        onChange={changeSettings}
        connected={connected}
        onUndo={undo}
        onRedo={redo}
        onClear={clearBoard}
      />
    </>
  );
}
