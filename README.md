# Whiteboard

[![CI](https://github.com/TobyNguyen710/whiteboard/actions/workflows/ci.yml/badge.svg)](https://github.com/TobyNguyen710/whiteboard/actions/workflows/ci.yml)

An all-in-one collaborative canvas: part Paint, part graph drawer, part Figma-lite. Open a board link and draw together in real time.

**Try it:** https://whiteboard-ochre-five.vercel.app — share the board link with a friend and draw together.

> The server runs on a free tier that sleeps when idle, so the first load can take up to a minute.

I wanted to understand how tools like Figma and Excalidraw keep everyone's view in sync, so I built my own and keep adding to it, one release at a time. See [CHANGELOG.md](CHANGELOG.md).

## Features (v1.0)

- **Live shared drawing:** everyone on a board sees strokes appear as they're drawn.
- **Shareable boards:** every board has a short link; copy it, join by ID or link, or start a new one.
- **Late join:** open a board mid-session and see everything drawn so far.
- **Tools:** 8 colors plus a custom picker, brush sizes 1–100 with a live preview, eraser, clear board.
- **Undo / redo** for your own strokes (Ctrl+Z / Ctrl+Y), synced for everyone.
- **Works everywhere:** mouse, touch, and pen; the board scales to any screen and looks the same on all of them.

## How it works

```
 Browser A                    Server (Socket.IO)                 Browser B
 ─────────                    ──────────────────                 ─────────
 pointer events ──► stroke:start / stroke:points / stroke:end ──► draws live
                      │ validate · store in room · relay
 joins late ◄────────── room:state (full history) ─────────────
```

1. **Rooms.** Opening `/board/:roomId` connects to the server and joins that room. With no ID, the client makes a short readable one (no `0/o`, `1/l/i`) and updates the URL.
2. **Batching.** While you draw, points are sent in batches every 25 ms or 32 points, whichever comes first, to keep drawing smooth and traffic low.
3. **Relay and history.** The server validates each message, appends it to the room's in-memory history, and forwards it to everyone else in the room. Late joiners get the full history, including strokes still being drawn.
4. **One coordinate system.** Points are stored on a fixed 1920×1080 logical board and scaled to each screen, so drawings line up across devices.
5. **Undo with several people.** Each person can only undo their own strokes. The server remembers every stroke's original position, so a redone stroke goes back under anything drawn on top of it, including eraser marks.
6. **Shared types.** Every socket event and payload is defined once in `shared/` and used by both client and server, so they can't drift apart.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Client | React + Vite, HTML canvas with Pointer Events |
| Server | Node + Socket.IO (boards in memory) |
| Tests | Vitest (unit + integration with real sockets) |
| CI | GitHub Actions: lint, typecheck, test, build |
| Hosting | Vercel (client), Render (server) |

```
client/   React + Vite app
server/   Node + Socket.IO server
shared/   Shared TypeScript types (socket events, Stroke, limits)
```

## Getting started

Requires Node 20+.

```bash
npm install
npm run build -w shared
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:5173
```

## Testing

```bash
npm test             # run all tests once (Vitest)
npm run test:watch   # re-run tests as you edit
npm run typecheck    # strict TypeScript, including test files
npm run lint         # ESLint (likely bugs, React hook rules)
```

Unit tests cover the pure logic (board math, point batching, input validation, the room store with undo/redo). Integration tests in `server/src/app.test.ts` start a real server on a random port and drive it with real Socket.IO clients. CI runs everything on every push to `main` and on pull requests.

## Deploying

- **Client (Vercel):** import the repo with the root directory left at the repo root; `vercel.json` sets the build. Set `VITE_SERVER_URL` to the server's URL.
- **Server (Render):** create a Blueprint from the repo; `render.yaml` sets the build, start command, health check, and `CLIENT_ORIGIN` (comma-separated list of allowed sites).

## Roadmap

- [x] **v1, Live drawing:** shared freehand canvas, tools, undo/redo, tests, CI, deployed.
- [ ] **v2, Paint tools:** shapes, lines, fill, text.
- [ ] **v3, Graphing:** type an equation and plot it, with grids and axes.
- [ ] **v4, Figma-style editing:** select, move, resize, layers, export to PNG or SVG.
- [ ] **v5, Fun layer:** draw-and-guess game mode, timelapse replay of how a board was drawn.
- [ ] **Later:** saved boards (database), accounts, live cursors, load testing.

## Known limits (v1)

- Boards live in server memory: a server restart or redeploy clears them.
- Undo history is per connection: refreshing the page resets it (your strokes stay).
- Anyone on a board can clear it.
