# Whiteboard

[![CI](https://github.com/TobyNguyen710/whiteboard/actions/workflows/ci.yml/badge.svg)](https://github.com/TobyNguyen710/whiteboard/actions/workflows/ci.yml)

A real-time collaborative whiteboard. Sign in, create a private board, share it when you're ready, and draw together live, with saved boards, a dashboard, and host controls over who can draw.

**Try it:** https://whiteboard-ochre-five.vercel.app

1. Sign in with Google or GitHub and click **New board**.
2. Click **Share**, turn sharing on, and open the link in another browser or on your phone (no account needed to join).
3. Draw on one screen and watch it appear on the other. As the host, open the people list to make someone **View only**, or ⚙ to lock the board.

> The server runs on a free tier that sleeps when idle, so the first connection can take up to a minute.

I wanted to understand how tools like Figma and Excalidraw keep everyone's view in sync, so I built my own and keep adding to it, one release at a time. See [CHANGELOG.md](CHANGELOG.md).

## Features (v2.1)

- **Live shared drawing:** everyone on a board sees strokes appear as they're drawn, including people who join late.
- **Accounts and a dashboard:** sign in with Google or GitHub. Your boards follow you to any device, in Recent, My boards, and Shared with me, with live previews. Rename or delete boards you own.
- **Saved boards:** boards are stored in Postgres and survive server restarts and redeploys.
- **Private until shared:** boards start closed. The host turns sharing on, and people join with the link or by typing the board ID. An optional password keeps out anyone who guesses the ID.
- **Guests:** anyone the host shares with can join with a display name, no sign-up.
- **Roles and host controls:** the board's owner is the host. They choose who can draw and who can only watch, what role new people get, whether the board is locked, and who can clear it. They can also remove people, who can't rejoin until allowed back.
- **Tools:** 8 colors plus a custom picker, brush sizes 1–100 with a live preview, eraser, clear board.
- **Undo / redo** for your own strokes (Ctrl+Z / Ctrl+Y), synced for everyone.
- **Works everywhere:** mouse, touch, and pen; the board scales to any screen and looks the same on all of them.

## How it works

```
 Browser A                    Server (Socket.IO)                 Browser B
 ─────────                    ──────────────────                 ─────────
 pointer events ──► stroke:start / stroke:points / stroke:end ──► draws live
                      │ check login + role · validate · store · relay
 joins late ◄────────── room:state (history, name, your role) ──
                      │
                      ▼ saved every 2 s
                 Supabase Postgres ◄── dashboard reads (row-level security)
```

1. **Rooms.** Opening `/board/:id` connects to the server and joins that board. Boards have short, readable IDs (no `0/o`, `1/l/i`).
2. **Batching.** While you draw, points are sent in batches every 25 ms or 32 points, whichever comes first, to keep drawing smooth and traffic low.
3. **Relay and history.** The server validates each message, appends it to the board's history in memory, and forwards it to everyone else. Late joiners get the full history, including strokes still being drawn.
4. **Saving.** A board is loaded from the database the first time it's opened, saved every 2 seconds while it changes, and saved again on shutdown. A board that failed to load is never saved over, and boards only leave memory once they're saved.
5. **Login.** The browser signs in with Supabase Auth and sends its token when it connects. The server verifies it with Supabase before letting the connection in; a bad token is refused, not treated as a guest.
6. **Access.** A closed board sends nothing to someone who isn't allowed in. People who got in once are remembered, so turning sharing off or changing the password only stops new people. Passwords are hashed with scrypt, kept in a table only the server can read, and wrong tries are limited per address and per board.
7. **Roles.** Every action is checked on the server against one shared function, `permissionsFor` in `shared/`, so the buttons the client shows and the rules the server enforces can't disagree.
8. **Who writes what.** The browser only *reads* the database (its own boards, enforced by row-level security). Every write goes through the server, which checks ownership: socket events on the board, and a small HTTP API for dashboard actions.
9. **One coordinate system.** Points are stored on a fixed 1920×1080 logical board and scaled to each screen, so drawings line up across devices.
10. **Undo with several people.** Each person can only undo their own strokes. The server remembers every stroke's original position, so a redone stroke goes back under anything drawn on top of it, including eraser marks.
11. **Shared types.** Every socket event, payload, and permission rule is defined once in `shared/` and used by both client and server.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) |
| Client | React + Vite + React Router, HTML canvas with Pointer Events |
| Server | Node + Socket.IO |
| Database and login | Supabase (Postgres with row-level security, Auth with Google and GitHub) |
| Tests | Vitest (unit + integration with real sockets) |
| CI | GitHub Actions: lint, typecheck, test, build |
| Hosting | Vercel (client), Render (server), Supabase (database) |

```
client/              React + Vite app
server/              Node + Socket.IO server and dashboard API
shared/              Types and rules used by both (socket events, roles, limits)
supabase/migrations/ Database schema
```

## Getting started

Requires Node 22.12+ or 24.

```bash
npm install
npm run build -w shared
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:5173
```

Without Supabase settings, boards are kept in memory and login is off (anyone can create boards, and names and previews are kept in the browser). To enable saving and login locally:

1. Create a Supabase project and run the 6 files in `supabase/migrations/` in order in its SQL editor.
2. Copy `server/.env.example` to `server/.env` with the project URL and **secret** key.
3. Copy `client/.env.example` to `client/.env.local` with the project URL and **publishable** key.
4. Enable the Google and GitHub providers in Supabase Auth and add `http://localhost:5173/**` to its redirect URLs.

## Testing

```bash
npm test             # run all tests once (Vitest)
npm run test:watch   # re-run tests as you edit
npm run typecheck    # strict TypeScript, including test files
npm run lint         # ESLint (likely bugs, React hook rules)
```

268 tests. Unit tests cover the pure logic: board math, point batching, input validation, roles and permissions, and the room store with undo/redo. Integration tests start a real server on a random port and drive it with real Socket.IO clients and HTTP requests:

- `server/src/app.test.ts`: drawing, history, undo/redo, renames, guests, and logins over real sockets.
- `server/src/permissions.test.ts`: roles, locking, clear rules, and removing people, enforced by the server.
- `server/src/sharing.test.ts`: closed boards, sharing, passwords, guessing limits, and what survives a restart.
- `server/src/persistence.test.ts`: loading, saving, shutdown, and never overwriting a board that failed to load.
- `server/src/api.test.ts`: the dashboard API (rename, delete, leave), ownership checks, and CORS.

CI runs everything on every push to `main` and on pull requests.

## Deploying

- **Client (Vercel):** import the repo with the root directory left at the repo root; `vercel.json` sets the build. Set `VITE_SERVER_URL` to the server's URL, and `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` for login.
- **Server (Render):** create a Blueprint from the repo; `render.yaml` sets the build, start command, health check, and `CLIENT_ORIGIN` (comma-separated list of allowed sites). Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the Render dashboard.
- **Database (Supabase):** run the SQL files in `supabase/migrations/` in order. The `keepalive` workflow pings `/health/db` twice a week so the free project doesn't pause.

## Roadmap

- [x] **v1, Live drawing:** shared freehand canvas, tools, undo/redo, tests, CI, deployed.
- [x] **v2, A real site:** accounts, dashboard, saved boards, guests, roles and host controls.
- [x] **v2.1, Private boards:** boards start closed, the host shares them, optional room passwords.
- [ ] **v3, Paint tools:** lines and arrows, rectangles and ellipses with fill, text, tool shortcuts.
- [ ] **v4, AI drawing, free and private:** type "flowchart: idea → build → ship" and it's drawn on the board. Built-in templates work instantly on any device; an optional small open model runs entirely in your browser (WebGPU), with no API costs and no data leaving your device.

## Known limits

- Undo history is per connection: refreshing the page resets it (your strokes stay).
- The list of removed people is kept in server memory, so after a restart they can rejoin a board that's still shared.
- Boards from before accounts have no host who could share them, so they stay open.
- The free server sleeps when idle; the first connection after a while can take up to a minute.
