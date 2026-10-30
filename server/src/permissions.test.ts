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

describe("board settings", () => {
  it("only the host can change settings, and everyone hears about it", async () => {
    const { host, bob } = await hostAndBob("settings01");
    bob.emit("board:update-settings", { locked: true });
    await settle();
    expect(got(host, "board:settings")).toBe(false);

    host.emit("board:update-settings", { locked: true, defaultRole: "host" as "editor" });
    expect(await next(bob, "board:settings")).toEqual({
      settings: { defaultRole: "editor", locked: true, clearPolicy: "host" },
      removedCount: 0,
    });
  });

  it("locking stops everyone but the host drawing, and unlocking brings it back", async () => {
    const { host, bob } = await hostAndBob("locked0001");
    host.emit("board:update-settings", { locked: true });
    await next(bob, "board:settings");
    bob.emit("stroke:start", stroke("blocked"));
    await settle();
    expect(got(host, "stroke:start")).toBe(false);

    host.emit("stroke:start", stroke("host-ok"));
    await next(bob, "stroke:start");

    host.emit("board:update-settings", { locked: false });
    await next(bob, "board:settings", (p) => !p.settings.locked);
    bob.emit("stroke:start", stroke("allowed"));
    await next(host, "stroke:start", (p) => p.strokeId === "allowed");
  });

  it("new people join with the default role, but people the host chose keep theirs", async () => {
    const { host, bob } = await hostAndBob("default001");
    host.emit("member:set-role", { participantId: bob.id!, role: "editor" }); // chosen explicitly
    await next(bob, "member:role");

    const { client: early } = await join("default001", { guestName: "Early", guestId: GUEST_ID });
    host.emit("board:update-settings", { defaultRole: "viewer" });
    // Someone who never got a role follows the new default right away...
    expect(await next(early, "member:role", (p) => p.role === "viewer")).toEqual({ role: "viewer" });

    // ...and so does anyone new.
    const { state } = await join("default001", { guestName: "Late", guestId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" });
    expect(state.role).toBe("viewer");

    // Bob was chosen as an editor, so he stays one.
    const { users } = await next(host, "room:users", (p) => p.count === 4);
    expect(users.find((u) => u.id === bob.id)?.role).toBe("editor");
  });

  it("can let anyone who can draw clear", async () => {
    const { host, bob } = await hostAndBob("clearpol01");
    host.emit("board:update-settings", { clearPolicy: "editors" });
    await next(bob, "board:settings");
    bob.emit("board:clear", { roomId: "clearpol01" });
    await next(host, "board:cleared");
  });

  it("saves settings with the board", async () => {
    const { host } = await hostAndBob("savedset01");
    host.emit("board:update-settings", { locked: true, clearPolicy: "editors", defaultRole: "viewer" });
    await next(host, "board:settings");
    await server.saver.flush();
    expect((await store.load("savedset01"))?.settings).toEqual({
      defaultRole: "viewer",
      locked: true,
      clearPolicy: "editors",
    });
  });
});

describe("removing people", () => {
  it("takes someone off the board and keeps them off", async () => {
    const { host, bob } = await hostAndBob("remove0001");
    host.emit("member:remove", { participantId: bob.id! });
    expect(await next(bob, "room:error")).toEqual({ reason: "removed" });
    const { users } = await next(host, "room:users", (p) => p.count === 1);
    expect(users.map((u) => u.id)).toEqual([host.id]);
    expect((await next(host, "board:settings")).removedCount).toBe(1);

    // They can't draw any more...
    bob.emit("stroke:start", stroke("ghost"));
    await settle();
    expect(got(host, "stroke:start")).toBe(false);

    // ...or rejoin, even from a new tab.
    const again = await connect({ token: "bob-token" });
    again.emit("room:join", { roomId: "remove0001" });
    expect(await next(again, "room:error")).toEqual({ reason: "removed" });
  });

  it("keeps a removed guest off by their guest ID, but not other guests", async () => {
    const { client: host } = await join("remove0002", { token: "host-token" });
    const { client: guest } = await join("remove0002", { guestName: "Pest", guestId: GUEST_ID });
    host.emit("member:remove", { participantId: guest.id! });
    await next(guest, "room:error");

    const back = await connect({ guestName: "Pest", guestId: GUEST_ID });
    back.emit("room:join", { roomId: "remove0002" });
    expect(await next(back, "room:error")).toEqual({ reason: "removed" });

    await join("remove0002", { guestName: "Friend", guestId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" });
  });

  it("lets removed people back when the host allows it", async () => {
    const { host, bob } = await hostAndBob("remove0003");
    host.emit("member:remove", { participantId: bob.id! });
    await next(bob, "room:error");
    host.emit("board:allow-removed");
    expect((await next(host, "board:settings", (p) => p.removedCount === 0)).removedCount).toBe(0);
    await join("remove0003", { token: "bob-token" });
  });

  it("only the host can remove people, and the host can't be removed", async () => {
    const { host, bob } = await hostAndBob("remove0004");
    bob.emit("member:remove", { participantId: host.id! });
    host.emit("member:remove", { participantId: host.id! });
    await settle();
    expect(got(host, "room:error")).toBe(false);
    expect(got(bob, "room:error")).toBe(false);
  });
});
