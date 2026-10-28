// Dashboard features end to end: a real server (fake login checker, in-memory database) with
// real Socket.IO clients and real HTTP requests.
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { io as connectClient, type Socket } from "socket.io-client";
import type { ClientToServerEvents, HandshakeAuth, ServerToClientEvents } from "@whiteboard/shared";
import { createWhiteboardServer, type WhiteboardServer } from "./app.js";
import type { Authenticator } from "./auth.js";
import { MemoryBoardStore } from "./persistence.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];
type RecordingClient = Client & { received: Array<[EventName, unknown]> };

const ORIGIN = "http://localhost:5173";
const ALICE = { id: "00000000-0000-0000-0000-00000000a11c", name: "Alice", avatarUrl: null };
const BOB = { id: "00000000-0000-0000-0000-0000000000b0", name: "Bob", avatarUrl: null };
const THUMB = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const authenticate: Authenticator = async (token) =>
  token === "alice-token" ? ALICE : token === "bob-token" ? BOB : null;

const store = new MemoryBoardStore();
let server: WhiteboardServer;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  server = createWhiteboardServer({ clientOrigins: [ORIGIN], boardStore: store, authenticate, log: () => {} });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await server.io.close();
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

async function connect(auth: HandshakeAuth): Promise<RecordingClient> {
  const client = connectClient(url, { transports: ["websocket"], forceNew: true, auth }) as RecordingClient;
  client.received = [];
  client.onAny((event: EventName, payload: unknown) => client.received.push([event, payload]));
  clients.push(client);
  await new Promise<void>((resolve) => client.once("connect", () => resolve()));
  return client;
}

function next<E extends EventName>(
  client: RecordingClient,
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

/** Alice opens (and so creates) a board; returns her client and what she got on joining. */
async function aliceCreates(boardId: string) {
  const alice = await connect({ token: "alice-token" });
  alice.emit("room:join", { roomId: boardId });
  const state = await next(alice, "room:state");
  return { alice, state };
}

async function join(boardId: string, auth: HandshakeAuth) {
  const client = await connect(auth);
  client.emit("room:join", { roomId: boardId });
  const state = await next(client, "room:state");
  return { client, state };
}

const api = (path: string, method: string, token?: string, body?: unknown) =>
  fetch(`${url}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("joining", () => {
  it("tells you the board's name and whether you own it", async () => {
    const { state } = await aliceCreates("join1234");
    expect(state).toMatchObject({ name: "Untitled board", isOwner: true });

    const { state: bobState } = await join("join1234", { token: "bob-token" });
    expect(bobState.isOwner).toBe(false);
    const { state: guestState } = await join("join1234", { guestName: "Guest" });
    expect(guestState.isOwner).toBe(false);
  });

  it("saves a new board right away and adds it to the creator's list", async () => {
    await aliceCreates("join5678");
    expect(await store.load("join5678")).not.toBeNull();
    await settle();
    expect(store.members.has(`join5678 ${ALICE.id}`)).toBe(true);
  });

  it("adds a board to a signed-in visitor's list, but not a guest's", async () => {
    await aliceCreates("visit1234");
    await join("visit1234", { token: "bob-token" });
    await join("visit1234", { guestName: "Guest" });
    await settle();
    const members = [...store.members.keys()].filter((k) => k.startsWith("visit1234 "));
    expect(members.sort()).toEqual([`visit1234 ${ALICE.id}`, `visit1234 ${BOB.id}`].sort());
  });
});

describe("renaming on the board", () => {
  it("lets the owner rename, and everyone sees it", async () => {
    const { alice } = await aliceCreates("rename1234");
    const { client: bob } = await join("rename1234", { token: "bob-token" });
    alice.emit("board:rename", { name: "  Team   plans " });
    expect(await next(bob, "board:renamed")).toEqual({ name: "Team plans" });
    await server.saver.flush();
    expect((await store.load("rename1234"))?.name).toBe("Team plans");
  });

  it("ignores renames from people who don't own the board", async () => {
    await aliceCreates("rename5678");
    const { client: bob } = await join("rename5678", { token: "bob-token" });
    const { client: guest } = await join("rename5678", { guestName: "Guest" });
    bob.emit("board:rename", { name: "Bob's now" });
    guest.emit("board:rename", { name: "Guest's now" });
    await settle();
    expect(bob.received.some(([e]) => e === "board:renamed")).toBe(false);
    expect(server.rooms.get("rename5678")?.name).toBe("Untitled board");
  });
});

describe("previews", () => {
  it("stores a valid preview from a signed-in person", async () => {
    const { alice } = await aliceCreates("thumb1234");
    alice.emit("board:thumbnail", { image: THUMB });
    await settle();
    await server.saver.flush();
    expect((await store.load("thumb1234"))?.thumbnail).toBe(THUMB);
  });

  it("ignores previews from guests and anything that isn't a JPEG data URL", async () => {
    await aliceCreates("thumb5678");
    const { client: guest } = await join("thumb5678", { guestName: "Guest" });
    guest.emit("board:thumbnail", { image: THUMB });
    const { client: bob } = await join("thumb5678", { token: "bob-token" });
    bob.emit("board:thumbnail", { image: "data:image/svg+xml;base64,PHN2Zz4=" });
    await settle();
    expect(server.rooms.get("thumb5678")?.thumbnail).toBeNull();
  });
});

describe("dashboard API", () => {
  it("answers CORS preflight for our site only", async () => {
    const ours = await fetch(`${url}/api/boards/abcd1234`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN, "access-control-request-method": "DELETE" },
    });
    expect(ours.status).toBe(204);
    expect(ours.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(ours.headers.get("access-control-allow-methods")).toContain("DELETE");

    const theirs = await fetch(`${url}/api/boards/abcd1234`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.com" },
    });
    expect(theirs.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("requires a valid login", async () => {
    expect((await api("/api/boards/abcd1234", "DELETE")).status).toBe(401);
    expect((await api("/api/boards/abcd1234", "DELETE", "forged-token")).status).toBe(401);
  });

  it("returns 404 for boards that don't exist and bad IDs", async () => {
    expect((await api("/api/boards/nosuch1234", "DELETE", "alice-token")).status).toBe(404);
    expect((await api("/api/boards/..%2Fx", "DELETE", "alice-token")).status).toBe(404);
  });

  it("lets only the owner rename a board that's still in memory (saved on the next save)", async () => {
    const { alice } = await aliceCreates("api1234");
    alice.disconnect();

    expect((await api("/api/boards/api1234", "PATCH", "bob-token", { name: "Mine now" })).status).toBe(403);
    expect((await api("/api/boards/api1234", "PATCH", "alice-token", { name: "   " })).status).toBe(400);

    const res = await api("/api/boards/api1234", "PATCH", "alice-token", { name: "Roadmap" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "Roadmap" });
    await server.saver.flush();
    expect((await store.loadMeta("api1234"))?.name).toBe("Roadmap");
  });

  it("renames a board that's no longer in memory directly in the database", async () => {
    const { alice } = await aliceCreates("api9999");
    alice.disconnect();
    await server.saver.flush();
    server.rooms.remove("api9999"); // as if it had been unloaded after sitting idle
    server.saver.forget(["api9999"]);

    expect((await api("/api/boards/api9999", "PATCH", "bob-token", { name: "Nope" })).status).toBe(403);
    expect((await api("/api/boards/api9999", "PATCH", "alice-token", { name: "Archive" })).status).toBe(200);
    expect((await store.loadMeta("api9999"))?.name).toBe("Archive");
  });

  it("renaming from the dashboard updates everyone on the board live", async () => {
    await aliceCreates("api5678");
    const { client: bob } = await join("api5678", { token: "bob-token" });
    await api("/api/boards/api5678", "PATCH", "alice-token", { name: "Live rename" });
    expect(await next(bob, "board:renamed")).toEqual({ name: "Live rename" });
  });

  it("deleting removes everyone from the board and it never comes back", async () => {
    const { alice } = await aliceCreates("delete1234");
    const { client: bob } = await join("delete1234", { token: "bob-token" });
    alice.emit("stroke:start", { strokeId: "s1", color: "#1e1e1e", size: 4, tool: "pen", point: { x: 1, y: 1 } });
    await next(bob, "stroke:start");

    expect((await api("/api/boards/delete1234", "DELETE", "bob-token")).status).toBe(403);
    expect((await api("/api/boards/delete1234", "DELETE", "alice-token")).status).toBe(204);

    await next(bob, "board:deleted");
    await next(alice, "board:deleted");
    expect(await store.load("delete1234")).toBeNull();
    expect([...store.members.keys()].some((k) => k.startsWith("delete1234 "))).toBe(false);

    // Drawing after the delete doesn't resurrect it.
    bob.emit("stroke:start", { strokeId: "s2", color: "#1e1e1e", size: 4, tool: "pen", point: { x: 1, y: 1 } });
    await settle();
    await server.saver.flush();
    expect(await store.load("delete1234")).toBeNull();

    // And a guest can't open it any more.
    const guest = await connect({ guestName: "Late" });
    guest.emit("room:join", { roomId: "delete1234" });
    expect(await next(guest, "room:error")).toEqual({ reason: "not-found" });
  });

  it("lets people remove a shared board from their list, but not the owner", async () => {
    await aliceCreates("leave1234");
    await join("leave1234", { token: "bob-token" });
    await settle();

    expect((await api("/api/boards/leave1234/membership", "DELETE", "alice-token")).status).toBe(400);
    expect((await api("/api/boards/leave1234/membership", "DELETE", "bob-token")).status).toBe(204);
    expect(store.members.has(`leave1234 ${BOB.id}`)).toBe(false);
    expect(store.members.has(`leave1234 ${ALICE.id}`)).toBe(true);
    expect(await store.load("leave1234")).not.toBeNull();
  });
});
