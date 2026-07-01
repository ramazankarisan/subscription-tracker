/**
 * Core domain types for the tracker.
 *
 * Data is persisted per-user in Supabase (see `lib/supabase.ts` +
 * `state/useAppData.tsx`), with a localStorage copy kept purely as an offline
 * read cache (see `lib/storage.ts`). All shapes are plain JSON-serialisable
 * data — no Date objects, dates are stored as ISO day strings ("yyyy-MM-dd").
 */

export type BillingCycle =
  'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

/** A recurring subscription we want to be reminded to review/cancel. */
export interface Subscription {
  id: string;
  name: string;
  cost: number;
  currency: string;
  cycle: BillingCycle;
  /** Only used when `cycle === 'custom'`; days between renewals. */
  customIntervalDays: number | null;
  /** Next renewal / billing date, ISO "yyyy-MM-dd". */
  nextRenewal: string;
  /** Optional deep link to the provider's cancel page. */
  cancelUrl: string;
  notes: string;
}

/** A fixed-length payment plan we want to track progress through. */
export interface Installment {
  id: string;
  name: string;
  currency: string;
  amountPerPayment: number;
  totalPayments: number;
  paidPayments: number;
  /** Date of the first payment, ISO "yyyy-MM-dd". */
  firstPaymentDate: string;
  /** Months between payments (usually 1). */
  intervalMonths: number;
  notes: string;
}

export interface AppSettings {
  /** Dashboard "due soon" window: show anything due within this many days. */
  reminderLeadDays: number;
  /**
   * Which days-before-a-due-date the server should email a reminder.
   * e.g. [3, 0] = 3 days before AND on the due date itself. `0` = on the day.
   */
  reminderOffsets: number[];
  /** Inbox the scheduled reminder emails are sent to (defaults to sign-in email). */
  recipientEmail: string;
}

/** The full persisted state blob. */
export interface AppData {
  subscriptions: Subscription[];
  installments: Installment[];
  settings: AppSettings;
}
