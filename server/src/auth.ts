import { createClient } from "@supabase/supabase-js";
import { accountDisplay } from "@whiteboard/shared";

/** A verified signed-in user. */
export type AuthUser = {
  /** Supabase account ID (uuid). */
  id: string;
  name: string;
  avatarUrl: string | null;
};

/** Turns a login token into a user. Returns null if the token is invalid or expired. */
export type Authenticator = (token: string) => Promise<AuthUser | null>;

/** Verifies tokens with Supabase Auth (works with both legacy and new JWT signing keys). */
export function supabaseAuthenticator(url: string, secretKey: string): Authenticator {
  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (token) => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const { id, email, user_metadata } = data.user;
    return { id, ...accountDisplay((user_metadata ?? {}) as Record<string, unknown>, email) };
  };
}
