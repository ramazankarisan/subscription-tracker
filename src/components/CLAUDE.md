# src/components

- Read data and call actions through `useAppData()` only.
- Style with the tokens and primitives in `src/styles/`, following `DESIGN.md`.
  No new colors, no UI library.
- Forms render inside `Modal` (focus trap, `inert` background). Destructive
  actions confirm through `ConfirmDialog`.
- Icon-only buttons get an `aria-label` that names the item. Result messages are
  live regions (`role="status"` / `role="alert"`).
- Verify by driving `pnpm dev:demo`. A component bug gets a regression test in a
  colocated `*.test.tsx` that starts with `// @vitest-environment jsdom`.
