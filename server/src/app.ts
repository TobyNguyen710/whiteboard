import { createServer, type Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import {
  cleanBoardName,
  cleanDisplayName,
  DEFAULT_GUEST_NAME,
  isAssignableRole,
  isValidGuestId,
  isValidRoomId,
  isValidThumbnail,
  parseSettingsChange,
  permissionsFor,
  type Permissions,
  type ClientToServerEvents,
  type Participant,
  type ServerToClientEvents,
} from "@whiteboard/shared";
import { handleApi, type ApiContext } from "./api.js";
import type { Authenticator } from "./auth.js";
import { BoardSaver, type BoardStore } from "./persistence.js";
import { RoomStore } from "./rooms.js";
import { parseStrokeEnd, parseStrokePoints, parseStrokeStart } from "./validate.js";

/** Who is behind a connection: a verified account, or a guest with a chosen name. */
type SocketUser = {
  accountId: string | null;
  name: string;
  avatarUrl: string | null;
  /** Who this is for roles: "a:<account id>", "g:<guest id>", or "c:<connection id>". */
  memberKey: string;
};

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
    // Dashboard actions (rename, delete, leave). apiContext is defined below, before any request.
    if (req.url?.startsWith("/api/")) {
      void handleApi(req, res, apiContext);
      return;
    }
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
      list.push({
        id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isGuest: user.accountId === null,
        role: rooms.roleOf(roomId, user.memberKey, user.accountId),
      });
    }
    return list;
  };

  const broadcastUsers = (roomId: string) => {
    const users = participants(roomId);
    io.to(roomId).emit("room:users", { count: users.length, users });
  };

  /** What this connection may do on the board it's on (nothing if it isn't on one). */
  const permissionsOf = (socket: { id: string; data: SocketData }): Permissions | null => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!roomId || !room || !room.users.has(socket.id)) return null;
    const { memberKey, accountId } = socket.data.user;
    return permissionsFor(rooms.roleOf(roomId, memberKey, accountId), room.ownerId !== null, room.settings);
  };

  /** Tell everyone on a board the current settings. */
  const broadcastSettings = (roomId: string) => {
    const room = rooms.get(roomId);
    if (room) io.to(roomId).emit("board:settings", { settings: room.settings, removedCount: room.removed.size });
  };

  /** Re-send everyone their role (e.g. after the default role changed) and the people list. */
  const refreshRoles = (roomId: string) => {
    for (const id of io.sockets.adapter.rooms.get(roomId) ?? []) {
      const socket = io.sockets.sockets.get(id);
      if (!socket) continue;
      const { memberKey, accountId } = socket.data.user;
      socket.emit("member:role", { role: rooms.roleOf(roomId, memberKey, accountId) });
    }
    broadcastUsers(roomId);
  };

  // ---------- Board actions, shared by the board itself and the dashboard API ----------

  /** Owner of a board (null = no owner), or undefined if the board doesn't exist. */
  const ownerOf = async (roomId: string): Promise<string | null | undefined> => {
    const room = rooms.get(roomId);
    if (room) return room.isNew ? undefined : room.ownerId;
    if (!boardStore) return undefined;
    const meta = await boardStore.loadMeta(roomId);
    return meta ? meta.ownerId : undefined;
  };

  const renameBoard = async (roomId: string, name: string) => {
    if (rooms.get(roomId)) {
      // In memory: the saver writes it, and everyone on the board sees it now.
      if (rooms.rename(roomId, name)) io.to(roomId).emit("board:renamed", { name });
    } else {
      await boardStore?.rename(roomId, name);
    }
  };

  const deleteBoard = async (roomId: string) => {
    // Remove everyone first, then make sure no save in progress can write the board back.
    io.to(roomId).emit("board:deleted", {});
    for (const id of [...(io.sockets.adapter.rooms.get(roomId) ?? [])]) {
      const socket = io.sockets.sockets.get(id);
      if (!socket) continue;
      rooms.leave(roomId, socket.id);
      socket.data.roomId = undefined;
      void socket.leave(roomId);
    }
    rooms.remove(roomId);
    await saver.whenIdle();
    saver.forget([roomId]);
    await boardStore?.remove(roomId);
  };

  /** Remember that a signed-in user opened a board (for their dashboard). Best effort. */
  const recordVisit = (roomId: string, accountId: string) => {
    boardStore?.recordVisit(roomId, accountId).catch((error: unknown) => {
      log(`could not record visit to ${roomId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  };

  const apiContext: ApiContext = {
    clientOrigins,
    authenticate,
    ownerOf,
    renameBoard,
    deleteBoard,
    leaveBoardList: async (roomId, userId) => {
      await boardStore?.removeMember(roomId, userId);
    },
    log,
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
        socket.data.user = {
          accountId: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl,
          memberKey: `a:${user.id}`,
        };
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
      // A guest ID from the browser keeps a guest's role across refreshes; otherwise per connection.
      memberKey: isValidGuestId(auth.guestId) ? `g:${auth.guestId.toLowerCase()}` : `c:${socket.id}`,
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
        // Save the new board now, so it exists before it's added to anyone's dashboard.
        await saver.saveNow(roomId);
        if (!socket.connected || socket.data.roomId !== roomId) return;
      }

      // People the host removed stay off the board until allowed back.
      if (rooms.isRemoved(roomId, socket.data.user.memberKey)) {
        socket.data.roomId = undefined;
        socket.emit("room:error", { reason: "removed" });
        return;
      }

      const room = rooms.join(roomId, userId);
      void socket.join(roomId);

      // Late joiners catch up on the full history, including strokes still being drawn.
      socket.emit("room:state", {
        strokes: room.strokes,
        name: room.name,
        role: rooms.roleOf(roomId, socket.data.user.memberKey, accountId),
        hasHost: room.ownerId !== null,
        settings: room.settings,
      });
      broadcastUsers(roomId);
      if (accountId) recordVisit(roomId, accountId);
      log(`${userId} joined ${roomId} (${room.users.size} on board)`);
    });

    socket.on("stroke:start", (raw) => {
      const roomId = socket.data.roomId;
      const payload = parseStrokeStart(raw);
      if (!roomId || !payload || !permissionsOf(socket)?.canDraw) return;
      if (!rooms.startStroke(roomId, userId, payload)) return;
      socket.to(roomId).emit("stroke:start", { ...payload, userId });
    });

    socket.on("stroke:points", (raw) => {
      const roomId = socket.data.roomId;
      const payload = parseStrokePoints(raw);
      // Checked on every batch, so becoming a viewer mid-stroke stops the stroke.
      if (!roomId || !payload || !permissionsOf(socket)?.canDraw) return;
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
      if (!roomId || !permissionsOf(socket)?.canDraw) return;
      const strokeId = rooms.undo(roomId, userId);
      if (strokeId) io.to(roomId).emit("stroke:removed", { strokeId });
    });

    socket.on("stroke:redo", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !permissionsOf(socket)?.canDraw) return;
      const restored = rooms.redo(roomId, userId);
      if (restored) io.to(roomId).emit("stroke:restored", restored);
    });

    // The host clears the board (or any editor on boards without a host). The client asks first.
    socket.on("board:clear", (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || payload?.roomId !== roomId || !permissionsOf(socket)?.canClear) return;
      if (!rooms.clear(roomId, userId)) return;
      io.to(roomId).emit("board:cleared", {});
      log(`${userId} cleared ${roomId}`);
    });

    // Only the owner renames the board; everyone on it sees the new name right away.
    socket.on("board:rename", (payload) => {
      const roomId = socket.data.roomId;
      const name = cleanBoardName(payload?.name);
      const { accountId } = socket.data.user;
      if (!roomId || !name || !accountId || rooms.get(roomId)?.ownerId !== accountId) return;
      void renameBoard(roomId, name);
    });

    // Signed-in people on the board keep its dashboard preview fresh.
    socket.on("board:thumbnail", (payload) => {
      const roomId = socket.data.roomId;
      const image = payload?.image;
      if (!roomId || !socket.data.user.accountId || !isValidThumbnail(image)) return;
      rooms.setThumbnail(roomId, image);
    });

    // The host makes people editors (can draw) or viewers (watch only).
    socket.on("member:set-role", (payload) => {
      const roomId = socket.data.roomId;
      const role = payload?.role;
      const target = io.sockets.sockets.get(String(payload?.participantId ?? ""));
      if (!roomId || !isAssignableRole(role) || !permissionsOf(socket)?.canManagePeople) return;
      if (!target || target.data.roomId !== roomId) return;
      const { memberKey, accountId } = target.data.user;
      if (rooms.roleOf(roomId, memberKey, accountId) === "host") return; // the host stays the host

      rooms.setMemberRole(roomId, memberKey, role);
      if (accountId) {
        boardStore?.setMemberRole(roomId, accountId, role).catch((error: unknown) => {
          log(`could not save role on ${roomId}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
      // Tell every tab this person has open on the board, then update everyone's people list.
      for (const id of io.sockets.adapter.rooms.get(roomId) ?? []) {
        const other = io.sockets.sockets.get(id);
        if (other?.data.user.memberKey === memberKey) other.emit("member:role", { role });
      }
      broadcastUsers(roomId);
      log(`${userId} made ${memberKey} ${role} on ${roomId}`);
    });

    // Host: board settings (default role for new people, lock, who can clear).
    socket.on("board:update-settings", (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || !permissionsOf(socket)?.canManageBoard) return;
      if (!rooms.updateSettings(roomId, parseSettingsChange(payload))) return;
      broadcastSettings(roomId);
      refreshRoles(roomId); // the default role or the lock can change what people may do
    });

    // Host: take someone off the board. All their tabs leave, and they can't rejoin until allowed.
    socket.on("member:remove", (payload) => {
      const roomId = socket.data.roomId;
      const target = io.sockets.sockets.get(String(payload?.participantId ?? ""));
      if (!roomId || !permissionsOf(socket)?.canManagePeople) return;
      if (!target || target.data.roomId !== roomId) return;
      const { memberKey, accountId } = target.data.user;
      if (rooms.roleOf(roomId, memberKey, accountId) === "host") return; // can't remove the host

      rooms.removeMember(roomId, memberKey);
      for (const id of [...(io.sockets.adapter.rooms.get(roomId) ?? [])]) {
        const other = io.sockets.sockets.get(id);
        if (other?.data.user.memberKey !== memberKey) continue;
        other.emit("room:error", { reason: "removed" });
        rooms.leave(roomId, other.id);
        other.data.roomId = undefined;
        void other.leave(roomId);
      }
      broadcastUsers(roomId);
      broadcastSettings(roomId);
      log(`${userId} removed ${memberKey} from ${roomId}`);
    });

    // Host: let everyone who was removed join again.
    socket.on("board:allow-removed", () => {
      const roomId = socket.data.roomId;
      if (!roomId || !permissionsOf(socket)?.canManagePeople) return;
      rooms.allowRemoved(roomId);
      broadcastSettings(roomId);
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
