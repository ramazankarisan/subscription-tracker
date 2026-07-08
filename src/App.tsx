import { useState } from 'react';

import styles from './App.module.css';
import { AuthGate } from './components/AuthGate';
import { Dashboard } from './components/Dashboard';
import { InstallmentsView } from './components/InstallmentsView';
import { SettingsView } from './components/SettingsView';
import { SubscriptionsView } from './components/SubscriptionsView';
import { TabBar, type TabId } from './components/TabBar';
import { BellIcon } from './components/icons';
import { AppDataProvider, useAppData } from './state/useAppData';

function AppShell() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const { settings, syncError, dismissSyncError } = useAppData();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className="app-brand">
          <BellIcon size={22} />
          <span>SubTrack</span>
        </div>
      </header>

      {syncError && (
        <div className={styles.syncBanner} role="alert">
          <span>⚠ {syncError}</span>
          <button
            className={styles.syncDismiss}
            onClick={dismissSyncError}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <main className={styles.main}>
        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'subscriptions' && (
          <SubscriptionsView leadDays={settings.reminderLeadDays} />
        )}
        {tab === 'installments' && (
          <InstallmentsView leadDays={settings.reminderLeadDays} />
        )}
        {tab === 'settings' && <SettingsView />}
      </main>

      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      {(user) => (
        // key: remount the store per user so refs don't leak across accounts.
        <AppDataProvider key={user.id} user={user}>
          <AppShell />
        </AppDataProvider>
      )}
    </AuthGate>
  );
}
