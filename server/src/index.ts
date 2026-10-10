import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@whiteboard/shared";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

const httpServer = createServer();
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

io.on("connection", (socket) => {
  console.log(`connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`disconnected: ${socket.id}`));
});

httpServer.listen(PORT, () => {
  console.log(`server listening on :${PORT}`);
});
