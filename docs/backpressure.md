# Backpressure — quality gates

**Backpressure** = automated gates that push back so low-quality changes can't flow
through unchecked. Two directions:

- **Against the agent** — a Claude Code **Stop hook** that blocks Claude from finishing a
  turn while gates fail on changed files.
- **Against the developer** — **git hooks** (pre-commit / pre-push) via
  [lefthook](https://lefthook.dev).

Every gate is **scoped to changed/staged files** and **no-op-safe** (an empty change set
skips the gate). We wire only tools the project already uses, plus `knip`, `secretlint`,
and `jscpd` which were added deliberately.

## Active gates

| Where                     | Gate                        | Command (scoped)                                       | Blocking?      |
| ------------------------- | --------------------------- | ------------------------------------------------------ | -------------- |
| **Stop hook** (agent)     | format                      | `prettier --check` on changed files                    | yes (`exit 2`) |
|                           | lint                        | `eslint --max-warnings 0` on changed `src/**/*.ts,tsx` | yes            |
|                           | typecheck                   | `tsc -b --noEmit` (whole-program, incremental)         | yes            |
|                           | duplication                 | `jscpd -c .jscpd.json src` (when `src/*` changed)      | yes            |
|                           | secrets                     | `secretlint` on changed files                          | yes            |
| **pre-commit** (lefthook) | format                      | `prettier --write` on staged (re-staged)               | yes            |
|                           | lint                        | `eslint --max-warnings 0` on staged `src/**/*.ts,tsx`  | yes            |
|                           | secrets                     | `secretlint` on staged                                 | yes            |
| **pre-push** (lefthook)   | typecheck                   | `tsc -b --noEmit`                                      | yes            |
|                           | dead code                   | `knip --production --strict`                           | yes            |
|                           | duplication                 | `jscpd -c .jscpd.json src`                             | yes            |
|                           | build                       | `vite build`                                           | yes            |
| **CI** (GitHub Actions)   | all of the above on push/PR | see `.github/workflows/ci.yml`                         | yes            |

`knip` and `jscpd` run whole-project by design (no changed-files mode) → pre-push / CI
(and, for `jscpd`, the Stop hook when any `src/*` file changed), never pre-commit.

### One linter (ESLint)

ESLint is the **single** linter (config: `eslint.config.js`, scoped to `src/`; the Deno
`supabase/**` bundle is excluded). It enforces, in one pass:

- **strict TypeScript** — `no-explicit-any`, `consistent-type-imports`,
  `no-non-null-assertion`, `array-type`, `ban-ts-comment` (`typescript-eslint`);
- **React** — `rules-of-hooks`, `jsx-key`, `no-danger`, `self-closing-comp`,
  `only-export-components` (`eslint-plugin-react` / `-hooks` / `-refresh`);
- **general** — `curly` (no braceless blocks), `eqeqeq`, `no-var`, `no-else-return`, …;
- **no abbreviations** — `unicorn/name-replacements` flags over-abbreviated names
  (`prev`, `err`, `res`); domain/React terms (`props`, `ref`, `env`, `db`, `fn`, …) are
  allow-listed. This rule exists **only** in ESLint's ecosystem — neither oxlint nor biome
  implements it, which is why ESLint (not a faster Rust linter) is the choice here.

`--max-warnings 0` makes every warning blocking. `jscpd` is a copy-paste detector (not a
lint rule): `.jscpd.json` sets a **ratchet threshold** (max duplication %) just above the
current baseline — it passes today but blocks a change that adds meaningful new
duplication. `supabase/**` is excluded (its date/message logic is duplicated from `src/`
**on purpose**). Lower the threshold as existing clones are refactored away.

## How to bypass (when you must)

- **git hooks:** `git commit --no-verify` / `git push --no-verify`.
- **a single lefthook command:** `LEFTHOOK_EXCLUDE=lint git commit …`.
- **the Stop hook:** remove the `hooks.Stop` block from `.claude/settings.json` (or delete
  `.claude/hooks/backpressure-stop.sh`).

Bypassing is for emergencies — CI runs the same gates and will fail the PR regardless.

## Maintenance

Gate commands live in `lefthook.yml`, `.claude/hooks/backpressure-stop.sh`, and
`.github/workflows/ci.yml`. Tool configs: `eslint.config.js`, `.jscpd.json`,
`.prettierrc.json`, `.secretlintrc.json`, `knip.json`. Hooks are installed
by `lefthook install`, run automatically by the `prepare` script on `pnpm install`.
