import { useEffect, useState } from "react";
import { cleanBoardName, DEFAULT_BOARD_NAME, isValidRoomId, isValidThumbnail } from "@whiteboard/shared";
import { supabase } from "./supabase";

/** A board on the signed-in user's dashboard. */
export type MyBoard = {
  id: string;
  name: string;
  thumbnail: string | null;
  isOwner: boolean;
  /** When this user last opened it (ms). */
  lastOpened: number;
};

type State = { status: "loading" | "ready" | "error"; boards: MyBoard[] };

type Row = {
  last_opened_at: string;
  boards: { id: string; name: string; owner_id: string | null; thumbnail: string | null } | null;
};

function toBoards(rows: Row[], accountId: string): MyBoard[] {
  const boards: MyBoard[] = [];
  for (const row of rows) {
    const board = row.boards;
    if (!board || !isValidRoomId(board.id)) continue;
    boards.push({
      id: board.id,
      name: cleanBoardName(board.name) ?? DEFAULT_BOARD_NAME,
      thumbnail: isValidThumbnail(board.thumbnail) ? board.thumbnail : null,
      isOwner: board.owner_id === accountId,
      lastOpened: Date.parse(row.last_opened_at) || 0,
    });
  }
  return boards;
}

/**
 * Boards this account has opened (owned or shared), newest first, read straight from Supabase.
 * Row-level security makes sure only your own memberships and boards come back.
 */
export function useMyBoards(accountId: string) {
  const [state, setState] = useState<State>({ status: "loading", boards: [] });

  useEffect(() => {
    if (!supabase) return;
    let current = true; // ignore a response that arrives after the account changed
    void supabase
      .from("board_members")
      .select("last_opened_at, boards (id, name, owner_id, thumbnail)")
      .eq("user_id", accountId)
      .order("last_opened_at", { ascending: false })
      .limit(200)
      .returns<Row[]>()
      .then(({ data, error }) => {
        if (!current) return;
        setState(error ? (prev) => ({ ...prev, status: "error" }) : { status: "ready", boards: toBoards(data ?? [], accountId) });
      });
    return () => {
      current = false;
    };
  }, [accountId]);

  /** Update the list right away after a change, without reloading. */
  const update = (change: (boards: MyBoard[]) => MyBoard[]) =>
    setState((prev) => ({ ...prev, boards: change(prev.boards) }));

  return { ...state, update };
}
