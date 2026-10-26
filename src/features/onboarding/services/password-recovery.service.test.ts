import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasswordRecoveryOperation, requestPasswordRecovery, isPasswordRecoveryEnabled } from './password-recovery.service';
const sdk = vi.hoisted(() => ({ createClient: vi.fn(), source: 'supabase' }));
vi.mock('@supabase/supabase-js', () => ({ createClient: sdk.createClient }));
vi.mock('../../../lib/app-config', () => ({ get appDataSource() { return sdk.source; } }));
const token = 'Opaque_URL-safe-Token_123456789';
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const authFixture = () => ({
  resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  verifyOtp: vi.fn().mockResolvedValue({ data: { session: { access_token: 'private', refresh_token: 'private' } }, error: null }),
  updateUser: vi.fn().mockResolvedValue({ data: { user: { id: 'recovered' } }, error: null }),
  signOut: vi.fn().mockResolvedValue({ error: null }), stopAutoRefresh: vi.fn().mockResolvedValue(undefined),
});
let auth: ReturnType<typeof authFixture>;
describe('isolated pilot password recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks(); sdk.source = 'supabase';
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
    auth = authFixture(); sdk.createClient.mockReturnValue({ auth });
  });
  it.each([
    ['onboarding disabled', 'false', 'supabase', 'http://127.0.0.1:55431'],
    ['local data', 'true', 'local', 'http://127.0.0.1:55431'],
    ['remote backend', 'true', 'supabase', 'https://example.supabase.co'],
    ['another local port', 'true', 'supabase', 'http://localhost:54321'],
    ['backend credentials', 'true', 'supabase', 'http://user@localhost:55431'],
    ['backend path', 'true', 'supabase', 'http://localhost:55431/other'],
    ['backend trailing newline', 'true', 'supabase', 'http://localhost:55431\n'],
  ])('keeps %s completely offline', async (_label, enabled, source, url) => {
    vi.stubEnv('VITE_ONBOARDING_ENABLED', enabled); sdk.source = source; vi.stubEnv('VITE_SUPABASE_URL', url);
    expect(isPasswordRecoveryEnabled()).toBe(false);
    await expect(requestPasswordRecovery('pilot@crewflow-onboarding.test')).rejects.toMatchObject({ code: 'disabled' });
    const operation = createPasswordRecoveryOperation(token);
    await expect(operation.complete('password')).rejects.toMatchObject({ code: 'disabled' });
    operation.dispose(); expect(sdk.createClient).not.toHaveBeenCalled();
  });
  it('requests recovery through the official SDK with a nonpersistent, uniquely isolated client', async () => {
    await requestPasswordRecovery('  PILOT@crewflow-onboarding.test  ');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith('pilot@crewflow-onboarding.test', { redirectTo: 'http://127.0.0.1:8096/reset-password' });
    const options = sdk.createClient.mock.calls[0][2];
    expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    expect(options.auth.storageKey).toMatch(/^nodu-pilot-recovery-/);
    await requestPasswordRecovery('unknown@crewflow-onboarding.test');
    expect(sdk.createClient.mock.calls[1][2].auth.storageKey).not.toBe(options.auth.storageKey);
    expect(auth.verifyOtp).not.toHaveBeenCalled(); expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it('returns the identical generic result for existing, unknown and provider failure outcomes', async () => {
    const existing = await requestPasswordRecovery('pilot@crewflow-onboarding.test');
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { message: 'private account status', status: 404 } });
    expect(await requestPasswordRecovery('unknown@crewflow-onboarding.test')).toEqual(existing);
    auth.resetPasswordForEmail.mockRejectedValueOnce(new Error('private transport details'));
    expect(await requestPasswordRecovery('unknown@crewflow-onboarding.test')).toEqual(existing);
  });
  it.each(['real@example.com', 'a@crewflow-onboarding.test.evil', '', 'a b@crewflow-onboarding.test'])('rejects non-test recipients before SDK creation', async (email) => {
    await expect(requestPasswordRecovery(email)).rejects.toMatchObject({ code: 'test_only' });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });
  it('does not verify on opening; authorizes the exact untrimmed password using recovery verification only', async () => {
    const operation = createPasswordRecoveryOperation(token);
    expect(sdk.createClient).not.toHaveBeenCalled();
    await operation.complete('  heslo ');
    expect(auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: token, type: 'recovery' });
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: '  heslo ' });
    expect(auth.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await expect(operation.complete('newother')).rejects.toMatchObject({ code: 'invalid_link' });
  });
  it.each(['short12', '🔒'.repeat(7), 'x'.repeat(73), '🔒'.repeat(19)])('rejects out-of-policy passwords without verifying a capability', async (password) => {
    const operation = createPasswordRecoveryOperation(token);
    await expect(operation.complete(password)).rejects.toMatchObject({ code: 'invalid_password' });
    expect(sdk.createClient).not.toHaveBeenCalled(); operation.dispose();
  });
  it.each(['x'.repeat(72), '🔒'.repeat(18), '🔒'.repeat(8)])('accepts passwords inside the shared codepoint and UTF-8 limits', async (password) => {
    const operation = createPasswordRecoveryOperation(token); await operation.complete(password);
    expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password });
  });

  it('can retry verification after a temporary provider outage without exposing diagnostics', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { status: 503, message: 'private transport details' } });
    const operation = createPasswordRecoveryOperation(token);
    await expect(operation.complete('password')).rejects.toMatchObject({ code: 'unavailable', message: 'unavailable' });
    expect(auth.updateUser).not.toHaveBeenCalled(); await operation.complete('password');
    expect(auth.verifyOtp).toHaveBeenCalledTimes(2); expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('reuses only its already verified in-memory session when password update is retried', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: null, error: { message: 'private update failure', status: 500 } });
    const operation = createPasswordRecoveryOperation(token);
    await expect(operation.complete('password')).rejects.toMatchObject({ code: 'unavailable', message: 'unavailable' });
    await operation.complete('password2');
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1); expect(auth.updateUser).toHaveBeenCalledTimes(2); expect(sdk.createClient).toHaveBeenCalledTimes(1);
  });
  it('allows a different password after same_password without verifying the used recovery capability again', async () => {
    auth.updateUser.mockResolvedValueOnce({ data: null, error: { status: 422, code: 'same_password', message: 'private validation details' } });
    const operation = createPasswordRecoveryOperation(token);
    await expect(operation.complete('password')).rejects.toMatchObject({ code: 'invalid_password', message: 'invalid_password' });
    expect(auth.signOut).not.toHaveBeenCalled();
    await operation.complete('different-password');
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1); expect(auth.updateUser).toHaveBeenCalledTimes(2);
  });

  it('rejects missing/invalid/expired/used capabilities without any password change', async () => {
    const missing = createPasswordRecoveryOperation(null);
    await expect(missing.complete('password')).rejects.toMatchObject({ code: 'invalid_link' });
    expect(sdk.createClient).not.toHaveBeenCalled();
    auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'private expired details', status: 403 } });
    const operation = createPasswordRecoveryOperation(token);
    await expect(operation.complete('password')).rejects.toMatchObject({ code: 'invalid_link', message: 'invalid_link' });
    await expect(operation.complete('password')).rejects.toMatchObject({ code: 'invalid_link' });
    expect(auth.updateUser).not.toHaveBeenCalled(); expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });
  it('blocks duplicate submissions while verification is pending', async () => {
    const pending = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>(); auth.verifyOtp.mockReturnValueOnce(pending.promise);
    const operation = createPasswordRecoveryOperation(token); const first = operation.complete('password');
    await expect(operation.complete('password2')).rejects.toMatchObject({ code: 'busy' });
    pending.resolve({ data: { session: { access_token: 'private' } }, error: null }); await first;
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1); expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });
  it('disposes a verification completing after unmount without changing a password', async () => {
    const pending = deferred<Awaited<ReturnType<typeof auth.verifyOtp>>>(); auth.verifyOtp.mockReturnValueOnce(pending.promise);
    const operation = createPasswordRecoveryOperation(token); const first = operation.complete('password');
    operation.dispose(); pending.resolve({ data: { session: { access_token: 'private' } }, error: null });
    await expect(first).rejects.toMatchObject({ code: 'invalid_link' });
    expect(auth.updateUser).not.toHaveBeenCalled(); expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
