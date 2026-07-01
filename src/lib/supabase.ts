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

export const supabase = createClient(url ?? '', publishableKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Complete the magic-link sign-in when the user lands back on the app.
    detectSessionInUrl: true,
  },
});
