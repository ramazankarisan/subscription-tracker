/**
 * Landing view: at-a-glance totals plus a "due soon" list, and a button to
 * email the reminder on demand. This is what surfaces the "don't forget"
 * information the moment the app is opened.
 */
import { useState } from 'react';

import { formatDate, relativeDayLabel } from '../lib/dates';
import { isEmailConfigured, sendReminderEmail } from '../lib/email';
import { formatCurrency } from '../lib/format';
import { getDueItems, type DueItem } from '../lib/reminders';
import { useAppData } from '../state/useAppData';
import type { Subscription } from '../types';
import { BellIcon, CardIcon, InstallmentsIcon, MailIcon } from './icons';

/** Convert any billing cycle to an approximate monthly cost. */
function monthlyEquivalent(subscription: Subscription): number {
  const averageDaysPerMonth = 365.25 / 12;
  switch (subscription.cycle) {
    case 'weekly':
      return (subscription.cost * 52) / 12;
    case 'monthly':
      return subscription.cost;
    case 'quarterly':
      return subscription.cost / 3;
    case 'yearly':
      return subscription.cost / 12;
    case 'custom':
      return subscription.customIntervalDays
        ? (subscription.cost * averageDaysPerMonth) /
            subscription.customIntervalDays
        : 0;
  }
}

type SendState = 'idle' | 'sending' | 'sent' | 'error';

export function Dashboard({
  onNavigateToSettings,
}: {
  onNavigateToSettings: () => void;
}) {
  const { data, subscriptions, installments, settings, updateSettings } =
    useAppData();
  const leadDays = settings.reminderLeadDays;

  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState('');

  const dueItems = getDueItems(data, leadDays);

  // Totals are summed numerically; the label uses the first item's currency.
  // For a single-currency setup (the common case) this is exact.
  const primaryCurrency =
    subscriptions[0]?.currency ?? installments[0]?.currency ?? 'EUR';

  const monthlySpend = subscriptions.reduce(
    (sum, subscription) => sum + monthlyEquivalent(subscription),
    0,
  );

  const activeInstallments = installments.filter(
    (installment) => installment.paidPayments < installment.totalPayments,
  );
  const remainingDebt = activeInstallments.reduce(
    (sum, installment) =>
      sum +
      (installment.totalPayments - installment.paidPayments) *
        installment.amountPerPayment,
    0,
  );

  const emailReady =
    settings.email.enabled && isEmailConfigured(settings.email);

  const handleSendNow = async () => {
    setSendState('sending');
    setSendError('');
    try {
      await sendReminderEmail(settings.email, dueItems);
      updateSettings({
        lastEmailSentDate: new Date().toISOString().slice(0, 10),
      });
      setSendState('sent');
    } catch (error) {
      setSendState('error');
      setSendError(error instanceof Error ? error.message : 'Failed to send');
    }
  };

  return (
    <section className="view">
      <div className="view-header">
        <h1>Overview</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <CardIcon size={20} />
          </div>
          <span className="stat-value">
            {formatCurrency(monthlySpend, primaryCurrency)}
          </span>
          <span className="stat-label">per month</span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <CardIcon size={20} />
          </div>
          <span className="stat-value">{subscriptions.length}</span>
          <span className="stat-label">
            subscription{subscriptions.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <InstallmentsIcon size={20} />
          </div>
          <span className="stat-value">
            {formatCurrency(remainingDebt, primaryCurrency)}
          </span>
          <span className="stat-label">left to pay</span>
        </div>
        <div className="stat-card">
          <div className="stat-icon">
            <InstallmentsIcon size={20} />
          </div>
          <span className="stat-value">{activeInstallments.length}</span>
          <span className="stat-label">
            active plan{activeInstallments.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="section-heading">
        <BellIcon size={18} />
        <h2>Due within {leadDays} days</h2>
      </div>

      {dueItems.length === 0 ? (
        <p className="empty-state">
          Nothing due soon. You're all caught up. ✅
        </p>
      ) : (
        <ul className="due-list">
          {dueItems.map((item) => (
            <DueRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </ul>
      )}

      <div className="email-box">
        {emailReady ? (
          <>
            <button
              className="button button-primary button-block"
              onClick={handleSendNow}
              disabled={sendState === 'sending' || dueItems.length === 0}
            >
              <MailIcon size={18} />
              {sendState === 'sending'
                ? 'Sending…'
                : dueItems.length === 0
                  ? 'Nothing to email'
                  : `Email me these ${dueItems.length} reminder${
                      dueItems.length === 1 ? '' : 's'
                    }`}
            </button>
            {sendState === 'sent' && (
              <p className="email-status email-status-ok">
                Sent to {settings.email.toEmail}.
              </p>
            )}
            {sendState === 'error' && (
              <p className="email-status email-status-error">{sendError}</p>
            )}
          </>
        ) : (
          <button
            className="button button-ghost button-block"
            onClick={onNavigateToSettings}
          >
            <MailIcon size={18} /> Set up email reminders
          </button>
        )}
      </div>
    </section>
  );
}

function DueRow({ item }: { item: DueItem }) {
  const isOverdue = item.days < 0;
  const pillClass = isOverdue ? 'pill-overdue' : 'pill-soon';

  if (item.kind === 'subscription') {
    const { name, cost, currency } = item.subscription;
    return (
      <li className="due-row">
        <div className="due-icon">
          <CardIcon size={18} />
        </div>
        <div className="due-text">
          <span className="due-name">{name}</span>
          <span className="due-sub">
            Renews {formatDate(item.dueDate)} · {formatCurrency(cost, currency)}
          </span>
        </div>
        <span className={`pill ${pillClass}`}>
          {relativeDayLabel(item.dueDate)}
        </span>
      </li>
    );
  }

  const { name, amountPerPayment, currency, totalPayments } = item.installment;
  return (
    <li className="due-row">
      <div className="due-icon">
        <InstallmentsIcon size={18} />
      </div>
      <div className="due-text">
        <span className="due-name">{name}</span>
        <span className="due-sub">
          Payment {item.paymentNumber}/{totalPayments} ·{' '}
          {formatCurrency(amountPerPayment, currency)}
        </span>
      </div>
      <span className={`pill ${pillClass}`}>
        {relativeDayLabel(item.dueDate)}
      </span>
    </li>
  );
}
