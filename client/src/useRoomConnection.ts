import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getServerUrl, type BoardSocket } from "./socket";

export type ConnectionStatus = "connecting" | "connected" | "offline";

export type RoomConnection = {
  status: ConnectionStatus;
  /** Null while no server is configured or before the first render's effect runs. */
  socket: BoardSocket | null;
};

/** Connect to the server and join the room. Rejoins automatically after a reconnect. */
export function useRoomConnection(roomId: string): RoomConnection {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    getServerUrl() ? "connecting" : "offline",
  );
  const [socket, setSocket] = useState<BoardSocket | null>(null);

  useEffect(() => {
    const url = getServerUrl();
    if (!url) return;

    const s: BoardSocket = io(url);
    setSocket(s);

    // "connect" also fires after every reconnect, so the join is repeated each time.
    s.on("connect", () => {
      setStatus("connected");
      s.emit("room:join", { roomId });
    });
    s.on("disconnect", () => setStatus("connecting"));

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [roomId]);

  return { status, socket };
}
