import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextType } from '../../app/providers/auth-context';
import { AuthContext } from '../../app/providers/auth-context';
import CrewInvitationPanel from './CrewInvitationPanel';
import { CrewInvitationError } from './services/invitations.service';

const mocks = vi.hoisted(() => ({ status: vi.fn(), invite: vi.fn(), enabled: true }));
vi.mock('../../lib/supabase', () => ({ supabase: null }));
vi.mock('./services/invitations.service', async () => ({
  ...await vi.importActual('./services/invitations.service'),
  isCrewInvitationsEnabled: () => mocks.enabled,
  getCrewInvitationStatus: mocks.status,
  createCrewInvitation: mocks.invite,
}));
const profileId = '11111111-1111-4111-8111-111111111111';
const authId = '22222222-2222-4222-8222-222222222222';
const invitationId = '33333333-3333-4333-8333-333333333333';
const email = 'jana@crewflow-onboarding.test';
const props = { profileId, name: 'Jana Nováková', email };
const initial = { profileId, email, state: 'not_invited', invitationId: null, expiresAt: null };
const pending = { ...initial, state: 'pending', invitationId, expiresAt: '2026-10-23T12:00:00Z' };
const auth = { isAuthenticated: true, isLoading: false, isDevSession: false, isRoleSwitching: false, currentUserId: authId,
  user: { id: authId, is_anonymous: false }, session: { user: { id: authId }, access_token: 'test-session' }, role: 'coo' } as AuthContextType;
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const view = (values = props, identity = auth) => <AuthContext.Provider value={identity}><CrewInvitationPanel {...values} /></AuthContext.Provider>;
const openInitial = async () => { const button = screen.getByRole('button', { name: 'Pozvat do aplikace' }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); return screen.getByRole('dialog'); };

describe('profile invitation controls', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; mocks.status.mockResolvedValue(initial); mocks.invite.mockResolvedValue(pending); });

  it('keeps the disabled action visible in a normal installation with zero invitation network calls', () => {
    mocks.enabled = false; render(view());
    expect(screen.getByRole('button', { name: 'Pozvat do aplikace' })).toBeDisabled();
    expect(screen.getByText('Pozvánky jsou zatím dostupné pouze v testovacím prostředí.')).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled(); expect(mocks.invite).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...props, profileId: null }, /uložený profil/], [{ ...props, profileId: 'legacy:1' }, /uložený profil/],
    [{ ...props, email: '' }, /Doplň e-mail/], [{ ...props, email: 'jana@example.cz' }, /crewflow-onboarding.test/],
  ])('explains unavailable selected profile %j without a request', (values, reason) => {
    render(view(values as typeof props)); expect(screen.getByRole('button', { name: 'Pozvat do aplikace' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument(); expect(mocks.status).not.toHaveBeenCalled();
  });

  it.each([
    { isDevSession: true }, { isAuthenticated: false }, { isLoading: true }, { isRoleSwitching: true },
    { session: null }, { user: null }, { currentUserId: null }, { currentUserId: profileId }, { user: { id: authId, is_anonymous: true } },
  ])('does not request invitations with an unavailable genuine session %j', (changes) => {
    render(view(props, { ...auth, ...changes } as AuthContextType));
    expect(screen.getByRole('button', { name: 'Pozvat do aplikace' })).toBeDisabled(); expect(mocks.status).not.toHaveBeenCalled();
  });

  it('loads read-only status, confirms the selected member and cancels without writing', async () => {
    render(view()); const dialog = await openInitial();
    expect(mocks.status).toHaveBeenCalledExactlyOnceWith(profileId, email, authId);
    expect(within(dialog).getByText('Jana Nováková')).toBeInTheDocument();
    expect(within(dialog).getByText(email)).toBeInTheDocument();
    expect(within(dialog).getByText(/48 hodin/)).toBeInTheDocument();
    expect(within(dialog).getByText(/lokální testovací schrán/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zrušit' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(mocks.invite).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'Escape'])('restores focus to the invitation action after %s without writing', async (method) => {
    render(view());
    const action = screen.getByRole('button', { name: 'Pozvat do aplikace' });
    await waitFor(() => expect(action).toBeEnabled());
    action.focus(); fireEvent.click(action);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    if (method === 'cancel') fireEvent.click(within(dialog).getByRole('button', { name: 'Zrušit' }));
    else fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(action).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.invite).not.toHaveBeenCalled();
  });

  it('suppresses duplicate confirmation immediately and reports test mailbox capture', async () => {
    const writing = deferred<typeof pending>(); mocks.invite.mockReturnValue(writing.promise);
    render(view()); await openInitial();
    const confirm = screen.getByRole('button', { name: 'Vytvořit testovací pozvánku' });
    act(() => { confirm.click(); confirm.click(); });
    expect(mocks.invite).toHaveBeenCalledExactlyOnceWith({ profileId, expectedEmail: email, expectedInvitationId: null, replaceExisting: false, authId });
    await act(async () => { writing.resolve(pending); });
    expect(screen.getByRole('status')).toHaveTextContent(/zachycena v lokální testovací schránce/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Vytvořit novou pozvánku' })).toHaveFocus());
  });

  it.each(['pending', 'expired', 'preparing', 'not_invited'])('requires explicit replacement confirmation for %s with an existing invitation', async (state) => {
    mocks.status.mockResolvedValue({ ...pending, state, expiresAt: state === 'not_invited' ? null : pending.expiresAt });
    render(view()); fireEvent.click(await screen.findByRole('button', { name: 'Vytvořit novou pozvánku' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Předchozí odkaz přestane platit/);
    expect(mocks.invite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit testovací pozvánku' }));
    await waitFor(() => expect(mocks.invite).toHaveBeenCalledExactlyOnceWith({ profileId, expectedEmail: email, expectedInvitationId: invitationId, replaceExisting: true, authId }));
  });

  it('shows pending expiry and blocks invitation for active or claiming members', async () => {
    mocks.status.mockResolvedValue(pending); const rendered = render(view());
    expect(await screen.findByText(/Platnost do/)).toHaveTextContent('23.');
    rendered.unmount(); mocks.status.mockResolvedValue({ ...pending, state: 'active' }); render(view());
    expect(await screen.findByText('Účet je aktivní.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pozvat do aplikace' })).toBeDisabled();
  });

  it('blocks invitation while activation is in progress', async () => {
    mocks.status.mockResolvedValue({ ...pending, state: 'activation_in_progress' }); render(view());
    expect(await screen.findByText('Aktivace účtu právě probíhá.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pozvat do aplikace' })).toBeDisabled();
  });

  it('disables the action while loading and offers an explicit retry on a safe status error', async () => {
    const loading = deferred<typeof initial>(); mocks.status.mockReturnValue(loading.promise); render(view());
    expect(screen.getByRole('button', { name: 'Pozvat do aplikace' })).toBeDisabled();
    await act(async () => { loading.resolve({ ...initial, email: 'stale@crewflow-onboarding.test' }); });
    expect(screen.getByRole('alert')).toHaveTextContent(/Stav pozvánky se nepodařilo načíst/);
    mocks.status.mockRejectedValue(new CrewInvitationError('forbidden'));
    fireEvent.click(screen.getByRole('button', { name: 'Obnovit stav pozvánky' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/oprávnění/);
  });

  it('refreshes a changed invitation only on request and demands a new confirmation', async () => {
    mocks.invite.mockRejectedValue(new CrewInvitationError('invitation_changed')); render(view()); await openInitial();
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit testovací pozvánku' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Pozvánka se změnila/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(mocks.status).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Obnovit stav pozvánky' })).toHaveFocus());
    mocks.status.mockResolvedValue(pending);
    fireEvent.click(screen.getByRole('button', { name: 'Obnovit stav pozvánky' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Vytvořit novou pozvánku' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Předchozí odkaz přestane platit/);
    expect(mocks.invite).toHaveBeenCalledTimes(1);
  });

  it.each(['profile', 'email', 'auth', 'switch'])('ignores a stale status response after changing %s', async (change) => {
    const loading = deferred<typeof initial>(); mocks.status.mockReturnValueOnce(loading.promise).mockResolvedValue(initial);
    const rendered = render(view());
    const values = change === 'profile' ? { ...props, profileId: invitationId } : change === 'email' ? { ...props, email: 'new@crewflow-onboarding.test' } : props;
    const identity = change === 'auth' ? { ...auth, currentUserId: invitationId, user: { id: invitationId }, session: { user: { id: invitationId }, access_token: 'new' } } as AuthContextType : change === 'switch' ? { ...auth, isRoleSwitching: true } : auth;
    rendered.rerender(view(values, identity));
    await act(async () => { loading.resolve(pending); });
    expect(screen.queryByText(/Platnost do/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vytvořit novou pozvánku' })).not.toBeInTheDocument();
  });

  it.each(['profile', 'email', 'auth', 'switch', 'unmount'])('ignores invite completion after %s changes and closes the old confirmation', async (change) => {
    const writing = deferred<typeof pending>(); mocks.invite.mockReturnValue(writing.promise); const rendered = render(view()); await openInitial();
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit testovací pozvánku' }));
    if (change === 'unmount') rendered.unmount();
    else rendered.rerender(view(change === 'profile' ? { ...props, profileId: invitationId } : change === 'email' ? { ...props, email: 'new@crewflow-onboarding.test' } : props,
      change === 'auth' ? { ...auth, currentUserId: profileId } : change === 'switch' ? { ...auth, isRoleSwitching: true } : auth));
    await act(async () => { writing.resolve(pending); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/zachycena v lokální testovací schránce/)).not.toBeInTheDocument();
  });

  it('rejects a stale successful invite response without retaining it', async () => {
    mocks.invite.mockResolvedValue({ ...pending, profileId: authId }); render(view()); await openInitial();
    fireEvent.click(screen.getByRole('button', { name: 'Vytvořit testovací pozvánku' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Pozvánku se nepodařilo vytvořit/);
    expect(screen.queryByText(/zachycena v lokální testovací schránce/)).not.toBeInTheDocument();
  });
});
