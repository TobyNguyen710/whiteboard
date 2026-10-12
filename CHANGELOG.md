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
