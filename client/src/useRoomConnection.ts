import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import type { Participant } from "@whiteboard/shared";
import { currentHandshakeAuth } from "./auth";
import { getServerUrl, type BoardSocket } from "./socket";

export type ConnectionStatus = "connecting" | "connected" | "offline";

/** Why we can't be on the board, if anything. */
export type ConnectionProblem =
  /** The board doesn't exist (and guests can't create boards). */
  | "not-found"
  /** The server rejected our login (expired or invalid). Sign out and rejoin as a guest. */
  | "unauthorized"
  /** The server couldn't check logins right now; retrying. */
  | "auth-unavailable";

export type RoomConnection = {
  status: ConnectionStatus;
  /** Null when no server is configured for this build. */
  socket: BoardSocket | null;
  /** Everyone on the board (including you), or empty when not connected. */
  users: Participant[];
  /** Our own connection ID, to spot ourselves in `users`. */
  selfId: string | null;
  problem: ConnectionProblem | null;
};

const AUTH_RETRY_MS = 5_000;

/**
 * Connect to the server and join the room. Rejoins automatically after a reconnect, sending the
 * current login token or guest name each time.
 */
export function useRoomConnection(roomId: string): RoomConnection {
  // Created once, not yet connected; the effect below connects and disconnects it.
  const [socket] = useState<BoardSocket | null>(() => {
    const url = getServerUrl();
    if (!url) return null;
    return io(url, {
      autoConnect: false,
      auth: (cb) => void currentHandshakeAuth().then(cb),
    });
  });
  const [status, setStatus] = useState<ConnectionStatus>(socket ? "connecting" : "offline");
  const [users, setUsers] = useState<Participant[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [problem, setProblem] = useState<ConnectionProblem | null>(null);

  useEffect(() => {
    if (!socket) return;
    let retry: ReturnType<typeof setTimeout> | undefined;

    // "connect" also fires after every reconnect, so the join is repeated each time.
    const onConnect = () => {
      setStatus("connected");
      setSelfId(socket.id ?? null);
      setProblem(null);
      socket.emit("room:join", { roomId });
    };
    const onDisconnect = () => {
      setStatus("connecting");
      setUsers([]);
    };
    // Refused by the server's login check. Socket.IO doesn't retry these on its own.
    const onConnectError = (error: Error) => {
      if (error.message === "unauthorized") {
        setProblem("unauthorized");
      } else if (error.message === "auth unavailable") {
        setProblem("auth-unavailable");
        retry = setTimeout(() => socket.connect(), AUTH_RETRY_MS);
      }
    };
    const onUsers = ({ users: next }: { users: Participant[] }) => setUsers(next);
    const onRoomError = ({ reason }: { reason: "not-found" }) => setProblem(reason);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("room:users", onUsers);
    socket.on("room:error", onRoomError);
    socket.connect();

    return () => {
      clearTimeout(retry);
      // Disconnect first so onDisconnect resets the status, then stop listening.
      socket.disconnect();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("room:users", onUsers);
      socket.off("room:error", onRoomError);
    };
  }, [socket, roomId]);

  return { status, socket, users, selfId, problem };
}
