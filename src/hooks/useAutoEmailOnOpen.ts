/**
 * Sends the reminder email automatically once when the app is opened, provided
 * email is enabled + configured, auto-send is on, something is actually due,
 * and we haven't already sent today.
 *
 * A module-level guard makes this fire at most once per page load (also
 * neutralising React StrictMode's double effect invocation in development).
 */
import { useEffect } from 'react';

import { todayIso } from '../lib/dates';
import { isEmailConfigured, sendReminderEmail } from '../lib/email';
import { getDueItems } from '../lib/reminders';
import { useAppData } from '../state/useAppData';

let hasAttempted = false;

export function useAutoEmailOnOpen(): void {
  const { data, settings, updateSettings } = useAppData();

  useEffect(() => {
    if (hasAttempted) return;
    hasAttempted = true;

    const { email, reminderLeadDays, lastEmailSentDate } = settings;
    if (!email.enabled || !email.autoSendOnOpen) return;
    if (!isEmailConfigured(email)) return;

    const today = todayIso();
    if (lastEmailSentDate === today) return;

    const dueItems = getDueItems(data, reminderLeadDays);
    if (dueItems.length === 0) return;

    // Mark as sent up front so a quick refresh doesn't trigger a second email.
    updateSettings({ lastEmailSentDate: today });
    sendReminderEmail(email, dueItems).catch(() => {
      // Best-effort: the Dashboard offers a manual send button if this fails.
    });
    // Intentionally run once on mount; state is already hydrated at first render.
  }, [data, settings, updateSettings]);
}
