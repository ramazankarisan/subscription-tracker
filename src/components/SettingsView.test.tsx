// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { defaultSettings, emptyData } from '../lib/storage';
import type { AppSettings } from '../types';
import { SettingsView } from './SettingsView';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../lib/passkeys', () => ({ passkeysSupported: () => false }));

// A stateful stand-in for the store: every updateSettings call is recorded
// and applied, like the real optimistic store does.
const saved: Array<Partial<AppSettings>> = [];
let store: Record<string, unknown> = {};
vi.mock('../state/useAppData', () => ({ useAppData: () => store }));

function Harness() {
  const [settings, setSettings] = useState<AppSettings>({
    ...defaultSettings,
    recipientEmail: 'demo@example.com',
  });
  store = {
    data: { ...emptyData, settings },
    settings,
    userEmail: 'demo@example.com',
    updateSettings: (patch: Partial<AppSettings>) => {
      saved.push(patch);
      setSettings((previous) => ({ ...previous, ...patch }));
    },
  };
  return <SettingsView />;
}

const recipientInput = () =>
  screen.getByLabelText<HTMLInputElement>('Send reminders to');
const leadDaysInput = () =>
  screen.getByLabelText<HTMLInputElement>('Show anything due within (days)');

let unmount: () => void;
beforeEach(() => {
  saved.length = 0;
  ({ unmount } = render(<Harness />));
});
afterEach(cleanup);

describe('SettingsView reminder recipient', () => {
  it('can be cleared to type a new address', () => {
    fireEvent.change(recipientInput(), { target: { value: '' } });
    expect(recipientInput().value).toBe('');
  });

  it('saves a valid address once, on blur', () => {
    fireEvent.change(recipientInput(), { target: { value: 'new@example' } });
    fireEvent.change(recipientInput(), {
      target: { value: 'new@example.com' },
    });
    fireEvent.blur(recipientInput());
    expect(saved).toEqual([{ recipientEmail: 'new@example.com' }]);
  });

  it('never saves an invalid address', () => {
    fireEvent.change(recipientInput(), { target: { value: 'not-an-email' } });
    fireEvent.blur(recipientInput());
    expect(saved).toEqual([]);
    expect(screen.getByRole('alert').textContent).toMatch(/valid email/i);
  });

  it('clears the error as soon as the user edits again', () => {
    fireEvent.change(recipientInput(), { target: { value: 'not-an-email' } });
    fireEvent.blur(recipientInput());
    fireEvent.change(recipientInput(), { target: { value: 'new@' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falls back to the account email when left blank', () => {
    fireEvent.change(recipientInput(), { target: { value: '' } });
    fireEvent.blur(recipientInput());
    expect(recipientInput().value).toBe('demo@example.com');
  });

  it('saves a pending edit when the view closes without a blur', () => {
    fireEvent.change(recipientInput(), {
      target: { value: 'new@example.com' },
    });
    unmount();
    expect(saved).toEqual([{ recipientEmail: 'new@example.com' }]);
  });
});

describe('SettingsView due-within days', () => {
  it('can be cleared without snapping to 0', () => {
    fireEvent.change(leadDaysInput(), { target: { value: '' } });
    expect(leadDaysInput().value).toBe('');
    expect(saved).toEqual([]);
  });

  it('saves the retyped number once, on blur', () => {
    fireEvent.change(leadDaysInput(), { target: { value: '' } });
    fireEvent.change(leadDaysInput(), { target: { value: '1' } });
    fireEvent.change(leadDaysInput(), { target: { value: '14' } });
    fireEvent.blur(leadDaysInput());
    expect(saved).toEqual([{ reminderLeadDays: 14 }]);
  });

  it.each(['', '366', '-1', '1.5'])(
    'restores %j on blur without saving it',
    (value) => {
      fireEvent.change(leadDaysInput(), { target: { value } });
      fireEvent.blur(leadDaysInput());
      expect(leadDaysInput().value).toBe('7');
      expect(saved).toEqual([]);
    },
  );
});
