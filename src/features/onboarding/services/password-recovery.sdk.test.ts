import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasswordRecoveryOperation, requestPasswordRecovery } from './password-recovery.service';

const origin = 'http://127.0.0.1:55431';
const user = (id: string) => ({ id, aud: 'authenticated', role: 'authenticated', email: `${id}@crewflow-onboarding.test`, app_metadata: {}, user_metadata: {}, created_at: '2026-10-20T00:00:00Z' });
const token = (id: string) => ['header', btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })), 'signature'].join('.');
const authSession = (id: string) => ({ access_token: token(id), refresh_token: 'disposable-fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(id) });

describe('recovery with the installed official Auth SDK', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true'); vi.stubEnv('VITE_APP_DATA_SOURCE', 'supabase'); vi.stubEnv('VITE_SUPABASE_URL', origin); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-sdk-fixture');
    window.localStorage.clear(); window.sessionStorage.clear();
  });
  it('uses recover/verify(recovery)/user endpoints without replacing or signing out a pre-existing app session', async () => {
    const existing = authSession('ordinary'); const key = 'ordinary-app-fixture'; window.localStorage.setItem(key, JSON.stringify(existing));
    const requests: { path: string; method: string; body: Record<string, unknown>; authorization: string | null; redirect: string | null; scope: string | null }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)); const body = init?.body ? JSON.parse(String(init.body)) : {};
      const request = { path: url.pathname, redirect: url.searchParams.get('redirect_to'), scope: url.searchParams.get('scope'), method: init?.method ?? 'GET', body, authorization: new Headers(init?.headers).get('authorization') }; requests.push(request);
      const response = url.pathname.endsWith('/recover') ? {} : url.pathname.endsWith('/verify') ? authSession('recovered') : url.pathname.endsWith('/user') ? user('recovered') : {};
      return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const ordinary = createClient(origin, 'public-sdk-fixture', { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: key } });
    const before = await ordinary.auth.getSession(); expect(before.data.session?.user.id).toBe('ordinary');
    const events: string[] = []; const { data: listener } = ordinary.auth.onAuthStateChange((event) => { events.push(event); });
    try {
      await requestPasswordRecovery('existing@crewflow-onboarding.test');
      const operation = createPasswordRecoveryOperation('Opaque_URL-safe-Token_123456789');
      expect(requests.map((request) => request.path)).toEqual(['/auth/v1/recover']);
      await operation.complete('password');
      await vi.waitFor(() => expect(requests.some((request) => request.path === '/auth/v1/logout' && request.scope === 'local')).toBe(true));
      expect(requests.find((request) => request.path === '/auth/v1/recover')?.redirect).toBe('http://127.0.0.1:8096/reset-password');
      expect(requests.find((request) => request.path === '/auth/v1/recover')?.body).toMatchObject({ email: 'existing@crewflow-onboarding.test' });
      expect(requests.find((request) => request.path === '/auth/v1/verify')?.body).toMatchObject({ token_hash: 'Opaque_URL-safe-Token_123456789', type: 'recovery' });
      const update = requests.find((request) => request.path === '/auth/v1/user'); expect(update?.method).toBe('PUT'); expect(update?.body).toMatchObject({ password: 'password' });
      expect(update?.authorization).toBe(`Bearer ${token('recovered')}`);
      expect(requests.filter((request) => request.path.includes('/logout')).every((request) => request.authorization !== `Bearer ${existing.access_token}`)).toBe(true);
      expect((await ordinary.auth.getSession()).data.session?.user.id).toBe('ordinary'); expect(events).not.toContain('SIGNED_OUT'); expect(events).not.toContain('PASSWORD_RECOVERY');
      expect(JSON.parse(window.localStorage.getItem(key)!)).toEqual(existing); expect(window.localStorage.length).toBe(1); expect(window.sessionStorage.length).toBe(0);
    } finally { listener.subscription.unsubscribe(); await ordinary.auth.stopAutoRefresh(); }
  });
});
