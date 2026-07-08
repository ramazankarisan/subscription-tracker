/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// Unit tests cover the pure logic in src/lib (no DOM needed), so the default
// node environment is enough. Test files are colocated as src/**/*.test.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
