# Decisions and known limitations

Short records of why things are the way they are. Each item names the trade-off,
so a later change can be made on purpose.

## Decisions

- **$0 to run.** Free tiers only (Supabase, Brevo, GitHub Pages). This rules out
  paid push services and a custom domain, and caps reminder email at Brevo's
  300/day.
- **Email reminders, not push.** Web push needs a push server, a per-device
  opt-in, and on iOS an installed PWA. A server cron plus email reaches every
  user with no setup.
- **Supabase is the source of truth; localStorage is a read cache only.** The cache
  makes the app open instantly and readable offline. Writes need the network, and
  a failed write reverts with a visible banner rather than queueing offline.
- **The Edge Function duplicates the small date logic** from `src/lib/dates.ts`.
  Supabase bundles only the function's own folder, so it can't import from `src/`.
  The duplication is excluded from jscpd on purpose.
- **EUR only.** One currency keeps totals exact without exchange rates.
  Multi-currency is a product decision, not a code gap.
- **No UI library.** The app is small; a handful of CSS tokens and components keep
  the PWA light (see `DESIGN.md`).
- **Restore replaces everything and assigns fresh ids.** It's validated up front
  (`src/lib/backup.ts`) and runs as one Postgres transaction
  (`restore_backup` in `supabase/schema.sql`), so a bad file or a dropped
  connection changes nothing.
- **Demo mode is a build flag** (`VITE_DEMO=1`). It runs the real store with
  synthetic data and no network, so screenshots, the GIF and the hosted demo
  (`/demo/`, built next to the app in `deploy.yml`) never touch a real account.
  The seed is tree-shaken out of the normal build. The demo isn't a PWA, and
  the app's service worker leaves `/demo/` alone.

## Known limitations

Open product or security decisions, not bugs:

- **Reminder recipient is free-form.** A user can point the daily reminder at
  any address. Test emails go only to the sign-in address, so the remaining
  exposure is at most one consolidated reminder a day per account, and only
  when something is due. Verifying the recipient address would close it.
- **Test email has no count limit.** It only reaches the caller now, but one
  account pressing it repeatedly still uses up Brevo's shared 300/day quota.
  A per-user daily cap (one counter table) would close it.
- **On the hosted instance the owner can read every row.** RLS isolates users
  from each other, not from the project owner. Forking gives a private instance.
- **Edge Function changes need a manual deploy** (`supabase functions deploy`);
  CI builds only the frontend.

Low-likelihood bugs, listed and left for now:

- A refetch that started before an edit can land after it and briefly revert the
  field (store-level race; the next refetch corrects it).
- Two "Renewed" / "Paid one" taps within one frame count once.
- The reminder job uses UTC for "today". A failed `reminder_log` write after a
  successful send re-sends the next day.
- `AuthGate` has no catch on `getSession()`; if it rejects, the app stays on
  "Loading…".
