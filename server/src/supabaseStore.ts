import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BoardStore, SavedBoard } from "./persistence.js";
import { parseStoredStrokes } from "./validate.js";

/**
 * Boards saved in Supabase Postgres (table `boards`, see supabase/migrations). Uses the secret
 * key, which bypasses row-level security: it must only ever live on the server.
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
      .select("strokes, owner_id")
      .eq("id", boardId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      strokes: parseStoredStrokes(data.strokes),
      ownerId: typeof data.owner_id === "string" ? data.owner_id : null,
    };
  }

  async save(boardId: string, board: SavedBoard): Promise<void> {
    const { error } = await this.db
      .from("boards")
      .upsert({
        id: boardId,
        strokes: board.strokes,
        owner_id: board.ownerId ?? null,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  }

  async ping(): Promise<void> {
    const { error } = await this.db.from("boards").select("id", { head: true }).limit(1);
    if (error) throw new Error(error.message);
  }
}
