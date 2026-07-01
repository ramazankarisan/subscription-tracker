/**
 * Controlled form for creating or editing a subscription. Emits a complete
 * `Omit<Subscription, 'id'>` payload; the parent decides add vs. update.
 */
import { useState, type FormEvent } from 'react';

import { todayIso } from '../lib/dates';
import type { BillingCycle, Subscription } from '../types';

const CYCLE_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom (days)' },
];

interface SubscriptionFormProps {
  initial?: Subscription;
  onSubmit: (input: Omit<Subscription, 'id'>) => void;
  onCancel: () => void;
}

export function SubscriptionForm({
  initial,
  onSubmit,
  onCancel,
}: SubscriptionFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cost, setCost] = useState(initial ? String(initial.cost) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'EUR');
  const [cycle, setCycle] = useState<BillingCycle>(initial?.cycle ?? 'monthly');
  const [customIntervalDays, setCustomIntervalDays] = useState(
    initial?.customIntervalDays ? String(initial.customIntervalDays) : '30',
  );
  const [nextRenewal, setNextRenewal] = useState(
    initial?.nextRenewal ?? todayIso(),
  );
  const [cancelUrl, setCancelUrl] = useState(initial?.cancelUrl ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      cost: Number(cost) || 0,
      currency: currency.trim().toUpperCase() || 'EUR',
      cycle,
      customIntervalDays:
        cycle === 'custom'
          ? Math.max(1, Number(customIntervalDays) || 1)
          : null,
      nextRenewal,
      cancelUrl: cancelUrl.trim(),
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
          placeholder="Netflix"
          required
          autoFocus
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Cost</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder="12.99"
            required
          />
        </label>
        <label className="field field-narrow">
          <span>Currency</span>
          <input
            type="text"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            placeholder="EUR"
            maxLength={3}
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Billing cycle</span>
          <select
            value={cycle}
            onChange={(event) => setCycle(event.target.value as BillingCycle)}
          >
            {CYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {cycle === 'custom' && (
          <label className="field field-narrow">
            <span>Every (days)</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={customIntervalDays}
              onChange={(event) => setCustomIntervalDays(event.target.value)}
            />
          </label>
        )}
      </div>

      <label className="field">
        <span>Next renewal date</span>
        <input
          type="date"
          value={nextRenewal}
          onChange={(event) => setNextRenewal(event.target.value)}
          required
        />
      </label>

      <label className="field">
        <span>Cancel link (optional)</span>
        <input
          type="url"
          value={cancelUrl}
          onChange={(event) => setCancelUrl(event.target.value)}
          placeholder="https://…"
        />
      </label>

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
