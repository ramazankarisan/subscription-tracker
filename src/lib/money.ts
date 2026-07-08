/** Money helpers that need the domain model but no React. */
import type { Subscription } from '../types';

/** Convert any billing cycle to an approximate monthly cost. */
export function monthlyEquivalent(subscription: Subscription): number {
  const averageDaysPerMonth = 365.25 / 12;
  switch (subscription.cycle) {
    case 'weekly':
      return (subscription.cost * 52) / 12;
    case 'monthly':
      return subscription.cost;
    case 'quarterly':
      return subscription.cost / 3;
    case 'yearly':
      return subscription.cost / 12;
    case 'custom':
      return subscription.customIntervalDays
        ? (subscription.cost * averageDaysPerMonth) /
            subscription.customIntervalDays
        : 0;
  }
}
