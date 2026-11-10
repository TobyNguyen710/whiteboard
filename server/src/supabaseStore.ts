import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanBoardName,
  DEFAULT_BOARD_NAME,
  DEFAULT_BOARD_SETTINGS,
  isAssignableRole,
  isValidThumbnail,
  type AssignableRole,
} from "@whiteboard/shared";
import type { BoardMeta, BoardStore, SavedBoard } from "./persistence.js";
import { parseStoredElements } from "./validate.js";

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
      .select("strokes, owner_id, name, thumbnail, default_role, locked, clear_policy, shared")
      .eq("id", boardId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    // Everyone who has opened the board, and the roles the host chose (null = not chosen, so the
    // board's default role applies).
    const rows = await this.db.from("board_members").select("user_id, role").eq("board_id", boardId);
    if (rows.error) throw new Error(rows.error.message);
    const members: string[] = [];
    const memberRoles: Record<string, AssignableRole> = {};
    for (const row of rows.data ?? []) {
      if (typeof row.user_id !== "string") continue;
      members.push(row.user_id);
      if (isAssignableRole(row.role)) memberRoles[row.user_id] = row.role;
    }

    const access = await this.db
      .from("board_access")
      .select("password_hash, guests")
      .eq("board_id", boardId)
      .maybeSingle();
    if (access.error) throw new Error(access.error.message);

    return {
      // The column is still called "strokes" from v1; it holds every kind of element.
      elements: parseStoredElements(data.strokes),
      ownerId: typeof data.owner_id === "string" ? data.owner_id : null,
      name: cleanBoardName(data.name) ?? DEFAULT_BOARD_NAME,
      thumbnail: isValidThumbnail(data.thumbnail) ? data.thumbnail : null,
      memberRoles,
      members,
      passwordHash: typeof access.data?.password_hash === "string" ? access.data.password_hash : null,
      guests: Array.isArray(access.data?.guests) ? (access.data.guests as string[]) : [],
      settings: {
        defaultRole: isAssignableRole(data.default_role) ? data.default_role : DEFAULT_BOARD_SETTINGS.defaultRole,
        locked: data.locked === true,
        clearPolicy: data.clear_policy === "editors" ? "editors" : "host",
        shared: data.shared === true,
      },
    };
  }

  async save(boardId: string, board: SavedBoard): Promise<void> {
    const { error } = await this.db.from("boards").upsert({
      id: boardId,
      strokes: board.elements,
      owner_id: board.ownerId ?? null,
      name: board.name ?? DEFAULT_BOARD_NAME,
      thumbnail: board.thumbnail ?? null,
      default_role: (board.settings ?? DEFAULT_BOARD_SETTINGS).defaultRole,
      locked: (board.settings ?? DEFAULT_BOARD_SETTINGS).locked,
      clear_policy: (board.settings ?? DEFAULT_BOARD_SETTINGS).clearPolicy,
      shared: (board.settings ?? DEFAULT_BOARD_SETTINGS).shared,
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

  async setMemberRole(boardId: string, userId: string, role: AssignableRole): Promise<void> {
    // Upsert only the role: an existing member keeps their last-opened time.
    const { error } = await this.db
      .from("board_members")
      .upsert({ board_id: boardId, user_id: userId, role }, { onConflict: "board_id,user_id" });
    if (error) throw new Error(error.message);
  }

  async savePassword(boardId: string, passwordHash: string | null): Promise<void> {
    // Upsert only this column, so saving guests at the same moment can't undo a password change.
    const { error } = await this.db.from("board_access").upsert({ board_id: boardId, password_hash: passwordHash });
    if (error) throw new Error(error.message);
  }

  async saveGuests(boardId: string, guests: string[]): Promise<void> {
    const { error } = await this.db.from("board_access").upsert({ board_id: boardId, guests });
    if (error) throw new Error(error.message);
  }

  async ping(): Promise<void> {
    const { error } = await this.db.from("boards").select("id", { head: true }).limit(1);
    if (error) throw new Error(error.message);
  }
}
