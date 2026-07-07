/**
 * Turns the stored data into a flat, sorted list of things that need attention
 * "soon" (within the user's lead-time window, including anything overdue).
 *
 * Shared by the Dashboard (to render) and the email sender (to summarise), so
 * both always agree on what counts as due.
 */
import type { AppData, Installment, Subscription } from '../types';
import { daysUntil, nextInstallmentDate } from './dates';

export interface DueSubscription {
  kind: 'subscription';
  id: string;
  subscription: Subscription;
  dueDate: string;
  days: number;
}

export interface DueInstallment {
  kind: 'installment';
  id: string;
  installment: Installment;
  dueDate: string;
  days: number;
  /** 1-indexed number of the payment coming due. */
  paymentNumber: number;
}

export type DueItem = DueSubscription | DueInstallment;

/** Items due within `leadDays` (negative days = overdue, still included). */
export function getDueItems(data: AppData, leadDays: number): DueItem[] {
  const items: DueItem[] = [];

  for (const subscription of data.subscriptions) {
    const days = daysUntil(subscription.nextRenewal);
    if (days <= leadDays) {
      items.push({
        kind: 'subscription',
        id: subscription.id,
        subscription,
        dueDate: subscription.nextRenewal,
        days,
      });
    }
  }

  for (const installment of data.installments) {
    const dueDate = nextInstallmentDate(
      installment.firstPaymentDate,
      installment.paidPayments,
      installment.totalPayments,
      installment.intervalMonths,
    );
    if (dueDate === null) {
      continue;
    }
    const days = daysUntil(dueDate);
    if (days <= leadDays) {
      items.push({
        kind: 'installment',
        id: installment.id,
        installment,
        dueDate,
        days,
        paymentNumber: installment.paidPayments + 1,
      });
    }
  }

  // Soonest (and most-overdue) first.
  items.sort((a, b) => a.days - b.days);
  return items;
}
