# supabase

- `functions/send-reminders/` is Deno and self-contained: Supabase bundles only
  that folder, so it can't import from `src/`. Its date logic mirrors
  `src/lib/dates.ts`; keep them in sync. ESLint, knip and jscpd skip this folder.
- No CI deploy here. Function and schema changes go live only when the owner runs
  `supabase functions deploy` or the SQL editor (`docs/supabase-setup.md`). Say
  so in the PR.
- `schema.sql` must stay safe to re-run: `if not exists`, and
  `drop policy if exists` before each `create policy`.
- Secrets (`BREVO_API_KEY`, `CRON_SECRET`, `REMINDER_FROM`) live only in
  Supabase's secret store.
