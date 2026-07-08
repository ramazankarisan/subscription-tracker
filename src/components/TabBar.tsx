/** Bottom navigation bar (mobile-first). */
import {
  CardIcon,
  DashboardIcon,
  InstallmentsIcon,
  SettingsIcon,
} from './icons';
import styles from './TabBar.module.css';

export type TabId = 'dashboard' | 'subscriptions' | 'installments' | 'settings';

const TABS: Array<{ id: TabId; label: string; Icon: typeof DashboardIcon }> = [
  { id: 'dashboard', label: 'Home', Icon: DashboardIcon },
  { id: 'subscriptions', label: 'Subscriptions', Icon: CardIcon },
  { id: 'installments', label: 'Installments', Icon: InstallmentsIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

interface TabBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className={styles.bar} aria-label="Main navigation">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`${styles.tab} ${active === id ? styles.tabActive : ''}`}
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
