-- Who created each board. Only signed-in users can create boards, so new boards get an owner.
-- Boards created before login existed keep owner_id = null and stay open to anyone with the link.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

alter table public.boards
  add column if not exists owner_id uuid references auth.users (id) on delete set null;

create index if not exists boards_owner_id_idx on public.boards (owner_id);
