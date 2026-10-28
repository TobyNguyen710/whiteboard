import type { IncomingMessage, ServerResponse } from "node:http";
import { cleanBoardName, isValidRoomId } from "@whiteboard/shared";
import type { Authenticator, AuthUser } from "./auth.js";

/** What the API needs from the rest of the server. */
export type ApiContext = {
  clientOrigins: string[];
  authenticate: Authenticator | null;
  /** Owner of a board, or undefined if the board doesn't exist. */
  ownerOf: (boardId: string) => Promise<string | null | undefined>;
  renameBoard: (boardId: string, name: string) => Promise<void>;
  deleteBoard: (boardId: string) => Promise<void>;
  leaveBoardList: (boardId: string, userId: string) => Promise<void>;
  log: (message: string) => void;
};

const MAX_BODY_BYTES = 4_096;
const ROUTE = /^\/api\/boards\/([^/]+)(\/membership)?$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (typeof parsed !== "object" || parsed === null) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

async function signedInUser(req: IncomingMessage, ctx: ApiContext): Promise<AuthUser> {
  if (!ctx.authenticate) throw new HttpError(404, "accounts are not enabled");
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw new HttpError(401, "sign in required");
  const user = await ctx.authenticate(token);
  if (!user) throw new HttpError(401, "sign in required");
  return user;
}

async function requireOwner(boardId: string, user: AuthUser, ctx: ApiContext): Promise<void> {
  const owner = await ctx.ownerOf(boardId);
  if (owner === undefined) throw new HttpError(404, "board not found");
  if (owner !== user.id) throw new HttpError(403, "only the board's owner can do that");
}

/**
 * Dashboard actions: PATCH /api/boards/:id (rename), DELETE /api/boards/:id (delete), and
 * DELETE /api/boards/:id/membership (remove from your list). Returns false if the request isn't
 * for the API, so the caller can handle it.
 */
export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<boolean> {
  const path = (req.url ?? "").split("?")[0] ?? "";
  if (!path.startsWith("/api/")) return false;

  // CORS: only our own site may call this from a browser.
  const origin = req.headers.origin;
  if (origin && ctx.clientOrigins.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-methods", "PATCH, DELETE, OPTIONS");
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.setHeader("access-control-max-age", "600");
    send(res, 204);
    return true;
  }

  try {
    const match = ROUTE.exec(path);
    const boardId = match?.[1];
    if (!match || !isValidRoomId(boardId)) throw new HttpError(404, "not found");
    const isMembership = match[2] !== undefined;

    if (!isMembership && req.method === "PATCH") {
      const user = await signedInUser(req, ctx);
      const name = cleanBoardName((await readJson(req)).name);
      if (!name) throw new HttpError(400, "name is required");
      await requireOwner(boardId, user, ctx);
      await ctx.renameBoard(boardId, name);
      send(res, 200, { name });
    } else if (!isMembership && req.method === "DELETE") {
      const user = await signedInUser(req, ctx);
      await requireOwner(boardId, user, ctx);
      await ctx.deleteBoard(boardId);
      ctx.log(`${user.id} deleted ${boardId}`);
      send(res, 204);
    } else if (isMembership && req.method === "DELETE") {
      const user = await signedInUser(req, ctx);
      // Owners delete their boards instead; leaving your own board would just hide it.
      if ((await ctx.ownerOf(boardId)) === user.id) {
        throw new HttpError(400, "owners can delete the board instead");
      }
      await ctx.leaveBoardList(boardId, user.id);
      send(res, 204);
    } else {
      throw new HttpError(405, "method not allowed");
    }
  } catch (error) {
    if (error instanceof HttpError) {
      send(res, error.status, { error: error.message });
    } else {
      ctx.log(`api error: ${error instanceof Error ? error.message : String(error)}`);
      send(res, 500, { error: "something went wrong" });
    }
  }
  return true;
}
