// Integration tests: a real server on a random port with real Socket.IO clients.
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { io as connectClient, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  HandshakeAuth,
  ServerToClientEvents,
  StrokeStartPayload,
} from "@whiteboard/shared";
import type { Authenticator } from "./auth.js";
import { createWhiteboardServer, type WhiteboardServer } from "./app.js";
import { MemoryBoardStore } from "./persistence.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

const ORIGIN = "http://localhost:5173";
let server: WhiteboardServer;
let url: string;
const clients: Client[] = [];
const boardStore = new MemoryBoardStore();

async function startServer(): Promise<{ server: WhiteboardServer; url: string }> {
  const s = createWhiteboardServer({ clientOrigins: [ORIGIN], boardStore, log: () => {} });
  await new Promise<void>((resolve) => s.httpServer.listen(0, resolve));
  return { server: s, url: `http://localhost:${(s.httpServer.address() as AddressInfo).port}` };
}

beforeAll(async () => {
  ({ server, url } = await startServer());
});

afterAll(async () => {
  await server.io.close();
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

type RecordingClient = Client & { received: Array<[EventName, unknown]> };

/** Connect a client that records every event it receives. */
async function connect(auth: HandshakeAuth = {}, target = url): Promise<RecordingClient> {
  const client = connectClient(target, { transports: ["websocket"], forceNew: true, auth }) as RecordingClient;
  client.received = [];
  client.onAny((event: EventName, payload: unknown) => client.received.push([event, payload]));
  clients.push(client);
  await new Promise<void>((resolve) => client.once("connect", () => resolve()));
  return client;
}

/** Wait for the next event of this kind (or one already received). */
function next<E extends EventName>(
  client: Client & { received: Array<[EventName, unknown]> },
  event: E,
  match: (payload: Payload<E>) => boolean = () => true,
): Promise<Payload<E>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 2000);
    const check = () => {
      const index = client.received.findIndex(([e, p]) => e === event && match(p as Payload<E>));
      if (index < 0) return false;
      const payload = client.received.splice(index, 1)[0]![1];
      clearTimeout(timer);
      client.offAny(listener);
      resolve(payload as Payload<E>);
      return true;
    };
    const listener = () => void check();
    if (!check()) client.onAny(listener);
  });
}

/** Give the server a moment, for asserting that something did NOT happen. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

const startPayload = (strokeId: string, extra: Partial<StrokeStartPayload> = {}): StrokeStartPayload => ({
  strokeId,
  color: "#e03131",
  size: 8,
  tool: "pen",
  point: { x: 10, y: 10 },
  ...extra,
});

async function joinedPair(roomId: string) {
  const a = await connect();
  const b = await connect();
  a.emit("room:join", { roomId });
  await next(a, "room:state");
  b.emit("room:join", { roomId });
  await next(b, "room:state");
  return { a, b };
}

describe("HTTP", () => {
  it("answers health checks", async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("checks the database on /health/db", async () => {
    const res = await fetch(`${url}/health/db`);
    expect(res.status).toBe(200);
  });

  it("returns 404 for other paths", async () => {
    expect((await fetch(`${url}/nope`)).status).toBe(404);
  });

  it("only allows configured sites to connect (CORS)", async () => {
    const polling = `${url}/socket.io/?EIO=4&transport=polling`;
    const allowed = await fetch(polling, { headers: { Origin: ORIGIN } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const other = await fetch(polling, { headers: { Origin: "https://evil.example.com" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("rooms", () => {
  it("ignores invalid room IDs", async () => {
    const a = await connect();
    a.emit("room:join", { roomId: "../bad id" });
    await settle();
    expect(a.received).toEqual([]);
  });

  it("lists people on the board as they join and leave", async () => {
    const { a, b } = await joinedPair("count1234");
    const both = await next(a, "room:users", (p) => p.count === 2);
    expect(both.users.map((u) => u.id).sort()).toEqual([a.id, b.id].sort());
    b.disconnect();
    const alone = await next(a, "room:users", (p) => p.count === 1);
    expect(alone.users.map((u) => u.id)).toEqual([a.id]);
  });
});

describe("live strokes", () => {
  it("relays a stroke to others on the board, tagged with the author", async () => {
    const { a, b } = await joinedPair("relay1234");
    const other = await connect();
    other.emit("room:join", { roomId: "other1234" });
    await next(other, "room:state");

    a.emit("stroke:start", startPayload("s1"));
    a.emit("stroke:points", { strokeId: "s1", points: [{ x: 11, y: 12 }] });
    a.emit("stroke:end", { strokeId: "s1" });

    expect(await next(b, "stroke:start")).toEqual({ ...startPayload("s1"), userId: a.id });
    expect(await next(b, "stroke:points")).toEqual({ strokeId: "s1", points: [{ x: 11, y: 12 }] });
    expect(await next(b, "stroke:end")).toEqual({ strokeId: "s1" });

    await settle();
    expect(a.received.filter(([e]) => e.startsWith("stroke:"))).toEqual([]); // no echo
    expect(other.received.filter(([e]) => e.startsWith("stroke:"))).toEqual([]); // other board
  });

  it("drops invalid stroke messages and other people's points", async () => {
    const { a, b } = await joinedPair("invalid1234");
    a.emit("stroke:start", startPayload("bad", { color: "red" }));
    a.emit("stroke:start", startPayload("s1"));
    await next(b, "stroke:start");

    b.emit("stroke:points", { strokeId: "s1", points: [{ x: 999, y: 999 }] });
    await settle();
    expect(a.received.filter(([e]) => e === "stroke:points")).toEqual([]);
    expect(b.received.filter(([e]) => e === "stroke:start")).toEqual([]);
  });

  it("sends late joiners the full history, including strokes in progress", async () => {
    const { a } = await joinedPair("late1234");
    a.emit("stroke:start", startPayload("done"));
    a.emit("stroke:end", { strokeId: "done" });
    a.emit("stroke:start", startPayload("live"));
    a.emit("stroke:points", { strokeId: "live", points: [{ x: 1, y: 1 }] });
    await settle();

    const c = await connect();
    c.emit("room:join", { roomId: "late1234" });
    const { strokes } = await next(c, "room:state");
    expect(strokes.map((s) => [s.id, s.points.length])).toEqual([
      ["done", 1],
      ["live", 2],
    ]);

    a.emit("stroke:points", { strokeId: "live", points: [{ x: 2, y: 2 }] });
    expect(await next(c, "stroke:points")).toEqual({ strokeId: "live", points: [{ x: 2, y: 2 }] });
  });
});

describe("undo / redo", () => {
  it("removes and restores your own stroke for everyone", async () => {
    const { a, b } = await joinedPair("undo1234");
    a.emit("stroke:start", startPayload("s1"));
    a.emit("stroke:end", { strokeId: "s1" });
    await next(b, "stroke:end");

    a.emit("stroke:undo");
    expect(await next(a, "stroke:removed")).toEqual({ strokeId: "s1" });
    expect(await next(b, "stroke:removed")).toEqual({ strokeId: "s1" });

    a.emit("stroke:redo");
    const restored = await next(b, "stroke:restored");
    expect(restored.stroke.id).toBe("s1");
    expect(restored.afterId).toBeNull();
  });

  it("does not let you undo someone else's stroke", async () => {
    const { a, b } = await joinedPair("undo5678");
    a.emit("stroke:start", startPayload("s1"));
    await next(b, "stroke:start");

    b.emit("stroke:undo");
    await settle();
    expect(a.received.filter(([e]) => e === "stroke:removed")).toEqual([]);
  });
});

describe("clear", () => {
  it("clears the board for everyone and resets history for late joiners", async () => {
    const { a, b } = await joinedPair("clear1234");
    a.emit("stroke:start", startPayload("s1"));
    await next(b, "stroke:start");

    b.emit("board:clear", { roomId: "clear1234" });
    await next(a, "board:cleared");
    await next(b, "board:cleared");

    const c = await connect();
    c.emit("room:join", { roomId: "clear1234" });
    expect((await next(c, "room:state")).strokes).toEqual([]);
  });

  it("ignores a clear naming a different board", async () => {
    const { a, b } = await joinedPair("clear5678");
    b.emit("board:clear", { roomId: "someother1" });
    await settle();
    expect(a.received.filter(([e]) => e === "board:cleared")).toEqual([]);
  });
});

describe("saved boards", () => {
  it("keeps a board's drawing across a server restart", async () => {
    const a = await connect();
    a.emit("room:join", { roomId: "restart1234" });
    await next(a, "room:state");
    a.emit("stroke:start", startPayload("kept"));
    a.emit("stroke:points", { strokeId: "kept", points: [{ x: 50.04, y: 60 }] });
    a.emit("stroke:end", { strokeId: "kept" });
    await settle();
    await server.saver.flush();

    // A brand-new server (like after a Render redeploy) using the same database.
    const restarted = await startServer();
    try {
      const b = connectClient(restarted.url, { transports: ["websocket"], forceNew: true }) as Client;
      clients.push(b);
      const state = new Promise<Payload<"room:state">>((resolve) => b.once("room:state", resolve));
      b.emit("room:join", { roomId: "restart1234" });
      const { strokes } = await state;
      expect(strokes.map((s) => s.id)).toEqual(["kept"]);
      expect(strokes[0]!.points).toEqual([{ x: 10, y: 10 }, { x: 50, y: 60 }]);
    } finally {
      await restarted.server.io.close();
    }
  });
});

// ---------- Accounts and guests: a second server with a fake login checker ----------

const ALICE = { id: "00000000-0000-0000-0000-00000000a11c", name: "Alice Smith", avatarUrl: "https://example.com/alice.png" };
const BOB = { id: "00000000-0000-0000-0000-0000000000b0", name: "Bob", avatarUrl: null };

const fakeAuthenticator: Authenticator = async (token) => {
  if (token === "alice-token") return ALICE;
  if (token === "bob-token") return BOB;
  if (token === "outage-token") throw new Error("auth service down");
  return null;
};

describe("accounts and guests", () => {
  const authStore = new MemoryBoardStore();
  let auth: WhiteboardServer;
  let authUrl: string;

  beforeAll(async () => {
    auth = createWhiteboardServer({
      clientOrigins: [ORIGIN],
      boardStore: authStore,
      authenticate: fakeAuthenticator,
      log: () => {},
    });
    await new Promise<void>((resolve) => auth.httpServer.listen(0, resolve));
    authUrl = `http://localhost:${(auth.httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await auth.io.close();
  });

  const connectAs = (handshake: HandshakeAuth) => connect(handshake, authUrl);

  const connectError = (handshake: HandshakeAuth) =>
    new Promise<string>((resolve) => {
      const client = connectClient(authUrl, { transports: ["websocket"], forceNew: true, auth: handshake });
      clients.push(client as Client);
      client.once("connect_error", (error) => resolve(error.message));
    });

  it("shows signed-in users with their account name and picture", async () => {
    const alice = await connectAs({ token: "alice-token" });
    alice.emit("room:join", { roomId: "names1234" });
    const { users } = await next(alice, "room:users");
    expect(users).toEqual([{ id: alice.id, name: "Alice Smith", avatarUrl: ALICE.avatarUrl, isGuest: false }]);
  });

  it("shows guests with their cleaned-up chosen name", async () => {
    const alice = await connectAs({ token: "alice-token" });
    alice.emit("room:join", { roomId: "names5678" });
    await next(alice, "room:state");

    const guest = await connectAs({ guestName: "   Teal    Otter  " });
    guest.emit("room:join", { roomId: "names5678" });
    const { users } = await next(guest, "room:users", (p) => p.count === 2);
    expect(users.find((u) => u.id === guest.id)).toEqual({
      id: guest.id,
      name: "Teal Otter",
      avatarUrl: null,
      isGuest: true,
    });
  });

  it("refuses an invalid login instead of quietly making you a guest", async () => {
    expect(await connectError({ token: "forged-token" })).toBe("unauthorized");
  });

  it("reports when logins can't be checked", async () => {
    expect(await connectError({ token: "outage-token" })).toBe("auth unavailable");
  });

  it("doesn't let guests create boards", async () => {
    const guest = await connectAs({ guestName: "Sneaky" });
    guest.emit("room:join", { roomId: "nobody1234" });
    expect(await next(guest, "room:error")).toEqual({ reason: "not-found" });
    await settle();
    expect(guest.received.some(([e]) => e === "room:state")).toBe(false);

    // Still doesn't exist for the next guest either.
    const another = await connectAs({ guestName: "Also sneaky" });
    another.emit("room:join", { roomId: "nobody1234" });
    expect(await next(another, "room:error")).toEqual({ reason: "not-found" });
  });

  it("lets a signed-in user create a board, records them as owner, then guests can join", async () => {
    const alice = await connectAs({ token: "alice-token" });
    alice.emit("room:join", { roomId: "owned1234" });
    expect((await next(alice, "room:state")).strokes).toEqual([]);
    await auth.saver.flush();
    expect((await authStore.load("owned1234"))?.ownerId).toBe(ALICE.id);

    const guest = await connectAs({ guestName: "Friend" });
    guest.emit("room:join", { roomId: "owned1234" });
    await next(guest, "room:state");
  });

  it("keeps the original owner when someone else opens the board", async () => {
    const alice = await connectAs({ token: "alice-token" });
    alice.emit("room:join", { roomId: "keepowner1" });
    await next(alice, "room:state");
    const bob = await connectAs({ token: "bob-token" });
    bob.emit("room:join", { roomId: "keepowner1" });
    await next(bob, "room:state");
    await auth.saver.flush();
    expect((await authStore.load("keepowner1"))?.ownerId).toBe(ALICE.id);
  });

  it("lets guests open boards saved before login existed (no owner)", async () => {
    await authStore.save("legacy1234", { strokes: [], ownerId: null });
    const guest = await connectAs({ guestName: "Old friend" });
    guest.emit("room:join", { roomId: "legacy1234" });
    await next(guest, "room:state");
  });

  it("lets guests rename themselves, but not signed-in users", async () => {
    const alice = await connectAs({ token: "alice-token" });
    alice.emit("room:join", { roomId: "rename1234" });
    await next(alice, "room:state");
    const guest = await connectAs({ guestName: "Before" });
    guest.emit("room:join", { roomId: "rename1234" });
    await next(alice, "room:users", (p) => p.count === 2);

    guest.emit("user:rename", { name: "  After  " });
    const renamed = await next(alice, "room:users", (p) => p.users.some((u) => u.name === "After"));
    expect(renamed.users.find((u) => u.id === guest.id)?.name).toBe("After");

    alice.emit("user:rename", { name: "Not Alice" });
    await settle();
    expect(alice.received.some(([e, p]) => e === "room:users" && JSON.stringify(p).includes("Not Alice"))).toBe(false);
  });
});
