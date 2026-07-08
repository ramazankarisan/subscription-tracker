import type { Subscription } from '../types';
import { monthlyEquivalent } from './money';

function makeSubscription(
  overrides: Partial<Subscription> & Pick<Subscription, 'cycle' | 'cost'>,
): Subscription {
  return {
    id: 's',
    name: 's',
    currency: 'EUR',
    customIntervalDays: null,
    nextRenewal: '2026-07-01',
    cancelUrl: '',
    notes: '',
    ...overrides,
  };
}

describe('monthlyEquivalent', () => {
  it('returns the cost as-is for a monthly cycle', () => {
    expect(
      monthlyEquivalent(makeSubscription({ cycle: 'monthly', cost: 10 })),
    ).toBe(10);
  });

  it('normalises a weekly cost to cost × 52 / 12', () => {
    expect(
      monthlyEquivalent(makeSubscription({ cycle: 'weekly', cost: 12 })),
    ).toBe(52);
  });

  it('divides a quarterly cost by 3', () => {
    expect(
      monthlyEquivalent(makeSubscription({ cycle: 'quarterly', cost: 30 })),
    ).toBe(10);
  });

  it('divides a yearly cost by 12', () => {
    expect(
      monthlyEquivalent(makeSubscription({ cycle: 'yearly', cost: 120 })),
    ).toBe(10);
  });

  it('prorates a custom interval by average days per month', () => {
    // 30 over a 30-day interval ≈ 30 × (365.25/12) / 30 = 30.4375 / month.
    expect(
      monthlyEquivalent(
        makeSubscription({ cycle: 'custom', cost: 30, customIntervalDays: 30 }),
      ),
    ).toBeCloseTo(30.4375, 4);
  });

  it('returns 0 for a custom cycle with no interval set', () => {
    expect(
      monthlyEquivalent(
        makeSubscription({
          cycle: 'custom',
          cost: 30,
          customIntervalDays: null,
        }),
      ),
    ).toBe(0);
  });
});
