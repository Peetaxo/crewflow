import { FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCrewInvitation, getCrewInvitationStatus, isCrewInvitationsEnabled } from './invitations.service';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn(), getUser: vi.fn(), source: 'supabase' }));
vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke }, auth: { getSession: mocks.getSession, getUser: mocks.getUser } } }));
vi.mock('../../../lib/app-config', () => ({ get appDataSource() { return mocks.source; } }));
const profileId = '11111111-1111-4111-8111-111111111111';
const authId = '22222222-2222-4222-8222-222222222222';
const invitationId = '33333333-3333-4333-8333-333333333333';
const email = 'jana@crewflow-onboarding.test';
const status = { profileId, email, state: 'not_invited', invitationId: null, expiresAt: null };
const input = { profileId, expectedEmail: email, expectedInvitationId: null, replaceExisting: false, authId };

describe('manual crew invitation adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_CREW_INVITATIONS_ENABLED', 'true');
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431');
    mocks.source = 'supabase';
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: authId }, access_token: 'test-session' } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: authId, is_anonymous: false } }, error: null });
    mocks.invoke.mockResolvedValue({ data: { data: status }, error: null });
  });

  it('reads selected profile and returns only safe metadata', async () => {
    mocks.invoke.mockResolvedValue({ data: { data: { ...status, token: 'do-not-retain', html: 'private', diagnostics: { secret: true } } }, error: null });
    await expect(getCrewInvitationStatus(profileId, email, authId)).resolves.toEqual(status);
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('crew-invitations', { method: 'POST', body: { action: 'status', profileId } });
  });

  it('creates with a fresh request UUID and exact optimistic replacement contract', async () => {
    await createCrewInvitation({ ...input, expectedEmail: ` ${email.toUpperCase()} `, expectedInvitationId: invitationId, replaceExisting: true });
    expect(mocks.invoke).toHaveBeenCalledWith('crew-invitations', { method: 'POST', body: { action: 'invite', profileId, expectedEmail: email, expectedInvitationId: invitationId, replaceExisting: true, requestId: expect.stringMatching(/^[a-f0-9-]{36}$/) } });
  });

  it.each([
    ['VITE_CREW_INVITATIONS_ENABLED', 'false'], ['VITE_CREW_INVITATIONS_ENABLED', 'TRUE'], ['VITE_ONBOARDING_ENABLED', 'false'],
    ['VITE_SUPABASE_URL', 'https://production.supabase.co'], ['VITE_SUPABASE_URL', 'http://127.0.0.1:54321'],
    ['VITE_SUPABASE_URL', 'http://127.0.0.1:55431/path'], ['VITE_SUPABASE_URL', 'http://127.0.0.1:55431?x=1'],
    ['VITE_SUPABASE_URL', 'http://user@127.0.0.1:55431'], ['VITE_SUPABASE_URL', 'http://127.0.0.1:55431#x'],
    ['VITE_SUPABASE_URL', 'http://127.0.0.1:55431\n'],
  ])('blocks %s=%s before every network call', async (key, value) => {
    vi.stubEnv(key, value);
    expect(isCrewInvitationsEnabled()).toBe(false);
    await expect(getCrewInvitationStatus(profileId, email, authId)).rejects.toMatchObject({ code: 'disabled' });
    await expect(createCrewInvitation(input)).rejects.toMatchObject({ code: 'disabled' });
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.getUser).not.toHaveBeenCalled(); expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it.each(['http://127.0.0.1:55431', 'http://localhost:55431', 'http://[::1]:55431'])('allows only dedicated loopback target %s', (target) => {
    vi.stubEnv('VITE_SUPABASE_URL', target); expect(isCrewInvitationsEnabled()).toBe(true);
  });

  it('blocks local storage mode and invalid recipients/profiles before network calls', async () => {
    mocks.source = 'local'; await expect(createCrewInvitation(input)).rejects.toMatchObject({ code: 'disabled' });
    mocks.source = 'supabase';
    await expect(getCrewInvitationStatus('legacy:1', email, authId)).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(getCrewInvitationStatus(profileId, '', authId)).rejects.toMatchObject({ code: 'missing_email' });
    await expect(createCrewInvitation({ ...input, expectedEmail: 'real@example.cz' })).rejects.toMatchObject({ code: 'test_only' });
    expect(mocks.getSession).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it.each([null, { id: 'other-user' }, { id: authId, is_anonymous: true }])('requires server-verified non-anonymous matching Auth identity %j', async (user) => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(createCrewInvitation(input)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('rejects a session that changes during server verification', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: { user: { id: authId }, access_token: 'test-session' } }, error: null })
      .mockResolvedValue({ data: { session: { user: { id: profileId }, access_token: 'other' } }, error: null });
    await expect(createCrewInvitation(input)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('requires a genuine stored session before asking the server or function', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(createCrewInvitation(input)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(mocks.getUser).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('discards a function response when the Auth session changed while it was in flight', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: { user: { id: authId }, access_token: 'test-session' } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: authId }, access_token: 'test-session' } }, error: null })
      .mockResolvedValue({ data: { session: { user: { id: profileId }, access_token: 'changed' } }, error: null });
    await expect(createCrewInvitation(input)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it.each(['disabled', 'unauthorized', 'forbidden', 'invalid_request', 'profile_unavailable', 'missing_email', 'test_only', 'already_active', 'activation_in_progress', 'invitation_changed', 'invitation_in_progress', 'delivery_unavailable', 'invitation_unavailable'])('translates HTTP error %s without diagnostics', async (code) => {
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: code, diagnostics: 'private' }), { status: 409 })) });
    await expect(createCrewInvitation(input)).rejects.toMatchObject({ code, message: code });
  });

  it.each([
    { profileId: authId }, { email: 'other@crewflow-onboarding.test' }, { email: 'real@example.cz' }, { state: 'unknown' },
    { invitationId: 'bad-id' }, { expiresAt: 'tomorrow' }, { expiresAt: '2026-10-22' },
  ])('rejects unsafe/mismatched status %j', async (changes) => {
    mocks.invoke.mockResolvedValue({ data: { data: { ...status, ...changes } }, error: null });
    await expect(getCrewInvitationStatus(profileId, email, authId)).rejects.toMatchObject({ code: 'invitation_unavailable' });
  });

  it('supports stale-email replacement metadata and valid expiry dates', async () => {
    mocks.invoke.mockResolvedValue({ data: { data: { ...status, invitationId } }, error: null });
    await expect(getCrewInvitationStatus(profileId, email, authId)).resolves.toMatchObject({ state: 'not_invited', invitationId, expiresAt: null });
    mocks.invoke.mockResolvedValue({ data: { data: { ...status, state: 'pending', invitationId, expiresAt: '2026-10-23T12:00:00Z' } }, error: null });
    await expect(getCrewInvitationStatus(profileId, email, authId)).resolves.toMatchObject({ state: 'pending' });
  });

  it('replaces transport/backend failures with a safe generic code', async () => {
    mocks.invoke.mockRejectedValue(new Error('sensitive backend detail'));
    await expect(createCrewInvitation(input)).rejects.toMatchObject({ code: 'invitation_unavailable', message: 'invitation_unavailable' });
    mocks.invoke.mockResolvedValue({ data: { error: 'private diagnostics' }, error: null });
    await expect(createCrewInvitation(input)).rejects.toMatchObject({ code: 'invitation_unavailable' });
  });
});
