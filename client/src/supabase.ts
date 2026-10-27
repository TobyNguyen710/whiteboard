import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Browser Supabase client, used only for login. It uses the publishable key, which is safe to
 * ship to browsers (row-level security protects the data). Null when login isn't configured for
 * this build, e.g. local development without keys: then everyone is a guest.
 */
export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey, { auth: { flowType: "pkce" } }) : null;
