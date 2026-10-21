import { FunctionsHttpError } from '@supabase/supabase-js';
import { appDataSource } from '../../../lib/app-config';
import { supabase } from '../../../lib/supabase';

const codes = ['disabled', 'unauthorized', 'forbidden', 'invalid_request', 'profile_unavailable', 'missing_email', 'test_only', 'already_active', 'activation_in_progress', 'invitation_changed', 'invitation_in_progress', 'delivery_unavailable', 'invitation_unavailable'] as const;
export type CrewInvitationErrorCode = typeof codes[number];
export type CrewInvitationState = 'not_invited' | 'preparing' | 'pending' | 'expired' | 'active' | 'activation_in_progress';
export type CrewInvitationStatus = { profileId: string; email: string; state: CrewInvitationState; invitationId: string | null; expiresAt: string | null };
type InviteInput = { profileId: string; expectedEmail: string; expectedInvitationId: string | null; replaceExisting: boolean; authId: string };
const states: CrewInvitationState[] = ['not_invited', 'preparing', 'pending', 'expired', 'active', 'activation_in_progress'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export class CrewInvitationError extends Error {
  constructor(readonly code: CrewInvitationErrorCode) { super(code); this.name = 'CrewInvitationError'; }
}
export const isSavedProfileId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
export const normalizeInvitationEmail = (value: string): string => value.trim().toLowerCase();
export const isTestInvitationEmail = (value: string): boolean => /^[a-z0-9][a-z0-9._+-]*@crewflow-onboarding\.test$/.test(normalizeInvitationEmail(value));

export const isCrewInvitationsEnabled = (): boolean => import.meta.env.VITE_CREW_INVITATIONS_ENABLED === 'true'
  && import.meta.env.VITE_ONBOARDING_ENABLED === 'true' && appDataSource === 'supabase'
  && /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):55431\/?$/.test(import.meta.env.VITE_SUPABASE_URL ?? '');

const safeCode = (payload: unknown): CrewInvitationErrorCode => {
  const code = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
  return codes.includes(code as CrewInvitationErrorCode) ? code as CrewInvitationErrorCode : 'invitation_unavailable';
};
const safeStatus = (value: unknown, profileId: string, email: string): CrewInvitationStatus => {
  if (!value || typeof value !== 'object' || !('profileId' in value) || value.profileId !== profileId
    || !('email' in value) || value.email !== email || !isTestInvitationEmail(email)
    || !('state' in value) || !states.includes(value.state as CrewInvitationState)
    || !('invitationId' in value) || !(value.invitationId === null || isSavedProfileId(value.invitationId))
    || !('expiresAt' in value) || !(value.expiresAt === null || (typeof value.expiresAt === 'string' && timestamp.test(value.expiresAt) && Number.isFinite(Date.parse(value.expiresAt))))) {
    throw new CrewInvitationError('invitation_unavailable');
  }
  return { profileId, email, state: value.state as CrewInvitationState, invitationId: value.invitationId as string | null, expiresAt: value.expiresAt as string | null };
};

const invoke = async (body: { action: 'status'; profileId: string } | { action: 'invite'; profileId: string; expectedEmail: string; requestId: string; expectedInvitationId: string | null; replaceExisting: boolean }, email: string, authId: string): Promise<CrewInvitationStatus> => {
  // Keep every disabled configuration completely offline, including Auth verification.
  if (!isCrewInvitationsEnabled()) throw new CrewInvitationError('disabled');
  if (!isSavedProfileId(body.profileId)) throw new CrewInvitationError('invalid_request');
  if (!email) throw new CrewInvitationError('missing_email');
  if (!isTestInvitationEmail(email)) throw new CrewInvitationError('test_only');
  if (body.action === 'invite' && (!(body.expectedInvitationId === null || isSavedProfileId(body.expectedInvitationId))
    || typeof body.replaceExisting !== 'boolean' || (body.expectedInvitationId !== null && !body.replaceExisting))) throw new CrewInvitationError('invalid_request');
  if (!supabase) throw new CrewInvitationError('invitation_unavailable');
  const client = supabase;
  const checkSession = async () => {
    const { data, error } = await client.auth.getSession();
    if (error || !isSavedProfileId(authId) || !data.session?.access_token || data.session.user.id !== authId || data.session.user.is_anonymous) throw new CrewInvitationError('unauthorized');
  };
  try {
    await checkSession();
    const { data: verified, error: verificationError } = await client.auth.getUser();
    if (verificationError || !verified.user || verified.user.id !== authId || verified.user.is_anonymous) throw new CrewInvitationError('unauthorized');
    await checkSession();
    const { data, error } = await client.functions.invoke('crew-invitations', { method: 'POST', body });
    await checkSession();
    if (error instanceof FunctionsHttpError) {
      let payload: unknown;
      try { payload = await error.context.json(); } catch { /* Preserve only a known error code. */ }
      throw new CrewInvitationError(safeCode(payload));
    }
    if (error) throw new CrewInvitationError('invitation_unavailable');
    if (data && typeof data === 'object' && 'error' in data) throw new CrewInvitationError(safeCode(data));
    return safeStatus(data?.data, body.profileId, email);
  } catch (error) {
    throw error instanceof CrewInvitationError ? error : new CrewInvitationError('invitation_unavailable');
  }
};

export const getCrewInvitationStatus = (profileId: string, email: string, authId: string): Promise<CrewInvitationStatus> => invoke({ action: 'status', profileId }, normalizeInvitationEmail(email), authId);
export const createCrewInvitation = ({ profileId, expectedEmail, expectedInvitationId, replaceExisting, authId }: InviteInput): Promise<CrewInvitationStatus> => invoke({ action: 'invite', profileId, expectedEmail: normalizeInvitationEmail(expectedEmail), requestId: crypto.randomUUID(), expectedInvitationId, replaceExisting }, normalizeInvitationEmail(expectedEmail), authId);
