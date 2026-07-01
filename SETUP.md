# SubTrack — Your Setup Tasks

Only **you** can do these (accounts, dashboards, secrets). Everything else is code Claude writes.

Legend: 🔓 public / safe to share · 🔒 secret — never paste into the repo

## Phase 0 — Unblock installs (2 min)

- [ ] Run `pnpm install` in the project.
- [ ] If it fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` (vite / electron-to-chromium
      "within the cutoff"), it's the MaibornWolff supply-chain policy rejecting packages
      published < 24h ago. Options: wait for the rolling window to clear, or
      `pnpm install --config.minimum-release-age=0` for a one-off, or tell Claude to
      re-resolve the lockfile to aged versions.

## Phase 1 — Backpressure (nothing to sign up for)

- [ ] After Claude wires the hooks, do one guided test commit + push to confirm they fire.
- [ ] See `docs/backpressure.md` for what each gate does and how to bypass in a pinch.

## Phase 2 — Supabase (database + auth + cron)

- [ ] Create a free account at https://supabase.com and a new project (region near you).
- [ ] Save the database password somewhere safe.
- [ ] Settings → API: copy **Project URL** 🔓 and **anon public key** 🔓 → give to Claude (go in `.env`).
- [ ] Settings → API: copy the **service_role key** 🔒 → paste into Supabase secrets later, **not** the repo.
- [ ] SQL Editor: run the `schema.sql` Claude provides (tables, RLS, `reminder_log`).
- [ ] Authentication → Providers: confirm **Email (magic link)** is enabled.
- [ ] Edge Functions → Secrets: add `RESEND_API_KEY` 🔒, `SUPABASE_SERVICE_ROLE_KEY` 🔒, and your recipient email.
- [ ] Integrations → Cron: schedule the `send-reminders` function daily (Claude gives the exact expression).

## Phase 2 — Resend (sends the emails)

- [ ] Create a free account at https://resend.com.
- [ ] Verify your own email address (the recipient).
- [ ] API Keys → create one 🔒 → paste into Supabase secrets (above). Do **not** commit it.
- [ ] Note: free tier sends from `onboarding@resend.dev` to your own inbox — no domain to buy.

## Phase 2 — GitHub Pages (hosts the installable app)

You've set `base: '/subscription-tracker/'` in `vite.config.ts` for this.

- [ ] Repo → Settings → Pages: set **Source = GitHub Actions**.
- [ ] Repo → Settings → Secrets and variables → Actions → **Variables**: add
      `VITE_SUPABASE_URL` 🔓 and `VITE_SUPABASE_ANON_KEY` 🔓 (baked in at CI build time;
      fine — the anon key is public with RLS on).
- [ ] Claude adds a Pages deploy workflow in Phase 2 that builds and publishes `dist/`.
- [ ] After the first deploy, open `https://ramazankarisan.github.io/subscription-tracker/`
      on your phone → **Add to Home Screen**.

## Reminders about secrets

- 🔒 service_role key, Resend API key → live **only** in Supabase's secret store.
- 🔓 Project URL + anon key → fine in `.env` / GitHub Actions Variables (designed to be public with RLS on).
- `secretlint` (Phase 1) blocks any 🔒 value that accidentally gets staged.
