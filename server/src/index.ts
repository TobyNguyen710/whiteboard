import { createWhiteboardServer } from "./app.js";
import { supabaseAuthenticator } from "./auth.js";
import { SupabaseBoardStore } from "./supabaseStore.js";

const PORT = Number(process.env.PORT ?? 3001);
// Comma-separated list, e.g. "https://my-app.vercel.app,http://localhost:5173".
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const SAVE_INTERVAL_MS = 2_000;
const SWEEP_INTERVAL_MS = 60_000;

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const supabase =
  SUPABASE_URL && SUPABASE_SECRET_KEY ? { url: SUPABASE_URL, key: SUPABASE_SECRET_KEY } : null;
const boardStore = supabase ? new SupabaseBoardStore(supabase.url, supabase.key) : null;
const authenticate = supabase ? supabaseAuthenticator(supabase.url, supabase.key) : null;
if (!supabase) {
  console.warn(
    "SUPABASE_URL / SUPABASE_SECRET_KEY not set: boards are kept in memory only and login is off.",
  );
}

const { httpServer, io, rooms, saver } = createWhiteboardServer({
  clientOrigins: CLIENT_ORIGINS,
  boardStore,
  authenticate,
});

// Save changed boards every couple of seconds rather than on every point.
const saveTimer = setInterval(() => void saver.flush(), SAVE_INTERVAL_MS);

// Drop boards nobody has used for a while, once their changes are safely saved.
const sweepTimer = setInterval(() => {
  void saver.flush().then(() => {
    const deleted = rooms.sweep((roomId) => saver.canEvict(roomId));
    saver.forget(deleted);
    for (const roomId of deleted) console.log(`unloaded idle board ${roomId}`);
  });
}, SWEEP_INTERVAL_MS);

// Render sends SIGTERM before a redeploy or restart: save everything, then exit.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, saving boards before exit`);
  clearInterval(saveTimer);
  clearInterval(sweepTimer);
  await io.close(); // also closes the HTTP server
  await saver.flush();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

httpServer.listen(PORT, () => {
  console.log(
    `server listening on :${PORT} (allowed origins: ${CLIENT_ORIGINS.join(", ")}; ` +
      `boards ${boardStore ? "saved to Supabase" : "in memory only"})`,
  );
});
