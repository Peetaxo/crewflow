import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { isActivationToken } from '../activation-link';

export type InvitationPreview = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  expiresAt: string;
};

export type ActivationComplete = { status: 'active'; email: string; profileId: string };
const errorCodes = ['disabled', 'invalid_invitation', 'expired_invitation', 'already_active', 'activation_in_progress', 'invalid_password', 'activation_unavailable'] as const;
export type ActivationErrorCode = typeof errorCodes[number];

export class ActivationError extends Error {
  constructor(readonly code: ActivationErrorCode) {
    super(code);
    this.name = 'ActivationError';
  }
}

export const isOnboardingEnabled = (): boolean => import.meta.env.VITE_ONBOARDING_ENABLED === 'true';
export const isValidActivationPassword = (password: string): boolean => [...password].length >= 12
  && new TextEncoder().encode(password).length <= 72;

const errorCode = (value: unknown): ActivationErrorCode => {
  const code = value && typeof value === 'object' && 'error' in value ? value.error : undefined;
  return errorCodes.includes(code as ActivationErrorCode) ? code as ActivationErrorCode : 'activation_unavailable';
};

const invokeActivation = async (body: { action: 'preview'; token: string } | { action: 'complete'; token: string; password: string }): Promise<unknown> => {
  if (!isOnboardingEnabled()) throw new ActivationError('disabled');
  if (!isActivationToken(body.token)) throw new ActivationError('invalid_invitation');
  if (body.action === 'complete' && !isValidActivationPassword(body.password)) throw new ActivationError('invalid_password');
  if (!supabase) throw new ActivationError('activation_unavailable');

  try {
    const { data, error } = await supabase.functions.invoke('crew-onboarding', { method: 'POST', body });
    if (error instanceof FunctionsHttpError) {
      let payload: unknown;
      try { payload = await error.context.json(); } catch { /* Unreadable HTTP responses remain generic. */ }
      throw new ActivationError(errorCode(payload));
    }
    if (error) throw new ActivationError('activation_unavailable');
    if (data && typeof data === 'object' && 'error' in data) throw new ActivationError(errorCode(data));
    return data?.data;
  } catch (error) {
    throw error instanceof ActivationError ? error : new ActivationError('activation_unavailable');
  }
};

export const previewActivation = async (token: string): Promise<InvitationPreview> => {
  const data = await invokeActivation({ action: 'preview', token });
  if (!data || typeof data !== 'object' || !['email', 'firstName', 'lastName', 'phone', 'expiresAt'].every((key) => key in data && typeof data[key as keyof typeof data] === 'string')) {
    throw new ActivationError('activation_unavailable');
  }
  const preview = data as InvitationPreview;
  if (!preview.email || !Number.isFinite(Date.parse(preview.expiresAt))) throw new ActivationError('activation_unavailable');
  return preview;
};

export const completeActivation = async (token: string, password: string): Promise<ActivationComplete> => {
  const data = await invokeActivation({ action: 'complete', token, password });
  if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'active'
    || !('email' in data) || typeof data.email !== 'string' || !data.email
    || !('profileId' in data) || typeof data.profileId !== 'string' || !data.profileId) {
    throw new ActivationError('activation_unavailable');
  }
  return data as ActivationComplete;
};
