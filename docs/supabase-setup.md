# Phase 2 setup — Supabase + Brevo + GitHub Pages

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
   The file is **safe to re-run** end to end (every `create policy` is preceded
   by `drop policy if exists`), so re-paste it any time to repair a project
   whose policies drifted from this file.
   - **Verify writes land**: after schema setup, sign in to the app, add a test
     subscription, then open **Table Editor → `subscriptions`** and confirm the
     row appears. If it does not, RLS write policies are missing — re-run
     `schema.sql` (the step above) and try again.
4. **Authentication → Sign In / Providers → Email**: ensure it's enabled
   (it's on by default — magic link works out of the box). Note: the built-in
   sender allows ~2 auth emails/hour; enough for personal use. If you request
   sign-in links faster than that (e.g. while testing) Supabase Auth returns
   `over_email_send_rate_limit` / "email rate limit exceeded" — this is the
   **login** email, unrelated to Brevo or the reminder quota. To lift it:
   raise **Authentication → Rate Limits → "Rate limit for sending emails"**,
   or (better) set **Authentication → Emails → SMTP Settings** to your own
   Brevo account — host `smtp-relay.brevo.com`, port `587`, user = your Brevo
   login email, password = a Brevo **SMTP key** (SMTP & API → SMTP).
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

## 2. Brevo (email)

Brevo's free tier sends **300 emails/day to any recipient** with only a verified
**single sender** — no domain required — so reminders reach every user, not just
you. (Resend, by contrast, needs a verified domain to email anyone but yourself.)

1. Create a free account at https://www.brevo.com.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: enter a name and
   an email you own (e.g. your Gmail). Click the confirmation link Brevo emails you.
   This verified address is what `REMINDER_FROM` must use.
3. **SMTP & API → API Keys → Generate a new API key** 🔒 → this is `BREVO_API_KEY`.
4. `REMINDER_FROM` = `Name <verified@email>` (see the secrets step below). Users
   can leave the app's **"Send reminders to"** (Settings) as their own inbox — any
   recipient works.

> ⚠️ **Deliverability**: mail from a plain verified address (no domain DKIM) lands
> in spam more often. Tell early users to check spam and mark "not spam". A real
> verified domain in Brevo fixes this later without any code change.

## 3. Deploy the Edge Function + secrets

With the [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase login`,
then `supabase link --project-ref YOUR-REF`):

```bash
# CRON_SECRET is a random password YOU invent — Supabase doesn't give it to you,
# and it must MATCH the value in the cron SQL below. Generate one you can see
# (don't inline $(openssl ...) — you'd never learn the value it set):
openssl rand -hex 24                        # copy the printed value

supabase secrets set BREVO_API_KEY=xkeysib-xxx CRON_SECRET=<paste-that-value> \
  REMINDER_FROM="SubTrack <your-verified@email>"
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

## 5b. Enable Realtime (live cross-device sync)

Live sync needs the three user tables in the `supabase_realtime` publication.
The `schema.sql` you ran in step 1.3 already does this (the Realtime block at the
end), so **no extra action is needed if you ran the latest `schema.sql`**. To
enable it on an existing project without a full re-run, paste just the
publication block from [`supabase/schema.sql`](../supabase/schema.sql) into the
**SQL Editor** — it's idempotent. (Alternatively, **Database → Replication →
`supabase_realtime`** → toggle the three tables on.)

## 5c. WhatsApp agent (optional — draft, finalised later)

Lets you manage the tracker by texting a WhatsApp bot. Runs at **$0** on the
WhatsApp Cloud API **test number** (≤5 verified recipients) + a permanent Meta
**System User token** + inbound-only replies (no paid templates). This section
is a draft for the webhook skeleton; the linking + AI steps are added as the
feature lands.

1. **Meta app** — [developers.facebook.com](https://developers.facebook.com) →
   create a **Business** app → add the **WhatsApp** product (this provisions a
   free test number + a Phone Number ID). Under WhatsApp → API Setup, add your
   own number as a recipient (verify the code Meta texts you).
2. **Collect the secrets**:
   - `WHATSAPP_PHONE_NUMBER_ID` — the test number's ID (API Setup page).
   - `WHATSAPP_APP_SECRET` — App → Settings → Basic → App Secret (the HMAC key
     that proves a webhook POST came from Meta).
   - `WHATSAPP_TOKEN` — Business Settings → **System users** → add an Admin →
     Generate token for this app with `whatsapp_business_messaging` +
     `whatsapp_business_management` → **permanent** (the API Setup token expires
     in 24h — don't use it).
   - `WHATSAPP_VERIFY_TOKEN` — any random string you invent (used only for the
     GET verification handshake).
3. **Set the secrets & deploy**:

   ```bash
   supabase secrets set \
     WHATSAPP_TOKEN=... \
     WHATSAPP_PHONE_NUMBER_ID=... \
     WHATSAPP_VERIFY_TOKEN=... \
     WHATSAPP_APP_SECRET=...
   supabase functions deploy whatsapp-webhook
   ```

4. **Configure the webhook in Meta** — WhatsApp → Configuration → Webhook →
   Edit: Callback URL =
   `https://<project>.supabase.co/functions/v1/whatsapp-webhook`, Verify token =
   your `WHATSAPP_VERIFY_TOKEN` → **Verify and save** → then **Manage** →
   subscribe to the **`messages`** field. Texting the test number should now
   reply `echo: <your text>`.

## 6. Verify

1. `pnpm dev` → sign in with the magic link → add a subscription → confirm the
   row appears in Supabase **Table editor**.
2. Open the app on a second device, sign in → same data (sync works).
3. **Live sync**: put two browser windows side by side, same account. Add /
   renew / delete an item (or change a setting) in one → it appears in the
   other within ~1 s, no focus change or reload. Then background one tab, edit
   in the other, return to the first → it refetches on focus.
4. Settings → **Send test email** → check your inbox.
5. Create an item due in 3 days and one due today; run the function manually
   (`curl -H "Authorization: Bearer YOUR_CRON_SECRET" <function-url>`) → one
   email lists both; run again → no duplicate (idempotency).
