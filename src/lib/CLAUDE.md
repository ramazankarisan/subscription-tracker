# src/lib

Pure logic, no React. This is where the unit tests live.

- All calendar math goes through `dates.ts` (date-fns). No date arithmetic
  anywhere else.
- DB column names live only in `mappers.ts`.
- Any logic change comes with a colocated `*.test.ts`. Test globals are on;
  `src/test/setupTests.ts` pins "now" to 2026-07-01, so build date-relative
  fixtures inside a test, not at module level.
- `dates.ts` logic is mirrored in `supabase/functions/send-reminders/`. Change
  both together.
