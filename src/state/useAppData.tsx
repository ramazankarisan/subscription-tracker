/**
 * Single source of truth for all app data, exposed via React context.
 *
 * Persistence now lives in Supabase (per authenticated user). The provider:
 *   1. renders instantly from a localStorage cache (offline-friendly),
 *   2. fetches the user's rows from Supabase and replaces the cache,
 *   3. applies every action optimistically to local state, then writes it
 *      through to Supabase (insert / update / upsert / delete),
 *   4. keeps devices converged live: a coalesced `requestRefetch()` re-reads
 *      the three tables on visibility/focus/reconnect and on Supabase Realtime
 *      `postgres_changes` events, deferring while writes are in flight; a write
 *      that fails to reach Supabase reverts (refetch) and surfaces `syncError`.
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
import { cacheKeyForUser, emptyData, loadData, saveData } from '../lib/storage';
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
  signOut: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

const SYNC_ERROR_MESSAGE =
  "Couldn't save to the server — will resync when you're back online.";
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
  const [data, setData] = useState<AppData>(() => loadData(cacheKey));
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Keep a ref to the latest data so persistence helpers can read it without
  // being recreated on every change.
  const dataRef = useRef(data);
  dataRef.current = data;

  // Latest user id, so an in-flight fetch started for a previous user never
  // applies its result after an account switch.
  const userIdRef = useRef(user.id);
  userIdRef.current = user.id;

  // Coalesced-refetch machinery.
  const pendingWritesRef = useRef(0); // > 0 while optimistic writes are settling
  const fetchInFlightRef = useRef(false);
  const refetchQueuedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update local state (optimistic) and mirror to the offline cache.
  const apply = useCallback(
    (updater: (prev: AppData) => AppData) => {
      setData((prev) => {
        const next = updater(prev);
        saveData(cacheKey, next);
        return next;
      });
    },
    [cacheKey],
  );

  // The 3-table load, reused by the initial mount and every live trigger.
  // Only the first call flips `loading`; refetches leave it untouched so the
  // UI never flashes back to a loading state. On any fetch error the cached
  // data is kept rather than wiping the UI.
  const fetchAll = useCallback(
    async (first: boolean) => {
      fetchInFlightRef.current = true;
      try {
        const [subs, insts, settingsRes] = await Promise.all([
          supabase.from('subscriptions').select('*').eq('user_id', user.id),
          supabase.from('installments').select('*').eq('user_id', user.id),
          supabase
            .from('app_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        // Ignore results for a user we've since switched away from.
        if (userIdRef.current !== user.id) return;
        if (subs.error || insts.error || settingsRes.error) return;

        let settings: AppSettings;
        if (settingsRes.data) {
          settings = rowToSettings(settingsRes.data as SettingsRow);
        } else {
          // First sign-in: create a settings row defaulting reminders to my inbox.
          settings = { ...emptyData.settings, recipientEmail: user.email };
          await supabase
            .from('app_settings')
            .upsert(settingsToRow(settings, user.id));
          if (userIdRef.current !== user.id) return;
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
        if (first) setLoading(false);
        fetchInFlightRef.current = false;
        // Something asked to refetch while this fetch was running — do it now.
        if (refetchQueuedRef.current && userIdRef.current === user.id) {
          refetchQueuedRef.current = false;
          void fetchAll(false);
        }
      }
    },
    [user.id, user.email, cacheKey],
  );

  // Run a refetch now unless a write is in flight or a fetch is already
  // running — in which case queue it to run when the blocker clears.
  const maybeRefetch = useCallback(() => {
    if (pendingWritesRef.current > 0 || fetchInFlightRef.current) {
      refetchQueuedRef.current = true;
      return;
    }
    void fetchAll(false);
  }, [fetchAll]);

  // Public entry point for every live trigger: debounce, then maybeRefetch.
  const requestRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      maybeRefetch();
    }, REFETCH_DEBOUNCE_MS);
  }, [maybeRefetch]);

  // Wrap every Supabase write: count it as in flight (so refetches defer),
  // and on failure revert to server truth (refetch) and surface a banner.
  const persist = useCallback(
    (run: () => PromiseLike<{ error: unknown }>) => {
      pendingWritesRef.current += 1;
      void (async () => {
        try {
          const res = await run();
          if (res && res.error) {
            setSyncError(SYNC_ERROR_MESSAGE);
            requestRefetch();
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

  // Initial load. `fetchAll` changes identity when user.id/email/cacheKey
  // change, so this re-runs the first load for a newly signed-in user.
  useEffect(() => {
    setLoading(true);
    void fetchAll(true);
  }, [fetchAll]);

  // Reset per-user sync state and clear any pending debounce on unmount or
  // before the user changes, so a stale timer never fires for a past user.
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

  // Refetch when the tab/app becomes visible again, regains focus, or the
  // network comes back — covers the backgrounded-PWA case Realtime can't
  // (iOS suspends the page and the websocket silently drops).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') requestRefetch();
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

  // Supabase Realtime: one per-user channel funnelling every change on the
  // three tables into the coalesced refetch, so two visible screens update
  // each other within ~1s. INSERT/UPDATE are user-filtered; DELETE cannot be
  // filtered (the payload carries only the old row's PK and RLS is not applied
  // to DELETE), so its binding is unfiltered — harmless, since the handler only
  // triggers an RLS-guarded refetch. Re-subscribing catches up events missed
  // while the socket was down.
  useEffect(() => {
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
      if (status === 'SUBSCRIBED') requestRefetch();
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user.id, requestRefetch]);

  const addSubscription = useCallback(
    (input: Omit<Subscription, 'id'>) => {
      const sub: Subscription = { ...input, id: newId() };
      apply((prev) => ({
        ...prev,
        subscriptions: [...prev.subscriptions, sub],
      }));
      persist(() =>
        supabase.from('subscriptions').insert(subscriptionToRow(sub, user.id)),
      );
    },
    [apply, persist, user.id],
  );

  const updateSubscription = useCallback(
    (id: string, patch: Partial<Subscription>) => {
      apply((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.map((item) =>
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
      apply((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.filter((item) => item.id !== id),
      }));
      persist(() => supabase.from('subscriptions').delete().eq('id', id));
    },
    [apply, persist],
  );

  const markSubscriptionRenewed = useCallback(
    (id: string) => {
      const current = dataRef.current.subscriptions.find((s) => s.id === id);
      if (!current) return;
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
      apply((prev) => ({
        ...prev,
        installments: [...prev.installments, inst],
      }));
      persist(() =>
        supabase.from('installments').insert(installmentToRow(inst, user.id)),
      );
    },
    [apply, persist, user.id],
  );

  const updateInstallment = useCallback(
    (id: string, patch: Partial<Installment>) => {
      apply((prev) => ({
        ...prev,
        installments: prev.installments.map((item) =>
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
      apply((prev) => ({
        ...prev,
        installments: prev.installments.filter((item) => item.id !== id),
      }));
      persist(() => supabase.from('installments').delete().eq('id', id));
    },
    [apply, persist],
  );

  const markInstallmentPaid = useCallback(
    (id: string) => {
      const current = dataRef.current.installments.find((i) => i.id === id);
      if (!current) return;
      updateInstallment(id, {
        paidPayments: Math.min(current.totalPayments, current.paidPayments + 1),
      });
    },
    [updateInstallment],
  );

  const markInstallmentUnpaid = useCallback(
    (id: string) => {
      const current = dataRef.current.installments.find((i) => i.id === id);
      if (!current) return;
      updateInstallment(id, {
        paidPayments: Math.max(0, current.paidPayments - 1),
      });
    },
    [updateInstallment],
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      const next = { ...dataRef.current.settings, ...patch };
      apply((prev) => ({ ...prev, settings: next }));
      persist(() =>
        supabase.from('app_settings').upsert(settingsToRow(next, user.id)),
      );
    },
    [apply, persist, user.id],
  );

  // Import/restore: replace everything for this user, server-side too. The
  // whole block is one persist unit — all five calls must settle before the
  // pending-write counter drops so a refetch can't interleave mid-replace.
  const replaceData = useCallback(
    (incoming: AppData) => {
      const next: AppData = {
        subscriptions: incoming.subscriptions,
        installments: incoming.installments,
        settings: { ...emptyData.settings, ...incoming.settings },
      };
      apply(() => next);
      persist(async () => {
        const deletes = await Promise.all([
          supabase.from('subscriptions').delete().eq('user_id', user.id),
          supabase.from('installments').delete().eq('user_id', user.id),
        ]);
        const inserts = await Promise.all([
          next.subscriptions.length
            ? supabase
                .from('subscriptions')
                .insert(
                  next.subscriptions.map((s) => subscriptionToRow(s, user.id)),
                )
            : Promise.resolve({ error: null }),
          next.installments.length
            ? supabase
                .from('installments')
                .insert(
                  next.installments.map((i) => installmentToRow(i, user.id)),
                )
            : Promise.resolve({ error: null }),
          supabase
            .from('app_settings')
            .upsert(settingsToRow(next.settings, user.id)),
        ]);
        const error =
          [...deletes, ...inserts].find((r) => r && r.error)?.error ?? null;
        return { error };
      });
    },
    [apply, persist, user.id],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

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
