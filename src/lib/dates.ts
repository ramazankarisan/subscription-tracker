/**
 * Date helpers. All calendar arithmetic goes through date-fns so month/leap-year
 * edge cases (e.g. Jan 31 + 1 month) behave sensibly.
 *
 * Dates cross the app as ISO day strings ("yyyy-MM-dd"). We convert to/from real
 * Date objects only inside this module.
 */
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from 'date-fns';

import type { BillingCycle } from '../types';

/** Today as an ISO day string, e.g. "2026-07-01". */
export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** True if the string is a parseable ISO day. */
export function isValidIso(iso: string): boolean {
  return Boolean(iso) && isValid(parseISO(iso));
}

/**
 * Whole calendar days from today until `iso`.
 * Negative = in the past, 0 = today, positive = in the future.
 */
export function daysUntil(iso: string): number {
  return differenceInCalendarDays(parseISO(iso), new Date());
}

/** Add exactly one billing cycle to an ISO date, returning a new ISO date. */
export function advanceByCycle(
  iso: string,
  cycle: BillingCycle,
  customIntervalDays: number | null,
): string {
  const date = parseISO(iso);
  let next: Date;
  switch (cycle) {
    case 'weekly':
      next = addWeeks(date, 1);
      break;
    case 'monthly':
      next = addMonths(date, 1);
      break;
    case 'quarterly':
      next = addMonths(date, 3);
      break;
    case 'yearly':
      next = addYears(date, 1);
      break;
    case 'custom':
      next = addDays(date, Math.max(1, customIntervalDays ?? 1));
      break;
  }
  return format(next, 'yyyy-MM-dd');
}

/**
 * Roll a renewal date forward by whole cycles until it is today or later.
 * Handles the case where the app wasn't opened for a while and a date lapsed.
 */
export function rollForwardToFuture(
  iso: string,
  cycle: BillingCycle,
  customIntervalDays: number | null,
): string {
  let result = iso;
  // Guard against a pathological custom interval of 0 causing an infinite loop.
  let safety = 0;
  while (daysUntil(result) < 0 && safety < 1000) {
    result = advanceByCycle(result, cycle, customIntervalDays);
    safety += 1;
  }
  return result;
}

/**
 * The date of the next unpaid installment payment, or null once the plan is
 * fully paid. Payment N (0-indexed) falls on firstPaymentDate + N intervals.
 */
export function nextInstallmentDate(
  firstPaymentDate: string,
  paidPayments: number,
  totalPayments: number,
  intervalMonths: number,
): string | null {
  if (paidPayments >= totalPayments) return null;
  const next = addMonths(
    parseISO(firstPaymentDate),
    paidPayments * Math.max(1, intervalMonths),
  );
  return format(next, 'yyyy-MM-dd');
}

/** Human-friendly date, e.g. "1 Jul 2026", in the user's locale. */
export function formatDate(iso: string): string {
  if (!isValidIso(iso)) return '—';
  return parseISO(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** A short relative phrase: "Today", "Tomorrow", "in 5 days", "3 days ago". */
export function relativeDayLabel(iso: string): string {
  const days = daysUntil(iso);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}
