# CLAUDE.md

Phone-first PWA (Vite + React 19 + TS) for subscription renewals and installment
plans. Supabase holds the data (RLS per user); a daily Edge Function emails
reminders. Product brief: `PRODUCT.md`. Design system: `DESIGN.md`. Decisions and
known limitations: `docs/decisions.md`.

## Workflow (hard rules)

- Never commit or push to `main`. Branch `type/topic` → PR → squash merge.
  Do git work in a worktree under `.claude/worktrees/`, stage only your files,
  Conventional Commits. Fill in `.github/pull_request_template.md`.
- Bug fix = a failing test committed first, then the fix.
- Gates (`docs/backpressure.md`) run in the Stop hook, lefthook and CI. Fix the
  cause; don't bypass them.
- Bigger work: `rpi-research` → `rpi-plan` → `rpi-implement` skills; artefacts go
  in `docs/agents/`.
- Comments: short, one line where possible, the _why_ not the _what_.

## Invariants

- Dates cross the app as ISO day strings (`yyyy-MM-dd`), never `Date` objects.
- Only the store (`src/state/useAppData.tsx`) touches Supabase or localStorage.
  Components call its actions.
- Every write goes through `persist()`, so a failure reverts and shows the banner.
- `pnpm dev:demo` runs with synthetic data and no backend. Use it to drive the UI.

Package rules: `src/lib/CLAUDE.md`, `src/components/CLAUDE.md`,
`supabase/CLAUDE.md`.
