/**
 * Parse a backup file (Settings → Import) before anything is replaced.
 *
 * Restore deletes the account's rows and then inserts the file's, so every
 * item must be valid up front: one bad row would fail the insert after the
 * delete already ran. Optional fields an older export may lack get defaults.
 * Every item gets a fresh id: ids are global primary keys, so reusing them
 * collides with duplicates in the file or with rows of another account.
 */
import type {
  AppData,
  AppSettings,
  BillingCycle,
  Installment,
  Subscription,
} from '../types';
import { isValidIso } from './dates';
import { defaultSettings } from './storage';

type Fields = Record<string, unknown>;

const CYCLES = new Set<BillingCycle>([
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'custom',
]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_INT4 = 2_147_483_647; // Postgres `integer`

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function isCount(value: unknown, minimum: number): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= MAX_INT4
  );
}
function isDay(value: unknown): value is string {
  return typeof value === 'string' && ISO_DAY.test(value) && isValidIso(value);
}
// Optional text: absent → '', anything but a string → invalid (null).
function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return '';
  }
  return typeof value === 'string' ? value : null;
}

function toSubscription(item: unknown): Subscription | null {
  if (!isFields(item)) {
    return null;
  }
  const { name, cost, cycle, nextRenewal, customIntervalDays } = item;
  const currency = optionalText(item.currency);
  const cancelUrl = optionalText(item.cancelUrl);
  const notes = optionalText(item.notes);
  if (
    !isName(name) ||
    !isAmount(cost) ||
    !CYCLES.has(cycle as BillingCycle) ||
    (cycle === 'custom' && !isCount(customIntervalDays, 1)) ||
    !isDay(nextRenewal) ||
    currency === null ||
    cancelUrl === null ||
    notes === null
  ) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    name,
    cost,
    currency: currency || 'EUR',
    cycle: cycle as BillingCycle,
    customIntervalDays:
      cycle === 'custom' ? (customIntervalDays as number) : null,
    nextRenewal,
    cancelUrl,
    notes,
  };
}

function toInstallment(item: unknown): Installment | null {
  if (!isFields(item)) {
    return null;
  }
  const {
    name,
    amountPerPayment,
    totalPayments,
    paidPayments,
    firstPaymentDate,
    intervalMonths,
  } = item;
  const currency = optionalText(item.currency);
  const notes = optionalText(item.notes);
  if (
    !isName(name) ||
    !isAmount(amountPerPayment) ||
    !isCount(totalPayments, 1) ||
    !isCount(paidPayments, 0) ||
    paidPayments > totalPayments ||
    !isDay(firstPaymentDate) ||
    !isCount(intervalMonths, 1) ||
    currency === null ||
    notes === null
  ) {
    return null;
  }
  return {
    id: crypto.randomUUID(),
    name,
    currency: currency || 'EUR',
    amountPerPayment,
    totalPayments,
    paidPayments,
    firstPaymentDate,
    intervalMonths,
    notes,
  };
}

function toSettings(value: unknown): AppSettings | null {
  if (value === undefined) {
    return defaultSettings;
  }
  if (!isFields(value)) {
    return null;
  }
  const settings = { ...defaultSettings, ...value };
  const { reminderLeadDays, reminderOffsets, recipientEmail } = settings;
  if (
    !isCount(reminderLeadDays, 0) ||
    !Array.isArray(reminderOffsets) ||
    !reminderOffsets.every((offset) => isCount(offset, 0)) ||
    typeof recipientEmail !== 'string'
  ) {
    return null;
  }
  return { reminderLeadDays, reminderOffsets, recipientEmail };
}

/** The parsed backup, or null when any part of it can't be restored. */
export function parseBackup(fileText: string): AppData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    return null;
  }
  if (
    !isFields(parsed) ||
    !Array.isArray(parsed.subscriptions) ||
    !Array.isArray(parsed.installments)
  ) {
    return null;
  }
  const subscriptions = parsed.subscriptions.map(toSubscription);
  const installments = parsed.installments.map(toInstallment);
  const settings = toSettings(parsed.settings);
  if (
    subscriptions.includes(null) ||
    installments.includes(null) ||
    settings === null
  ) {
    return null;
  }
  return {
    subscriptions: subscriptions as Subscription[],
    installments: installments as Installment[],
    settings,
  };
}
