/**
 * Single source of truth for all app data, exposed via React context.
 *
 * State lives in one object (`AppData`) initialised from localStorage and
 * written back on every change. Components read the current data and call the
 * typed action helpers — they never touch localStorage directly.
 *
 * (Structurally: this is the app's "store". In this small PWA a context +
 * useState replaces what Redux Toolkit would do in the main work repo.)
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { advanceByCycle, rollForwardToFuture } from '../lib/dates';
import { loadData, saveData } from '../lib/storage';
import type {
  AppData,
  AppSettings,
  EmailSettings,
  Installment,
  Subscription,
} from '../types';

interface AppDataContextValue {
  data: AppData;
  subscriptions: Subscription[];
  installments: Installment[];
  settings: AppSettings;

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
  updateEmailSettings: (patch: Partial<EmailSettings>) => void;
  replaceData: (data: AppData) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function newId(): string {
  return crypto.randomUUID();
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);

  // Persist on every change.
  useEffect(() => {
    saveData(data);
  }, [data]);

  const addSubscription = useCallback((input: Omit<Subscription, 'id'>) => {
    setData((prev) => ({
      ...prev,
      subscriptions: [...prev.subscriptions, { ...input, id: newId() }],
    }));
  }, []);

  const updateSubscription = useCallback(
    (id: string, patch: Partial<Subscription>) => {
      setData((prev) => ({
        ...prev,
        subscriptions: prev.subscriptions.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      }));
    },
    [],
  );

  const deleteSubscription = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      subscriptions: prev.subscriptions.filter((item) => item.id !== id),
    }));
  }, []);

  const markSubscriptionRenewed = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      subscriptions: prev.subscriptions.map((item) => {
        if (item.id !== id) return item;
        // The current renewal happened: advance one cycle, then skip any
        // further cycles that are already in the past.
        const advanced = advanceByCycle(
          item.nextRenewal,
          item.cycle,
          item.customIntervalDays,
        );
        const nextRenewal = rollForwardToFuture(
          advanced,
          item.cycle,
          item.customIntervalDays,
        );
        return { ...item, nextRenewal };
      }),
    }));
  }, []);

  const addInstallment = useCallback((input: Omit<Installment, 'id'>) => {
    setData((prev) => ({
      ...prev,
      installments: [...prev.installments, { ...input, id: newId() }],
    }));
  }, []);

  const updateInstallment = useCallback(
    (id: string, patch: Partial<Installment>) => {
      setData((prev) => ({
        ...prev,
        installments: prev.installments.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      }));
    },
    [],
  );

  const deleteInstallment = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      installments: prev.installments.filter((item) => item.id !== id),
    }));
  }, []);

  const markInstallmentPaid = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      installments: prev.installments.map((item) =>
        item.id === id
          ? {
              ...item,
              paidPayments: Math.min(item.totalPayments, item.paidPayments + 1),
            }
          : item,
      ),
    }));
  }, []);

  const markInstallmentUnpaid = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      installments: prev.installments.map((item) =>
        item.id === id
          ? { ...item, paidPayments: Math.max(0, item.paidPayments - 1) }
          : item,
      ),
    }));
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setData((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  const updateEmailSettings = useCallback((patch: Partial<EmailSettings>) => {
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        email: { ...prev.settings.email, ...patch },
      },
    }));
  }, []);

  const replaceData = useCallback((next: AppData) => {
    setData(next);
  }, []);

  const value = useMemo<AppDataContextValue>(
    () => ({
      data,
      subscriptions: data.subscriptions,
      installments: data.installments,
      settings: data.settings,
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
      updateEmailSettings,
      replaceData,
    }),
    [
      data,
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
      updateEmailSettings,
      replaceData,
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
