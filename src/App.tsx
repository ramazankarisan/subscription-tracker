import { useState } from 'react';

import './App.css';
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
  const { settings, userEmail, signOut } = useAppData();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <BellIcon size={22} />
          <span>SubTrack</span>
        </div>
        <button
          className="button button-ghost button-small"
          onClick={() => void signOut()}
          title={`Signed in as ${userEmail}`}
        >
          Sign out
        </button>
      </header>

      <main className="app-main">
        {tab === 'dashboard' && (
          <Dashboard onNavigateToSettings={() => setTab('settings')} />
        )}
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
        <AppDataProvider user={user}>
          <AppShell />
        </AppDataProvider>
      )}
    </AuthGate>
  );
}
