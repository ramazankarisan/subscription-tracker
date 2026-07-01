/** Bottom navigation bar (mobile-first). */
import {
  CardIcon,
  DashboardIcon,
  InstallmentsIcon,
  SettingsIcon,
} from './icons';

export type TabId = 'dashboard' | 'subscriptions' | 'installments' | 'settings';

const TABS: { id: TabId; label: string; Icon: typeof DashboardIcon }[] = [
  { id: 'dashboard', label: 'Home', Icon: DashboardIcon },
  { id: 'subscriptions', label: 'Subs', Icon: CardIcon },
  { id: 'installments', label: 'Plans', Icon: InstallmentsIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

interface TabBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`tab ${active === id ? 'tab-active' : ''}`}
          onClick={() => onChange(id)}
          aria-current={active === id ? 'page' : undefined}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
