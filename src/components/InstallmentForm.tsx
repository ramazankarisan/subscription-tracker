/**
 * Controlled form for creating or editing an installment plan. Emits a complete
 * `Omit<Installment, 'id'>` payload; the parent decides add vs. update.
 */
import { useState, type FormEvent } from 'react';

import { todayIso } from '../lib/dates';
import { formatCurrency } from '../lib/format';
import type { Installment } from '../types';

interface InstallmentFormProps {
  initial?: Installment;
  onSubmit: (input: Omit<Installment, 'id'>) => void;
  onCancel: () => void;
}

export function InstallmentForm({
  initial,
  onSubmit,
  onCancel,
}: InstallmentFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amountPerPayment, setAmountPerPayment] = useState(
    initial ? String(initial.amountPerPayment) : '',
  );
  const [totalPayments, setTotalPayments] = useState(
    initial ? String(initial.totalPayments) : '12',
  );
  const [paidPayments, setPaidPayments] = useState(
    initial ? String(initial.paidPayments) : '0',
  );
  const [firstPaymentDate, setFirstPaymentDate] = useState(
    initial?.firstPaymentDate ?? todayIso(),
  );
  const [intervalMonths, setIntervalMonths] = useState(
    initial ? String(initial.intervalMonths) : '1',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const total = Number(totalPayments) || 0;
  const perPayment = Number(amountPerPayment) || 0;
  const grandTotal = total * perPayment;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const totalValue = Math.max(1, Number(totalPayments) || 1);
    const paidValue = Math.min(
      totalValue,
      Math.max(0, Number(paidPayments) || 0),
    );
    onSubmit({
      name: name.trim(),
      amountPerPayment: Number(amountPerPayment) || 0,
      currency: 'EUR',
      totalPayments: totalValue,
      paidPayments: paidValue,
      firstPaymentDate,
      intervalMonths: Math.max(1, Number(intervalMonths) || 1),
      notes: notes.trim(),
    });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New phone"
          required
        />
      </label>

      <label className="field">
        <span>Amount per payment (€)</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={amountPerPayment}
          onChange={(event) => setAmountPerPayment(event.target.value)}
          placeholder="49.99"
          required
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Total payments</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={totalPayments}
            onChange={(event) => setTotalPayments(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Already paid</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max={totalPayments}
            value={paidPayments}
            onChange={(event) => setPaidPayments(event.target.value)}
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>First payment date</span>
          <input
            type="date"
            value={firstPaymentDate}
            onChange={(event) => setFirstPaymentDate(event.target.value)}
            required
          />
        </label>
        <label className="field field-narrow">
          <span>Every (months)</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={intervalMonths}
            onChange={(event) => setIntervalMonths(event.target.value)}
          />
        </label>
      </div>

      {grandTotal > 0 && (
        <p className="form-hint">
          Total plan value: {formatCurrency(grandTotal, 'EUR')}
        </p>
      )}

      <label className="field">
        <span>Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
        />
      </label>

      <div className="form-actions">
        <button
          type="button"
          className="button button-ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="submit" className="button button-primary">
          Save
        </button>
      </div>
    </form>
  );
}
