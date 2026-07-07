---
date: 2026-07-02T10:03:09+00:00
git_commit: aff9b1bed871e915e2a52f87b04efdb40c49a254
branch: main
topic: 'Root cause analysis: subscription/installment writes never reach Supabase, silently, on all devices'
tags: [research, codebase, useAppData, supabase, rls, auth, silent-failure]
status: complete
---

# Research: Why subscription writes never reach Supabase — silently, on all devices

## Research Question

Why can a subscription added in the UI never arrive in the Supabase table, with no
visible error, on both an iPhone PWA and a laptop browser signed into the same
verified account (rkarisan25@gmail.com)? Root-cause analysis explicitly requested.

## Summary

**The write path has zero error surfacing by construction, and the failure
pattern (settings upserts succeed at sign-in, subscription/installment inserts
never land, from all devices, with the user visibly signed in) points to the
live database rejecting the inserts — most plausibly missing Row Level
Security write policies on `subscriptions`/`installments` in the live project,
which the repo's `schema.sql` cannot vouch for because the live DB demonstrably
was not created exactly from it.**

Every hypothesis that could be tested remotely has been tested (see Verified
Live Evidence). Two hypotheses remain, and the supabase-js 2.110.0 source
analysis shows both produce the exact observed symptom — an HTTP 403 /
Postgres `42501` response that the app's `void`-ed insert swallows with no
console output whatsoever:

- **H1 (leading): the live tables have RLS enabled but no write policy** for
  `subscriptions`/`installments`. Fits everything: systematic, permanent, same
  on every device, while `app_settings` (with a working policy) accepts writes.
- **H2 (weaker): session silently downgraded to the anon key at insert time**
  (expired access token + failed refresh → supabase-js sends the anon key, not
  an error). Fits an iOS PWA resume race, but on the laptop a fresh page load
  with a dead session would visibly land on the sign-in screen (auth-js emits
  `SIGNED_OUT` during load-time recovery), which the user does not see.

The two decisive checks (below) distinguish these in under a minute.

### Verified live evidence (2026-07-02)

| Check                           | Method                               | Result                                                                                                               |
| ------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Deployed bundle current?        | `last-modified` header + marker grep | Built 2026-07-02 09:10 UTC; contains all `subscriptions`/`installments`/`insert`/`upsert` code                       |
| Right Supabase project?         | Bundle contains project URL          | `xlgbvltlcjkdvqwbjsbd.supabase.co`; `app_settings` rows for both known users exist there                             |
| Schema columns present?         | Anon REST probe per column           | All columns the app writes exist on all three tables                                                                 |
| Column types sane?              | PostgREST operator probes            | `reminder_offsets` accepts array `cs` operator; numeric/date filters accepted                                        |
| Sign-in + writes ever worked?   | `app_settings` rows                  | Two rows created 2026-07-01 19:34 / 19:47 UTC (md2025126@, rkarisan25@)                                              |
| Subscriptions/installments rows | Dashboard (user)                     | **Empty** despite multiple adds on 2026-07-02 from phone and laptop                                                  |
| RLS policies on live tables     | —                                    | **Unverifiable anonymously** (SELECT returns `[]` with or without policy; OpenAPI introspection requires secret key) |

## Detailed Findings

### 1. The write path swallows every failure by construction

- The add flow is: `SubscriptionForm.handleSubmit` (src/components/SubscriptionForm.tsx:42-57, unconditional `onSubmit`) → `SubscriptionsView.handleSubmit` (src/components/SubscriptionsView.tsx:57-64, always closes the modal) → `addSubscription` (src/state/useAppData.tsx:155-167).
- `addSubscription` applies the item optimistically to React state **and the
  localStorage cache** (`apply()`, useAppData.tsx:94-103), then issues
  `void supabase.from('subscriptions').insert(...)` (useAppData.tsx:162-164) —
  not awaited, result never inspected, no try/catch.
- Repo-wide search confirms **no Supabase write anywhere in `src/` checks its
  result**: inserts :162/:227, updates :181/:246, deletes :194/:259, settings
  upserts :136/:290, and the `replaceData` bulk block :306-326. The only
  `.error` check in the app is on the read path (useAppData.tsx:123).
- postgrest-js resolves failures as `{ data, error }` without throwing
  (`PostgrestBuilder.processResponse`, `shouldThrowOnError` defaults false) and
  logs **nothing** to the console — even network-level failures become
  `{ error, status: 0 }`. A `void`-ed insert therefore fails with zero trace.
- Because the optimistic item is also written to the localStorage cache, the
  device that "added" it keeps showing it forever — indistinguishable, to the
  user, from a successful save.

### 2. supabase-js 2.110.0 auth behavior (verified in vendored source)

- Before every PostgREST request, `fetchWithAuth` resolves a token via
  `getSession()`; a token within 90 s of expiry triggers an awaited refresh
  (`__loadSession` → `_callRefreshToken`). **An expired JWT is never knowingly
  sent.**
- **If the refresh fails and the token is truly expired, `getSession()` returns
  `null` and the request is sent with the anon key instead** — no exception,
  no console output. Under RLS this yields HTTP 403 / code `42501`, swallowed
  as per finding 1. This is the mechanism behind H2.
- A non-retryable refresh failure with an expired token removes the session and
  emits `SIGNED_OUT`; at app load, `_recoverAndRefresh()` runs during client
  initialization, so a dead session on page load lands the user on the AuthGate
  sign-in screen (src/components/AuthGate.tsx:31-41 clears `user` on the
  event). **A signed-in-looking laptop after a fresh page load implies a live
  session** — which is what weakens H2 for the laptop case.
- Network-level refresh failures (offline radio at PWA resume) preserve the
  session but enter a 60 s failure cooldown during which requests go out with
  the anon key — a transient, device-local version of H2 that can eat writes
  made in the first minute after reopening the phone app.
- Concurrent requests during a refresh queue behind a single deduped refresh
  (no race). Magic-link and email-OTP sessions are structurally identical.

### 3. RLS: what a missing policy looks like from the client

- `supabase/schema.sql:63-77` enables RLS and creates `for all` policies for
  all three tables. **With RLS enabled and no policy, PostgREST returns HTTP
  403, code `42501`, message `new row violates row-level security policy for
table "subscriptions"`** — the same code whether the policy is missing or
  its `with check` fails; INSERT bodies don't distinguish the two.
- Critically for diagnosis: **SELECT under RLS with no policy returns `200 []`,
  not an error.** The app's initial fetch therefore looks healthy even against
  a table that rejects every write, and my anonymous probes cannot detect
  policy presence.

### 4. The live database provably diverges from the repo's schema history

- `supabase/schema.sql` has exactly **one committed version ever**
  (bb5955b, 2026-07-01 21:59 +0200) — born complete with `reminder_offsets
integer[] default '{3,0}'` and all four policy statements; never modified on
  any branch; no other `.sql` file exists in history. The setup doc always
  pointed at running this full file.
- Therefore any divergence in the live DB (and the failure pattern itself)
  originated **outside version control** — a partial paste, a hand-edited run,
  or tables created via the dashboard UI (whose "enable RLS" default creates
  **no** policies). Notably, if `schema.sql` is re-run against a DB where any
  policy already exists, the duplicate `create policy` **aborts the whole
  script** (no `if not exists` guards), silently leaving later statements
  unapplied — a plausible mechanism for "settings policy works, subscriptions
  inserts rejected" if the original setup involved more than one attempt.

### 5. Decisive checks (one minute in the Supabase SQL editor)

Run in the dashboard SQL editor of project `xlgbvltlcjkdvqwbjsbd`:

```sql
-- A. Which policies actually exist? (H1 test)
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename;

-- B. Exact live column definitions (rules out any remaining shape mismatch)
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('subscriptions', 'installments', 'app_settings')
order by table_name, ordinal_position;
```

Interpretation:

- **A shows no row (or no `ALL`/`INSERT` row) for `subscriptions`/`installments`
  → H1 confirmed.** Re-running the policy block from `supabase/schema.sql:70-77`
  fixes it immediately.
- **A shows all policies present → H2 (or a shape issue from B).** Then the
  browser check decides: DevTools → Network → add a subscription → inspect the
  `POST /rest/v1/subscriptions` request. Status 403 + body code `42501` with
  policies present means the request went out as `anon` (decode the
  `Authorization: Bearer` JWT's `role` claim to confirm); status 400 + code
  `23502`/`42703` means a live column mismatch B will have exposed. **No POST
  appearing at all** would mean the deployed build isn't executing the insert —
  ruled out already by the bundle inspection but trivially visible here.

## Code References

- `src/state/useAppData.tsx:155-167` — `addSubscription`: optimistic apply + `void` insert
- `src/state/useAppData.tsx:94-103` — `apply()` writes optimistic state into the localStorage cache (why the phantom item persists)
- `src/state/useAppData.tsx:123` — the only `.error` check in the app (read path)
- `src/components/SubscriptionForm.tsx:42-57` — unconditional submit; HTML `required` only
- `src/components/SubscriptionsView.tsx:57-64` — routes to add/update, always closes modal
- `src/components/AuthGate.tsx:31-41` — `SIGNED_OUT` handling that would reveal a dead session on page load
- `src/lib/supabase.ts:20-27` — client config (`persistSession`, `autoRefreshToken`)
- `supabase/schema.sql:63-82` — RLS enablement + the four policies (single committed version, bb5955b)
- `node_modules/@supabase/supabase-js/src/lib/fetch.ts:24-52` — anon-key fallback when no session resolves
- `node_modules/.pnpm/node_modules/@supabase/auth-js/src/GoTrueClient.ts:2911-3037, 4953-4998` — expiry margin, refresh, `SIGNED_OUT` conditions

## Architecture Documentation

The app's persistence contract is optimistic-first with fire-and-forget
write-through and no reconciliation: UI state and the localStorage cache are
updated before (and regardless of) server acknowledgment, reads happen only at
mount, and no write result is observed anywhere. Combined with supabase-js's
non-throwing `{ data, error }` contract and silent anon-key fallback, every
server-side write rejection — RLS, auth, or schema — is invisible at runtime
on every device.

## Open Questions

- Which of H1/H2 is it? Decided by check A (pg_policies) and, if needed, the
  DevTools network inspection in finding 5 — both require dashboard/browser
  access only the user has.
- Why `app_settings.reminder_offsets` exported as `"[\"3\",\"0\"]"` from the
  dashboard while accepting array operators via REST — cosmetic export
  formatting or a `jsonb` column created out-of-band. Check B settles it; it
  does not affect the subscriptions failure either way.
