/**
 * Landing view: a distilled at-a-glance summary plus a "due soon & overdue"
 * list, and an unobtrusive test-email action. First-time users (no data yet)
 * see a first-run panel with a clear next step instead of a false "all caught
 * up". This is what surfaces the "don't forget" information on open.
 */
import { useState } from 'react';

import { formatDate, relativeDayLabel } from '../lib/dates';
import { formatCurrency } from '../lib/format';
import { getDueItems, type DueItem } from '../lib/reminders';
import { supabase } from '../lib/supabase';
import { useAppData } from '../state/useAppData';
import type { Subscription } from '../types';
import type { TabId } from './TabBar';
import { CardIcon, InstallmentsIcon, MailIcon } from './icons';
import styles from './Dashboard.module.css';

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
  onNavigate,
}: {
  onNavigate: (tab: TabId) => void;
}) {
  const { data, subscriptions, installments, settings } = useAppData();
  const leadDays = settings.reminderLeadDays;

  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState('');

  const hasData = subscriptions.length > 0 || installments.length > 0;
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

  const emailReady = Boolean(settings.recipientEmail);

  const handleSendNow = async () => {
    setSendState('sending');
    setSendError('');
    const { error } = await supabase.functions.invoke('send-reminders', {
      body: { test: true },
    });
    if (error) {
      setSendState('error');
      setSendError(error instanceof Error ? error.message : 'Failed to send');
    } else {
      setSendState('sent');
    }
  };

  if (!hasData) {
    return (
      <section className="view">
        <div className="view-header">
          <h1>Home</h1>
        </div>
        <div className={styles.firstRun}>
          <h2>Track what's about to charge you</h2>
          <p>
            Add a subscription or an installment plan and SubTrack tells you
            before each one is due — by email too, even when the app is closed.
          </p>
          <div className={styles.firstRunActions}>
            <button
              className="button button-primary"
              onClick={() => onNavigate('subscriptions')}
            >
              <CardIcon size={18} /> Add a subscription
            </button>
            <button
              className="button button-ghost"
              onClick={() => onNavigate('installments')}
            >
              <InstallmentsIcon size={18} /> Add a plan
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view">
      <div className="view-header">
        <h1>Home</h1>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryStat}>
          <span className={styles.statValue}>
            {formatCurrency(monthlySpend, primaryCurrency)}
          </span>
          <span className={styles.statLabel}>
            per month · {subscriptions.length} subscription
            {subscriptions.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className={styles.summaryStat}>
          <span className={styles.statValue}>
            {formatCurrency(remainingDebt, primaryCurrency)}
          </span>
          <span className={styles.statLabel}>
            left to pay · {activeInstallments.length} plan
            {activeInstallments.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className={styles.sectionHeading}>
        <h2>Due soon &amp; overdue</h2>
      </div>

      {dueItems.length === 0 ? (
        <p className="empty-state">
          Nothing due in the next {leadDays} days. You're all caught up.
        </p>
      ) : (
        <ul className={styles.dueList}>
          {dueItems.map((item) => (
            <DueRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </ul>
      )}

      <div className="email-box">
        {!emailReady ? (
          <button
            className="button button-ghost button-block"
            onClick={() => onNavigate('settings')}
          >
            <MailIcon size={18} /> Set up email reminders
          </button>
        ) : sendState === 'sent' ? (
          <p className="email-status email-status-ok">
            Test email sent to {settings.recipientEmail}. Reminders are on.
          </p>
        ) : (
          <>
            <p className="settings-hint">
              Reminders are emailed to {settings.recipientEmail} automatically.
              Send one now to check it works:
            </p>
            <button
              className="button button-ghost button-block"
              onClick={handleSendNow}
              disabled={sendState === 'sending'}
            >
              <MailIcon size={18} />
              {sendState === 'sending' ? 'Sending…' : 'Send me a test email'}
            </button>
            {sendState === 'error' && (
              <p className="email-status email-status-error">{sendError}</p>
            )}
          </>
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
      <li className={styles.dueRow}>
        <div className={styles.dueIcon}>
          <CardIcon size={18} />
        </div>
        <div className={styles.dueText}>
          <span className={styles.dueName}>{name}</span>
          <span className={styles.dueSub}>
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
    <li className={styles.dueRow}>
      <div className={styles.dueIcon}>
        <InstallmentsIcon size={18} />
      </div>
      <div className={styles.dueText}>
        <span className={styles.dueName}>{name}</span>
        <span className={styles.dueSub}>
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
