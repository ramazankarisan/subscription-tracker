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
  markInstallmentUnpaid: vi.fn(),
};
vi.mock('../state/useAppData', () => ({ useAppData: () => store }));

function Harness() {
  const { renew, pay, toast } = useMarkDone();
  const { subscriptions, installments } = demoData();
  return (
    <>
      <button onClick={() => renew(subscriptions[0])}>renew</button>
      <button onClick={() => pay(installments[0])}>pay</button>
      {toast}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  render(<Harness />);
});
afterEach(cleanup);

describe('useMarkDone', () => {
  it('renews, says so, and Undo restores the previous date', () => {
    const netflix = demoData().subscriptions[0];
    fireEvent.click(screen.getByText('renew'));
    expect(store.markSubscriptionRenewed).toHaveBeenCalledWith(netflix.id);
    expect(screen.getByRole('status').textContent).toMatch(
      /Netflix marked renewed/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(store.updateSubscription).toHaveBeenCalledWith(netflix.id, {
      nextRenewal: netflix.nextRenewal,
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('marks a payment paid and Undo takes it back', () => {
    fireEvent.click(screen.getByText('pay'));
    expect(screen.getByRole('status').textContent).toMatch(
      /payment 5 of 12 marked paid/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(store.markInstallmentUnpaid).toHaveBeenCalledOnce();
  });

  it('hides the notice after a few seconds', () => {
    fireEvent.click(screen.getByText('renew'));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
