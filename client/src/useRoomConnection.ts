import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getServerUrl, type BoardSocket } from "./socket";

export type ConnectionStatus = "connecting" | "connected" | "offline";

export type RoomConnection = {
  status: ConnectionStatus;
  /** Null when no server is configured for this build. */
  socket: BoardSocket | null;
  /** People on the board (including you), or null when not connected. */
  userCount: number | null;
};

/** Connect to the server and join the room. Rejoins automatically after a reconnect. */
export function useRoomConnection(roomId: string): RoomConnection {
  // Created once, not yet connected; the effect below connects and disconnects it.
  const [socket] = useState<BoardSocket | null>(() => {
    const url = getServerUrl();
    return url ? io(url, { autoConnect: false }) : null;
  });
  const [status, setStatus] = useState<ConnectionStatus>(socket ? "connecting" : "offline");
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    if (!socket) return;

    // "connect" also fires after every reconnect, so the join is repeated each time.
    const onConnect = () => {
      setStatus("connected");
      socket.emit("room:join", { roomId });
    };
    const onDisconnect = () => {
      setStatus("connecting");
      setUserCount(null);
    };
    const onUsers = ({ count }: { count: number }) => setUserCount(count);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:users", onUsers);
    socket.connect();

    return () => {
      // Disconnect first so onDisconnect resets the status, then stop listening.
      socket.disconnect();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:users", onUsers);
    };
  }, [socket, roomId]);

  return { status, socket, userCount };
}
