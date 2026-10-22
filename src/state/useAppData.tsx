/**
 * Single source of truth for all app data, exposed via React context.
 *
 * Persistence now lives in Supabase (per authenticated user). The provider:
 *   1. renders instantly from a localStorage cache (offline-friendly),
 *   2. fetches the user's rows from Supabase and replaces the cache,
 *   3. applies every action optimistically, then writes it through to Supabase,
 *   4. stays converged live via a coalesced `requestRefetch()` (visibility /
 *      focus / reconnect / Realtime); a failed write reverts and sets `syncError`.
 *
 * Components read the current data and call the typed action helpers — they
 * never touch Supabase or localStorage directly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { advanceByCycle, rollForwardToFuture } from '../lib/dates';
import { demoData, isDemo } from '../lib/demo';
import {
  installmentToRow,
  rowToInstallment,
  rowToSettings,
  rowToSubscription,
  settingsToRow,
  subscriptionToRow,
  type InstallmentRow,
  type SettingsRow,
  type SubscriptionRow,
} from '../lib/mappers';
import {
  cacheKeyForUser,
  clearData,
  emptyData,
  loadData,
  saveData,
} from '../lib/storage';
import { supabase } from '../lib/supabase';
import type { AppData, AppSettings, Installment, Subscription } from '../types';

/** The signed-in user this store is scoped to. */
export interface AuthedUser {
  id: string;
  email: string;
}

interface AppDataContextValue {
  data: AppData;
  subscriptions: Subscription[];
  installments: Installment[];
  settings: AppSettings;
  userEmail: string;
  /** True until the first Supabase fetch resolves. */
  loading: boolean;
  /** Set when a write failed to reach Supabase; rendered as a banner. */
  syncError: string | null;
  dismissSyncError: () => void;

  addSubscription: (input: Omit<Subscription, 'id'>) => void;
  updateSubscription: (id: string, patch: Partial<Subscription>) => void;
  deleteSubscription: (id: string) => void;
  markSubscriptionRenewed: (id: string) => void;

  addInstallment: (input: Omit<Installment, 'id'>) => void;
  updateInstallment: (id: string, patch: Partial<Installment>) => void;
  deleteInstallment: (id: string) => void;
  markInstallmentPaid: (id: string) => void;
  markInstallmentUnpaid: (id: string) => void;

  updateSettings: (patch: Partial<AppSettings>) => void;
  replaceData: (data: AppData) => void;
  /** Email a preview now; resolves to an error message, or null on success. */
  sendTestEmail: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

const SYNC_ERROR_MESSAGE =
  "Couldn't save your last change to the server — check your connection and try again.";
const REFETCH_DEBOUNCE_MS = 300;

function newId(): string {
  return crypto.randomUUID();
}

export function AppDataProvider({
  user,
  children,
}: {
  user: AuthedUser;
  children: ReactNode;
}) {
  const cacheKey = cacheKeyForUser(user.id);
  const [data, setData] = useState<AppData>(() =>
    isDemo ? demoData() : loadData(cacheKey),
  );
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Keep a ref to the latest data so persistence helpers can read it without
  // being recreated on every change.
  const dataRef = useRef(data);
  dataRef.current = data;

  // Guards against a stale fetch applying after a user change.
  const userIdRef = useRef(user.id);
  userIdRef.current = user.id;

  // Coalesced-refetch machinery.
  const pendingWritesRef = useRef(0); // > 0 while optimistic writes are settling
  const fetchInFlightRef = useRef(false);
  const refetchQueuedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update local state (optimistic) and mirror to the offline cache.
  const apply = useCallback(
    (updater: (previous: AppData) => AppData) => {
      setData((previous) => {
        const next = updater(previous);
        saveData(cacheKey, next);
        return next;
      });
    },
    [cacheKey],
  );

  // Reads all three tables. Only the first call flips `loading`; on error we
  // keep the cached data.
  const fetchAll = useCallback(
    async (first: boolean) => {
      if (isDemo) {
        setLoading(false);
        return;
      }
      fetchInFlightRef.current = true;
      try {
        const [subs, insts, settingsResponse] = await Promise.all([
          supabase.from('subscriptions').select('*').eq('user_id', user.id),
          supabase.from('installments').select('*').eq('user_id', user.id),
          supabase
            .from('app_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        // Ignore results for a user we've since switched away from.
        if (userIdRef.current !== user.id) {
          return;
        }
        if (subs.error || insts.error || settingsResponse.error) {
          return;
        }

        let settings: AppSettings;
        if (settingsResponse.data) {
          settings = rowToSettings(settingsResponse.data as SettingsRow);
        } else {
          // First sign-in: create a settings row defaulting reminders to my inbox.
          settings = { ...emptyData.settings, recipientEmail: user.email };
          await supabase
            .from('app_settings')
            .upsert(settingsToRow(settings, user.id));
          if (userIdRef.current !== user.id) {
            return;
          }
        }

        const next: AppData = {
          subscriptions: (subs.data as SubscriptionRow[]).map(
            rowToSubscription,
          ),
          installments: (insts.data as InstallmentRow[]).map(rowToInstallment),
          settings,
        };
        saveData(cacheKey, next);
        setData(next);
      } finally {
        if (first) {
          setLoading(false);
        }
        fetchInFlightRef.current = false;
        // Drain a queued refetch, unless a write is in flight — then leave it
        // for persist() so we don't refetch pre-write rows.
        if (
          refetchQueuedRef.current &&
          userIdRef.current === user.id &&
          pendingWritesRef.current === 0
        ) {
          refetchQueuedRef.current = false;
          void fetchAll(false);
        }
      }
    },
    [user.id, user.email, cacheKey],
  );

  // Refetch now, or queue it if a write or fetch is in flight.
  const maybeRefetch = useCallback(() => {
    if (pendingWritesRef.current > 0 || fetchInFlightRef.current) {
      refetchQueuedRef.current = true;
      return;
    }
    void fetchAll(false);
  }, [fetchAll]);

  // Public entry point for every live trigger: debounce, then maybeRefetch.
  const requestRefetch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      maybeRefetch();
    }, REFETCH_DEBOUNCE_MS);
  }, [maybeRefetch]);

  // Wrap every write: count it in flight; on failure refetch + show banner.
  const persist = useCallback(
    (run: () => PromiseLike<{ error: unknown }>) => {
      if (isDemo) {
        return; // local state only
      }
      pendingWritesRef.current += 1;
      void (async () => {
        try {
          const response = await run();
          if (response && response.error) {
            setSyncError(SYNC_ERROR_MESSAGE);
            requestRefetch();
          } else {
            setSyncError(null); // write succeeded — clear any stale notice
          }
        } catch {
          setSyncError(SYNC_ERROR_MESSAGE);
          requestRefetch();
        } finally {
          pendingWritesRef.current -= 1;
          if (
            pendingWritesRef.current === 0 &&
            refetchQueuedRef.current &&
            !fetchInFlightRef.current
          ) {
            refetchQueuedRef.current = false;
            maybeRefetch();
          }
        }
      })();
    },
    [requestRefetch, maybeRefetch],
  );

  const dismissSyncError = useCallback(() => setSyncError(null), []);

  // Initial load.
  useEffect(() => {
    setLoading(true);
    void fetchAll(true);
  }, [fetchAll]);

  // Clear pending debounce + reset sync state on unmount / user change.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      pendingWritesRef.current = 0;
      refetchQueuedRef.current = false;
      fetchInFlightRef.current = false;
    };
  }, [user.id]);

  // Refetch on tab visible / focus / reconnect — covers the backgrounded-PWA
  // case Realtime misses (iOS suspends the page, socket drops).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        requestRefetch();
      }
    };
    const onFocus = () => requestRefetch();
    const onOnline = () => requestRefetch();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [requestRefetch]);

  // Realtime: one per-user channel; every change refetches. INSERT/UPDATE are
  // user-filtered; DELETE can't be (Supabase limitation), so it's unfiltered —
  // fine, the refetch is RLS-guarded. Refetch on SUBSCRIBED to catch up misses.
  useEffect(() => {
    if (isDemo) {
      return;
    }
    const channel = supabase.channel(`appdata:${user.id}`);
    const tables = ['subscriptions', 'installments', 'app_settings'] as const;
    for (const table of tables) {
      channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table,
            filter: `user_id=eq.${user.id}`,
          },
          () => requestRefetch(),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table,
            filter: `user_id=eq.${user.id}`,
          },
          () => requestRefetch(),
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table },
          () => requestRefetch(),
        );
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        requestRefetch();
      }
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user.id, requestRefetch]);

  const addSubscription = useCallback(
    (input: Omit<Subscription, 'id'>) => {
      const sub: Subscription = { ...input, id: newId() };
      apply((previous) => ({
        ...previous,
        subscriptions: [...previous.subscriptions, sub],
      }));
      persist(() =>
        supabase.from('subscriptions').insert(subscriptionToRow(sub, user.id)),
      );
    },
    [apply, persist, user.id],
  );

  const updateSubscription = useCallback(
    (id: string, patch: Partial<Subscription>) => {
      apply((previous) => ({
        ...previous,
        subscriptions: previous.subscriptions.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      }));
      const updated = dataRef.current.subscriptions.find((s) => s.id === id);
      if (updated) {
        persist(() =>
          supabase
            .from('subscriptions')
            .update(subscriptionToRow({ ...updated, ...patch }, user.id))
            .eq('id', id),
        );
      }
    },
    [apply, persist, user.id],
  );

  const deleteSubscription = useCallback(
    (id: string) => {
      apply((previous) => ({
        ...previous,
        subscriptions: previous.subscriptions.filter((item) => item.id !== id),
      }));
      persist(() => supabase.from('subscriptions').delete().eq('id', id));
    },
    [apply, persist],
  );

  const markSubscriptionRenewed = useCallback(
    (id: string) => {
      const current = dataRef.current.subscriptions.find((s) => s.id === id);
      if (!current) {
        return;
      }
      // The current renewal happened: advance one cycle, then skip any further
      // cycles already in the past.
      const advanced = advanceByCycle(
        current.nextRenewal,
        current.cycle,
        current.customIntervalDays,
      );
      const nextRenewal = rollForwardToFuture(
        advanced,
        current.cycle,
        current.customIntervalDays,
      );
      updateSubscription(id, { nextRenewal });
    },
    [updateSubscription],
  );

  const addInstallment = useCallback(
    (input: Omit<Installment, 'id'>) => {
      const inst: Installment = { ...input, id: newId() };
      apply((previous) => ({
        ...previous,
        installments: [...previous.installments, inst],
      }));
      persist(() =>
        supabase.from('installments').insert(installmentToRow(inst, user.id)),
      );
    },
    [apply, persist, user.id],
  );

  const updateInstallment = useCallback(
    (id: string, patch: Partial<Installment>) => {
      apply((previous) => ({
        ...previous,
        installments: previous.installments.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      }));
      const updated = dataRef.current.installments.find((i) => i.id === id);
      if (updated) {
        persist(() =>
          supabase
            .from('installments')
            .update(installmentToRow({ ...updated, ...patch }, user.id))
            .eq('id', id),
        );
      }
    },
    [apply, persist, user.id],
  );

  const deleteInstallment = useCallback(
    (id: string) => {
      apply((previous) => ({
        ...previous,
        installments: previous.installments.filter((item) => item.id !== id),
      }));
      persist(() => supabase.from('installments').delete().eq('id', id));
    },
    [apply, persist],
  );

  const markInstallmentPaid = useCallback(
    (id: string) => {
      const current = dataRef.current.installments.find((i) => i.id === id);
      if (!current) {
        return;
      }
      updateInstallment(id, {
        paidPayments: Math.min(current.totalPayments, current.paidPayments + 1),
      });
    },
    [updateInstallment],
  );

  const markInstallmentUnpaid = useCallback(
    (id: string) => {
      const current = dataRef.current.installments.find((i) => i.id === id);
      if (!current) {
        return;
      }
      updateInstallment(id, {
        paidPayments: Math.max(0, current.paidPayments - 1),
      });
    },
    [updateInstallment],
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const next = { ...dataRef.current.settings, ...patch };
      apply((previous) => ({ ...previous, settings: next }));
      persist(() =>
        supabase.from('app_settings').upsert(settingsToRow(next, user.id)),
      );
    },
    [apply, persist, user.id],
  );

  // Import/restore: replace everything for this user.
  const replaceData = useCallback(
    (incoming: AppData) => {
      const next: AppData = {
        subscriptions: incoming.subscriptions,
        installments: incoming.installments,
        settings: { ...emptyData.settings, ...incoming.settings },
      };
      apply(() => next);
      // One transaction server-side (supabase/schema.sql: restore_backup).
      persist(() =>
        supabase.rpc('restore_backup', {
          subscriptions: next.subscriptions.map((item) =>
            subscriptionToRow(item, user.id),
          ),
          installments: next.installments.map((item) =>
            installmentToRow(item, user.id),
          ),
          settings: settingsToRow(next.settings, user.id),
        }),
      );
    },
    [apply, persist, user.id],
  );

  const sendTestEmail = useCallback(async () => {
    if (isDemo) {
      return 'Email is turned off in the demo.';
    }
    const { error } = await supabase.functions.invoke('send-reminders', {
      body: { test: true },
    });
    if (!error) {
      return null;
    }
    return error instanceof Error
      ? error.message
      : 'Failed to send test email.';
  }, []);

  // Drop this user's offline cache too, so a shared device keeps no data.
  // In the demo, "signing out" just resets the sample data.
  const signOut = useCallback(async () => {
    if (isDemo) {
      window.location.reload();
      return;
    }
    await supabase.auth.signOut();
    clearData(cacheKey);
  }, [cacheKey]);

  const value = useMemo<AppDataContextValue>(
    () => ({
      data,
      subscriptions: data.subscriptions,
      installments: data.installments,
      settings: data.settings,
      userEmail: user.email,
      loading,
      syncError,
      dismissSyncError,
      addSubscription,
      updateSubscription,
      deleteSubscription,
      markSubscriptionRenewed,
      addInstallment,
      updateInstallment,
      deleteInstallment,
      markInstallmentPaid,
      markInstallmentUnpaid,
      updateSettings,
      replaceData,
      sendTestEmail,
      signOut,
    }),
    [
      data,
      user.email,
      loading,
      syncError,
      dismissSyncError,
      addSubscription,
      updateSubscription,
      deleteSubscription,
      markSubscriptionRenewed,
      addInstallment,
      updateInstallment,
      deleteInstallment,
      markInstallmentPaid,
      markInstallmentUnpaid,
      updateSettings,
      replaceData,
      sendTestEmail,
      signOut,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
