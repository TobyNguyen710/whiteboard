// Roles end to end: host, editors, viewers, on a real server with real Socket.IO clients.
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { io as connectClient, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  HandshakeAuth,
  ServerToClientEvents,
  StrokeStartPayload,
} from "@whiteboard/shared";
import { createWhiteboardServer, type WhiteboardServer } from "./app.js";
import type { Authenticator } from "./auth.js";
import { MemoryBoardStore } from "./persistence.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];
type RecordingClient = Client & { received: Array<[EventName, unknown]> };

const ORIGIN = "http://localhost:5173";
const HOST = { id: "00000000-0000-0000-0000-0000000000a1", name: "Host", avatarUrl: null };
const BOB = { id: "00000000-0000-0000-0000-0000000000b0", name: "Bob", avatarUrl: null };
const GUEST_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

const authenticate: Authenticator = async (token) =>
  token === "host-token" ? HOST : token === "bob-token" ? BOB : null;

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
const got = (client: RecordingClient, event: EventName) => client.received.some(([e]) => e === event);

const stroke = (strokeId: string): StrokeStartPayload => ({
  strokeId,
  color: "#1e1e1e",
  size: 4,
  tool: "pen",
  point: { x: 1, y: 1 },
});

async function join(boardId: string, auth: HandshakeAuth) {
  const client = await connect(auth);
  client.emit("room:join", { roomId: boardId });
  const state = await next(client, "room:state");
  return { client, state };
}

/** The host creates a board and Bob (signed in) joins it. */
async function hostAndBob(boardId: string) {
  const { client: host } = await join(boardId, { token: "host-token" });
  const { client: bob } = await join(boardId, { token: "bob-token" });
  await next(host, "room:users", (p) => p.count === 2);
  return { host, bob };
}

describe("roles", () => {
  it("shows everyone's role in the people list", async () => {
    const { host } = await hostAndBob("roles1234");
    await join("roles1234", { guestName: "Guest", guestId: GUEST_ID });
    const { users } = await next(host, "room:users", (p) => p.count === 3);
    expect(users.map((u) => [u.name, u.role]).sort()).toEqual(
      [
        ["Bob", "editor"],
        ["Guest", "editor"],
        ["Host", "host"],
      ].sort(),
    );
  });

  it("lets the host make someone a viewer, who then can't draw or undo", async () => {
    const { host, bob } = await hostAndBob("viewer1234");
    bob.emit("stroke:start", stroke("before"));
    await next(host, "stroke:start");

    host.emit("member:set-role", { participantId: bob.id!, role: "viewer" });
    expect(await next(bob, "member:role")).toEqual({ role: "viewer" });
    const { users } = await next(host, "room:users", (p) => p.users.some((u) => u.role === "viewer"));
    expect(users.find((u) => u.id === bob.id)?.role).toBe("viewer");

    host.received.length = 0;
    bob.emit("stroke:start", stroke("after"));
    bob.emit("stroke:undo");
    await settle();
    expect(got(host, "stroke:start")).toBe(false);
    expect(got(host, "stroke:removed")).toBe(false);
  });

  it("stops a stroke that's in progress when someone becomes a viewer", async () => {
    const { host, bob } = await hostAndBob("midstroke1");
    bob.emit("stroke:start", stroke("s1"));
    await next(host, "stroke:start");

    host.emit("member:set-role", { participantId: bob.id!, role: "viewer" });
    await next(bob, "member:role");
    bob.emit("stroke:points", { strokeId: "s1", points: [{ x: 5, y: 5 }] });
    await settle();
    expect(got(host, "stroke:points")).toBe(false);
  });

  it("lets the host give drawing back", async () => {
    const { host, bob } = await hostAndBob("editor1234");
    host.emit("member:set-role", { participantId: bob.id!, role: "viewer" });
    await next(bob, "member:role");
    host.emit("member:set-role", { participantId: bob.id!, role: "editor" });
    expect(await next(bob, "member:role")).toEqual({ role: "editor" });

    bob.emit("stroke:start", stroke("again"));
    await next(host, "stroke:start");
  });

  it("remembers a signed-in member's role after they come back", async () => {
    const { host, bob } = await hostAndBob("remember12");
    host.emit("member:set-role", { participantId: bob.id!, role: "viewer" });
    await next(bob, "member:role");
    await settle();
    expect(store.roles.get(`remember12 ${BOB.id}`)).toBe("viewer");

    bob.disconnect();
    const { state } = await join("remember12", { token: "bob-token" });
    expect(state.role).toBe("viewer");
  });

  it("remembers a guest's role by their guest ID, not their connection", async () => {
    const { client: host } = await join("guest12345", { token: "host-token" });
    const { client: guest } = await join("guest12345", { guestName: "Guest", guestId: GUEST_ID });
    host.emit("member:set-role", { participantId: guest.id!, role: "viewer" });
    await next(guest, "member:role");

    guest.disconnect();
    const { state: back } = await join("guest12345", { guestName: "Guest", guestId: GUEST_ID });
    expect(back.role).toBe("viewer");

    const { state: someoneElse } = await join("guest12345", {
      guestName: "Other",
      guestId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    });
    expect(someoneElse.role).toBe("editor");
  });

  it("only the host can change roles, and the host's role can't be changed", async () => {
    const { host, bob } = await hostAndBob("onlyhost12");
    bob.emit("member:set-role", { participantId: host.id!, role: "viewer" });
    bob.emit("member:set-role", { participantId: bob.id!, role: "viewer" });
    host.emit("member:set-role", { participantId: host.id!, role: "viewer" });
    await settle();
    expect(got(host, "member:role")).toBe(false);
    expect(got(bob, "member:role")).toBe(false);
  });

  it("ignores made-up roles and people on other boards", async () => {
    const { host, bob } = await hostAndBob("bogus12345");
    const { client: elsewhere } = await join("elsewhere1", { token: "bob-token" });
    host.emit("member:set-role", { participantId: bob.id!, role: "host" as "editor" });
    host.emit("member:set-role", { participantId: elsewhere.id!, role: "viewer" });
    await settle();
    expect(got(bob, "member:role")).toBe(false);
    expect(got(elsewhere, "member:role")).toBe(false);
  });
});

describe("clearing", () => {
  it("is host-only on boards with a host", async () => {
    const { host, bob } = await hostAndBob("clear12345");
    bob.emit("board:clear", { roomId: "clear12345" });
    await settle();
    expect(got(host, "board:cleared")).toBe(false);

    host.emit("board:clear", { roomId: "clear12345" });
    await next(bob, "board:cleared");
  });

  it("keeps the old rule on boards from before accounts (no host): editors can clear", async () => {
    await store.save("legacy1234", { strokes: [], ownerId: null });
    const { client: a, state } = await join("legacy1234", { token: "bob-token" });
    expect(state).toMatchObject({ role: "editor", hasHost: false });
    const { client: b } = await join("legacy1234", { guestName: "Guest" });
    a.emit("board:clear", { roomId: "legacy1234" });
    await next(b, "board:cleared");

    // Nobody can hand out roles there.
    a.emit("member:set-role", { participantId: b.id!, role: "viewer" });
    await settle();
    expect(got(b, "member:role")).toBe(false);
  });
});
