// A fresh clone has no .env: the module must still load so the app can show
// its "Backend not configured" screen instead of a blank page.
describe('supabase client without env', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads and reports itself as not configured', async () => {
    const module = await import('./supabase');
    expect(module.isSupabaseConfigured).toBe(false);
  });
});
