/**
 * Settings: account + sign-out, dashboard window, server-side reminder schedule
 * + recipient, a test-send button (invokes the Edge Function), and JSON
 * backup/restore. Restoring a backup is guarded by a confirm because it
 * replaces all current data.
 */
import { format, parseISO } from 'date-fns';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

import {
  deletePasskey,
  listPasskeys,
  passkeysSupported,
  registerPasskey,
  type PasskeySummary,
} from '../lib/passkeys';
import { exportData } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useAppData } from '../state/useAppData';
import type { AppData } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { FingerprintIcon, MailIcon, TrashIcon } from './icons';
import styles from './SettingsView.module.css';

type PasskeyState = 'idle' | 'working' | 'error';

type TestState = 'idle' | 'sending' | 'sent' | 'error';

/** Offsets the user can toggle; 0 = on the due date itself. */
const OFFSET_CHOICES: Array<{ value: number; label: string }> = [
  { value: 0, label: 'On the day' },
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '7 days before' },
];

export function SettingsView() {
  const { data, settings, updateSettings, replaceData, userEmail, signOut } =
    useAppData();

  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [importState, setImportState] = useState<'idle' | 'ok' | 'error'>(
    'idle',
  );
  const [importMessage, setImportMessage] = useState('');
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supportsPasskeys = passkeysSupported();
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [passkeyState, setPasskeyState] = useState<PasskeyState>('idle');
  const [passkeyMessage, setPasskeyMessage] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PasskeySummary | null>(
    null,
  );

  const refreshPasskeys = async () => {
    setPasskeys(await listPasskeys());
  };

  useEffect(() => {
    if (supportsPasskeys) {
      void refreshPasskeys();
    }
  }, [supportsPasskeys]);

  // Default the reminder recipient to the signed-in account — on the free tier
  // that's the only address that can actually receive mail.
  useEffect(() => {
    if (!settings.recipientEmail && userEmail) {
      updateSettings({ recipientEmail: userEmail });
    }
  }, [settings.recipientEmail, userEmail, updateSettings]);

  const handleEnrollPasskey = async () => {
    setPasskeyState('working');
    setPasskeyMessage('');
    const result = await registerPasskey();
    if (result.ok) {
      setPasskeyState('idle');
      setPasskeyMessage('This device is set up. Use it to sign in next time.');
      await refreshPasskeys();
    } else if (result.cancelled) {
      setPasskeyState('idle');
    } else {
      setPasskeyState('error');
      setPasskeyMessage(result.message);
    }
  };

  const handleDeletePasskey = async () => {
    if (!pendingDelete) {
      return;
    }
    const error = await deletePasskey(pendingDelete.id);
    setPendingDelete(null);
    if (error) {
      setPasskeyState('error');
      setPasskeyMessage(error);
    } else {
      setPasskeyMessage('Passkey removed.');
      await refreshPasskeys();
    }
  };

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
    anchor.download = 'subtrack-backup.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Parse + validate the file, then wait for confirmation before replacing.
  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
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
          setImportState('idle');
          setImportMessage('');
          setPendingImport(parsed);
        } else {
          setImportState('error');
          setImportMessage('That file does not look like a valid backup.');
        }
      } catch {
        setImportState('error');
        setImportMessage('Could not read that file.');
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (pendingImport) {
      replaceData(pendingImport);
      setImportState('ok');
      setImportMessage('Backup restored.');
    }
    setPendingImport(null);
  };

  return (
    <section className="view">
      <div className="view-header">
        <h1>Settings</h1>
      </div>

      <div className={styles.group}>
        <h2>Account</h2>
        <p className="settings-hint">Signed in as {userEmail}.</p>
        <button
          className="button button-ghost"
          onClick={() => setConfirmSignOut(true)}
        >
          Sign out
        </button>
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

      {supportsPasskeys && (
        <div className={styles.group}>
          <h2>Sign-in</h2>
          <p className="settings-hint">
            Set up Face ID or Touch ID on this device so you can sign in without
            waiting for an email code. Your email code still works as a backup.
          </p>

          {passkeys.length > 0 && (
            <ul className={styles.passkeyList}>
              {passkeys.map((passkey) => (
                <li key={passkey.id} className={styles.passkeyRow}>
                  <span className={styles.passkeyMeta}>
                    <span>{passkey.friendlyName || 'This device'}</span>
                    <small>
                      Added {format(parseISO(passkey.createdAt), 'PP')}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => setPendingDelete(passkey)}
                    aria-label={`Remove ${passkey.friendlyName || 'this device'}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            className="button button-primary button-block"
            onClick={handleEnrollPasskey}
            disabled={passkeyState === 'working'}
          >
            <FingerprintIcon size={18} />
            {passkeyState === 'working'
              ? 'Setting up…'
              : 'Enable Face ID / Touch ID'}
          </button>
          {passkeyMessage && (
            <p
              className={`email-status ${
                passkeyState === 'error'
                  ? 'email-status-error'
                  : 'email-status-ok'
              }`}
              role={passkeyState === 'error' ? 'alert' : 'status'}
            >
              {passkeyMessage}
            </p>
          )}
        </div>
      )}

      <div className={styles.group}>
        <h2>Email reminders</h2>
        <p className="settings-hint">
          A daily job emails you before anything is due — even when the app is
          closed. Reminders go to your account email by default; on the free
          tier that's the only address they can reach.
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
        {importMessage && (
          <p
            className={`email-status ${
              importState === 'error' ? 'email-status-error' : 'email-status-ok'
            }`}
            role={importState === 'error' ? 'alert' : 'status'}
          >
            {importMessage}
          </p>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Remove this passkey?"
          message={`You will no longer be able to sign in with ${
            pendingDelete.friendlyName || 'this device'
          }. Your email code still works.`}
          confirmLabel="Remove"
          danger
          onConfirm={handleDeletePasskey}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {pendingImport && (
        <ConfirmDialog
          title="Restore backup"
          message="Replace all current data with this backup? This can't be undone."
          confirmLabel="Replace"
          danger
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {confirmSignOut && (
        <ConfirmDialog
          title="Sign out"
          message="Sign out of SubTrack on this device?"
          confirmLabel="Sign out"
          onConfirm={() => void signOut()}
          onCancel={() => setConfirmSignOut(false)}
        />
      )}
    </section>
  );
}
