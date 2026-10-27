/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Socket.IO server URL. Defaults to http://localhost:3001 in dev. */
  readonly VITE_SERVER_URL?: string;
  /** Supabase project URL, for login. Login is off when unset. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable key (sb_publishable_...). Safe in the browser; never the secret key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
