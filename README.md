# Whiteboard

An all-in-one collaborative canvas: part Paint, part graph drawer, part Figma-lite. Open a board link and draw together in real time.

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
- [ ] Solo canvas: freehand drawing in one tab
- [ ] Rooms and live sync between tabs
- [ ] Late join: new users see full history
- [ ] Tools: colors, brush sizes, eraser, clear
- [ ] Quality: Vitest tests, GitHub Actions CI
- [ ] Ship: deploy client (Vercel) and server (Render)
