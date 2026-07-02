# Phase 2 setup — Supabase + Resend + GitHub Pages

Everything below is free and personal-scoped. 🔓 = safe to expose · 🔒 = secret,
never commit. You do the dashboard steps; the code is already in the repo.

## 1. Supabase project

1. Create a free project at https://supabase.com (save the DB password).
2. Copy two **public** values (both safe to expose — RLS protects the data).
   Easiest: click the **Connect** button at the top of the dashboard → **App
   Frameworks** tab, which shows both together:
   - **Project URL** 🔓 → `VITE_SUPABASE_URL`
     — always `https://<ref>.supabase.co`. If you can't find it, `<ref>` is the
     string in your browser address bar after `/project/`.
   - **Publishable key** 🔓 → `VITE_SUPABASE_ANON_KEY`
     — new projects show a **Publishable key** (`sb_publishable_…`); older ones
     show **anon public** (`eyJ…`) under **Settings → API Keys → Legacy API
     Keys**. Either works — same low privileges, same RLS.
   - You do **not** need the service_role / secret key: Supabase auto-injects
     `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into
     Edge Functions, so the reminder function already has them.
3. **SQL Editor** → paste and run [`supabase/schema.sql`](../supabase/schema.sql).
4. **Authentication → Sign In / Providers → Email**: ensure it's enabled
   (it's on by default — magic link works out of the box). Note: the built-in
   sender allows ~2 auth emails/hour; enough for personal use. If you request
   sign-in links faster than that (e.g. while testing) Supabase Auth returns
   `over_email_send_rate_limit` / "email rate limit exceeded" — this is the
   **login** email, unrelated to Resend or the reminder quota. To lift it:
   raise **Authentication → Rate Limits → "Rate limit for sending emails"**,
   or (better) set **Authentication → Emails → SMTP Settings** to your own
   Resend account — host `smtp.resend.com`, port `465`, user `resend`,
   password = your `RESEND_API_KEY` — which raises the default to ~30/hour.
5. **Authentication → URL Configuration**: add your site URL
   `https://ramazankarisan.github.io/subscription-tracker/` to **Site URL** and
   **Redirect URLs** (and `http://localhost:5173/` for local dev), so magic
   links return to the app.
6. **Authentication → Emails → Templates → "Magic Link"**: make sure the body
   includes the 6-digit code token, e.g. add a line:
   `Your code: {{ .Token }}`. The app signs you in by **code entry**, which is
   the only reliable path in an installed iOS PWA (the tapped link opens in
   Safari and can't hand its session to the standalone app). Keep
   `{{ .ConfirmationURL }}` too so the link still works on desktop.

## 2. Resend (email)

1. Create a free account at https://resend.com and **verify your own email**.
2. **API Keys → Create** 🔒 → this is `RESEND_API_KEY`.
3. Free tier sends from `onboarding@resend.dev` to **your own inbox** — no domain
   needed. (Emailing other people would require verifying a domain; out of scope.)
   ⚠️ Set the app's **"Send reminders to"** (Settings) to this **same** email —
   the one your Resend account uses. Any other address returns a Resend 403.

## 3. Deploy the Edge Function + secrets

With the [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase login`,
then `supabase link --project-ref YOUR-REF`):

```bash
# CRON_SECRET is a random password YOU invent — Supabase doesn't give it to you,
# and it must MATCH the value in the cron SQL below. Generate one you can see
# (don't inline $(openssl ...) — you'd never learn the value it set):
openssl rand -hex 24                        # copy the printed value

supabase secrets set RESEND_API_KEY=re_xxx CRON_SECRET=<paste-that-value>
# service_role + URL are provided to functions automatically.

supabase functions deploy send-reminders    # config.toml sets verify_jwt=false
```

Function URL (used below): `https://<project-ref>.supabase.co/functions/v1/send-reminders`.
`<project-ref>` is the string after `/project/` in the dashboard URL.

## 4. Schedule the daily run

**Database → Extensions**: enable `pg_cron` and `pg_net`. Then in the **SQL
Editor**, run — replacing `<project-ref>` with yours and `<CRON_SECRET>` with the
**exact same** value you set above:

```sql
select cron.schedule(
  'daily-reminders',
  '0 8 * * *',                       -- 08:00 UTC every day
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

The daily query also keeps the free project from idling.

## 5. Frontend env (local + GitHub Pages)

- **Local**: copy `.env.example` → `.env`, fill in the URL + anon key, `pnpm dev`.
- **GitHub Pages**: repo **Settings → Secrets and variables → Actions →
  Variables** → add `VITE_SUPABASE_URL` 🔓 and `VITE_SUPABASE_PUBLISHABLE_KEY`
  🔓 (or `VITE_SUPABASE_ANON_KEY` for a legacy key).
  The deploy workflow bakes them into the build. (Then **Settings → Pages →
  Source: GitHub Actions** if not already set.)

## 6. Verify

1. `pnpm dev` → sign in with the magic link → add a subscription → confirm the
   row appears in Supabase **Table editor**.
2. Open the app on a second device, sign in → same data (sync works).
3. Settings → **Send test email** → check your inbox.
4. Create an item due in 3 days and one due today; run the function manually
   (`curl -H "Authorization: Bearer YOUR_CRON_SECRET" <function-url>`) → one
   email lists both; run again → no duplicate (idempotency).
