# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
