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
   sender allows ~2 auth emails/hour; enough for personal use.
5. **Authentication → URL Configuration**: add your site URL
   `https://ramazankarisan.github.io/subscription-tracker/` to **Site URL** and
   **Redirect URLs** (and `http://localhost:5173/` for local dev), so magic
   links return to the app.

## 2. Resend (email)

1. Create a free account at https://resend.com and **verify your own email**.
2. **API Keys → Create** 🔒 → this is `RESEND_API_KEY`.
3. Free tier sends from `onboarding@resend.dev` to **your own inbox** — no domain
   needed. (Emailing other people would require verifying a domain; out of scope.)

## 3. Deploy the Edge Function + secrets

With the [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase login`,
then `supabase link --project-ref YOUR-REF`):

```bash
# Secrets (🔒). CRON_SECRET is any long random string you invent.
supabase secrets set RESEND_API_KEY=re_xxx CRON_SECRET=$(openssl rand -hex 24)
# service_role + URL are provided to functions automatically.

supabase functions deploy send-reminders   # config.toml sets verify_jwt=false
```

Note the function URL: `https://YOUR-PROJECT.functions.supabase.co/send-reminders`.

## 4. Schedule the daily run

**Database → Extensions**: enable `pg_cron` and `pg_net`. Then in the **SQL
Editor**, run (substitute your URL + the `CRON_SECRET` you set):

```sql
select cron.schedule(
  'daily-reminders',
  '0 8 * * *',                       -- 08:00 UTC every day
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT.functions.supabase.co/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_CRON_SECRET',
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
