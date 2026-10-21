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

  // The demo should show every state at a glance, whatever today is —
  // including month ends, where date-fns clamps the plan dates.
  it.each([
    '2026-07-01',
    '2026-10-28',
    '2026-10-31',
    '2027-02-28',
    '2028-02-29',
    '2026-12-31',
  ])('on %s: overdue, due soon and paid-off items all show', (iso) => {
    const seeded = demoData(new Date(`${iso}T12:00:00`));
    vi.setSystemTime(new Date(`${iso}T12:00:00`));
    const due = getDueItems(seeded, seeded.settings.reminderLeadDays);
    expect(due.some((item) => item.days < 0)).toBe(true);
    const laptop = due.find((item) => item.kind === 'installment');
    expect(laptop?.days).toBeGreaterThanOrEqual(0);
    expect(laptop?.days).toBeLessThanOrEqual(3);
    expect(
      seeded.installments.some(
        (plan) => plan.paidPayments === plan.totalPayments,
      ),
    ).toBe(true);
  });
});
