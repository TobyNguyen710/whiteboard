import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getServerUrl, type BoardSocket } from "./socket";

export type ConnectionStatus = "connecting" | "connected" | "offline";

export type RoomConnection = {
  status: ConnectionStatus;
  /** Null while no server is configured or before the first render's effect runs. */
  socket: BoardSocket | null;
  /** People on the board (including you), or null when not connected. */
  userCount: number | null;
};

/** Connect to the server and join the room. Rejoins automatically after a reconnect. */
export function useRoomConnection(roomId: string): RoomConnection {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    getServerUrl() ? "connecting" : "offline",
  );
  const [socket, setSocket] = useState<BoardSocket | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);

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
    s.on("disconnect", () => {
      setStatus("connecting");
      setUserCount(null);
    });
    s.on("room:users", ({ count }) => setUserCount(count));

    return () => {
      s.disconnect();
      setSocket(null);
      setUserCount(null);
    };
  }, [roomId]);

  return { status, socket, userCount };
}
