# SubTrack — Setup

The app is **set up and live** at
`https://ramazankarisan.github.io/subscription-tracker/`. This file is the
high-level checklist of the one-time, human-only tasks (accounts, dashboards,
secrets). For the exact click-by-click steps, follow the canonical guide:
**[`docs/supabase-setup.md`](docs/supabase-setup.md)**.

Legend: 🔓 public / safe to share · 🔒 secret — never commit.

## Toolchain

- `pnpm install` — the repo pins a 60-minute supply-chain guard in
  `pnpm-workspace.yaml` (`minimumReleaseAge`), so brand-new (<1h) packages are
  blocked but normal installs work.

## Quality gates (backpressure)

- Installed automatically (`pnpm install` runs `lefthook install`). Pre-commit
  runs prettier + eslint + secretlint; pre-push runs typecheck + knip + jscpd + build;
  CI re-runs everything. Details + bypasses: `docs/backpressure.md`.

## Supabase — database + auth + daily cron

- [ ] Free project → copy **Project URL** 🔓 and **Publishable key** 🔓 (from the
      **Connect** dialog) into repo env / Variables. The service_role key is **not**
      needed — Supabase injects it into Edge Functions.
- [ ] SQL editor → run `supabase/schema.sql` (tables, RLS, `reminder_log`).
- [ ] Authentication → **URL Configuration** → add the Pages URL (and
      `http://localhost:5173/`) to Site URL + Redirect URLs.
- [ ] Deploy the function + secrets, then schedule the daily cron — see the guide.

## Brevo — email

- [ ] Free account, **verify a single sender** (an email you own), create an API
      key 🔒 (Supabase function secret, never committed). Set `REMINDER_FROM` to
      that verified sender. Free tier: 300/day → **any** recipient's inbox.

## GitHub Pages — hosting

- [ ] Repo **Settings → Pages → Source: GitHub Actions**.
- [ ] Repo **Settings → Actions → Variables**: `VITE_SUPABASE_URL` 🔓 and
      `VITE_SUPABASE_PUBLISHABLE_KEY` 🔓. Every push to `main` deploys.

## Secrets recap

- 🔒 Brevo API key + `CRON_SECRET` → live **only** in Supabase's secret store.
- 🔓 Project URL + publishable/anon key → fine in `.env` / Actions Variables
  (public by design; Row Level Security protects the data).
- `secretlint` blocks any 🔒 value that accidentally gets staged.
