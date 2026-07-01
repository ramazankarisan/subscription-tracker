/**
 * List of installment plans with progress bars and add / edit / delete plus
 * "mark paid" / "undo" actions.
 */
import { useState } from 'react';

import {
  daysUntil,
  formatDate,
  nextInstallmentDate,
  relativeDayLabel,
} from '../lib/dates';
import { formatCurrency } from '../lib/format';
import { useAppData } from '../state/useAppData';
import type { Installment } from '../types';
import { Modal } from './Modal';
import { InstallmentForm } from './InstallmentForm';
import { CheckIcon, EditIcon, PlusIcon, TrashIcon, UndoIcon } from './icons';

export function InstallmentsView({ leadDays }: { leadDays: number }) {
  const {
    installments,
    addInstallment,
    updateInstallment,
    deleteInstallment,
    markInstallmentPaid,
    markInstallmentUnpaid,
  } = useAppData();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Installment | null>(null);

  const openAdd = () => {
    setEditing(null);
    setIsFormOpen(true);
  };
  const openEdit = (installment: Installment) => {
    setEditing(installment);
    setIsFormOpen(true);
  };
  const closeForm = () => setIsFormOpen(false);

  const handleSubmit = (input: Omit<Installment, 'id'>) => {
    if (editing) {
      updateInstallment(editing.id, input);
    } else {
      addInstallment(input);
    }
    setIsFormOpen(false);
  };

  const handleDelete = (installment: Installment) => {
    if (window.confirm(`Delete "${installment.name}"?`)) {
      deleteInstallment(installment.id);
    }
  };

  return (
    <section className="view">
      <div className="view-header">
        <h1>Installments</h1>
        <button className="button button-primary" onClick={openAdd}>
          <PlusIcon size={18} /> Add
        </button>
      </div>

      {installments.length === 0 ? (
        <p className="empty-state">
          No installment plans yet. Add one to track how many payments are left.
        </p>
      ) : (
        <ul className="card-list">
          {installments.map((installment) => {
            const remaining =
              installment.totalPayments - installment.paidPayments;
            const isComplete = remaining <= 0;
            const progress =
              installment.totalPayments > 0
                ? installment.paidPayments / installment.totalPayments
                : 0;
            const remainingAmount = remaining * installment.amountPerPayment;
            const dueDate = nextInstallmentDate(
              installment.firstPaymentDate,
              installment.paidPayments,
              installment.totalPayments,
              installment.intervalMonths,
            );
            const days = dueDate === null ? null : daysUntil(dueDate);
            const isOverdue = days !== null && days < 0;
            const isDueSoon = days !== null && days <= leadDays;

            return (
              <li key={installment.id} className="card">
                <div className="card-main">
                  <div className="card-title-row">
                    <h2 className="card-title">{installment.name}</h2>
                    <span className="card-amount">
                      {formatCurrency(
                        installment.amountPerPayment,
                        installment.currency,
                      )}
                      <small> / payment</small>
                    </span>
                  </div>

                  <div className="progress">
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                    <span className="progress-label">
                      {installment.paidPayments} / {installment.totalPayments}{' '}
                      paid
                    </span>
                  </div>

                  {isComplete ? (
                    <p className="card-meta">
                      <span className="pill pill-ok">Fully paid 🎉</span>
                    </p>
                  ) : (
                    <p className="card-meta">
                      {remaining} left ·{' '}
                      {formatCurrency(remainingAmount, installment.currency)}{' '}
                      remaining
                      {dueDate && (
                        <>
                          {' · next '}
                          {formatDate(dueDate)}
                          <span
                            className={`pill ${
                              isOverdue
                                ? 'pill-overdue'
                                : isDueSoon
                                  ? 'pill-soon'
                                  : 'pill-ok'
                            }`}
                          >
                            {relativeDayLabel(dueDate)}
                          </span>
                        </>
                      )}
                    </p>
                  )}

                  {installment.notes && (
                    <p className="card-notes">{installment.notes}</p>
                  )}
                </div>

                <div className="card-actions">
                  {!isComplete && (
                    <button
                      className="button button-small"
                      onClick={() => markInstallmentPaid(installment.id)}
                      title="Mark next payment as paid"
                    >
                      <CheckIcon size={16} /> Paid one
                    </button>
                  )}
                  {installment.paidPayments > 0 && (
                    <button
                      className="icon-button"
                      onClick={() => markInstallmentUnpaid(installment.id)}
                      aria-label="Undo last payment"
                      title="Undo last payment"
                    >
                      <UndoIcon size={18} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    onClick={() => openEdit(installment)}
                    aria-label="Edit"
                  >
                    <EditIcon size={18} />
                  </button>
                  <button
                    className="icon-button icon-button-danger"
                    onClick={() => handleDelete(installment)}
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
          title={editing ? 'Edit installment' : 'Add installment'}
          onClose={closeForm}
        >
          <InstallmentForm
            initial={editing ?? undefined}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </Modal>
      )}
    </section>
  );
}
