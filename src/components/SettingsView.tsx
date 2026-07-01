/**
 * Settings: reminder window, EmailJS credentials, a test-send button, and
 * JSON backup/restore of all data.
 */
import { useRef, useState, type ChangeEvent } from 'react';

import { isEmailConfigured, sendReminderEmail } from '../lib/email';
import { exportData } from '../lib/storage';
import { getDueItems } from '../lib/reminders';
import { useAppData } from '../state/useAppData';
import type { AppData } from '../types';
import { MailIcon } from './icons';

type TestState = 'idle' | 'sending' | 'sent' | 'error';

export function SettingsView() {
  const { data, settings, updateSettings, updateEmailSettings, replaceData } =
    useAppData();
  const { email } = settings;

  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTestSend = async () => {
    setTestState('sending');
    setTestMessage('');
    const dueItems = getDueItems(data, settings.reminderLeadDays);
    // Fall back to a single placeholder line so a test still proves the wiring
    // even when nothing is actually due.
    const items = dueItems.length > 0 ? dueItems : getDueItems(data, 3650); // widen window to grab anything at all
    try {
      await sendReminderEmail(email, items);
      setTestState('sent');
      setTestMessage(`Test email sent to ${email.toEmail}.`);
    } catch (error) {
      setTestState('error');
      setTestMessage(
        error instanceof Error ? error.message : 'Failed to send test email.',
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
    if (!file) return;
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

      <div className="settings-group">
        <h2>Reminders</h2>
        <label className="field">
          <span>Remind me about anything due within (days)</span>
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

      <div className="settings-group">
        <h2>Email (EmailJS)</h2>
        <p className="settings-hint">
          Emails are sent straight from your browser using{' '}
          <a href="https://www.emailjs.com/" target="_blank" rel="noreferrer">
            EmailJS
          </a>{' '}
          (free tier). Create a free account, add an email service and a
          template that uses the variables <code>{'{{to_email}}'}</code>,{' '}
          <code>{'{{subject}}'}</code> and <code>{'{{message}}'}</code>, then
          paste your IDs below.
        </p>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={email.enabled}
            onChange={(event) =>
              updateEmailSettings({ enabled: event.target.checked })
            }
          />
          <span>Enable email reminders</span>
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={email.autoSendOnOpen}
            onChange={(event) =>
              updateEmailSettings({ autoSendOnOpen: event.target.checked })
            }
          />
          <span>Automatically email me when I open the app (once per day)</span>
        </label>

        <label className="field">
          <span>Recipient email</span>
          <input
            type="email"
            value={email.toEmail}
            onChange={(event) =>
              updateEmailSettings({ toEmail: event.target.value })
            }
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span>Service ID</span>
          <input
            type="text"
            value={email.serviceId}
            onChange={(event) =>
              updateEmailSettings({ serviceId: event.target.value })
            }
            placeholder="service_xxxxxxx"
          />
        </label>
        <label className="field">
          <span>Template ID</span>
          <input
            type="text"
            value={email.templateId}
            onChange={(event) =>
              updateEmailSettings({ templateId: event.target.value })
            }
            placeholder="template_xxxxxxx"
          />
        </label>
        <label className="field">
          <span>Public key</span>
          <input
            type="text"
            value={email.publicKey}
            onChange={(event) =>
              updateEmailSettings({ publicKey: event.target.value })
            }
            placeholder="XXXXXXXXXXXXXXXX"
          />
        </label>

        <button
          className="button button-primary button-block"
          onClick={handleTestSend}
          disabled={!isEmailConfigured(email) || testState === 'sending'}
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

      <div className="settings-group">
        <h2>Backup</h2>
        <p className="settings-hint">
          Your data lives only in this browser. Export a copy to keep it safe or
          move it to another device.
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
