/**
 * List of all subscriptions with add / edit / delete / "mark renewed" actions.
 */
import { useState } from 'react';

import { daysUntil, formatDate, relativeDayLabel } from '../lib/dates';
import { formatCurrency } from '../lib/format';
import { useAppData } from '../state/useAppData';
import type { BillingCycle, Subscription } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './Modal';
import { SubscriptionForm } from './SubscriptionForm';
import {
  CheckIcon,
  EditIcon,
  ExternalLinkIcon,
  PlusIcon,
  TrashIcon,
} from './icons';

const CYCLE_LABEL: Record<BillingCycle, string> = {
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
  custom: 'cycle',
};

function cycleSuffix(subscription: Subscription): string {
  if (subscription.cycle === 'custom') {
    return `every ${subscription.customIntervalDays ?? 0} days`;
  }
  return `per ${CYCLE_LABEL[subscription.cycle]}`;
}

export function SubscriptionsView({ leadDays }: { leadDays: number }) {
  const {
    subscriptions,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    markSubscriptionRenewed,
  } = useAppData();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Subscription | null>(null);

  const openAdd = () => {
    setEditing(null);
    setIsFormOpen(true);
  };
  const openEdit = (subscription: Subscription) => {
    setEditing(subscription);
    setIsFormOpen(true);
  };
  const closeForm = () => setIsFormOpen(false);

  const handleSubmit = (input: Omit<Subscription, 'id'>) => {
    if (editing) {
      updateSubscription(editing.id, input);
    } else {
      addSubscription(input);
    }
    setIsFormOpen(false);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      deleteSubscription(pendingDelete.id);
    }
    setPendingDelete(null);
  };

  const sorted = [...subscriptions].sort(
    (a, b) => daysUntil(a.nextRenewal) - daysUntil(b.nextRenewal),
  );

  return (
    <section className="view">
      <div className="view-header">
        <h1>Subscriptions</h1>
        <button className="button button-primary" onClick={openAdd}>
          <PlusIcon size={18} /> Add
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="empty-state">
          No subscriptions yet. Add one to start tracking renewal dates.
        </p>
      ) : (
        <ul className="card-list">
          {sorted.map((subscription) => {
            const days = daysUntil(subscription.nextRenewal);
            const isDueSoon = days <= leadDays;
            const isOverdue = days < 0;
            return (
              <li key={subscription.id} className="card">
                <div className="card-main">
                  <div className="card-title-row">
                    <h2 className="card-title">{subscription.name}</h2>
                    <span className="card-amount">
                      {formatCurrency(subscription.cost, subscription.currency)}
                      <small> {cycleSuffix(subscription)}</small>
                    </span>
                  </div>
                  <p className="card-meta">
                    Renews {formatDate(subscription.nextRenewal)}
                    <span
                      className={`pill ${
                        isOverdue
                          ? 'pill-overdue'
                          : isDueSoon
                            ? 'pill-soon'
                            : 'pill-ok'
                      }`}
                    >
                      {relativeDayLabel(subscription.nextRenewal)}
                    </span>
                  </p>
                  {subscription.notes && (
                    <p className="card-notes">{subscription.notes}</p>
                  )}
                </div>

                <div className="card-actions">
                  <button
                    className="button button-small"
                    onClick={() => markSubscriptionRenewed(subscription.id)}
                    title="Mark as renewed (advance to next date)"
                  >
                    <CheckIcon size={16} /> Renewed
                  </button>
                  {subscription.cancelUrl && (
                    <a
                      className="icon-button"
                      href={subscription.cancelUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open cancel page"
                      title="Open cancel page"
                    >
                      <ExternalLinkIcon size={18} />
                    </a>
                  )}
                  <button
                    className="icon-button"
                    onClick={() => openEdit(subscription)}
                    aria-label="Edit"
                  >
                    <EditIcon size={18} />
                  </button>
                  <button
                    className="icon-button icon-button-danger"
                    onClick={() => setPendingDelete(subscription)}
                    aria-label="Delete"
                  >
                    <TrashIcon size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isFormOpen && (
        <Modal
          title={editing ? 'Edit subscription' : 'Add subscription'}
          onClose={closeForm}
        >
          <SubscriptionForm
            initial={editing ?? undefined}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete subscription"
          message={`Delete “${pendingDelete.name}”? This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
