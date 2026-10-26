import { FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeActivation, isValidActivationPassword, previewActivation } from './activation.service';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke } } }));

const token = 'a'.repeat(64);
const preview = { email: 'crew@example.test', firstName: 'Eva', lastName: 'Nová', phone: '+420123456789', expiresAt: '2026-10-22T10:00:00Z' };

describe('activation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
  });

  it('previews without completing or changing the invitation', async () => {
    invoke.mockResolvedValue({ data: { data: preview }, error: null });
    await expect(previewActivation(token)).resolves.toEqual(preview);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('crew-onboarding', { method: 'POST', body: { action: 'preview', token } });
  });

  it('completes with the exact untrimmed password', async () => {
    const result = { status: 'active', email: preview.email, profileId: 'profile-id' };
    invoke.mockResolvedValue({ data: { data: result }, error: null });
    await expect(completeActivation(token, '  moje heslo 123  ')).resolves.toEqual(result);
    expect(invoke).toHaveBeenCalledWith('crew-onboarding', { method: 'POST', body: { action: 'complete', token, password: '  moje heslo 123  ' } });
  });

  it('does not call the server while disabled', async () => {
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false');
    await expect(previewActivation(token)).rejects.toMatchObject({ code: 'disabled' });
    await expect(completeActivation(token, 'password123456')).rejects.toMatchObject({ code: 'disabled' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['expired_invitation', 'already_active', 'activation_in_progress', 'invalid_invitation', 'disabled', 'invalid_password', 'activation_unavailable'])('preserves %s from non-2xx function responses', async (code) => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: code }), { status: 409 })) });
    await expect(previewActivation(token)).rejects.toMatchObject({ code });
  });

  it('does not expose raw transport errors or malformed success envelopes', async () => {
    invoke.mockRejectedValue(new Error('sensitive transport detail'));
    await expect(previewActivation(token)).rejects.toMatchObject({ code: 'activation_unavailable', message: 'activation_unavailable' });
    invoke.mockResolvedValue({ data: { data: { ...preview, phone: null } }, error: null });
    await expect(previewActivation(token)).rejects.toMatchObject({ code: 'activation_unavailable' });
  });

  it('rejects malformed tokens before any call', async () => {
    await expect(previewActivation('A'.repeat(64))).rejects.toMatchObject({ code: 'invalid_invitation' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('counts Unicode codepoints and enforces the 72 UTF-8 byte bound before mutation', async () => {
    expect(isValidActivationPassword('😀'.repeat(7))).toBe(false);
    expect(isValidActivationPassword('😀'.repeat(8))).toBe(true);
    expect(isValidActivationPassword('a'.repeat(72))).toBe(true);
    expect(isValidActivationPassword('a'.repeat(73))).toBe(false);
    expect(isValidActivationPassword('😀'.repeat(19))).toBe(false);
    await expect(completeActivation(token, 'short')).rejects.toMatchObject({ code: 'invalid_password' });
    await expect(completeActivation(token, '😀'.repeat(19))).rejects.toMatchObject({ code: 'invalid_password' });
    expect(invoke).not.toHaveBeenCalled();
  });
});
