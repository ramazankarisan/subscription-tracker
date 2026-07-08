/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// Unit tests cover the pure logic in src/lib (no DOM needed), so the default
// node environment is enough. `globals` exposes describe/it/expect/vi without
// per-file imports; the shared setup (deterministic clock) lives in setupTests.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setupTests.ts'],
    include: ['src/**/*.test.ts'],
  },
});
