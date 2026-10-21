// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

import { demoData } from '../lib/demo';
import { useMarkDone } from './useMarkDone';

const store = {
  markSubscriptionRenewed: vi.fn(),
  updateSubscription: vi.fn(),
  markInstallmentPaid: vi.fn(),
  updateInstallment: vi.fn(),
};
vi.mock('../state/useAppData', () => ({ useAppData: () => store }));

const { subscriptions, installments } = demoData(new Date('2026-07-01'));
const netflix = subscriptions[0];
const laptop = installments[0];
const paidOff = installments[2];

function Harness() {
  const { renew, pay, dismiss, toast } = useMarkDone();
  return (
    <>
      <button onClick={() => renew(netflix)}>renew</button>
      <button onClick={() => pay(laptop)}>pay</button>
      <button onClick={() => pay(paidOff)}>pay paid-off</button>
      <button onClick={dismiss}>edit</button>
      {toast}
    </>
  );
}

const notice = () => screen.getByRole('status').textContent;
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  vi.clearAllMocks();
  render(<Harness />);
});
afterEach(cleanup);

describe('useMarkDone', () => {
  it('renews, says so, and Undo restores the previous date', () => {
    click('renew');
    expect(store.markSubscriptionRenewed).toHaveBeenCalledWith(netflix.id);
    expect(notice()).toMatch(/Netflix marked renewed/);
    click('Undo');
    expect(store.updateSubscription).toHaveBeenCalledWith(netflix.id, {
      nextRenewal: netflix.nextRenewal,
    });
    expect(notice()).toBe('');
  });

  it('marks a payment paid and Undo restores the previous count', () => {
    click('pay');
    expect(store.markInstallmentPaid).toHaveBeenCalledWith(laptop.id);
    expect(notice()).toMatch(/payment 5 of 12 marked paid/);
    click('Undo');
    expect(store.updateInstallment).toHaveBeenCalledWith(laptop.id, {
      paidPayments: 4,
    });
  });

  it('does nothing for a plan that is already paid off', () => {
    click('pay paid-off');
    expect(store.markInstallmentPaid).not.toHaveBeenCalled();
    expect(notice()).toBe('');
  });

  it('drops the undo once the item is edited another way', () => {
    click('renew');
    click('edit');
    expect(notice()).toBe('');
  });

  it('a second action replaces the notice and restarts the timer', () => {
    click('renew');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    click('pay');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(notice()).toMatch(/Laptop/);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(notice()).toBe('');
  });

  it('stays while focused, then hides a few seconds after', () => {
    click('renew');
    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(notice()).toMatch(/Netflix/);
    fireEvent.blur(screen.getByRole('button', { name: 'Undo' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(notice()).toBe('');
  });
});
