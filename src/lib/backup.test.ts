import type { AppData } from '../types';
import { parseBackup } from './backup';
import { exportData } from './storage';

const valid: AppData = {
  subscriptions: [
    {
      id: '6f1c2a4e-8b1d-4c1e-9a55-0d2b8f3e7a10',
      name: 'Streaming',
      cost: 12.99,
      currency: 'EUR',
      cycle: 'monthly',
      customIntervalDays: null,
      nextRenewal: '2026-07-10',
      cancelUrl: '',
      notes: '',
    },
  ],
  installments: [
    {
      id: '0b7e9d3c-2f4a-4e8b-b1c6-5a9d7e2f4c31',
      name: 'Laptop',
      currency: 'EUR',
      amountPerPayment: 49.99,
      totalPayments: 12,
      paidPayments: 3,
      firstPaymentDate: '2026-04-01',
      intervalMonths: 1,
      notes: '',
    },
  ],
  settings: {
    reminderLeadDays: 7,
    reminderOffsets: [3, 0],
    recipientEmail: '',
  },
};

// Ids are always regenerated, so match any id.
function anyIds(data: AppData) {
  const anyId = { id: expect.any(String) as unknown };
  return {
    ...data,
    subscriptions: data.subscriptions.map((item) => ({ ...item, ...anyId })),
    installments: data.installments.map((item) => ({ ...item, ...anyId })),
  };
}

// Overwrite one field of the first subscription / installment in a backup.
function withSubscription(patch: Record<string, unknown>): string {
  return JSON.stringify({
    ...valid,
    subscriptions: [{ ...valid.subscriptions[0], ...patch }],
  });
}
function withInstallment(patch: Record<string, unknown>): string {
  return JSON.stringify({
    ...valid,
    installments: [{ ...valid.installments[0], ...patch }],
  });
}

describe('parseBackup', () => {
  it('accepts a file produced by Export', () => {
    expect(parseBackup(exportData(valid))).toEqual(anyIds(valid));
  });

  it('rejects text that is not JSON', () => {
    expect(parseBackup('not json')).toBeNull();
  });

  it('rejects a file without the two lists', () => {
    expect(parseBackup('{"subscriptions": []}')).toBeNull();
  });

  // Each of these would make the insert fail after the delete already ran,
  // leaving the account empty.
  it.each([
    ['a missing name', { name: undefined }],
    ['a blank name', { name: '   ' }],
    ['a text cost', { cost: '12.99' }],
    ['a negative cost', { cost: -1 }],
    ['an unknown cycle', { cycle: 'daily' }],
    ['an invalid renewal date', { nextRenewal: '2026-13-45' }],
    ['a partial renewal date', { nextRenewal: '2026-07' }],
    ['a custom cycle without an interval', { cycle: 'custom' }],
    ['notes that are not text', { notes: 42 }],
  ])('rejects a subscription with %s', (_label, patch) => {
    expect(parseBackup(withSubscription(patch))).toBeNull();
  });

  it.each([
    ['a fractional payment count', { totalPayments: 1.5 }],
    ['more paid than total', { paidPayments: 13 }],
    ['a zero interval', { intervalMonths: 0 }],
    ['a count beyond a Postgres integer', { totalPayments: 3_000_000_000 }],
    ['a missing first payment date', { firstPaymentDate: undefined }],
  ])('rejects an installment with %s', (_label, patch) => {
    expect(parseBackup(withInstallment(patch))).toBeNull();
  });

  it('rejects settings with the wrong types', () => {
    const text = JSON.stringify({
      ...valid,
      settings: { ...valid.settings, reminderOffsets: '3,0' },
    });
    expect(parseBackup(text)).toBeNull();
  });

  it('fills optional fields an older backup may lack', () => {
    const bare: Record<string, unknown> = { ...valid.subscriptions[0] };
    delete bare.notes;
    delete bare.cancelUrl;
    const parsed = parseBackup(
      JSON.stringify({ ...valid, subscriptions: [bare], settings: undefined }),
    );
    expect(parsed).toEqual(anyIds(valid));
  });

  it('gives every item a fresh id, so restored rows never collide', () => {
    const duplicate = valid.subscriptions[0];
    const parsed = parseBackup(
      JSON.stringify({ ...valid, subscriptions: [duplicate, duplicate] }),
    );
    const ids = parsed?.subscriptions.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain(duplicate.id);
  });
});
