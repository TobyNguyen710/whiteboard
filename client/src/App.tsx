import { useState } from "react";
import { Canvas } from "./Canvas";
import { RoomBadge } from "./RoomBadge";
import { Toolbar } from "./Toolbar";
import { getOrCreateRoomId } from "./room";
import { loadSettings, saveSettings, type ToolSettings } from "./tools";
import { useRoomConnection } from "./useRoomConnection";

export function App() {
  const [roomId] = useState(getOrCreateRoomId);
  const { status, socket, userCount } = useRoomConnection(roomId);
  const [settings, setSettings] = useState<ToolSettings>(loadSettings);

  const changeSettings = (next: ToolSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  return (
    <>
      <Canvas socket={socket} color={settings.color} size={settings.size} />
      <RoomBadge roomId={roomId} status={status} userCount={userCount} />
      <Toolbar settings={settings} onChange={changeSettings} />
    </>
  );
}
