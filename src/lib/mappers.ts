/**
 * Convert between Supabase rows (snake_case columns) and the app's domain
 * objects (camelCase). Kept in one place so the persistence layer in
 * `useAppData` stays readable and the column names live in exactly one file.
 */
import type { AppSettings, Installment, Subscription } from '../types';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  cost: number;
  currency: string;
  cycle: string;
  custom_interval_days: number | null;
  next_renewal: string;
  cancel_url: string;
  notes: string;
}

export interface InstallmentRow {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  amount_per_payment: number;
  total_payments: number;
  paid_payments: number;
  first_payment_date: string;
  interval_months: number;
  notes: string;
}

export interface SettingsRow {
  user_id: string;
  reminder_lead_days: number;
  reminder_offsets: number[];
  recipient_email: string;
}

export function rowToSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    name: row.name,
    cost: Number(row.cost),
    currency: row.currency,
    cycle: row.cycle as Subscription['cycle'],
    customIntervalDays: row.custom_interval_days,
    nextRenewal: row.next_renewal,
    cancelUrl: row.cancel_url ?? '',
    notes: row.notes ?? '',
  };
}

export function subscriptionToRow(
  sub: Subscription,
  userId: string,
): SubscriptionRow {
  return {
    id: sub.id,
    user_id: userId,
    name: sub.name,
    cost: sub.cost,
    currency: sub.currency,
    cycle: sub.cycle,
    custom_interval_days: sub.customIntervalDays,
    next_renewal: sub.nextRenewal,
    cancel_url: sub.cancelUrl,
    notes: sub.notes,
  };
}

export function rowToInstallment(row: InstallmentRow): Installment {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    amountPerPayment: Number(row.amount_per_payment),
    totalPayments: row.total_payments,
    paidPayments: row.paid_payments,
    firstPaymentDate: row.first_payment_date,
    intervalMonths: row.interval_months,
    notes: row.notes ?? '',
  };
}

export function installmentToRow(
  inst: Installment,
  userId: string,
): InstallmentRow {
  return {
    id: inst.id,
    user_id: userId,
    name: inst.name,
    currency: inst.currency,
    amount_per_payment: inst.amountPerPayment,
    total_payments: inst.totalPayments,
    paid_payments: inst.paidPayments,
    first_payment_date: inst.firstPaymentDate,
    interval_months: inst.intervalMonths,
    notes: inst.notes,
  };
}

export function rowToSettings(row: SettingsRow): AppSettings {
  return {
    reminderLeadDays: row.reminder_lead_days,
    reminderOffsets: row.reminder_offsets ?? [3, 0],
    recipientEmail: row.recipient_email ?? '',
  };
}

export function settingsToRow(
  settings: AppSettings,
  userId: string,
): SettingsRow {
  return {
    user_id: userId,
    reminder_lead_days: settings.reminderLeadDays,
    reminder_offsets: settings.reminderOffsets,
    recipient_email: settings.recipientEmail,
  };
}
