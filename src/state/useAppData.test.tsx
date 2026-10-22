// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';

import { demoData } from '../lib/demo';
import { AppDataProvider, useAppData } from './useAppData';

// Records every write the store sends; reads resolve empty.
const writes: string[] = [];
const rpc = vi.fn<(name: string, args: unknown) => Promise<unknown>>((name) => {
  writes.push(`rpc ${name}`);
  return Promise.resolve({ error: rpcError });
});
let rpcError: unknown = null;
vi.mock('../lib/supabase', () => {
  const table = (name: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      delete: () => (writes.push(`delete ${name}`), chain),
      insert: () => (writes.push(`insert ${name}`), chain),
      upsert: () => (writes.push(`upsert ${name}`), chain),
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [], error: null }),
    };
    return chain;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: table,
      rpc: (name: string, args: unknown) => rpc(name, args),
      channel: () => channel,
      removeChannel: () => Promise.resolve(),
    },
  };
});

let store: ReturnType<typeof useAppData>;
function Capture() {
  store = useAppData();
  return null;
}

afterEach(cleanup);

async function renderStore() {
  render(
    <AppDataProvider user={{ id: 'user-1', email: 'demo@example.com' }}>
      <Capture />
    </AppDataProvider>,
  );
  await act(async () => {});
  writes.length = 0;
  rpc.mockClear();
}

describe('AppDataProvider restore', () => {
  beforeEach(() => {
    rpcError = null;
  });

  // Delete-then-insert in separate requests loses the account's data if the
  // connection drops in between; the server must do both in one transaction.
  it('sends a restore as one request with every row', async () => {
    await renderStore();
    const backup = demoData();

    await act(async () => {
      store.replaceData(backup);
    });

    expect(writes).toEqual(['rpc restore_backup']);
    expect(rpc).toHaveBeenCalledWith('restore_backup', {
      subscriptions: backup.subscriptions.map((item) =>
        expect.objectContaining({
          id: item.id,
          user_id: 'user-1',
          next_renewal: item.nextRenewal,
        }),
      ),
      installments: backup.installments.map((item) =>
        expect.objectContaining({
          id: item.id,
          paid_payments: item.paidPayments,
        }),
      ),
      settings: expect.objectContaining({
        user_id: 'user-1',
        reminder_lead_days: backup.settings.reminderLeadDays,
      }),
    });
  });

  it('shows the sync banner when the restore fails', async () => {
    await renderStore();
    rpcError = { message: 'network' };

    await act(async () => {
      store.replaceData(demoData());
    });

    expect(store.syncError).toMatch(/Couldn't save/);
  });
});
