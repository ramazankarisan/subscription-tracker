/**
 * Settings: dashboard window, server-side reminder schedule + recipient, a
 * test-send button (invokes the Edge Function), and JSON backup/restore.
 */
import { useRef, useState, type ChangeEvent } from 'react';

import { exportData } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useAppData } from '../state/useAppData';
import type { AppData } from '../types';
import { MailIcon } from './icons';
import styles from './SettingsView.module.css';

type TestState = 'idle' | 'sending' | 'sent' | 'error';

/** Offsets the user can toggle; 0 = on the due date itself. */
const OFFSET_CHOICES: Array<{ value: number; label: string }> = [
  { value: 0, label: 'On the day' },
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '7 days before' },
];

export function SettingsView() {
  const { data, settings, updateSettings, replaceData } = useAppData();

  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleOffset = (value: number) => {
    const set = new Set(settings.reminderOffsets);
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    updateSettings({ reminderOffsets: [...set].sort((a, b) => b - a) });
  };

  const handleTestSend = async () => {
    setTestState('sending');
    setTestMessage('');
    const { error } = await supabase.functions.invoke('send-reminders', {
      body: { test: true },
    });
    if (error) {
      setTestState('error');
      setTestMessage(
        error instanceof Error ? error.message : 'Failed to send test email.',
      );
    } else {
      setTestState('sent');
      setTestMessage(
        `Test email sent to ${settings.recipientEmail || 'your inbox'}.`,
      );
    }
  };

  const handleExport = () => {
    const blob = new Blob([exportData(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'subscription-tracker-backup.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppData;
        if (
          Array.isArray(parsed.subscriptions) &&
          Array.isArray(parsed.installments)
        ) {
          replaceData(parsed);
          window.alert('Backup restored.');
        } else {
          window.alert('That file does not look like a valid backup.');
        }
      } catch {
        window.alert('Could not read that file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <section className="view">
      <div className="view-header">
        <h1>Settings</h1>
      </div>

      <div className={styles.group}>
        <h2>Dashboard</h2>
        <label className="field">
          <span>Show anything due within (days)</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={settings.reminderLeadDays}
            onChange={(event) =>
              updateSettings({
                reminderLeadDays: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </label>
      </div>

      <div className={styles.group}>
        <h2>Email reminders</h2>
        <p className="settings-hint">
          A daily job emails you before anything is due — even when the app is
          closed. Pick when to be reminded and where to send it. On Resend's
          free tier this must be your own Resend account email (no domain to
          verify).
        </p>

        <label className="field">
          <span>Send reminders to</span>
          <input
            type="email"
            value={settings.recipientEmail}
            onChange={(event) =>
              updateSettings({ recipientEmail: event.target.value })
            }
            placeholder="you@example.com"
          />
        </label>

        <span className="field-label">Remind me…</span>
        <div className="chip-row">
          {OFFSET_CHOICES.map((choice) => {
            const active = settings.reminderOffsets.includes(choice.value);
            return (
              <button
                key={choice.value}
                type="button"
                className={`chip ${active ? 'chip-active' : ''}`}
                aria-pressed={active}
                onClick={() => toggleOffset(choice.value)}
              >
                {choice.label}
              </button>
            );
          })}
        </div>

        <button
          className="button button-primary button-block"
          onClick={handleTestSend}
          disabled={!settings.recipientEmail || testState === 'sending'}
        >
          <MailIcon size={18} />
          {testState === 'sending' ? 'Sending…' : 'Send test email'}
        </button>
        {testMessage && (
          <p
            className={`email-status ${
              testState === 'error' ? 'email-status-error' : 'email-status-ok'
            }`}
          >
            {testMessage}
          </p>
        )}
      </div>

      <div className={styles.group}>
        <h2>Backup</h2>
        <p className="settings-hint">
          Export a copy of your data, or restore it from a previous backup.
        </p>
        <div className="button-pair">
          <button className="button button-ghost" onClick={handleExport}>
            Export JSON
          </button>
          <button
            className="button button-ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImport}
          />
        </div>
      </div>
    </section>
  );
}
