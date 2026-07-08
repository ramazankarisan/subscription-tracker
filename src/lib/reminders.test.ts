import type { AppData, Installment, Subscription } from '../types';
import { getDueItems } from './reminders';

// "now" is pinned to 2026-07-01 by src/test/setupTests.ts.

function makeSubscription(id: string, nextRenewal: string): Subscription {
  return {
    id,
    name: id,
    cost: 10,
    currency: 'EUR',
    cycle: 'monthly',
    customIntervalDays: null,
    nextRenewal,
    cancelUrl: '',
    notes: '',
  };
}

function makeInstallment(
  id: string,
  firstPaymentDate: string,
  paid: number,
): Installment {
  return {
    id,
    name: id,
    currency: 'EUR',
    amountPerPayment: 50,
    totalPayments: 12,
    paidPayments: paid,
    firstPaymentDate,
    intervalMonths: 1,
    notes: '',
  };
}

function makeData(
  subscriptions: Subscription[],
  installments: Installment[],
): AppData {
  return {
    subscriptions,
    installments,
    settings: {
      reminderLeadDays: 7,
      reminderOffsets: [3, 0],
      recipientEmail: '',
    },
  };
}

describe('getDueItems', () => {
  it('includes items within the lead window and excludes those beyond it', () => {
    const data = makeData(
      [
        makeSubscription('soon', '2026-07-03'),
        makeSubscription('far', '2026-08-15'),
      ],
      [],
    );
    const due = getDueItems(data, 7);
    expect(due.map((item) => item.id)).toEqual(['soon']);
  });

  it('includes overdue items and sorts most-overdue/soonest first', () => {
    const data = makeData(
      [
        makeSubscription('overdue', '2026-06-20'),
        makeSubscription('soon', '2026-07-05'),
      ],
      [makeInstallment('plan', '2026-07-03', 0)],
    );
    const due = getDueItems(data, 7);
    // overdue (-11) < plan (2) < soon (4)
    expect(due.map((item) => item.id)).toEqual(['overdue', 'plan', 'soon']);
  });

  it('sets a 1-indexed paymentNumber and skips fully-paid plans', () => {
    const data = makeData(
      [],
      [
        makeInstallment('active', '2026-07-02', 3),
        makeInstallment('done', '2026-01-01', 12),
      ],
    );
    const due = getDueItems(data, 400);
    expect(due).toHaveLength(1);
    const item = due[0];
    expect(item.kind).toBe('installment');
    if (item.kind === 'installment') {
      expect(item.paymentNumber).toBe(4);
    }
  });
});
