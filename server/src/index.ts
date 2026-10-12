import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  isValidRoomId,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@whiteboard/shared";

type SocketData = { roomId?: string };

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  { cors: { origin: CLIENT_ORIGIN } },
);

io.on("connection", (socket) => {
  console.log(`connected: ${socket.id}`);

  socket.on("room:join", (payload) => {
    const roomId = payload?.roomId;
    if (!isValidRoomId(roomId)) return;

    // A socket is on one board at a time.
    const previous = socket.data.roomId;
    if (previous && previous !== roomId) void socket.leave(previous);

    socket.data.roomId = roomId;
    void socket.join(roomId);
    console.log(`${socket.id} joined ${roomId}`);
  });

  socket.on("disconnect", () => console.log(`disconnected: ${socket.id}`));
});

httpServer.listen(PORT, () => {
  console.log(`server listening on :${PORT}`);
});
