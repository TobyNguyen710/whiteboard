-- Boards saved by the Socket.IO server.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.boards (
  id          text primary key check (id ~ '^[a-z0-9]{4,32}$'),
  name        text not null default 'Untitled board' check (char_length(name) <= 60),
  -- Full drawing history in order: [{ id, userId, color, size, tool, points: [{ x, y }] }]
  strokes     jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Row-level security on with no policies: nobody can read or write through the public API.
-- Only the server, using the secret key (which bypasses RLS), can. Policies for signed-in
-- users come with login (v2 Day 15-16).
alter table public.boards enable row level security;
