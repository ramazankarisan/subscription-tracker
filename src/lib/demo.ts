/**
 * Demo mode (`VITE_DEMO=1`, see `pnpm dev:demo`): the app runs on synthetic
 * data with no backend, so it can be tried, screenshotted and hosted without
 * an account. Every action still goes through the real store; only the
 * Supabase reads/writes and emails are skipped. Data resets on reload.
 */
import { addDays, addMonths, format } from 'date-fns';

import type { AuthedUser } from '../state/useAppData';
import type { AppData } from '../types';

export const isDemo = import.meta.env.VITE_DEMO === '1';

export const demoUser: AuthedUser = {
  id: 'demo',
  email: 'demo@example.com',
};

/** Seed data with dates relative to `today`, so something is always due soon. */
export function demoData(today = new Date()): AppData {
  const day = (offset: number) => format(addDays(today, offset), 'yyyy-MM-dd');
  // First payment chosen so payment `paid + 1` falls `dueIn` days from today.
  const planStart = (paid: number, dueIn: number) =>
    format(addMonths(addDays(today, dueIn), -paid), 'yyyy-MM-dd');
  const subscription = {
    currency: 'EUR',
    customIntervalDays: null,
    cancelUrl: '',
    notes: '',
  };
  const installment = { currency: 'EUR', intervalMonths: 1, notes: '' };

  return {
    subscriptions: [
      {
        ...subscription,
        id: 'demo-sub-1',
        name: 'Netflix',
        cost: 13.99,
        cycle: 'monthly',
        nextRenewal: day(2),
        cancelUrl: 'https://www.netflix.com/cancelplan',
      },
      {
        ...subscription,
        id: 'demo-sub-2',
        name: 'Gym membership',
        cost: 34.9,
        cycle: 'monthly',
        nextRenewal: day(-1),
        notes: '3-month notice period',
      },
      {
        ...subscription,
        id: 'demo-sub-3',
        name: 'Spotify Family',
        cost: 17.99,
        cycle: 'monthly',
        nextRenewal: day(9),
      },
      {
        ...subscription,
        id: 'demo-sub-4',
        name: 'iCloud+ 200 GB',
        cost: 2.99,
        cycle: 'monthly',
        nextRenewal: day(16),
      },
      {
        ...subscription,
        id: 'demo-sub-5',
        name: 'Amazon Prime',
        cost: 89.9,
        cycle: 'yearly',
        nextRenewal: day(45),
      },
    ],
    installments: [
      {
        ...installment,
        id: 'demo-plan-1',
        name: 'Laptop (0% plan)',
        amountPerPayment: 99.92,
        totalPayments: 12,
        paidPayments: 4,
        firstPaymentDate: planStart(4, 3),
      },
      {
        ...installment,
        id: 'demo-plan-2',
        name: 'Sofa',
        amountPerPayment: 75,
        totalPayments: 10,
        paidPayments: 9,
        firstPaymentDate: planStart(9, 20),
      },
      {
        ...installment,
        id: 'demo-plan-3',
        name: 'Phone',
        amountPerPayment: 41.63,
        totalPayments: 24,
        paidPayments: 24,
        firstPaymentDate: planStart(24, 0),
      },
    ],
    settings: {
      reminderLeadDays: 7,
      reminderOffsets: [3, 0],
      recipientEmail: demoUser.email,
    },
  };
}
