import { exportData } from './storage';
import { parseBackup } from './backup';
import { demoData } from './demo';
import { getDueItems } from './reminders';

describe('demo seed', () => {
  // Built per test, after setupTests pins the clock.
  let data: ReturnType<typeof demoData>;
  beforeEach(() => {
    data = demoData();
  });

  it('is valid data (it would pass a restore)', () => {
    expect(parseBackup(exportData(data))).not.toBeNull();
  });

  // The demo should show every state at a glance, whatever today is.
  it('always has something overdue and something due soon', () => {
    const days = getDueItems(data, data.settings.reminderLeadDays).map(
      (item) => item.days,
    );
    expect(days.some((value) => value < 0)).toBe(true);
    expect(days.some((value) => value >= 0)).toBe(true);
  });

  it('puts the next laptop payment 3 days out and has a paid-off plan', () => {
    const laptop = getDueItems(data, 7).find(
      (item) => item.kind === 'installment',
    );
    expect(laptop?.days).toBe(3);
    expect(
      data.installments.some(
        (plan) => plan.paidPayments === plan.totalPayments,
      ),
    ).toBe(true);
  });
});
