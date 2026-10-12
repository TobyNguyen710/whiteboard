/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Socket.IO server URL. Defaults to http://localhost:3001 in dev. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
