// Integration tests: a real server on a random port with real Socket.IO clients.
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { io as connectClient, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  StrokeStartPayload,
} from "@whiteboard/shared";
import { createWhiteboardServer, type WhiteboardServer } from "./app.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

const ORIGIN = "http://localhost:5173";
let server: WhiteboardServer;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  server = createWhiteboardServer({ clientOrigins: [ORIGIN], log: () => {} });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await server.io.close();
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

/** Connect a client that records every event it receives. */
async function connect(): Promise<Client & { received: Array<[EventName, unknown]> }> {
  const client = connectClient(url, { transports: ["websocket"], forceNew: true }) as Client & {
    received: Array<[EventName, unknown]>;
  };
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

  it("counts people on the board as they join and leave", async () => {
    const { a, b } = await joinedPair("count1234");
    expect(await next(a, "room:users", (p) => p.count === 2)).toEqual({ count: 2 });
    b.disconnect();
    expect(await next(a, "room:users", (p) => p.count === 1)).toEqual({ count: 1 });
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
