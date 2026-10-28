import { getServerUrl } from "./socket";
import { supabase } from "./supabase";

/** An API call that failed, with a message that's fine to show. */
export class ApiError extends Error {}

/**
 * Call the server's dashboard API as the signed-in user. Changes go through the server (not
 * straight to the database) so it can check permissions and tell everyone on the board.
 */
async function apiRequest(path: string, method: "PATCH" | "DELETE", body?: unknown): Promise<void> {
  const serverUrl = getServerUrl();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (!serverUrl || !session) throw new ApiError("You need to be signed in to do that.");

  let res: Response;
  try {
    res = await fetch(`${serverUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the server. It may be waking up; try again in a minute.");
  }
  if (res.ok) return;
  const message =
    res.status === 403
      ? "Only the board's owner can do that."
      : res.status === 404
        ? "That board no longer exists."
        : "Something went wrong. Please try again.";
  throw new ApiError(message);
}

export const renameBoardRemote = (boardId: string, name: string) =>
  apiRequest(`/api/boards/${boardId}`, "PATCH", { name });

export const deleteBoardRemote = (boardId: string) => apiRequest(`/api/boards/${boardId}`, "DELETE");

export const leaveBoardRemote = (boardId: string) =>
  apiRequest(`/api/boards/${boardId}/membership`, "DELETE");
