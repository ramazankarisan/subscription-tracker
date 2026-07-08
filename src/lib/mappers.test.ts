import { describe, expect, it } from 'vitest';

import {
  installmentToRow,
  rowToInstallment,
  rowToSettings,
  rowToSubscription,
  subscriptionToRow,
  type InstallmentRow,
  type SettingsRow,
  type SubscriptionRow,
} from './mappers';

describe('subscription mapping', () => {
  const row: SubscriptionRow = {
    id: 's1',
    user_id: 'u1',
    name: 'Netflix',
    cost: 12.99,
    currency: 'EUR',
    cycle: 'monthly',
    custom_interval_days: null,
    next_renewal: '2026-07-10',
    cancel_url: '',
    notes: '',
  };

  it('maps a row to camelCase domain object', () => {
    const subscription = rowToSubscription(row);
    expect(subscription.nextRenewal).toBe('2026-07-10');
    expect(subscription.customIntervalDays).toBeNull();
    expect(subscription.cost).toBe(12.99);
  });

  it('round-trips through row → domain → row with the given userId', () => {
    const back = subscriptionToRow(rowToSubscription(row), 'u2');
    expect(back.user_id).toBe('u2');
    expect(back.next_renewal).toBe(row.next_renewal);
    expect(back.name).toBe(row.name);
  });

  it('coerces null text columns to empty strings', () => {
    const subscription = rowToSubscription({
      ...row,
      cancel_url: null as unknown as string,
      notes: null as unknown as string,
    });
    expect(subscription.cancelUrl).toBe('');
    expect(subscription.notes).toBe('');
  });
});

describe('installment mapping', () => {
  const row: InstallmentRow = {
    id: 'i1',
    user_id: 'u1',
    name: 'Phone',
    currency: 'EUR',
    amount_per_payment: 49.99,
    total_payments: 12,
    paid_payments: 3,
    first_payment_date: '2026-01-15',
    interval_months: 1,
    notes: '',
  };

  it('maps amount_per_payment to a number', () => {
    const installment = rowToInstallment({
      ...row,
      amount_per_payment: '49.99' as unknown as number,
    });
    expect(installment.amountPerPayment).toBe(49.99);
  });

  it('round-trips through row → domain → row', () => {
    const back = installmentToRow(rowToInstallment(row), 'u3');
    expect(back.user_id).toBe('u3');
    expect(back.first_payment_date).toBe(row.first_payment_date);
    expect(back.paid_payments).toBe(3);
  });
});

describe('settings mapping', () => {
  it('defaults null reminder_offsets to [3, 0]', () => {
    const row: SettingsRow = {
      user_id: 'u1',
      reminder_lead_days: 5,
      reminder_offsets: null as unknown as number[],
      recipient_email: null as unknown as string,
    };
    const settings = rowToSettings(row);
    expect(settings.reminderOffsets).toEqual([3, 0]);
    expect(settings.recipientEmail).toBe('');
    expect(settings.reminderLeadDays).toBe(5);
  });
});
