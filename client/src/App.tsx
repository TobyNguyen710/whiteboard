import { useState } from "react";
import { Canvas } from "./Canvas";
import { RoomBadge } from "./RoomBadge";
import { getOrCreateRoomId } from "./room";
import { useRoomConnection } from "./useRoomConnection";

export function App() {
  const [roomId] = useState(getOrCreateRoomId);
  const { status, socket } = useRoomConnection(roomId);

  return (
    <>
      <Canvas socket={socket} />
      <RoomBadge roomId={roomId} status={status} />
    </>
  );
}
