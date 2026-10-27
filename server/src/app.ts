import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import {
  cleanDisplayName,
  DEFAULT_GUEST_NAME,
  isValidRoomId,
  type ClientToServerEvents,
  type Participant,
  type ServerToClientEvents,
} from "@whiteboard/shared";
import type { Authenticator } from "./auth.js";
import { BoardSaver, type BoardStore } from "./persistence.js";
import { RoomStore } from "./rooms.js";
import { parseStrokeEnd, parseStrokePoints, parseStrokeStart } from "./validate.js";

/** Who is behind a connection: a verified account, or a guest with a chosen name. */
type SocketUser = { accountId: string | null; name: string; avatarUrl: string | null };

type SocketData = { roomId?: string; user: SocketUser };

export type WhiteboardIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type WhiteboardServerOptions = {
  /** Sites allowed to connect (CORS). */
  clientOrigins: string[];
  /** Where boards are saved. Null keeps boards in memory only (lost on restart). */
  boardStore?: BoardStore | null;
  /**
   * Verifies login tokens. When set, only signed-in users can create boards (guests can still
   * join existing ones). Null: everyone is a guest and anyone can create boards.
   */
  authenticate?: Authenticator | null;
  /** Where to send log lines. Defaults to console.log; tests pass a no-op. */
  log?: (message: string) => void;
};

export type WhiteboardServer = {
  httpServer: HttpServer;
  io: WhiteboardIo;
  rooms: RoomStore;
  saver: BoardSaver;
};

/** Build the HTTP + Socket.IO server with all board logic wired up. Call httpServer.listen() to start. */
export function createWhiteboardServer({
  clientOrigins,
  boardStore = null,
  authenticate = null,
  log = console.log,
}: WhiteboardServerOptions): WhiteboardServer {
  const rooms = new RoomStore();
  const saver = new BoardSaver(boardStore, rooms, log);

  // Plain HTTP answers health checks (used by Render, and handy for waking a sleeping instance).
  // /health/db also touches the database, which keeps a free Supabase project from pausing.
  // Socket.IO handles its own /socket.io/ requests before this runs.
  const httpServer = createServer((req, res) => {
    const reply = (status: number, body: string) => {
      res.writeHead(status, { "content-type": "text/plain" });
      res.end(body);
    };
    if (req.method !== "GET") return reply(404, "");
    if (req.url === "/" || req.url === "/health") return reply(200, "ok");
    if (req.url === "/health/db") {
      if (!boardStore) return reply(503, "no database configured");
      boardStore.ping().then(
        () => reply(200, "ok"),
        (error: unknown) => {
          log(`database health check failed: ${error instanceof Error ? error.message : String(error)}`);
          reply(503, "database unreachable");
        },
      );
      return;
    }
    reply(404, "");
  });

  const io: WhiteboardIo = new Server(httpServer, { cors: { origin: clientOrigins } });

  /** Everyone on a board, from the connections in its Socket.IO room. */
  const participants = (roomId: string): Participant[] => {
    const ids = io.sockets.adapter.rooms.get(roomId) ?? new Set<string>();
    const list: Participant[] = [];
    for (const id of ids) {
      const user = io.sockets.sockets.get(id)?.data.user;
      if (!user) continue;
      list.push({ id, name: user.name, avatarUrl: user.avatarUrl, isGuest: user.accountId === null });
    }
    return list;
  };

  const broadcastUsers = (roomId: string) => {
    const users = participants(roomId);
    io.to(roomId).emit("room:users", { count: users.length, users });
  };

  // Every connection says who it is: a login token (checked here) or a guest name.
  io.use(async (socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
    const token = typeof auth.token === "string" && auth.token ? auth.token : null;

    if (token && authenticate) {
      try {
        const user = await authenticate(token);
        // A bad or expired token is refused outright, so the client can refresh or sign out
        // instead of silently becoming a guest.
        if (!user) return next(new Error("unauthorized"));
        socket.data.user = { accountId: user.id, name: user.name, avatarUrl: user.avatarUrl };
        return next();
      } catch (error) {
        log(`login check failed: ${error instanceof Error ? error.message : String(error)}`);
        return next(new Error("auth unavailable"));
      }
    }

    socket.data.user = {
      accountId: null,
      name: cleanDisplayName(auth.guestName) ?? DEFAULT_GUEST_NAME,
      avatarUrl: null,
    };
    next();
  });

  io.on("connection", (socket) => {
    // The socket ID doubles as the user ID for v1 (no accounts).
    const userId = socket.id;
    log(`connected: ${userId}`);

    socket.on("room:join", async (payload) => {
      const roomId = payload?.roomId;
      if (!isValidRoomId(roomId)) return;

      // A socket is on one board at a time.
      const previous = socket.data.roomId;
      if (previous === roomId) return;
      if (previous) {
        rooms.leave(previous, userId);
        void socket.leave(previous);
        broadcastUsers(previous);
      }

      // Saved boards are loaded on first open. Strokes sent before this finishes are dropped
      // (the user isn't on the board yet), which only affects the first moment after joining.
      socket.data.roomId = roomId;
      await saver.ensureLoaded(roomId);
      if (!socket.connected || socket.data.roomId !== roomId) return;

      // Creating a board needs an account: a brand-new board can be opened by a signed-in user
      // (who becomes its owner) but not by a guest.
      const { accountId } = socket.data.user;
      if (rooms.get(roomId)?.isNew && authenticate) {
        if (!accountId) {
          socket.data.roomId = undefined;
          socket.emit("room:error", { reason: "not-found" });
          return;
        }
        rooms.claim(roomId, accountId);
        log(`${userId} created ${roomId}`);
      }

      const room = rooms.join(roomId, userId);
      void socket.join(roomId);

      // Late joiners catch up on the full history, including strokes still being drawn.
      socket.emit("room:state", { strokes: room.strokes });
      broadcastUsers(roomId);
      log(`${userId} joined ${roomId} (${room.users.size} on board)`);
    });

    socket.on("stroke:start", (raw) => {
      const roomId = socket.data.roomId;
      const payload = parseStrokeStart(raw);
      if (!roomId || !payload) return;
      if (!rooms.startStroke(roomId, userId, payload)) return;
      socket.to(roomId).emit("stroke:start", { ...payload, userId });
    });

    socket.on("stroke:points", (raw) => {
      const roomId = socket.data.roomId;
      const payload = parseStrokePoints(raw);
      if (!roomId || !payload) return;
      const accepted = rooms.addPoints(roomId, userId, payload.strokeId, payload.points);
      if (!accepted) return;
      socket.to(roomId).emit("stroke:points", { strokeId: payload.strokeId, points: accepted });
    });

    socket.on("stroke:end", (raw) => {
      const roomId = socket.data.roomId;
      const payload = parseStrokeEnd(raw);
      if (!roomId || !payload) return;
      if (!rooms.endStroke(roomId, userId, payload.strokeId)) return;
      socket.to(roomId).emit("stroke:end", payload);
    });

    // Undo/redo only touch your own strokes; everyone (including you) is told what changed.
    socket.on("stroke:undo", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const strokeId = rooms.undo(roomId, userId);
      if (strokeId) io.to(roomId).emit("stroke:removed", { strokeId });
    });

    socket.on("stroke:redo", () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const restored = rooms.redo(roomId, userId);
      if (restored) io.to(roomId).emit("stroke:restored", restored);
    });

    // Anyone on the board can clear it (v1). The client asks for confirmation first.
    socket.on("board:clear", (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || payload?.roomId !== roomId) return;
      if (!rooms.clear(roomId, userId)) return;
      io.to(roomId).emit("board:cleared", {});
      log(`${userId} cleared ${roomId}`);
    });

    // Guests can change the name others see; account names come from Google/GitHub.
    socket.on("user:rename", (payload) => {
      const name = cleanDisplayName(payload?.name);
      if (!name || socket.data.user.accountId) return;
      socket.data.user.name = name;
      if (socket.data.roomId) broadcastUsers(socket.data.roomId);
    });

    socket.on("disconnect", () => {
      const roomId = socket.data.roomId;
      if (roomId) {
        rooms.leave(roomId, userId);
        broadcastUsers(roomId);
      }
      log(`disconnected: ${userId}`);
    });
  });

  return { httpServer, io, rooms, saver };
}
