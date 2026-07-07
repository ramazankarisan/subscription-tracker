#!/usr/bin/env bash
# Agent backpressure: block Claude from finishing a turn while quality gates fail
# on CHANGED files (working tree + staged + untracked). Fast + scoped + no-op-safe.
# Bypass: remove the Stop hook from .claude/settings.json. See docs/backpressure.md.
set -euo pipefail

# --- read hook input (JSON on stdin) ---
input="$(cat)"
stop_active="$(printf '%s' "$input" | jq -r '.stop_hook_active // false')"

# Infinite-loop guard: if we already blocked once and re-entered, let it stop.
if [ "$stop_active" = "true" ]; then
  exit 0
fi

# --- navigate to repo root (session may start in a subfolder) ---
START_DIR="$PWD"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
trap 'cd "$START_DIR"' EXIT

# Resolve tool binaries locally — avoids the pnpm supply-chain wrapper and any
# PATH surprises when the hook is invoked outside a package-manager context.
export PATH="$ROOT/node_modules/.bin:$PATH"

# --- collect changed files (added/copied/modified/renamed; excludes deletions) ---
CHANGED="$(
  { git diff --diff-filter=ACMR --name-only;
    git diff --diff-filter=ACMR --name-only --staged;
    git ls-files --others --exclude-standard; } | sort -u
)"

# nothing relevant changed → let the agent stop
if [ -z "$CHANGED" ]; then
  exit 0
fi

TS_FILES="$(printf '%s\n' "$CHANGED" | grep -E '\.(ts|tsx)$' || true)"

failures=""

# format (changed, check-only — auto-fix belongs to pre-commit / PostToolUse)
if ! out="$(printf '%s\n' "$CHANGED" | xargs prettier --check --cache --ignore-unknown --no-error-on-unmatched-pattern 2>&1)"; then
  failures="${failures}\n## format failed:\n${out}"
fi

# lint (changed src/*.ts,tsx only) — single ESLint pass: strict TS + React +
# curly + no-abbreviation naming. Warnings are errors (--max-warnings 0).
SRC_TS_FILES="$(printf '%s\n' "$TS_FILES" | grep -E '^src/' || true)"
if [ -n "$SRC_TS_FILES" ]; then
  if ! out="$(printf '%s\n' "$SRC_TS_FILES" | xargs eslint --max-warnings 0 --no-error-on-unmatched-pattern 2>&1)"; then
    failures="${failures}\n## lint failed:\n${out}"
  fi
fi

# duplication — whole-project (like typecheck/knip: a change can add a clone
# anywhere). Cheap (Rust cpd, ~ms), ratchet threshold lives in .jscpd.json.
if printf '%s\n' "$TS_FILES" | grep -qE '^src/'; then
  if ! out="$(jscpd -c .jscpd.json src 2>&1)"; then
    failures="${failures}\n## duplication (jscpd) failed:\n${out}"
  fi
fi

# typecheck (whole-program incremental — catches untouched importers of the change)
if ! out="$(tsc -b --noEmit 2>&1)"; then
  failures="${failures}\n## typecheck failed:\n${out}"
fi

# secrets (changed files)
if ! out="$(printf '%s\n' "$CHANGED" | xargs secretlint --secretlintignore .gitignore 2>&1)"; then
  failures="${failures}\n## secrets failed:\n${out}"
fi

if [ -n "$failures" ]; then
  # exit 2 + stderr → blocks the stop and feeds the message back to the agent
  printf 'Backpressure gates failed. Fix before finishing:%b\n' "$failures" >&2
  exit 2
fi

exit 0
