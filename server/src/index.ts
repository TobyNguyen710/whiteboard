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
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const SWEEP_INTERVAL_MS = 60_000;

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  { cors: { origin: CLIENT_ORIGIN } },
);
const rooms = new RoomStore();

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
    }

    rooms.join(roomId, userId);
    socket.data.roomId = roomId;
    void socket.join(roomId);
    console.log(`${userId} joined ${roomId}`);
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
    if (roomId) rooms.leave(roomId, userId);
    console.log(`disconnected: ${userId}`);
  });
});

setInterval(() => {
  for (const roomId of rooms.sweep()) console.log(`deleted empty board ${roomId}`);
}, SWEEP_INTERVAL_MS).unref();

httpServer.listen(PORT, () => {
  console.log(`server listening on :${PORT}`);
});
