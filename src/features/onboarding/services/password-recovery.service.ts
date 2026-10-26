import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { isLocalOnboardingPilot } from '../local-pilot';
import { isValidOnboardingPassword } from '../password-policy';
import { isRecoveryToken } from '../password-recovery-link';

export const isPasswordRecoveryEnabled = isLocalOnboardingPilot;
export type PasswordRecoveryErrorCode = 'disabled' | 'test_only' | 'invalid_password' | 'invalid_link' | 'unavailable' | 'busy';
export class PasswordRecoveryError extends Error {
  constructor(readonly code: PasswordRecoveryErrorCode) { super(code); this.name = 'PasswordRecoveryError'; }
}
const ensureEnabled = () => { if (!isPasswordRecoveryEnabled()) throw new PasswordRecoveryError('disabled'); };
const createIsolatedClient = (): SupabaseClient => {
  ensureEnabled();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new PasswordRecoveryError('unavailable');
  return createClient(import.meta.env.VITE_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `nodu-pilot-recovery-${crypto.randomUUID()}` },
  });
};

/** Account existence and provider responses deliberately have the same result. */
export const requestPasswordRecovery = async (email: string): Promise<void> => {
  ensureEnabled();
  const normalized = email.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._+-]*@crewflow-onboarding\.test$/.test(normalized)) throw new PasswordRecoveryError('test_only');
  let client: SupabaseClient | null = null;
  try {
    client = createIsolatedClient();
    await client.auth.resetPasswordForEmail(normalized, { redirectTo: 'http://127.0.0.1:8096/reset-password' });
  } catch {
    // Never turn provider errors, account status or transport details into enumeration.
  } finally {
    if (client) void client.auth.stopAutoRefresh().catch(() => {});
  }
};

const isUnauthorized = (error: unknown): boolean => Boolean(error && typeof error === 'object' && 'status' in error && [400, 401, 403, 404, 422].includes(Number(error.status)));
const cleanupClient = (client: SupabaseClient): void => {
  void client.auth.stopAutoRefresh().catch(() => {});
  void client.auth.signOut({ scope: 'local' }).catch(() => {});
};

/** One link revision owns one isolated in-memory Auth session, including retries. */
export const createPasswordRecoveryOperation = (initialToken: string | null) => {
  let token = initialToken;
  let client: SupabaseClient | null = null;
  let verifiedSession: Session | null = null;
  let disposed = false;
  let pending = false;
  const dispose = () => {
    disposed = true;
    token = null;
    verifiedSession = null;
    if (client) cleanupClient(client);
    client = null;
  };
  const complete = async (password: string): Promise<void> => {
    ensureEnabled();
    if (disposed || !token || !isRecoveryToken(token)) throw new PasswordRecoveryError('invalid_link');
    if (pending) throw new PasswordRecoveryError('busy');
    if (!isValidOnboardingPassword(password)) throw new PasswordRecoveryError('invalid_password');
    pending = true;
    let current: SupabaseClient | null = null;
    try {
      current = client ?? createIsolatedClient();
      client = current;
      if (!verifiedSession) {
        const { data, error } = await current.auth.verifyOtp({ token_hash: token, type: 'recovery' });
        if (disposed) { cleanupClient(current); throw new PasswordRecoveryError('invalid_link'); }
        if (error || !data.session) {
          if (error && !isUnauthorized(error)) throw new PasswordRecoveryError('unavailable');
          dispose();
          throw new PasswordRecoveryError('invalid_link');
        }
        verifiedSession = data.session;
      }
      if (disposed) throw new PasswordRecoveryError('invalid_link');
      const { error } = await current.auth.updateUser({ password });
      if (disposed) throw new PasswordRecoveryError('invalid_link');
      if (error) {
        if ('code' in error && (error.code === 'weak_password' || error.code === 'same_password')) throw new PasswordRecoveryError('invalid_password');
        if (isUnauthorized(error)) { dispose(); throw new PasswordRecoveryError('invalid_link'); }
        throw new PasswordRecoveryError('unavailable');
      }
      dispose();
    } catch (error) {
      if (disposed && current) cleanupClient(current);
      throw error instanceof PasswordRecoveryError ? error : new PasswordRecoveryError('unavailable');
    } finally {
      pending = false;
    }
  };
  return { complete, dispose };
};
export type PasswordRecoveryOperation = ReturnType<typeof createPasswordRecoveryOperation>;
