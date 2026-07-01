/**
 * Offline read cache. The source of truth now lives in Supabase (per user);
 * this keeps a copy of the last-seen state in localStorage so the app can
 * render instantly on open and still show data when briefly offline.
 *
 * Loading is defensive: any corruption or missing field falls back to defaults
 * rather than crashing the app.
 */
import type { AppData, AppSettings } from '../types';

const STORAGE_KEY = 'subscription-tracker:v2';

export const defaultSettings: AppSettings = {
  reminderLeadDays: 7,
  reminderOffsets: [3, 0],
  recipientEmail: '',
};

export const emptyData: AppData = {
  subscriptions: [],
  installments: [],
  settings: defaultSettings,
};

/** Per-user cache key so switching accounts never mixes data. */
export function cacheKeyForUser(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

/** Read cached state for a user, merging over defaults so new fields are safe. */
export function loadData(key: string): AppData {
  try {
    const raw = localStorage.getItem(key);
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
        reminderOffsets: Array.isArray(parsed.settings?.reminderOffsets)
          ? parsed.settings.reminderOffsets
          : defaultSettings.reminderOffsets,
      },
    };
  } catch {
    return emptyData;
  }
}

/** Persist cached state for a user. Best-effort — swallows quota errors. */
export function saveData(key: string, data: AppData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage full or unavailable (e.g. private mode) — nothing we can do.
  }
}

/** Export the raw JSON string for backup. */
export function exportData(data: AppData): string {
  return JSON.stringify(data, null, 2);
}
