import { createWhiteboardServer } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
// Comma-separated list, e.g. "https://my-app.vercel.app,http://localhost:5173".
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const SWEEP_INTERVAL_MS = 60_000;

const { httpServer, rooms } = createWhiteboardServer({ clientOrigins: CLIENT_ORIGINS });

setInterval(() => {
  for (const roomId of rooms.sweep()) console.log(`deleted empty board ${roomId}`);
}, SWEEP_INTERVAL_MS).unref();

httpServer.listen(PORT, () => {
  console.log(`server listening on :${PORT} (allowed origins: ${CLIENT_ORIGINS.join(", ")})`);
});
