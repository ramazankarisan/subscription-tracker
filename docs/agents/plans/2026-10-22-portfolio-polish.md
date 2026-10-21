---
date: 2026-10-22T00:30:00+02:00
git_commit: b2e4e6c
branch: main
topic: 'Portfolio polish: bugs, boundaries, demo mode, docs, UI'
tags: [plan, settings, backup, demo, docs, ui]
status: in-progress
---

# PLAN: Portfolio polish

Goal: someone opening the repo sees, within ~30 s, a small, working, well-reasoned
PWA built with a visible, disciplined agentic workflow. Profile it should read as:
**frontend-heavy full-stack engineer who also works as an AI engineer**.

Decisions taken with the owner up front:

- Screenshots / GIF come from a **build-time demo mode** (`VITE_DEMO=1`) with
  synthetic seed data — no Supabase, no real account. A hosted demo is a later step.
- Commit the existing `DESIGN.md` + `PRODUCT.md` (design system + product brief).
  The WhatsApp plan / branch / PR stay out of scope.

## Acceptance Criteria

- Every PR follows the repo's workflow (below); non-UI PRs merged after CI + own review.
- High/medium bugs fixed, each with a test that is red before and green after
  (the PR's commit history shows the red test first).
- Low-likelihood bugs listed (here), not fixed.
- Docs: README for humans, CLAUDE.md files for agents (short, nested), no stale
  or duplicated content, no broken links.
- Screenshots + GIF from synthetic data only. No real email anywhere in the tree.
- UI PR merged only after the owner approves before/after screenshots.

## The repo's workflow (adopted, not invented)

| Thing         | Convention found                                                              |
| ------------- | ----------------------------------------------------------------------------- |
| Branches      | `type/kebab-topic` (`feat/brevo-email`, `fix/dashboard-copy-nits`)            |
| Git work      | in a worktree under `.claude/worktrees/<type>+<topic>`, never on `main`       |
| Commits       | Conventional Commits, `Co-authored-by` trailer; stage only changed files      |
| PR title      | same as squash commit: `type(scope): summary`                                 |
| PR body       | `## Why` / `## What` / extra sections (setup, caveat, cost) / 🤖 footer       |
| Merge         | squash; branch protection = PR required, 0 approvals                          |
| Gates         | lefthook pre-commit + pre-push, CI re-runs all, Claude Stop hook              |
| Agent process | `rpi-research` → `rpi-plan` → `rpi-implement`, artefacts in `docs/agents/`    |
| Verification  | unit tests for `src/lib`; components verified by driving the app              |

**Gap filled:** no PR template → add `.github/pull_request_template.md` that encodes
the existing body style plus a `## Verification` section. Nothing else new.

## Findings

### Bugs to fix (high / medium likelihood)

1. **Restore of a malformed backup wipes the user's data** (high impact, medium
   likelihood). `SettingsView.handleImport` only checks that two arrays exist.
   `replaceData` then deletes every row and inserts the file's items; one item
   with a missing / wrongly typed field makes the insert fail **after** the delete
   → refetch shows an empty account. Fix: validate every item + settings in a pure
   `parseBackup()` (`src/lib/backup.ts`) before the confirm dialog.
2. **Settings "Send reminders to" field cannot be cleared, and saves every
   keystroke unvalidated** (medium-high). An effect re-fills the account email the
   moment the field is empty, so select-all + type a new address fights the user;
   each keystroke upserts, so a half-typed / invalid address can be persisted and
   reminders silently fail. Fix: local draft, commit on blur only when valid.
3. **Settings "due within (days)" input snaps to 0 when cleared** (medium). Same
   per-keystroke pattern: clearing to retype "14" writes 0 and shows "0". Fixed
   with the same draft-and-commit pattern as #2 (one PR).

### Low-likelihood bugs (listed, left)

- `replaceData` is not atomic: a network drop between delete and insert loses
  data. Proper fix is a Postgres RPC doing both in one transaction.
- Restoring another account's backup into this one collides on primary keys
  (insert fails after delete). Rare; same RPC fix.
- Two "Paid one" / "Renewed" taps within one frame read the same stale
  `dataRef` and count once.
- Export revokes the object URL synchronously; some older Safari versions can
  drop the download.
- Edge Function: "today" is UTC; a failed `reminder_log` write after a successful
  send re-sends next run; a failed per-user select is treated as "nothing due".
- `AuthGate` `getSession()` has no `.catch` (stuck on "Loading…" if it rejects).

### Necessary improvements (what a senior reviewer expects)

- **Input validation:** whitespace-only names are accepted (`required` passes on
  `"  "`); reject them.
- **Accessibility basics:** list action buttons are all labelled "Edit" / "Delete"
  (indistinguishable to a screen reader) → include the item name; test-email
  status messages have no live region (others do) → `role="status"/"alert"`.
- **Privacy boundary:** sign-out leaves the user's cached data in localStorage on a
  shared device → clear this user's cache on sign-out.
- **Stale copy:** Settings says the account email is "the only address they can
  reach" — false since the Brevo switch.

### Product / security decisions (documented, not built)

- **Test-send is unthrottled:** any signed-in user can trigger unlimited emails to
  any address they set → spam vector and Brevo's 300/day quota can be drained.
  Options: limit to N/day/user, or test sends only to the sign-in address.
- Hosted instance: owner can read all rows (already stated in README).
- Edge Function changes need a manual `supabase functions deploy`; none planned.
- Real email in **git history** (old screenshots): removing it needs a history
  rewrite + force-push to `main` — owner's call.

## Technical Key Decisions and Tradeoffs

1. **Component tests via jsdom + Testing Library, scoped per file.**
   - Why: bugs #2/#3 live in a component; a regression test must render it.
   - Impact: two dev deps; default env stays `node`; only `*.test.tsx` opt in.
2. **Demo mode is a build flag inside the existing store**, not a second store.
   - Why: one code path for every action → demo exercises real logic, no dupes.
   - Impact: `useAppData` seeds from `src/demo/seed.ts` and skips network calls
     when `isDemo`; `AuthGate` renders a demo user; email/passkey actions hidden.
3. **Screenshots / GIF captured with the agent's browser tools, not a new
   Playwright dependency.** A short "regenerate" note lives in the docs.
4. **Docs split by reader:** README = pitch for humans; root CLAUDE.md = only
   rules an agent can't infer; nested `src/lib/CLAUDE.md` and
   `supabase/CLAUDE.md` for package rules. `SETUP.md` folds into the canonical
   `docs/supabase-setup.md` (it duplicates it).

## Implementation (one PR per phase, in this order)

### Phase 1 — `docs(agents)`: plan, design/product briefs, PR template

Dependencies: None. Lands first so every later PR uses the template.

- [ ] this plan, `DESIGN.md`, `PRODUCT.md`, `.prettierignore` (`docs/agents`)
- [ ] `.github/pull_request_template.md`

### Phase 2 — `fix(backup)`: validate restore files

Dependencies: Phase 1.

- [ ] move existing check into `src/lib/backup.ts#parseBackup` (no behaviour change)
- [ ] red test: malformed item / bad date / string cost rejected
- [ ] fix: per-item validation; SettingsView uses it

### Phase 3 — `fix(settings)`: draft-and-commit inputs

Dependencies: Phase 2 (same file).

- [ ] add jsdom + @testing-library/react; `*.test.tsx` opt-in
- [ ] red tests: field can be cleared; invalid email not saved; lead days not 0 on clear
- [ ] fix in `SettingsView`

### Phase 4 — `fix(harden)`: validation, a11y labels, sign-out cache, stale copy

Dependencies: Phase 3 (touches SettingsView).

### Phase 5 — `feat(demo)`: build-time demo mode with synthetic data

Dependencies: Phase 4 (touches store, AuthGate, Dashboard, Settings).

- [ ] `src/demo/seed.ts` (dates relative to today), `isDemo` flag, store guards
- [ ] `pnpm dev:demo` script; test for seed shape (valid via `parseBackup`)

### Phase 6 — `docs`: README, agent docs, screenshots + GIF

Dependencies: Phase 5 (captures come from demo mode).

- [ ] README: pitch → GIF/screens → why/what it shows → stack → setup
- [ ] trim root CLAUDE.md, add nested CLAUDE.md files, fix stale gate lists
      (vitest missing from SETUP/backpressure), broken `verify` skill reference
- [ ] replace screenshots (current ones show a real email) + add GIF

### Phase 7 — `feat(ui)`: more intuitive UI (owner approval before merge)

Dependencies: Phases 5–6 (demo for captures; refreshes screenshots).

- [ ] prepare on a branch, post before/after screenshots, wait for "yes"

**Automated verification (every phase):** lefthook pre-commit/pre-push and CI
green: eslint, prettier, tsc, vitest, knip, jscpd, secretlint, build.

## Implementation Notes

(filled in as phases land)
