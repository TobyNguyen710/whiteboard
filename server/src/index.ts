import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  isValidRoomId,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@whiteboard/shared";
import { RoomStore } from "./rooms.js";
import { parseStrokeEnd, parseStrokePoints, parseStrokeStart } from "./validate.js";

type SocketData = { roomId?: string };

const PORT = Number(process.env.PORT ?? 3001);
// Comma-separated list, e.g. "https://my-app.vercel.app,http://localhost:5173".
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const SWEEP_INTERVAL_MS = 60_000;

// Plain HTTP answers health checks (used by Render, and handy for waking a sleeping instance).
// Socket.IO handles its own /socket.io/ requests before this runs.
const httpServer = createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  { cors: { origin: CLIENT_ORIGINS } },
);
const rooms = new RoomStore();

const broadcastUserCount = (roomId: string) => {
  const count = rooms.get(roomId)?.users.size ?? 0;
  io.to(roomId).emit("room:users", { count });
};

io.on("connection", (socket) => {
  // The socket ID doubles as the user ID for v1 (no accounts).
  const userId = socket.id;
  console.log(`connected: ${userId}`);

  socket.on("room:join", (payload) => {
    const roomId = payload?.roomId;
    if (!isValidRoomId(roomId)) return;

    // A socket is on one board at a time.
    const previous = socket.data.roomId;
    if (previous === roomId) return;
    if (previous) {
      rooms.leave(previous, userId);
      void socket.leave(previous);
      broadcastUserCount(previous);
    }

    const room = rooms.join(roomId, userId);
    socket.data.roomId = roomId;
    void socket.join(roomId);

    // Late joiners catch up on the full history, including strokes still being drawn.
    socket.emit("room:state", { strokes: room.strokes });
    broadcastUserCount(roomId);
    console.log(`${userId} joined ${roomId} (${room.users.size} on board)`);
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

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      rooms.leave(roomId, userId);
      broadcastUserCount(roomId);
    }
    console.log(`disconnected: ${userId}`);
  });
});

setInterval(() => {
  for (const roomId of rooms.sweep()) console.log(`deleted empty board ${roomId}`);
}, SWEEP_INTERVAL_MS).unref();

httpServer.listen(PORT, () => {
  console.log(`server listening on :${PORT} (allowed origins: ${CLIENT_ORIGINS.join(", ")})`);
});
