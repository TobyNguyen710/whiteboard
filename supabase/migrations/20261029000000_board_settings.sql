-- Board settings the host controls: the role new people get, whether the board is locked (only the
-- host draws), and who can clear it. Saved by the server with the rest of the board.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to re-run.

alter table public.boards
  add column if not exists default_role text not null default 'editor'
    check (default_role in ('editor', 'viewer')),
  add column if not exists locked boolean not null default false,
  add column if not exists clear_policy text not null default 'host'
    check (clear_policy in ('host', 'editors'));

-- A member's role is now only stored when the host chooses one; empty (null) means "use the
-- board's default role". Visits used to record 'editor' automatically, which would hide a
-- "new people join as viewers" setting from anyone who had opened the board before, so those
-- automatic values are cleared. (The existing check still allows only 'editor', 'viewer', or null.)
alter table public.board_members
  alter column role drop not null,
  alter column role drop default;

update public.board_members set role = null where role = 'editor';
