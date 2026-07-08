import {
  deletePasskey,
  listPasskeys,
  passkeysSupported,
  registerPasskey,
  signInWithPasskey,
} from './passkeys';

// Stand-in for the Supabase auth client so we can drive each ceremony's result.
const mocks = vi.hoisted(() => ({
  registerPasskey: vi.fn(),
  signInWithPasskey: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      registerPasskey: mocks.registerPasskey,
      signInWithPasskey: mocks.signInWithPasskey,
      passkey: { list: mocks.list, delete: mocks.remove },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('passkeysSupported', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('is false without a WebAuthn-capable window', () => {
    expect(passkeysSupported()).toBe(false);
  });

  it('is true when the browser exposes PublicKeyCredential', () => {
    (globalThis as { window?: unknown }).window = {
      PublicKeyCredential: () => {},
    };
    expect(passkeysSupported()).toBe(true);
  });
});

describe('registerPasskey / signInWithPasskey outcomes', () => {
  it('reports success when the ceremony returns no error', async () => {
    mocks.registerPasskey.mockResolvedValue({ error: null });
    expect(await registerPasskey()).toEqual({ ok: true });
  });

  it('treats a dismissed prompt (NotAllowedError) as a quiet cancel', async () => {
    mocks.signInWithPasskey.mockResolvedValue({
      error: { name: 'NotAllowedError', message: 'user cancelled' },
    });
    const result = await signInWithPasskey();
    expect(result).toMatchObject({ ok: false, cancelled: true });
  });

  it('treats an AbortError as a cancel too', async () => {
    mocks.signInWithPasskey.mockResolvedValue({
      error: { name: 'AbortError', message: '' },
    });
    expect(await signInWithPasskey()).toMatchObject({ cancelled: true });
  });

  it('surfaces a real error message, not a cancel', async () => {
    mocks.registerPasskey.mockResolvedValue({
      error: { name: 'SecurityError', message: 'bad origin' },
    });
    expect(await registerPasskey()).toEqual({
      ok: false,
      cancelled: false,
      message: 'bad origin',
    });
  });

  it('falls back to a friendly message when a thrown error has none', async () => {
    mocks.signInWithPasskey.mockRejectedValue({});
    const result = await signInWithPasskey();
    expect(result).toMatchObject({ ok: false, cancelled: false });
    expect((result as { message: string }).message).toMatch(/email code/i);
  });
});

describe('listPasskeys', () => {
  it('maps snake_case rows to camelCase summaries', async () => {
    mocks.list.mockResolvedValue({
      data: [
        {
          id: 'p1',
          friendly_name: 'iPhone',
          created_at: '2026-07-01',
          last_used_at: '2026-07-05',
        },
      ],
      error: null,
    });
    expect(await listPasskeys()).toEqual([
      {
        id: 'p1',
        friendlyName: 'iPhone',
        createdAt: '2026-07-01',
        lastUsedAt: '2026-07-05',
      },
    ]);
  });

  it('returns an empty list on error', async () => {
    mocks.list.mockResolvedValue({ data: null, error: { message: 'nope' } });
    expect(await listPasskeys()).toEqual([]);
  });
});

describe('deletePasskey', () => {
  it('returns null on success', async () => {
    mocks.remove.mockResolvedValue({ error: null });
    expect(await deletePasskey('p1')).toBeNull();
  });

  it('returns an error string on failure', async () => {
    mocks.remove.mockResolvedValue({ error: { message: 'boom' } });
    expect(await deletePasskey('p1')).toMatch(/remove/i);
  });
});
