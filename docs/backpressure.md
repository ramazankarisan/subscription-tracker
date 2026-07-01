# Backpressure — quality gates

**Backpressure** = automated gates that push back so low-quality changes can't flow
through unchecked. Two directions:

- **Against the agent** — a Claude Code **Stop hook** that blocks Claude from finishing a
  turn while gates fail on changed files.
- **Against the developer** — **git hooks** (pre-commit / pre-push) via
  [lefthook](https://lefthook.dev).

Every gate is **scoped to changed/staged files** and **no-op-safe** (an empty change set
skips the gate). We wire only tools the project already uses, plus `knip` and `secretlint`
which were added deliberately.

## Active gates

| Where | Gate | Command (scoped) | Blocking? |
|---|---|---|---|
| **Stop hook** (agent) | format | `prettier --check` on changed files | yes (`exit 2`) |
| | lint | `oxlint --deny-warnings` on changed `*.ts,*.tsx` | yes |
| | typecheck | `tsc -b --noEmit` (whole-program, incremental) | yes |
| | secrets | `secretlint` on changed files | yes |
| **pre-commit** (lefthook) | format | `prettier --write` on staged (re-staged) | yes |
| | lint | `oxlint --deny-warnings` on staged `*.ts,*.tsx` | yes |
| | secrets | `secretlint` on staged | yes |
| **pre-push** (lefthook) | typecheck | `tsc -b --noEmit` | yes |
| | dead code | `knip --production --strict` | yes |
| | build | `vite build` | yes |
| **CI** (GitHub Actions) | all of the above on push/PR | see `.github/workflows/ci.yml` | yes |

`knip` runs whole-project by design (no changed-files mode) → pre-push / CI only, never
pre-commit. `oxlint` has no cache (raw Rust) and no native changed flag, so the file list
is passed explicitly.

## How to bypass (when you must)

- **git hooks:** `git commit --no-verify` / `git push --no-verify`.
- **a single lefthook command:** `LEFTHOOK_EXCLUDE=lint git commit …`.
- **the Stop hook:** remove the `hooks.Stop` block from `.claude/settings.json` (or delete
  `.claude/hooks/backpressure-stop.sh`).

Bypassing is for emergencies — CI runs the same gates and will fail the PR regardless.

## Maintenance

Gate commands live in `lefthook.yml`, `.claude/hooks/backpressure-stop.sh`, and
`.github/workflows/ci.yml`. Tool configs: `.oxlintrc.json`, `.prettierrc.json`,
`.secretlintrc.json`, `knip.json`. Hooks are installed by `lefthook install`, run
automatically by the `prepare` script on `pnpm install`.
