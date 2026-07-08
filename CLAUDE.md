# CLAUDE.md

## Commands

Package manager is **pnpm**.

```bash
pnpm install
pnpm dev        # dev server at http://localhost:5173 (needs .env — see below; add --host for a phone on the LAN)
pnpm build      # tsc -b type-check + vite build into dist/ (also generates PWA icons)
pnpm preview    # serve the production build
pnpm lint       # eslint (strict TS + React + curly + no-abbreviations), warnings are errors
pnpm lint:fix   # eslint --fix
pnpm dupes      # jscpd copy-paste detector (ratchet threshold in .jscpd.json)
pnpm typecheck  # tsc -b --noEmit
pnpm knip       # unused files / exports / deps
pnpm secretlint # scan for committed secrets
pnpm format     # prettier --write .
pnpm test       # vitest run (unit tests, once)
pnpm test:watch # vitest in watch mode
```

## Testing

**Vitest** runs the unit suite. Tests are **colocated** next to the code as
`*.test.ts` and cover the **pure logic in `src/lib`** (dates, reminders,
currency formatting, DB↔domain mappers) — the calendar math and the "what's
due" rules are the parts worth protecting. They run in the `node` environment
(no DOM). React components are not unit-tested; the app is verified by driving
it (see the `verify` skill).

- **Add a test with any change to `src/lib` logic** — a new date rule, a
  reminder edge case, a mapper column. Match the existing files' style.
- Test globals (`describe`/`it`/`expect`/`vi`) are enabled (`globals: true`), so
  test files don't import them. Shared setup lives in `src/test/setupTests.ts`,
  which pins "now" (`vi.setSystemTime`) so day-relative logic is deterministic.
- Tests are part of the backpressure gates: `vitest run` is in lefthook
  **pre-push** and in CI. `*.test.*` is excluded from `jscpd` (test fixtures are
  repetitive by design).

`pnpm dev` needs a `.env` (`cp .env.example .env`) with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. One-time backend setup (Supabase, Brevo, cron,
Pages variables) is in `docs/supabase-setup.md`.

## Workflow (hard rules)

- **Never push or commit directly to `main`.** Every change lands via a branch →
  pull request → merge. Do git work in a git **worktree** (not the main tree),
  stage only the files you changed, and use **Conventional Commits**.
- **Backpressure gates** (see `docs/backpressure.md`): lefthook runs prettier +
  eslint + secretlint on pre-commit and tsc + vitest + knip + jscpd + build on
  pre-push; GitHub Actions CI (`.github/workflows/ci.yml`) re-runs all of them; a Claude
  Code Stop hook blocks finishing a turn while gates fail on changed files.
  ESLint is the single linter (strict TS + React + `curly` + no-abbreviations).
- The Deno Edge Function under `supabase/**` is excluded from `knip` (it's a
  separate runtime, not part of the app graph).
- **Keep code comments short and simple** — one line where possible; explain
  the _why_, not the obvious.

## Architecture

A phone-first PWA (Vite + React 19 + TypeScript) for tracking subscription renewals and installment plans, with **server-scheduled** email reminders. Data is stored **per user in Supabase** (Postgres + magic-link auth + Row Level Security); a daily Supabase Edge Function emails reminders even when the app is closed. A localStorage copy is kept purely as an offline read cache. Setup: `docs/supabase-setup.md`.

### Data flow

- `src/types.ts` — the domain model (`Subscription`, `Installment`, `AppData`, settings). Everything is plain JSON: **dates are stored as ISO day strings (`"yyyy-MM-dd"`), never `Date` objects.**
- `src/lib/supabase.ts` — the Supabase browser client (URL + anon key from `VITE_SUPABASE_*` env). `src/components/AuthGate.tsx` gates the app behind a magic-link sign-in and passes the `AuthedUser` down.
- `src/state/useAppData.tsx` — the single store, scoped to the signed-in user. Renders instantly from the localStorage cache, fetches the user's rows from Supabase, then applies every action **optimistically** to local state and writes it through to Supabase (insert/update/upsert/delete). Components call typed action helpers (`addSubscription`, `markSubscriptionRenewed`, …); **components never touch Supabase or localStorage directly.** Devices stay converged live: a coalesced, debounced `requestRefetch()` re-reads the three tables on tab visibility/focus/reconnect and on Supabase **Realtime** `postgres_changes` events (per-user channel), deferring while optimistic writes are in flight. Every write goes through `persist()`; a write that fails to reach Supabase reverts to server truth (refetch) and surfaces a dismissible `syncError` banner (`AppShell`) instead of silently losing data.
- `src/lib/mappers.ts` — converts between snake_case DB rows and camelCase domain objects (column names live only here).
- `src/lib/storage.ts` — the per-user localStorage read cache (`cacheKeyForUser`). Loading is defensive: corruption / missing fields fall back to defaults.

### Date logic (the core domain rules)

All calendar math lives in `src/lib/dates.ts` and goes through `date-fns` — do not do date arithmetic elsewhere.

- **Subscriptions**: "mark renewed" calls `advanceByCycle` then `rollForwardToFuture`, which skips any cycles already in the past (handles the app not being opened for a while).
- **Installments**: the next payment date is `firstPaymentDate + paidPayments × intervalMonths`; "paid one" / "undo" just increments/decrements `paidPayments` (clamped).
- `src/lib/reminders.ts` — `getDueItems(data, leadDays)` flattens subscriptions + installments into one sorted list of what's due within the lead window (overdue included). Used by the Dashboard to render the "due soon" list.

### Email reminders (server-side)

A daily **Supabase Edge Function** (`supabase/functions/send-reminders/`, Deno) emails reminders via **Brevo** (free tier, 300/day, single verified sender → any recipient's inbox). It runs on a **Supabase Cron** schedule, so mail goes out even when the app is closed.

- **Schedule**: for each item and each configured offset in `settings.reminderOffsets` (default `[3, 0]` = 3 days before + on the day), it fires when today is within a short catch-up window of `dueDate − offset`.
- **Idempotency**: the `reminder_log` table records every `(item, reminder_date, offset)` sent, so a reminder goes out at most once even if the cron double-runs or catches up a missed day.
- The function is **self-contained** (reimplements the small date/message logic in Deno) because Supabase bundles only the function's own directory — it does not import from `src/`.
- **Test send**: Settings / Dashboard call the same function with `{ test: true }` (authenticated by the user's token) to email a preview immediately. Scheduled runs authenticate with a shared `CRON_SECRET`.
- `supabase/schema.sql` — tables + RLS + `reminder_log`. Run once in the SQL editor.

### UI

`src/App.tsx` wraps everything in `AppDataProvider` and renders a tab shell (`TabBar`) with four views: Dashboard, Subscriptions, Installments, Settings. Forms live in `*Form.tsx` components rendered inside `Modal.tsx`.

### PWA

`vite-plugin-pwa` (config in `vite.config.ts`, `registerType: 'autoUpdate'`) generates the service worker and all icons from the single source `public/favicon.svg`. A real home-screen install needs HTTPS (or `localhost`) for the service worker.
