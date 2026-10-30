# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Home page: start a new board, join one by link or ID, and see your recent boards with thumbnails, names, and when you last opened them. Rename or remove boards from the list. (Stored in this browser for now; accounts come later in v2.)
- Board page top bar: back to home, click-to-rename board name, connection status with "N online", and a Share button that copies the link.
- Routing with React Router: `/` is the home page and `/board/:id` is a board; unknown or invalid links go home.
- Saved boards (Supabase Postgres): boards load from the database when first opened, changes are saved every 2 seconds and on shutdown, so drawings survive server restarts and redeploys. Without Supabase settings the server keeps boards in memory as before.
- Safety: if a board can't be loaded, it's never saved over; idle boards are only unloaded once saved; boards are capped at 200,000 points.
- `/health/db` endpoint and a twice-weekly GitHub Actions ping, so the free Supabase project doesn't pause.
- Database schema in `supabase/migrations/`.
- Sign in with Google or GitHub (Supabase Auth). Signed out, the home page is a landing page; signed in, it's your dashboard with an account menu.
- Guests can join existing boards from a link with a random name (e.g. "Guest Teal Otter") they can change. Only signed-in users can create boards, and the creator is recorded as the board's owner.
- See who's on a board: avatars in the top bar, with a list of names on click.
- The server verifies every login when a connection opens; invalid logins are refused rather than treated as guests.
- Privacy page at `/privacy` (required for Google sign-in), linked from the landing page.
- Your boards on your account: the dashboard has Recent, My boards, and Shared with me tabs, loaded from the database so they're the same on every device. Rename or delete boards you own (delete asks first and removes the board for everyone on it); remove shared boards from your list.
- Board names are saved on the board: only the owner can rename it, and everyone on the board sees the new name immediately.
- Board previews are saved with the board (sent by signed-in people on it), so dashboard thumbnails look right anywhere. Clearing a board clears its preview.
- Server API for dashboard actions (`PATCH`/`DELETE /api/boards/:id`, `DELETE /api/boards/:id/membership`), checked by login and ownership, with CORS limited to the site.
- Database: `board_members` table and board thumbnails, with row-level security so signed-in users can only read their own boards and memberships.
- Roles on boards: the owner is the host; everyone else is an editor (can draw) or a viewer (watch only). The host changes roles from the people list, and the server enforces them: viewers can't draw, erase, or undo, and only the host can clear the board (boards from before accounts keep the old rule). Shown as role labels, with a "View only" label and no toolbar for viewers.
- Roles are remembered: in the database for signed-in members, and by a random guest ID kept in the browser for guests.
- Host controls (board settings, saved with the board): the role new people get (can draw or view only), lock the board so only the host draws, and who can clear (only the host, or anyone who can draw).
- The host can remove people from a board; they can't rejoin until the host allows them back. Removed people see a "You were removed" page; a locked board shows a "Board locked" label.
- Member roles are stored only when the host chooses one, so the board's default role applies to everyone else.

### Security
- Upgraded dev tooling to clear all `npm audit` findings (7 → 0): Vite 5 → 8, Vitest 3 → 5, @vitejs/plugin-react 4 → 6. The issues were in the dev server and test runner only; production dependencies already had none. Removed the Vite version pin added for Vitest 3.

### Changed
- Node 22.12+ or 24 is required (bounded so hosting doesn't jump to a new major version unannounced).
- Stroke coordinates are rounded to 0.1 board px on the server (invisible, keeps saved boards small).
- Opening the site no longer jumps straight into a new board; the floating board badge is replaced by the top bar and home page.

## [1.0.0] - 2026-10-21

First release: live, shared freehand drawing.

### Drawing
- Freehand drawing on an HTML canvas with Pointer Events: mouse, touch, pen, and multi-touch.
- Fixed 1920×1080 logical board scaled to fit any window, so a drawing looks the same on every screen. Sharp on high-DPI displays and redrawn on resize.
- Smooth strokes using quadratic curves, identical whether drawn live, received from others, or replayed from history.
- Brush preview under the mouse or pen showing the exact size, color, and eraser.

### Collaboration
- Board links (`/board/:roomId`) with short, readable IDs created automatically. Copy link, Join (by ID or pasted link), and New board.
- Live sync over Socket.IO: points are batched every 25 ms or 32 points, and other people's strokes appear as they draw.
- Late join: new arrivals get the board's full history, and strokes still being drawn keep growing.
- Connection badge with status and an "N online" count.
- Empty boards are kept for 10 minutes so a refresh doesn't wipe them, then deleted.

### Tools
- 8 preset colors plus a custom color picker.
- Brush sizes from 1 to 100: five quick picks and a slider. Your last tool, color, and size are remembered per device.
- Eraser that syncs and replays in order like any other stroke.
- Undo and redo for your own strokes (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z, ⌘ on Mac, plus toolbar buttons). Synced for everyone; redone strokes return to their original drawing order.
- "Clear board" for everyone, with a confirm step.

### Quality and infrastructure
- TypeScript strict mode across a monorepo (`client`, `server`, `shared`) with socket event types defined once in `shared`.
- Server validates every incoming message: payload shape, colors, brush sizes, coordinates, batch and stroke limits, and stroke ownership.
- 103 Vitest tests: unit tests for the pure logic and integration tests against a real server with real Socket.IO clients.
- ESLint with TypeScript and React hooks rules.
- GitHub Actions CI runs lint, typecheck, tests, and build on every push and pull request.
- Deployed: client on Vercel, server on Render (`render.yaml` blueprint, `/health` check).

[Unreleased]: https://github.com/TobyNguyen710/whiteboard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/TobyNguyen710/whiteboard/releases/tag/v1.0.0
