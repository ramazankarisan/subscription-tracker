/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xxxx.supabase.co (public, safe to ship). */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon/public key (public by design — RLS enforces access). */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
