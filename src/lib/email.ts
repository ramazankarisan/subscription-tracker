/**
 * Client-side email via EmailJS (https://www.emailjs.com/). No backend: the
 * browser calls EmailJS directly using the user's own service/template/public
 * key, which they enter on the Settings page.
 *
 * The EmailJS template is expected to reference three variables:
 *   {{to_email}}, {{subject}}, {{message}}
 */
import emailjs from '@emailjs/browser';

import type { EmailSettings } from '../types';
import { formatDate, relativeDayLabel } from './dates';
import { formatCurrency } from './format';
import type { DueItem } from './reminders';

/** True only when every field needed to actually send is filled in. */
export function isEmailConfigured(email: EmailSettings): boolean {
  return Boolean(
    email.serviceId && email.templateId && email.publicKey && email.toEmail,
  );
}

/** One plain-text line describing a due item, used in the email body. */
function describeItem(item: DueItem): string {
  const when = `${relativeDayLabel(item.dueDate)} (${formatDate(item.dueDate)})`;
  if (item.kind === 'subscription') {
    const { name, cost, currency, cancelUrl } = item.subscription;
    const price = formatCurrency(cost, currency);
    const cancel = cancelUrl ? ` — cancel: ${cancelUrl}` : '';
    return `• ${name} renews ${when} — ${price}${cancel}`;
  }
  const { name, amountPerPayment, currency, totalPayments } = item.installment;
  const left = totalPayments - item.paymentNumber + 1;
  const price = formatCurrency(amountPerPayment, currency);
  return `• ${name}: payment ${item.paymentNumber}/${totalPayments} due ${when} — ${price} (${left} left)`;
}

/** Assemble the multi-line message body from the due items. */
export function buildReminderMessage(items: DueItem[]): string {
  const lines = items.map(describeItem);
  return [
    `You have ${items.length} item${items.length === 1 ? '' : 's'} coming up:`,
    '',
    ...lines,
    '',
    '— Sent from your Subscription & Installment Tracker',
  ].join('\n');
}

/**
 * Send the reminder email. Throws if EmailJS rejects (caller handles the error
 * and surfaces it to the user).
 */
export async function sendReminderEmail(
  email: EmailSettings,
  items: DueItem[],
): Promise<void> {
  const subject = `Reminder: ${items.length} item${
    items.length === 1 ? '' : 's'
  } need attention`;

  await emailjs.send(
    email.serviceId,
    email.templateId,
    {
      to_email: email.toEmail,
      subject,
      message: buildReminderMessage(items),
    },
    { publicKey: email.publicKey },
  );
}
