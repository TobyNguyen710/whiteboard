import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getServerUrl, type BoardSocket } from "./socket";

export type ConnectionStatus = "connecting" | "connected" | "offline";

/** Connect to the server and join the room. Rejoins automatically after a reconnect. */
export function useRoomConnection(roomId: string): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    getServerUrl() ? "connecting" : "offline",
  );

  useEffect(() => {
    const url = getServerUrl();
    if (!url) return;

    const socket: BoardSocket = io(url);

    // "connect" also fires after every reconnect, so the join is repeated each time.
    socket.on("connect", () => {
      setStatus("connected");
      socket.emit("room:join", { roomId });
    });
    socket.on("disconnect", () => setStatus("connecting"));

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  return status;
}
