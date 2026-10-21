/**
 * Supabase browser client — the app's backend (Postgres + magic-link auth).
 *
 * URL + anon key come from build-time env (`.env` locally, GitHub Actions
 * Variables in CI). The anon key is public by design; Row Level Security in the
 * database is what actually restricts each user to their own rows.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
// Supabase's current name is the publishable key; fall back to the legacy anon
// key so either works (both are public and carry the same low privileges).
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False until the two env vars are set — the UI shows a setup hint in that case. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

// createClient throws on an empty URL; a placeholder keeps the module loadable
// so AuthGate can show its setup hint. Nothing calls it while unconfigured.
export const supabase = createClient(
  url || 'http://localhost',
  publishableKey || 'unconfigured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Complete the magic-link sign-in when the user lands back on the app.
      detectSessionInUrl: true,
      // Opt in to the beta passkey API (Face ID / Touch ID sign-in). See lib/passkeys.ts.
      experimental: { passkey: true },
    },
  },
);
