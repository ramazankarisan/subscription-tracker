/**
 * Single source of truth for all app data, exposed via React context.
 *
 * Persistence now lives in Supabase (per authenticated user). The provider:
 *   1. renders instantly from a localStorage cache (offline-friendly),
 *   2. fetches the user's rows from Supabase and replaces the cache,
 *   3. applies every action optimistically to local state, then writes it
 *      through to Supabase (insert / update / upsert / delete).
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

  // Keep a ref to the latest data so persistence helpers can read it without
  // being recreated on every change.
  const dataRef = useRef(data);
  dataRef.current = data;

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

  // Initial load: fetch this user's rows and seed a settings row if missing.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [subs, insts, settingsResponse] = await Promise.all([
        supabase.from('subscriptions').select('*').eq('user_id', user.id),
        supabase.from('installments').select('*').eq('user_id', user.id),
        supabase
          .from('app_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (cancelled) {
        return;
      }

      // On any fetch error, keep the cached data rather than wiping the UI.
      if (subs.error || insts.error || settingsResponse.error) {
        setLoading(false);
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
      }

      const next: AppData = {
        subscriptions: (subs.data as SubscriptionRow[]).map(rowToSubscription),
        installments: (insts.data as InstallmentRow[]).map(rowToInstallment),
        settings,
      };
      saveData(cacheKey, next);
      setData(next);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user.id, user.email, cacheKey]);

  const addSubscription = useCallback(
    (input: Omit<Subscription, 'id'>) => {
      const sub: Subscription = { ...input, id: newId() };
      apply((previous) => ({
        ...previous,
        subscriptions: [...previous.subscriptions, sub],
      }));
      void supabase
        .from('subscriptions')
        .insert(subscriptionToRow(sub, user.id));
    },
    [apply, user.id],
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
        void supabase
          .from('subscriptions')
          .update(subscriptionToRow({ ...updated, ...patch }, user.id))
          .eq('id', id);
      }
    },
    [apply, user.id],
  );

  const deleteSubscription = useCallback(
    (id: string) => {
      apply((previous) => ({
        ...previous,
        subscriptions: previous.subscriptions.filter((item) => item.id !== id),
      }));
      void supabase.from('subscriptions').delete().eq('id', id);
    },
    [apply],
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
      void supabase
        .from('installments')
        .insert(installmentToRow(inst, user.id));
    },
    [apply, user.id],
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
        void supabase
          .from('installments')
          .update(installmentToRow({ ...updated, ...patch }, user.id))
          .eq('id', id);
      }
    },
    [apply, user.id],
  );

  const deleteInstallment = useCallback(
    (id: string) => {
      apply((previous) => ({
        ...previous,
        installments: previous.installments.filter((item) => item.id !== id),
      }));
      void supabase.from('installments').delete().eq('id', id);
    },
    [apply],
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
      void supabase.from('app_settings').upsert(settingsToRow(next, user.id));
    },
    [apply, user.id],
  );

  // Import/restore: replace everything for this user, server-side too.
  const replaceData = useCallback(
    (incoming: AppData) => {
      const next: AppData = {
        subscriptions: incoming.subscriptions,
        installments: incoming.installments,
        settings: { ...emptyData.settings, ...incoming.settings },
      };
      apply(() => next);
      void (async () => {
        await Promise.all([
          supabase.from('subscriptions').delete().eq('user_id', user.id),
          supabase.from('installments').delete().eq('user_id', user.id),
        ]);
        await Promise.all([
          next.subscriptions.length
            ? supabase
                .from('subscriptions')
                .insert(
                  next.subscriptions.map((s) => subscriptionToRow(s, user.id)),
                )
            : Promise.resolve(),
          next.installments.length
            ? supabase
                .from('installments')
                .insert(
                  next.installments.map((i) => installmentToRow(i, user.id)),
                )
            : Promise.resolve(),
          supabase
            .from('app_settings')
            .upsert(settingsToRow(next.settings, user.id)),
        ]);
      })();
    },
    [apply, user.id],
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
