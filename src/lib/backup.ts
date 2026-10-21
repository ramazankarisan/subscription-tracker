/** Parse a backup file (Settings → Import) before anything is replaced. */
import type { AppData } from '../types';

/** The parsed backup, or null when the file can't be restored. */
export function parseBackup(text: string): AppData | null {
  try {
    const parsed = JSON.parse(text) as AppData;
    if (
      Array.isArray(parsed.subscriptions) &&
      Array.isArray(parsed.installments)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
