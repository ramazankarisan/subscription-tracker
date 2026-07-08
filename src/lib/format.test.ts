import { describe, expect, it } from 'vitest';

import { formatCurrency } from './format';

describe('formatCurrency', () => {
  it('formats a EUR amount with two decimals', () => {
    expect(formatCurrency(12.5, 'EUR')).toContain('12.50');
  });

  it('treats a non-finite amount as 0', () => {
    expect(formatCurrency(Number.NaN, 'EUR')).toContain('0');
  });

  it('falls back to "amount code" for an invalid currency code', () => {
    // "EURO" is not a valid ISO 4217 code, so Intl throws and we fall back.
    expect(formatCurrency(10, 'EURO')).toBe('10.00 EURO');
  });

  it('defaults an empty currency to EUR rather than throwing', () => {
    expect(formatCurrency(5, '')).toContain('5');
  });
});
