import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@whiteboard/shared";

export type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const DEV_SERVER_URL = "http://localhost:3001";

/** Server URL for this build, or null when none is configured (e.g. production before the server is deployed). */
export function getServerUrl(): string | null {
  const url = import.meta.env.VITE_SERVER_URL;
  if (url) return url;
  return import.meta.env.DEV ? DEV_SERVER_URL : null;
}
