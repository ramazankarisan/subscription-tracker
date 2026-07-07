---
date: 2026-07-02T09:14:27+00:00
git_commit: aff9b1bed871e915e2a52f87b04efdb40c49a254
branch: main
topic: 'Live cross-device data sync (refetch triggers + Supabase Realtime)'
tags: [plan, useAppData, supabase, realtime, sync]
status: code-complete (live-DB repair + manual verification pending)
---

# PLAN: Live cross-device data sync

Data written on one device is already persisted to Supabase, but another
device only picks it up on a full page load — the single read lives in a
mount-time `useEffect`. This plan adds a live read path so two devices signed
in with the same email converge without manual reloads, and stops failed
writes from disappearing silently.

Based on research: `docs/agents/research/2026-07-02-cross-device-data-sync.md`.

**Update 2026-07-02:** live-system diagnosis
(`docs/agents/research/2026-07-02-silent-write-failure-analysis.md`) found that
subscription/installment inserts currently **never reach the live database, on
any device, with no visible error** — the leading hypothesis is missing RLS
write policies on the live `subscriptions`/`installments` tables (the live DB
was not created exactly from the committed `schema.sql`, and re-running that
file aborts on the first duplicate `create policy`). Phase 0 was added to
repair and verify the live DB first; without it every later phase syncs
nothing.

## Acceptance Criteria

- A subscription/installment added on any signed-in device produces a row in
  the live Supabase table (verifiable in the dashboard) — the current silent
  write failure is fixed and guarded against recurrence (`schema.sql` is safe
  to re-run; setup docs include a write-verification step).
- Data added/edited/deleted on device A appears on device B without a manual
  reload: instantly while B's app is open and connected (Realtime), or
  immediately when B's tab/app regains focus or comes back online (refetch
  triggers).
- A background refetch never wipes an in-flight optimistic write on the same
  device, and never flashes the `loading` UI after first load.
- A write that fails to reach Supabase no longer disappears silently: the UI
  reverts to true server state (via refetch) and shows a dismissible error
  notice.
- Existing behavior is preserved: instant first render from the per-user
  localStorage cache, offline read view, per-user scoping via RLS, components
  never touching Supabase/localStorage directly.

## Technical Key Decisions and Tradeoffs

1. **Sync method: refetch triggers + Supabase Realtime.**
   - Why: Realtime gives live side-by-side updates; focus/visibility/online
     refetch covers the backgrounded-PWA case (iOS suspends pages and the
     websocket silently drops), which Realtime alone cannot.
   - Impact: one-time `supabase_realtime` publication addition in
     `supabase/schema.sql` + a setup-doc step; a per-user channel subscription
     in `useAppData`.
2. **Update mode: coalesced refetch.**
   - Why: one code path that always converges to exact server state; row
     counts are tiny, so refetching all three tables per burst is negligible.
   - Impact: the existing mount-time load is extracted into a reusable,
     debounced `requestRefetch()` that defers while writes are in flight.
3. **Write errors: minimal handling (no offline outbox).**
   - Why: fire-and-forget writes are the one way sync can still silently lie;
     a full replay queue (true offline editing) is a separate, larger feature.
   - Impact: every Supabase write result is checked through one `persist()`
     helper; failure → refetch (revert) + dismissible notice.
4. **No-cost constraint: everything stays on the Supabase Free plan.**
   - Why: hard project policy — the whole stack (Supabase, Resend, GitHub
     Pages) must run at $0.
   - Impact: Realtime is included in the Free plan (200 concurrent
     connections, 2M messages/month) and this app uses a handful of
     connections and a few messages per edit — orders of magnitude below the
     limits. The coalesced-refetch design also keeps REST reads tiny (three
     small selects per burst, debounced), far under the free egress quota. No
     paid feature, add-on, or upgrade is introduced in any phase.

## Current State

All persistence lives in `src/state/useAppData.tsx`:

- The only Supabase read is a mount-time `useEffect`
  (`src/state/useAppData.tsx:106-153`), keyed on `[user.id, user.email, cacheKey]` —
  it never re-runs while the app stays open.
- Every action is optimistic (`apply()` at `:94-103` mirrors to the per-user
  localStorage cache) followed by a fire-and-forget `void supabase…` write
  (inserts `:162`, `:227`; updates `:179`, `:244`; deletes `:194`, `:259`;
  settings upsert `:290`; full replace `:296-331`). No result is checked.
- No Realtime channel, no polling, no focus/visibility/online listeners exist
  anywhere in `src/` (verified in the research).
- The service worker (`vite.config.ts:12-34`) precaches app assets only and
  does not affect Supabase requests.

```
Phone (A)                      Supabase                       Browser (B)
add item ──▶ setData/cache ──▶ row stored ──▶ (nothing — B updates only on
                                               a full page reload)
```

## Desired End State

```
                    ┌───────────────── triggers ─────────────────┐
                    │ visibilitychange→visible · window focus    │
                    │ window online · Realtime postgres_changes  │
                    │ channel (re)SUBSCRIBED · failed write      │
                    └──────────────────┬─────────────────────────┘
                                       ▼
                      requestRefetch()  — debounced ~300 ms,
                      defers while pendingWrites > 0,
                      never overlaps an in-flight fetch
                                       ▼
                      fetch 3 tables → setData + saveData(cache)
                      (loading flag untouched after first load)
```

Writes go through `persist(promise)`: increments/decrements the pending-write
counter and, on error, calls `requestRefetch()` and sets a `syncError` that
`AppShell` renders as a dismissible banner.

## Abstractions and Code Reuse

The existing layering rule holds: components keep calling `useAppData` action
helpers; Supabase and localStorage stay confined to the store. The mappers
(`src/lib/mappers.ts`) and cache (`src/lib/storage.ts`) are reused unchanged.

- `src/state/useAppData.tsx` — all sync logic lands here
  - `fetchAll` — the extracted 3-table load (reused by mount + all triggers)
  - `requestRefetch` — debounce + pending-write deferral + no-overlap guard
  - `persist` — wraps every write: counter + error → refetch + `syncError`
  - `syncError` / `dismissSyncError` — new context fields
- `src/App.tsx` — renders the error banner in `AppShell`
- `src/App.css` — banner styling (reuse `email-status-error` look)
- `supabase/schema.sql` — Realtime publication (idempotent guard)
- `docs/supabase-setup.md`, `CLAUDE.md`, `README.md` — doc updates in the
  phase that delivers the behavior

## Logging & Observability

Background sync failures are surfaced in the UI (`syncError` banner). Refetch
and channel lifecycle stay silent in production; no logging framework exists
in this repo and none is added.

## Implementation

### Phase 0: Repair and verify the live database (writes must land)

Dependencies: None

Restore the live project (`xlgbvltlcjkdvqwbjsbd`) to the state `schema.sql`
describes, make the schema file safe to re-run, and prove a write lands
end-to-end. Full diagnosis and the interpretation table for each outcome:
`docs/agents/research/2026-07-02-silent-write-failure-analysis.md` §5.

**Tasks**:

- [ ] Run the decisive checks in the Supabase SQL editor and record the output
      in this plan's Implementation Notes:

  ```sql
  select tablename, policyname, cmd, qual, with_check
  from pg_policies where schemaname = 'public' order by tablename;

  select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('subscriptions', 'installments', 'app_settings')
  order by table_name, ordinal_position;
  ```

- [ ] Make `supabase/schema.sql` idempotent so re-running it can never abort
      halfway: precede each `create policy` with the matching
      `drop policy if exists "<name>" on <table>;` (Postgres has no
      `create policy if not exists`). Keep everything else as-is
      (`create table if not exists` already guards the tables).
- [ ] Re-run the full (now idempotent) `supabase/schema.sql` in the SQL editor
      against the live project — this restores any missing policies.
- [ ] If the column-definition check exposed live tables whose shape diverges
      from `schema.sql` (wrong types, unexpected NOT NULL columns), align them
      with explicit `alter table` statements in the SQL editor and note what
      was changed in Implementation Notes. (Tables are empty, so type changes
      are safe.)
- [ ] Update `docs/supabase-setup.md`: note that `schema.sql` is safe to
      re-run, and add a write-verification step after schema setup — sign in,
      add a test subscription, confirm the row in Table Editor →
      `subscriptions`.

**Automated Verification**:

- [ ] `pnpm lint` passes (schema.sql is not linted, but the docs edit is
      format-checked by prettier via lefthook)
- [ ] Anonymous REST probe still returns `200 []` for
      `subscriptions?select=id` (RLS intact — no accidental public access):
      `curl -s "https://xlgbvltlcjkdvqwbjsbd.supabase.co/rest/v1/subscriptions?select=id&limit=1" -H "apikey: <publishable key>" -H "Authorization: Bearer <publishable key>"`

**Manual Verification**:

- [ ] `pg_policies` lists an `ALL` policy for each of `subscriptions`,
      `installments`, `app_settings` after the re-run.
- [ ] Adding a subscription in the deployed app produces a row in the
      dashboard `subscriptions` table within seconds, from the laptop **and**
      from the phone.
- [ ] The existing locally-cached phantom items (added while writes were
      failing) are re-added once on one device so they exist server-side.

### Phase 1: Coalesced refetch + focus/visibility/online triggers

Dependencies: Phase 0 (writes must reach the database for sync to matter)

Extract the mount-time load into a reusable `fetchAll`, add the coalescing
`requestRefetch()` machinery and the pending-write counter, and wire the
browser triggers. After this phase, returning to the tab/app or regaining
network always shows fresh data — this alone fixes the everyday phone ↔
browser case.

**Tasks**:

- [ ] In `src/state/useAppData.tsx`, extract the body of `load()`
      (`:109-147`) into a `fetchAll` callback (same three parallel selects,
      same settings seeding, same error behavior: keep cached data on any
      error). Only the initial call flips `loading`; refetches must not
      (pass/track a `first` flag or clear `loading` only once).
- [ ] Add refs for the sync machinery: `pendingWritesRef` (number),
      `fetchInFlightRef` (boolean), `refetchQueuedRef` (boolean), and a
      debounce timer ref.
- [ ] Implement `requestRefetch()`: (re)start a ~300 ms debounce timer; when
      it fires, if `pendingWritesRef.current > 0` or a fetch is in flight,
      mark queued and re-run when the blocker clears; otherwise run
      `fetchAll`. After any `fetchAll` completes, run once more if queued.
      Clear the debounce timer on unmount / `user.id` change so a stale timer
      never fires `fetchAll` for a previous user.
- [ ] Add a `persist(promise)` helper that increments
      `pendingWritesRef.current`, awaits the Supabase call, decrements, and
      (this phase) ignores the result — error handling arrives in Phase 3.
      Route all eight write units through it: the seven single-call sites
      (`addSubscription`, `updateSubscription`, `deleteSubscription`,
      `addInstallment`, `updateInstallment`, `deleteInstallment`,
      `updateSettings`) plus the entire async block inside `replaceData`
      (`:304-328`) wrapped as one unit — it contains five Supabase calls (two
      user-wide deletes, two bulk inserts, one settings upsert) that must all
      settle before the pending-write counter drops. Replace every bare
      `void supabase…` call.
- [ ] Add a `useEffect` (keyed on `user.id`) registering the triggers, each
      calling `requestRefetch()`: `document` `visibilitychange` (only when
      `document.visibilityState === 'visible'`), `window` `focus`, `window`
      `online`. Clean all three up on unmount.
- [ ] Update `CLAUDE.md` (Data flow bullet for `src/state/useAppData.tsx`):
      the store now refetches on visibility/focus/reconnect via a coalesced
      `requestRefetch()`.

**Automated Verification**:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] `pnpm knip` passes

**Manual Verification**:

- [ ] With the app open in browser tab 1, add a subscription in tab 2 (same
      account), switch away from tab 1 and back → the new item appears
      without reload.
- [ ] Toggle DevTools network to offline and back online in an open tab →
      a refetch fires (visible in the network panel) and data stays intact.
- [ ] Adding an item and immediately switching tabs away/back does not make
      the new item flicker or disappear (pending-write deferral works).

### Phase 2: Supabase Realtime subscription

Dependencies: Phase 1 (`requestRefetch()` is the funnel for events)

Enable Realtime on the three tables and subscribe per user, so two visible
screens update each other within a second — no focus change needed.

**Tasks**:

- [ ] Append to `supabase/schema.sql` an idempotent publication block (safe
      to re-run in the SQL editor):

  ```sql
  do $$
  declare t text;
  begin
    foreach t in array array['subscriptions', 'installments', 'app_settings'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end $$;
  ```

- [ ] In `src/state/useAppData.tsx`, add a `useEffect` (keyed on `user.id`)
      that creates one channel with two `postgres_changes` bindings per table
      (`subscriptions`, `installments`, `app_settings`) — every handler just
      calls `requestRefetch()`; cleanup with `supabase.removeChannel(channel)`:
  - filtered binding for inserts/updates:
    `{ event: 'INSERT' /* and one for 'UPDATE' */, schema: 'public', table, filter: 'user_id=eq.<user.id>' }`
    (do **not** use `event: '*'` — see next bullet);
  - **unfiltered** binding `{ event: 'DELETE', schema: 'public', table }` —
    Supabase does not support filters on DELETE events (the payload carries
    only the old row's primary key, and RLS is not applied to DELETE
    payloads), so a `user_id` filter would silently drop all deletes. The
    unfiltered binding is safe: the handler only triggers `requestRefetch()`,
    whose selects are RLS-guarded, so another user's delete merely causes one
    harmless coalesced refetch.
- [ ] In the `.subscribe(status => …)` callback, call `requestRefetch()` on
      every `'SUBSCRIBED'` status so events missed while the socket was down
      (PWA backgrounded, network blip) are caught up on reconnect.
- [ ] Update `docs/supabase-setup.md`: add the "enable Realtime" schema step
      (re-run `schema.sql` or paste the publication block) and extend the
      verification section: two browsers side by side, add an item in one →
      it appears in the other within ~1 s without focus change.
- [ ] Update `CLAUDE.md` (same Data flow bullet): per-user Realtime
      `postgres_changes` subscription funnels into the coalesced refetch.

**Automated Verification**:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] `pnpm knip` passes

**Manual Verification**:

- [ ] Two browser windows visible side by side, same account: adding /
      renewing / deleting an item in one appears in the other within ~1 s
      without any focus change (requires the publication block applied to the
      Supabase project).
- [ ] Settings change (e.g. reminder lead days) in one window is reflected in
      the other's Settings view.

### Phase 3: Surface failed writes

Dependencies: Phase 1 (`persist()` and `requestRefetch()` exist)

Make sync honest: a write that never reached Supabase reverts the optimistic
UI and tells the user, instead of silently losing data.

**Tasks**:

- [ ] In `src/state/useAppData.tsx`, add `syncError: string | null` state and
      a `dismissSyncError()` callback; extend `persist()` to inspect the
      settled Supabase response (`error` field, and thrown/network rejections
      via `try/catch`) — on failure set `syncError` and call
      `requestRefetch()` so local state reverts to server truth. Banner text:
      "Couldn't save to the server — will resync when you're back online."
      (Not "showing last synced data": when the device is offline the
      compensating refetch also fails and the optimistic item stays visible
      until reconnect.)
- [ ] Expose `syncError` and `dismissSyncError` on `AppDataContextValue` and
      in the provider `value`.
- [ ] In `src/App.tsx` (`AppShell`), render a dismissible banner between the
      header and `app-main` when `syncError` is set:

  ```
  ┌──────────────────────────────────────────────┐
  │ ⚠ Couldn't save to the server — will resync  │
  │   when you're back online.               [×] │
  └──────────────────────────────────────────────┘
  ```

- [ ] Style the banner in `src/App.css` (new `sync-error-banner` class,
      visually consistent with the existing `email-status-error` treatment).
- [ ] Update `README.md` sync wording if needed so it matches actual behavior
      (live sync + surfaced write failures), and `CLAUDE.md`'s store bullet
      (writes are checked; failures revert via refetch and surface a banner).

**Automated Verification**:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] `pnpm knip` passes

**Manual Verification**:

- [ ] With DevTools network set to offline, add a subscription: the item
      appears optimistically, then the banner shows and — once back online
      and refetched — the phantom item is gone (it never reached the server).
- [ ] The banner's dismiss button clears it; a subsequent successful save
      does not re-show it.

## Implementation Notes

**2026-07-07 — code complete for all phases; live-DB steps still owner-only.**

- **Phase 0 (code):** `supabase/schema.sql` made idempotent — every
  `create policy` now preceded by `drop policy if exists`, so the file is safe
  to re-run end to end. `docs/supabase-setup.md` notes the re-run safety and
  adds a write-verification step. **Still pending (needs live SQL editor
  access, owner only):** running the `pg_policies` / column-definition checks,
  re-running `schema.sql` against `xlgbvltlcjkdvqwbjsbd`, any `alter table`
  realignment, and the manual add-a-row verification from laptop + phone.
- **Phase 1:** `useAppData.tsx` — extracted `fetchAll(first)` (only the first
  call flips `loading`), added `requestRefetch()` (300 ms debounce +
  pending-write deferral + no-overlap guard via `fetchInFlightRef` /
  `refetchQueuedRef`), a `persist()` wrapper counting in-flight writes, and
  visibility/focus/online triggers. All eight write units routed through
  `persist()` (the `replaceData` block wrapped as one unit whose five calls all
  settle before the counter drops). A stale-user guard (`userIdRef`) stops an
  in-flight fetch applying after an account switch; debounce timer + counters
  reset on unmount / user change.
- **Phase 2:** per-user Realtime channel (`appdata:<user.id>`) with
  INSERT/UPDATE (user-filtered) + unfiltered DELETE bindings per table, all
  funnelling into `requestRefetch()`; `requestRefetch()` also fires on every
  `SUBSCRIBED` to catch up missed events. Idempotent `supabase_realtime`
  publication block appended to `schema.sql`; setup doc §5b covers enabling it.
- **Phase 3:** `syncError` / `dismissSyncError` added; `persist()` sets the
  banner + refetches on a failed/thrown write. `AppShell` renders a dismissible
  `sync-error-banner` (styled in `App.css` off `--danger` / `--danger-soft`).
- **Gates:** `pnpm typecheck`, `lint`, `build`, `knip` all pass in the worktree.
- **Not yet done:** all manual verification (needs the live DB repaired first)
  and re-adding the locally-cached phantom items on one device.

## References

- Research: `docs/agents/research/2026-07-02-cross-device-data-sync.md`
- Live write-failure diagnosis: `docs/agents/research/2026-07-02-silent-write-failure-analysis.md`
- Store: `src/state/useAppData.tsx` (fetch `:106-153`, writes `:162-331`)
- Auth/user scoping: `src/components/AuthGate.tsx:31-41`
- Client config: `src/lib/supabase.ts:20-27` (`@supabase/supabase-js` 2.110.0)
- Schema + RLS: `supabase/schema.sql`
- Setup docs to update: `docs/supabase-setup.md`
- Supabase Realtime `postgres_changes` requires tables in the
  `supabase_realtime` publication. RLS applies to delivered INSERT/UPDATE
  payloads, but **not** to DELETE events (all table subscribers receive the
  deleted row's primary key), and DELETE events cannot be filtered — hence
  the unfiltered DELETE binding funneling into an RLS-guarded refetch.
