/**
 * Persistence. The entire app state is a single JSON blob in localStorage.
 * Loading is defensive: any corruption or missing field falls back to defaults
 * rather than crashing the app.
 */
import type { AppData, AppSettings } from '../types';

const STORAGE_KEY = 'subscription-tracker:v1';

export const defaultSettings: AppSettings = {
  reminderLeadDays: 7,
  email: {
    enabled: false,
    autoSendOnOpen: true,
    serviceId: '',
    templateId: '',
    publicKey: '',
    toEmail: '',
  },
  lastEmailSentDate: null,
};

export const emptyData: AppData = {
  subscriptions: [],
  installments: [],
  settings: defaultSettings,
};

/** Read state from localStorage, merging over defaults so new fields are safe. */
export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData;
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      subscriptions: Array.isArray(parsed.subscriptions)
        ? parsed.subscriptions
        : [],
      installments: Array.isArray(parsed.installments)
        ? parsed.installments
        : [],
      settings: {
        ...defaultSettings,
        ...parsed.settings,
        email: { ...defaultSettings.email, ...parsed.settings?.email },
      },
    };
  } catch {
    return emptyData;
  }
}

/** Persist state. Swallows quota/serialisation errors — this is best-effort. */
export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable (e.g. private mode) — nothing we can do.
  }
}

/** Export the raw JSON string for backup. */
export function exportData(data: AppData): string {
  return JSON.stringify(data, null, 2);
}
