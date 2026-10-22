// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';

import { demoData } from '../lib/demo';
import { AppDataProvider, useAppData } from './useAppData';

// Records every write the store sends; reads resolve empty.
const writes: string[] = [];
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
      rpc: (name: string) => {
        writes.push(`rpc ${name}`);
        return Promise.resolve({ error: null });
      },
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

describe('AppDataProvider restore', () => {
  // Delete-then-insert in separate requests loses the account's data if the
  // connection drops in between; the server must do both in one transaction.
  it('sends a restore as one request', async () => {
    render(
      <AppDataProvider user={{ id: 'user-1', email: 'demo@example.com' }}>
        <Capture />
      </AppDataProvider>,
    );
    await act(async () => {});
    writes.length = 0;

    await act(async () => {
      store.replaceData(demoData());
    });

    expect(writes).toEqual(['rpc restore_backup']);
  });
});
