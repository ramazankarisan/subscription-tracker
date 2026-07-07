---
date: 2026-07-02T09:06:30+00:00
git_commit: 333029e5907e1bad01550357d09ce5eb174750ad
branch: main
topic: 'How data persistence and cross-device sync (phone ↔ browser, same email) works today'
tags: [research, codebase, useAppData, supabase, storage, auth, pwa]
status: complete
---

# Research: How data persistence and cross-device sync works today

## Research Question

"I want to have the same data on my phone and on the website at the same time — if I add data on my phone it should also be persisted in the browser. As I saw there is no persistence; with the same email, data should be persisted."

## Summary

Persistence **does exist and is server-side**: every add/edit/delete is written through to Supabase (Postgres), keyed by the signed-in user's id, with Row Level Security restricting each user to their own rows. A per-user localStorage copy is kept only as an offline read cache.

However, **another device only picks up those rows at one moment: when the app (re)mounts for a signed-in user** — i.e. on page load / reload / sign-in. There is:

- **no realtime subscription** (no `supabase.channel(...)` / `postgres_changes` anywhere),
- **no polling interval**,
- **no refetch on window focus or `visibilitychange`**,
- **no service-worker caching of Supabase API calls** (the PWA precaches only built app assets).

So the current behavior is: data added on the phone _is_ persisted to the server immediately, and the browser _will_ show it — but only after the browser tab reloads (or the user signs in), because the single fetch lives in a mount-time `useEffect`. An already-open tab keeps showing its last-loaded state (seeded instantly from the localStorage cache), which can look like "no persistence / no sync at the same time".

Both devices must be signed in with the **same email**: rows are scoped by `user_id` (`auth.users.id`), and the same email through Supabase magic-link/OTP auth resolves to the same user id.

### Key files

```
src/
├── state/
│   └── useAppData.tsx      # the single store: mount-time fetch + optimistic write-through
├── lib/
│   ├── supabase.ts         # Supabase browser client (persistSession, autoRefreshToken)
│   ├── storage.ts          # per-user localStorage offline read cache
│   └── mappers.ts          # snake_case row ↔ camelCase domain conversion
├── components/
│   └── AuthGate.tsx        # email OTP / magic-link sign-in; provides AuthedUser
└── App.tsx                 # AuthGate → AppDataProvider → tabs
supabase/
└── schema.sql              # tables + RLS (per-user row access)
vite.config.ts              # VitePWA: autoUpdate, no runtimeCaching for API calls
```

### Data flow between two devices (as implemented)

```
Phone (device A)                        Supabase (source of truth)        Browser (device B)
────────────────                        ──────────────────────────        ──────────────────
add subscription
 ├─ setData(...)  (optimistic)
 ├─ saveData → localStorage cache A
 └─ supabase.insert ────────────────▶  row stored (user_id = U)
                                                                          (open tab: nothing happens —
                                                                           no realtime, no polling,
                                                                           no focus refetch)
                                                                          on reload / sign-in:
                                                    ◀──────────────────── mount useEffect fetch
                                                                           ├─ setData(rows)
                                                                           └─ saveData → cache B
```

## Detailed Findings

### 1. The store: fetch once on mount, write through on every action (`src/state/useAppData.tsx`)

- `AppDataProvider` is scoped to the signed-in user (`user.id`, `user.email`) passed down from `AuthGate` (src/state/useAppData.tsx:77-86).
- **Initial state** comes synchronously from the per-user localStorage cache: `useState(() => loadData(cacheKey))` (src/state/useAppData.tsx:85). This is why each device renders _its own last-seen data_ instantly.
- **The only read from Supabase** is a mount-time `useEffect` (src/state/useAppData.tsx:106-153) that runs three selects in parallel — `subscriptions`, `installments`, `app_settings` — filtered by `.eq('user_id', user.id)` (lines 111-119). On success it replaces local state _and_ rewrites the localStorage cache (lines 139-146). Dependency array is `[user.id, user.email, cacheKey]` (line 153), so it re-runs only when the signed-in identity changes — not periodically, not on focus.
- On any fetch error the cached data is kept and the UI is not wiped (src/state/useAppData.tsx:122-126).
- First sign-in ever: if no `app_settings` row exists, one is created with `recipientEmail` defaulted to the user's email (src/state/useAppData.tsx:128-137).
- **Every action is optimistic + write-through**: `apply()` updates React state and mirrors to localStorage (src/state/useAppData.tsx:94-103), then a fire-and-forget (`void`) Supabase call persists it server-side:
  - subscriptions: insert :162-164, update :179-183, delete :194
  - installments: insert :227-229, update :244-248, delete :259
  - settings upsert :290
  - `replaceData` (import/restore): delete-all then re-insert, plus settings upsert (src/state/useAppData.tsx:296-331)
- No write ever re-reads from the server, and no code path re-runs the fetch after mount.

### 2. What does NOT exist (verified by search)

- **No Supabase realtime**: no `supabase.channel(...)`, `postgres_changes`, or realtime `.subscribe()` anywhere in `src/`. The only `subscription.unsubscribe()` is the auth-state listener cleanup in src/components/AuthGate.tsx:41.
- **No polling**: no `setInterval`/timer-driven refetch in the data layer.
- **No focus/visibility refetch**: no `visibilitychange` or window `focus` listeners; the only `addEventListener` in the app is a `keydown` handler in `Modal.tsx:20`.

### 3. Identity scoping — why "same email" gives the same data (`src/components/AuthGate.tsx`, `src/lib/supabase.ts`)

- Sign-in is passwordless email OTP / magic link via `supabase.auth.signInWithOtp` (src/components/AuthGate.tsx:60-76) and `verifyOtp` (lines 78-92). The same email always resolves to the same Supabase `auth.users` row, hence the same `user.id` on every device.
- `AuthGate` resolves the session on mount (`getSession`) and listens to `onAuthStateChange` (src/components/AuthGate.tsx:31-41); the resulting `AuthedUser { id, email }` is what scopes both the Supabase queries and the localStorage cache key.
- The client persists the session locally with token auto-refresh (`persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true` — src/lib/supabase.ts:20-27), so each device stays signed in independently.
- All rows carry `user_id`, and `supabase/schema.sql` enforces Row Level Security so a user can only read/write their own rows (referenced in CLAUDE.md and docs/supabase-setup.md).

### 4. The localStorage layer is a read cache, not the store (`src/lib/storage.ts`)

- Key is per user: `subscription-tracker:v2:<userId>` (src/lib/storage.ts:11, 26-28) — switching accounts on one device never mixes data.
- `loadData` is defensive (corruption/missing fields fall back to defaults, src/lib/storage.ts:31-54); `saveData` is best-effort and swallows quota errors (lines 57-63).
- The cache is written in exactly two situations: after every optimistic `apply()` and after a successful mount fetch. It is never synced across devices itself — each device's cache is just that device's last-seen server state.

### 5. PWA / service worker does not affect data freshness (`vite.config.ts`)

- `VitePWA` runs with `registerType: 'autoUpdate'` and a manifest, but **no `workbox`/`runtimeCaching` block** — the service worker precaches built app assets only. Supabase API requests are not cached or replayed by the SW; data staleness is entirely a product of the mount-only fetch in `useAppData`.

### 6. What the docs claim vs. the mechanism

- README.md:9-10: "Your data syncs across devices — stored per-user in Supabase (Postgres), so your phone and laptop show the same thing."
- docs/supabase-setup.md:110-111 verifies sync as: "Open the app on a second device, **sign in** → same data" — i.e. the documented sync moment is exactly the mount/sign-in fetch, consistent with the implementation.
- CLAUDE.md:42-50 describes the same design: Supabase is the source of truth, localStorage is "purely an offline read cache".

## Code References

- `src/state/useAppData.tsx:85` — initial render from the localStorage cache
- `src/state/useAppData.tsx:106-153` — the single mount-time Supabase fetch (deps: `[user.id, user.email, cacheKey]`)
- `src/state/useAppData.tsx:94-103` — optimistic `apply()` + cache mirror
- `src/state/useAppData.tsx:162-164, 179-183, 194, 227-229, 244-248, 259, 290` — fire-and-forget write-through calls
- `src/state/useAppData.tsx:296-331` — `replaceData` full replace (import/restore)
- `src/components/AuthGate.tsx:31-41` — session resolution + `onAuthStateChange`
- `src/components/AuthGate.tsx:60-92` — email OTP send/verify
- `src/lib/supabase.ts:20-27` — client config (`persistSession`, `autoRefreshToken`, `detectSessionInUrl`)
- `src/lib/storage.ts:11, 26-28` — per-user cache key; `:31-54` defensive load; `:57-63` best-effort save
- `src/lib/mappers.ts:41-123` — row ↔ domain conversions (column names live only here)
- `vite.config.ts:12-34` — VitePWA config (no API runtime caching)

## Architecture Documentation

- **Source of truth**: Supabase Postgres, per user (`user_id` columns + RLS). localStorage is strictly a per-user, per-device offline read cache.
- **Consistency model**: optimistic local writes with fire-and-forget server write-through; reads happen exactly once per provider mount (page load / sign-in / account switch). There is no server→client push path (no realtime channels), no pull loop (no polling/focus refetch), and no reconciliation of writes that fail silently.
- **Cross-device convergence point**: the mount-time fetch. Two devices signed in with the same email converge whenever either one reloads the app.
- **Layering rule**: components never touch Supabase or localStorage directly — everything goes through `useAppData` action helpers; column names live only in `mappers.ts`.

## Open Questions

- Whether the "no persistence" observation was an already-open tab (expected with the current mount-only fetch) or a genuinely failed write: write calls are `void`-ed with no error surfacing, so a rejected insert (e.g. RLS mismatch, network failure) would be invisible in the UI and lost — the code has no retry/queue. Reproducing with the network tab open would distinguish the two.
- Whether both devices were signed in with the same email (different emails → different `user_id` → disjoint data by design).
