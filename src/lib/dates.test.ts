import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advanceByCycle,
  daysUntil,
  isValidIso,
  nextInstallmentDate,
  relativeDayLabel,
  rollForwardToFuture,
  todayIso,
} from './dates';

// Pin "now" so day-relative helpers are deterministic. Noon avoids timezone
// boundary flips around midnight.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('todayIso', () => {
  it('returns the pinned day as an ISO string', () => {
    expect(todayIso()).toBe('2026-07-01');
  });
});

describe('daysUntil', () => {
  it('is positive in the future, negative in the past, 0 today', () => {
    expect(daysUntil('2026-07-08')).toBe(7);
    expect(daysUntil('2026-06-28')).toBe(-3);
    expect(daysUntil('2026-07-01')).toBe(0);
  });
});

describe('advanceByCycle', () => {
  it('advances each cycle by one period', () => {
    expect(advanceByCycle('2026-07-01', 'weekly', null)).toBe('2026-07-08');
    expect(advanceByCycle('2026-07-01', 'monthly', null)).toBe('2026-08-01');
    expect(advanceByCycle('2026-07-01', 'quarterly', null)).toBe('2026-10-01');
    expect(advanceByCycle('2026-07-01', 'yearly', null)).toBe('2027-07-01');
    expect(advanceByCycle('2026-07-01', 'custom', 10)).toBe('2026-07-11');
  });

  it('clamps a month overflow (Jan 31 + 1 month) to the month end', () => {
    expect(advanceByCycle('2026-01-31', 'monthly', null)).toBe('2026-02-28');
  });
});

describe('rollForwardToFuture', () => {
  it('rolls a lapsed date forward by whole cycles until it is not past', () => {
    // 2026-04-15 monthly, "today" 2026-07-01 → 2026-07-15.
    expect(rollForwardToFuture('2026-04-15', 'monthly', null)).toBe(
      '2026-07-15',
    );
  });

  it('leaves a future date unchanged', () => {
    expect(rollForwardToFuture('2026-09-01', 'monthly', null)).toBe(
      '2026-09-01',
    );
  });
});

describe('nextInstallmentDate', () => {
  it('is firstPaymentDate + paidPayments intervals', () => {
    expect(nextInstallmentDate('2026-01-15', 2, 12, 1)).toBe('2026-03-15');
  });

  it('is null once the plan is fully paid', () => {
    expect(nextInstallmentDate('2026-01-15', 12, 12, 1)).toBeNull();
  });
});

describe('relativeDayLabel', () => {
  it('renders friendly relative phrases', () => {
    expect(relativeDayLabel('2026-07-01')).toBe('Today');
    expect(relativeDayLabel('2026-07-02')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-06-30')).toBe('Yesterday');
    expect(relativeDayLabel('2026-07-06')).toBe('in 5 days');
    expect(relativeDayLabel('2026-06-28')).toBe('3 days ago');
  });
});

describe('isValidIso', () => {
  it('accepts an ISO day and rejects junk', () => {
    expect(isValidIso('2026-07-01')).toBe(true);
    expect(isValidIso('not-a-date')).toBe(false);
    expect(isValidIso('')).toBe(false);
  });
});
