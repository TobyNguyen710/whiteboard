// Closed boards, sharing, and passwords, on a real server with real Socket.IO clients.
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { io as connectClient, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  HandshakeAuth,
  RoomErrorReason,
  ServerToClientEvents,
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
const GUEST = { guestName: "Guest", guestId: GUEST_ID };

const authenticate: Authenticator = async (token) =>
  token === "host-token" ? HOST : token === "bob-token" ? BOB : null;

let store: MemoryBoardStore;
let server: WhiteboardServer;
let url: string;
const clients: Client[] = [];

async function start() {
  server = createWhiteboardServer({ clientOrigins: [ORIGIN], boardStore: store, authenticate, log: () => {} });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  store = new MemoryBoardStore();
  await start();
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

function next<E extends EventName>(client: RecordingClient, event: E): Promise<Payload<E>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 2000);
    const check = () => {
      const index = client.received.findIndex(([e]) => e === event);
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

async function enter(boardId: string, auth: HandshakeAuth, password?: string) {
  const client = await connect(auth);
  client.emit("room:join", { roomId: boardId, password });
  const state = await next(client, "room:state");
  return { client, state };
}

/** Try to join and expect to be refused. Also checks nothing about the board was sent. */
async function refused(boardId: string, auth: HandshakeAuth, password?: string): Promise<RoomErrorReason> {
  const client = await connect(auth);
  client.emit("room:join", { roomId: boardId, password });
  const { reason } = await next(client, "room:error");
  await settle();
  expect(client.received.map(([event]) => event)).toEqual([]);
  client.disconnect();
  return reason;
}

async function hostCreates(boardId: string) {
  const { client: host, state } = await enter(boardId, { token: "host-token" });
  return { host, state };
}

async function share(host: RecordingClient, shared = true) {
  host.emit("board:update-settings", { shared });
  await next(host, "board:settings");
}

const setPassword = (client: RecordingClient, password: string | null) =>
  new Promise<boolean>((resolve) => client.emit("board:set-password", { password }, ({ ok }) => resolve(ok)));

/** A shared board with a password. */
async function passwordBoard(boardId: string, password = "open sesame") {
  const { host } = await hostCreates(boardId);
  await share(host);
  expect(await setPassword(host, password)).toBe(true);
  await next(host, "board:settings");
  return host;
}

describe("closed boards", () => {
  it("start closed, to guests and signed-in people alike", async () => {
    const { state } = await hostCreates("closed0001");
    expect(state.settings.shared).toBe(false);
    expect(await refused("closed0001", GUEST)).toBe("private");
    expect(await refused("closed0001", { token: "bob-token" })).toBe("private");
  });

  it("keep refused people from doing anything on the board", async () => {
    const { host } = await hostCreates("closed0002");
    const bob = await connect({ token: "bob-token" });
    bob.emit("room:join", { roomId: "closed0002" });
    await next(bob, "room:error");

    bob.emit("stroke:start", {
      strokeId: "s1",
      color: "#1e1e1e",
      size: 4,
      tool: "pen",
      point: { x: 1, y: 1 },
    });
    bob.emit("board:thumbnail", { image: "data:image/jpeg;base64,AAAA" });
    await settle();
    expect(host.received.some(([event]) => event === "stroke:start")).toBe(false);
    expect(server.rooms.get("closed0002")?.thumbnail).toBeNull();
  });

  it("don't add refused people to anyone's list", async () => {
    await hostCreates("closed0003");
    await refused("closed0003", { token: "bob-token" });
    await settle();
    expect(store.members.has(`closed0003 ${BOB.id}`)).toBe(false);
  });

  it("let in signed-in people who opened the board before it was closed", async () => {
    await hostCreates("closed0004");
    await server.saver.flush();
    await store.recordVisit("closed0004", BOB.id);
    // Loading from the store is what picks up people from before sharing existed.
    server.rooms.remove("closed0004");
    server.saver.forget(["closed0004"]);
    const { state } = await enter("closed0004", { token: "bob-token" });
    expect(state.role).toBe("editor");
  });
});

describe("sharing", () => {
  it("lets anyone in by board ID once the host turns it on", async () => {
    const { host } = await hostCreates("shared0001");
    await share(host);
    expect((await enter("shared0001", GUEST)).state.settings.shared).toBe(true);
    await enter("shared0001", { token: "bob-token" });
  });

  it("only the host can turn it on", async () => {
    const { host } = await hostCreates("shared0002");
    await share(host);
    const { client: bob } = await enter("shared0002", { token: "bob-token" });
    await share(host, false);
    await next(bob, "board:settings");

    bob.emit("board:update-settings", { shared: true });
    await settle();
    expect(server.rooms.get("shared0002")?.settings.shared).toBe(false);
  });

  it("keeps people who joined when it's turned off, and stops new people", async () => {
    const { host } = await hostCreates("shared0003");
    await share(host);
    const { client: guest } = await enter("shared0003", GUEST);
    const { client: bob } = await enter("shared0003", { token: "bob-token" });
    await share(host, false);

    expect(await refused("shared0003", { guestName: "Stranger" })).toBe("private");

    guest.disconnect();
    bob.disconnect();
    await enter("shared0003", GUEST);
    await enter("shared0003", { token: "bob-token" });
  });

  it("removing someone takes away their access, even after they're allowed back", async () => {
    const { host } = await hostCreates("shared0004");
    await share(host);
    const { client: bob } = await enter("shared0004", { token: "bob-token" });
    await next(host, "room:users");
    await share(host, false);

    host.emit("member:remove", { participantId: bob.id! });
    await next(bob, "room:error");
    expect(await refused("shared0004", { token: "bob-token" })).toBe("removed");
    host.emit("board:allow-removed");
    await settle();
    expect(await refused("shared0004", { token: "bob-token" })).toBe("private");
  });
});

describe("passwords", () => {
  it("asks for the password, refuses a wrong one, and takes the right one", async () => {
    await passwordBoard("pass000001");
    expect(await refused("pass000001", GUEST)).toBe("password-needed");
    expect(await refused("pass000001", GUEST, "wrong guess")).toBe("password-wrong");
    expect(await refused("pass000001", GUEST, "x".repeat(1000))).toBe("password-wrong");
    expect((await enter("pass000001", GUEST, "open sesame")).state.hasPassword).toBe(true);
  });

  it("is only needed the first time", async () => {
    await passwordBoard("pass000002");
    const { client } = await enter("pass000002", GUEST, "open sesame");
    client.disconnect();
    await enter("pass000002", GUEST);
  });

  it("doesn't apply on a closed board: the password alone isn't enough", async () => {
    const host = await passwordBoard("pass000003");
    await share(host, false);
    expect(await refused("pass000003", GUEST, "open sesame")).toBe("private");
  });

  it("keeps people in when it changes, and the old one stops working", async () => {
    const host = await passwordBoard("pass000004");
    const { client } = await enter("pass000004", GUEST, "open sesame");
    expect(await setPassword(host, "new secret")).toBe(true);
    client.disconnect();
    await enter("pass000004", GUEST);

    expect(await refused("pass000004", { guestName: "New" }, "open sesame")).toBe("password-wrong");
    await enter("pass000004", { guestName: "New" }, "new secret");
  });

  it("can be removed", async () => {
    const host = await passwordBoard("pass000005");
    expect(await setPassword(host, null)).toBe(true);
    expect((await next(host, "board:settings")).hasPassword).toBe(false);
    await enter("pass000005", GUEST);
  });

  it("can only be set by the host, and must be a sensible length", async () => {
    const { host } = await hostCreates("pass000006");
    await share(host);
    const { client: bob } = await enter("pass000006", { token: "bob-token" });
    expect(await setPassword(bob, "bob's password")).toBe(false);
    expect(await setPassword(host, "abc")).toBe(false);
    expect(await setPassword(host, "x".repeat(65))).toBe(false);
    expect(server.rooms.get("pass000006")?.passwordHash).toBeNull();
  });

  it("is stored only as a hash and never sent to anyone", async () => {
    const host = await passwordBoard("pass000007", "plain text secret");
    const { client, state } = await enter("pass000007", GUEST, "plain text secret");
    await setPassword(host, "another secret");
    await next(client, "board:settings");

    const hash = store.passwords.get("pass000007");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("another secret");
    await server.saver.flush();
    expect(store.boards.get("pass000007")).not.toContain("scrypt");
    expect(JSON.stringify([state, client.received, host.received])).not.toContain("scrypt");
  });

  it("isn't turned on if it can't be saved", async () => {
    const { host } = await hostCreates("pass000008");
    const save = store.savePassword;
    store.savePassword = () => Promise.reject(new Error("database down"));
    expect(await setPassword(host, "open sesame")).toBe(false);
    store.savePassword = save;
    expect(server.rooms.get("pass000008")?.passwordHash).toBeNull();
  });

  it("stops guessing after too many wrong tries, even with the right password", async () => {
    await passwordBoard("pass000009");
    for (let i = 0; i < 5; i++) expect(await refused("pass000009", GUEST, `guess ${i}`)).toBe("password-wrong");
    expect(await refused("pass000009", GUEST, "guess 6")).toBe("too-many-tries");
    expect(await refused("pass000009", GUEST, "open sesame")).toBe("too-many-tries");
  });

  it("limits guessing on a board even from many addresses", async () => {
    await passwordBoard("pass000010");
    const tryFrom = async (address: string) => {
      const client = connectClient(url, {
        transports: ["websocket"],
        forceNew: true,
        auth: GUEST,
        extraHeaders: { "x-forwarded-for": address },
      }) as Client;
      clients.push(client);
      return new Promise<RoomErrorReason>((resolve) => {
        client.once("room:error", ({ reason }) => resolve(reason));
        client.once("connect", () => client.emit("room:join", { roomId: "pass000010", password: "wrong guess" }));
      });
    };
    for (let i = 0; i < 30; i++) expect(await tryFrom(`10.0.0.${i}`)).toBe("password-wrong");
    expect(await tryFrom("10.0.1.1")).toBe("too-many-tries");
  });

  it("ignores anything sent while the password is still being checked", async () => {
    await passwordBoard("pass000012");
    const bob = await connect({ token: "bob-token" });
    bob.emit("room:join", { roomId: "pass000012", password: "wrong guess" });
    bob.emit("board:thumbnail", { image: "data:image/jpeg;base64,AAAA" });
    expect((await next(bob, "room:error")).reason).toBe("password-wrong");
    expect(server.rooms.get("pass000012")?.thumbnail).toBeNull();
  });

  it("doesn't count correct passwords against the limit", async () => {
    await passwordBoard("pass000011");
    for (let i = 0; i < 7; i++) await enter("pass000011", { guestName: `Friend ${i}` }, "open sesame");
  });
});

describe("after a restart", () => {
  it("remembers sharing, the password, and who got in", async () => {
    const host = await passwordBoard("restart001");
    await enter("restart001", GUEST, "open sesame");
    await enter("restart001", { token: "bob-token" }, "open sesame");
    await share(host, false);
    await settle();
    await server.saver.flush();

    for (const client of clients.splice(0)) client.disconnect();
    await server.io.close();
    await start();

    expect(await refused("restart001", { guestName: "Stranger" })).toBe("private");
    await enter("restart001", GUEST);
    await enter("restart001", { token: "bob-token" });
    const { client: backHost } = await enter("restart001", { token: "host-token" });
    await share(backHost, true);
    expect(await refused("restart001", { guestName: "Stranger" })).toBe("password-needed");
  });
});
