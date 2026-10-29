-- Roles on a board for signed-in members. The host is always the board's owner (boards.owner_id),
-- so only "editor" (can draw) and "viewer" (watch only) are stored here. Changed by the server
-- when the host changes someone's role.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to re-run.

alter table public.board_members
  add column if not exists role text not null default 'editor'
    check (role in ('editor', 'viewer'));
