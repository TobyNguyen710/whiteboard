-- Boards on your account: who has opened which board, board thumbnails, and read access.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run. Safe to re-run.

-- Small JPEG preview of the board for dashboard cards (sent by the browser, checked by the server).
alter table public.boards
  add column if not exists thumbnail text
    check (thumbnail is null or (thumbnail like 'data:image/jpeg;base64,%' and char_length(thumbnail) <= 200000));

-- Every signed-in user who has opened a board. Powers "Recent" and "Shared with me", and is where
-- roles will live. Removed automatically when the board or the account is deleted.
create table if not exists public.board_members (
  board_id        text not null references public.boards (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  last_opened_at  timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index if not exists board_members_user_recent_idx
  on public.board_members (user_id, last_opened_at desc);

alter table public.board_members enable row level security;

-- Read access for signed-in users (the dashboard queries Supabase directly with their login).
-- There are no insert/update/delete policies: every change goes through the server, which uses
-- the secret key and enforces the rules (only owners rename or delete boards, and so on).

drop policy if exists "Users can read their own memberships" on public.board_members;
create policy "Users can read their own memberships"
  on public.board_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read boards they own or have opened" on public.boards;
create policy "Users can read boards they own or have opened"
  on public.boards for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.board_members m
      where m.board_id = boards.id and m.user_id = (select auth.uid())
    )
  );
