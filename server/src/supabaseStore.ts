import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanBoardName, DEFAULT_BOARD_NAME, isValidThumbnail } from "@whiteboard/shared";
import type { BoardMeta, BoardStore, SavedBoard } from "./persistence.js";
import { parseStoredStrokes } from "./validate.js";

/**
 * Boards saved in Supabase Postgres (tables `boards` and `board_members`, see
 * supabase/migrations). Uses the secret key, which bypasses row-level security: it must only ever
 * live on the server.
 */
export class SupabaseBoardStore implements BoardStore {
  private readonly db: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async load(boardId: string): Promise<SavedBoard | null> {
    const { data, error } = await this.db
      .from("boards")
      .select("strokes, owner_id, name, thumbnail")
      .eq("id", boardId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      strokes: parseStoredStrokes(data.strokes),
      ownerId: typeof data.owner_id === "string" ? data.owner_id : null,
      name: cleanBoardName(data.name) ?? DEFAULT_BOARD_NAME,
      thumbnail: isValidThumbnail(data.thumbnail) ? data.thumbnail : null,
    };
  }

  async save(boardId: string, board: SavedBoard): Promise<void> {
    const { error } = await this.db.from("boards").upsert({
      id: boardId,
      strokes: board.strokes,
      owner_id: board.ownerId ?? null,
      name: board.name ?? DEFAULT_BOARD_NAME,
      thumbnail: board.thumbnail ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  async loadMeta(boardId: string): Promise<BoardMeta | null> {
    const { data, error } = await this.db
      .from("boards")
      .select("owner_id, name")
      .eq("id", boardId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      ownerId: typeof data.owner_id === "string" ? data.owner_id : null,
      name: cleanBoardName(data.name) ?? DEFAULT_BOARD_NAME,
    };
  }

  async rename(boardId: string, name: string): Promise<void> {
    const { error } = await this.db
      .from("boards")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", boardId);
    if (error) throw new Error(error.message);
  }

  async remove(boardId: string): Promise<void> {
    // board_members rows go with it (on delete cascade).
    const { error } = await this.db.from("boards").delete().eq("id", boardId);
    if (error) throw new Error(error.message);
  }

  async recordVisit(boardId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from("board_members")
      .upsert({ board_id: boardId, user_id: userId, last_opened_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  async removeMember(boardId: string, userId: string): Promise<void> {
    const { error } = await this.db
      .from("board_members")
      .delete()
      .eq("board_id", boardId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  async ping(): Promise<void> {
    const { error } = await this.db.from("boards").select("id", { head: true }).limit(1);
    if (error) throw new Error(error.message);
  }
}
