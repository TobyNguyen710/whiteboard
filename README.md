# Whiteboard

An all-in-one collaborative canvas: part Paint, part graph drawer, part Figma-lite. Open a board link and draw together in real time.

**Live:** https://whiteboard-ochre-five.vercel.app

> 🚧 Early development. Built a little at a time; see [CHANGELOG.md](CHANGELOG.md).

## Stack

- **Language:** TypeScript (strict)
- **Client:** React + Vite, HTML canvas with Pointer Events
- **Server:** Node + Socket.IO (rooms in memory for v1)
- **Shared:** socket event and data types used by both sides

## Layout

```
client/   React + Vite app
server/   Node + Socket.IO server
shared/   Shared TypeScript types (socket events, Stroke, etc.)
```

## Getting started

```bash
npm install
npm run build -w shared
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:5173
```

## v1 roadmap

- [x] Project scaffold
- [x] Solo canvas: freehand drawing in one tab
- [x] Deploy client to Vercel
- [x] Rooms and live sync between tabs
- [x] Late join: new users see full history
- [x] Deploy server to Render (first shareable version)
- [x] Tools: colors, brush sizes, eraser, clear
- [x] Undo / redo (Ctrl+Z, Ctrl+Y) for your own strokes
- [ ] Quality: Vitest tests, GitHub Actions CI
- [ ] v1.0.0 release: README with GIF and live link
