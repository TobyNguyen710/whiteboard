# Changelog

## [Unreleased]

### Added
- Monorepo scaffold with `client`, `server`, and `shared` workspaces.
- Shared `Point` / `Stroke` types and typed Socket.IO event maps.
- Minimal Socket.IO server and React + Vite client.
- Solo freehand canvas with Pointer Events (mouse, touch, pen, multi-touch), sharp on high-DPI screens, redraws on resize.
- Fixed 1920×1080 logical board, scaled to fit any window, so drawings look the same on every screen.
- Smoother strokes using quadratic curves.
- Vercel config for deploying the client.
- Board links: `/board/:roomId`, with a short readable room ID created automatically when missing.
- Client connects to the server over Socket.IO and joins the board's room (rejoins after reconnect).
- Connection badge with status, room ID, and a "Copy link" button.
- "Join" (accepts a board ID or a pasted link) and "New board" buttons.
- Server keeps each board's strokes in memory and relays strokes to everyone else on the board.
- Server validates every incoming stroke event; only a stroke's author can add to it.
- Empty boards are kept for 10 minutes, then deleted.
- Live sync: strokes are sent as you draw (points batched every 25 ms or 32 points) and other people's strokes appear in real time.
- Late join: new arrivals get the board's full history, and strokes still being drawn keep growing.
- "N online" count in the badge, updated as people join and leave.
- Server health check (`/health`), multiple allowed client origins, and a Render blueprint (`render.yaml`).
- Toolbar with 8 preset colors, a custom color picker, and 5 brush sizes; the choice is remembered per device.
- Eraser tool (paints the board color; syncs and replays like any stroke). Picking a color switches back to the pen.
- "Clear board" for everyone, with a confirm step; the server wipes the board's history.
