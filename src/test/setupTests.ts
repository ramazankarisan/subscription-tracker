/**
 * Global test setup (registered via vitest `setupFiles`). Pins "now" so every
 * day-relative helper is deterministic; noon avoids timezone midnight flips.
 */
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});
