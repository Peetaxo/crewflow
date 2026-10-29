import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let fixtureNumber = 0;
let origin: string;
let storageKey: string;
const user = (id: string) => ({
  id, aud: 'authenticated', role: 'authenticated', email: `${id}@crewflow-onboarding.test`,
  app_metadata: {}, user_metadata: {}, created_at: '2026-10-20T00:00:00Z',
});
const token = (id: string) => ['header', btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })), 'signature'].join('.');
const session = (id: string) => ({
  access_token: token(id), refresh_token: `fixture-refresh-${id}`, token_type: 'bearer',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(id),
});
let client: SupabaseClient | null;
let requests: string[];

describe('ordinary app singleton with the installed Auth SDK', () => {
  beforeEach(() => {
    vi.resetModules();
    // Each simulated browser gets its own SDK storage/broadcast scope.
    origin = `http://sdk-check-${++fixtureNumber}.localhost:55431`;
    storageKey = `sb-sdk-check-${fixtureNumber}-auth-token`;
    vi.stubEnv('VITE_APP_DATA_SOURCE', 'supabase');
    vi.stubEnv('VITE_SUPABASE_URL', origin);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-sdk-fixture');
    window.localStorage.clear(); window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    requests = [];
    client = null;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe(origin);
      requests.push(url.pathname);
      const data = url.pathname.endsWith('/token') ? session('ordinary') : user('incoming');
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
  });
  afterEach(async () => {
    if (client) await client.auth.stopAutoRefresh();
    window.history.replaceState(null, '', '/');
    window.localStorage.clear(); window.sessionStorage.clear();
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });

  it.each(['/activate', '/reset-password', '/login'])('does not replace the stored account from an implicit callback on %s', async (path) => {
    const existing = session('ordinary');
    window.localStorage.setItem(storageKey, JSON.stringify(existing));
    const hash = new URLSearchParams({
      access_token: token('incoming'), refresh_token: 'fixture-incoming-refresh',
      expires_in: '3600', token_type: 'bearer', type: 'recovery',
    }).toString();
    window.history.replaceState(null, '', `${path}#${hash}`);
    client = (await import('./supabase')).supabase;
    expect((await client.auth.getSession()).data.session?.user.id).toBe('ordinary');
    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual(existing);
    expect(requests).toEqual([]);
  });

  it.each([
    ['/activate', `#token=${'a'.repeat(64)}`, 'activation'],
    ['/reset-password', '#token_hash=Opaque_URL-safe-Token_123456789', 'recovery'],
  ])('leaves the supported %s capability for its explicit route handler', async (path, hash, kind) => {
    window.localStorage.setItem(storageKey, JSON.stringify(session('ordinary')));
    window.history.replaceState(null, '', `${path}${hash}`);
    client = (await import('./supabase')).supabase;
    expect((await client.auth.getSession()).data.session?.user.id).toBe('ordinary');
    expect(window.location.hash).toBe(hash);
    const capability = kind === 'activation'
      ? (await import('../features/onboarding/activation-link')).consumeBrowserActivationToken()
      : (await import('../features/onboarding/password-recovery-link')).consumeBrowserRecoveryToken();
    expect(capability).toBe(hash.split('=')[1]);
    expect(window.location.hash).toBe('');
    expect(requests).toEqual([]);
  });

  it('still signs in explicitly with email and persists the ordinary account', async () => {
    client = (await import('./supabase')).supabase;
    expect((await client.auth.getSession()).data.session).toBeNull();
    const result = await client.auth.signInWithPassword({ email: 'ordinary@crewflow-onboarding.test', password: 'disposable-fixture' });
    expect(result.error).toBeNull();
    expect(result.data.user?.id).toBe('ordinary');
    expect(JSON.parse(window.localStorage.getItem(storageKey)!).user.id).toBe('ordinary');
    expect(requests).toEqual(['/auth/v1/token']);
  });
});
