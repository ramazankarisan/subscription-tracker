/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://xxxx.supabase.co (public, safe to ship). */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase publishable key (sb_publishable_…) — the current name. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Legacy anon key (eyJ…) — still accepted as a fallback. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
