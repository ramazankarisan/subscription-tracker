/**
 * Core domain types for the tracker.
 *
 * Everything is persisted to the browser's localStorage (see `lib/storage.ts`),
 * so all shapes are plain JSON-serialisable data — no Date objects, dates are
 * stored as ISO day strings ("yyyy-MM-dd").
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

/** EmailJS credentials + recipient, all entered by the user in Settings. */
export interface EmailSettings {
  enabled: boolean;
  /** Send a summary automatically when the app is opened (once per day). */
  autoSendOnOpen: boolean;
  serviceId: string;
  templateId: string;
  publicKey: string;
  toEmail: string;
}

export interface AppSettings {
  /** Remind about anything due within this many days. */
  reminderLeadDays: number;
  email: EmailSettings;
  /** Guard so the auto-email fires at most once per day, ISO "yyyy-MM-dd". */
  lastEmailSentDate: string | null;
}

/** The full persisted state blob. */
export interface AppData {
  subscriptions: Subscription[];
  installments: Installment[];
  settings: AppSettings;
}
