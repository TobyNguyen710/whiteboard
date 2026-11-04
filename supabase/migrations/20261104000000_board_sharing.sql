-- Boards start closed: only the host and people who already joined can open one, until the host
-- turns sharing on. Every existing board becomes closed; signed-in people who opened one before
-- keep access through board_members.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to re-run.

alter table public.boards
  add column if not exists shared boolean not null default false;

-- Board passwords and guests who got in. Kept out of `boards` because board members can read that
-- table. Row-level security with no policies means only the server (secret key) can touch this.
create table if not exists public.board_access (
  board_id      text primary key references public.boards (id) on delete cascade,
  password_hash text,
  guests        text[] not null default '{}'
);

alter table public.board_access enable row level security;
revoke all on public.board_access from anon, authenticated;
