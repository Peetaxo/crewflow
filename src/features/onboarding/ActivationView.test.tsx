import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivationView from './ActivationView';
import { ActivationLinkContext } from './activation-link';
import { ActivationError } from './services/activation.service';

const api = vi.hoisted(() => ({ preview: vi.fn(), complete: vi.fn(), signIn: vi.fn(), clear: vi.fn() }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => ({ signIn: api.signIn, isLoading: true }) }));
vi.mock('../../lib/supabase', () => ({ supabase: null }));
vi.mock('./services/activation.service', async (original) => ({ ...await original<typeof import('./services/activation.service')>(), previewActivation: api.preview, completeActivation: api.complete }));
const token = 'a'.repeat(64);
const preview = { email: 'eva@example.test', firstName: 'Eva', lastName: 'Nová', phone: '+420123456789', expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() };
const activationTree = (invitationToken: string | null = token, revision = 1, strict = false) => (
  <MemoryRouter initialEntries={['/activate']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ActivationLinkContext.Provider value={{ token: invitationToken, revision, ready: true, clearToken: api.clear }}>{strict ? <StrictMode><ActivationView /></StrictMode> : <Routes><Route path="/activate" element={<ActivationView />} /><Route path="/app" element={<div>Authenticated app</div>} /><Route path="/login" element={<div>Normal login</div>} /></Routes>}</ActivationLinkContext.Provider></MemoryRouter>
);
const renderActivation = (invitationToken: string | null = token, revision = 1, strict = false) => render(activationTree(invitationToken, revision, strict));
const enterPasswords = (password = '  moje heslo 123  ', confirmation = password) => {
  fireEvent.change(screen.getByLabelText('Heslo'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Heslo znovu'), { target: { value: confirmation } });
};
const submit = () => fireEvent.submit(screen.getByRole('button', { name: 'Aktivovat účet' }).closest('form')!);

describe('ActivationView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    api.preview.mockResolvedValue(preview);
    api.complete.mockResolvedValue({ status: 'active', email: preview.email, profileId: 'profile' });
    api.signIn.mockResolvedValue(undefined);
  });

  it('shows a loading state independently of ordinary auth/bootstrap discovery', () => {
    api.preview.mockReturnValue(new Promise(() => {}));
    renderActivation();
    expect(screen.getByRole('status')).toHaveTextContent('Ověřuji pozvánku');
    expect(api.complete).not.toHaveBeenCalled();
  });

  it('previews read-only imported identity and the password/48 hour guidance', async () => {
    renderActivation();
    expect(await screen.findByLabelText('E-mail')).toHaveValue(preview.email);
    for (const name of ['E-mail', 'Jméno', 'Příjmení', 'Telefon']) expect(screen.getByLabelText(name)).toHaveAttribute('readonly');
    expect(screen.getByText(/alespoň 12 znaků/i)).toBeInTheDocument();
    expect(screen.getByText(/48 hodin/i)).toBeInTheDocument();
    expect(api.preview).toHaveBeenCalledWith(token);
  });

  it.each(['expired_invitation', 'already_active', 'invalid_invitation', 'activation_in_progress'] as const)('presents %s without a password form and keeps login available', async (code) => {
    api.preview.mockRejectedValue(new ActivationError(code));
    renderActivation();
    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
    expect(screen.queryByLabelText('Heslo')).not.toBeInTheDocument();
    expect(api.clear).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: /přihlášení/i }));
    expect(screen.getByText('Normal login')).toBeInTheDocument();
  });

  it('rejects mismatched confirmation before mutation', async () => {
    renderActivation();
    await screen.findByLabelText('Heslo');
    enterPasswords('password123456', 'different123456');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Hesla se neshodují');
    expect(api.complete).not.toHaveBeenCalled();
  });

  it.each(['short', '😀'.repeat(11), '😀'.repeat(19)])('rejects a password outside client bounds before mutation', async (password) => {
    renderActivation();
    await screen.findByLabelText('Heslo');
    enterPasswords(password);
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/12 znaků|příliš dlouhé/);
    expect(api.complete).not.toHaveBeenCalled();
  });

  it('blocks duplicate submission and signs in normally with the exact chosen password', async () => {
    let finish: (value: { status: string; email: string; profileId: string }) => void;
    api.complete.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderActivation();
    await screen.findByLabelText('Heslo');
    enterPasswords();
    const form = screen.getByRole('button', { name: 'Aktivovat účet' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.complete).toHaveBeenCalledExactlyOnceWith(token, '  moje heslo 123  ');
    expect(screen.getByRole('button', { name: /Aktivuji/ })).toBeDisabled();
    await act(async () => finish({ status: 'active', email: preview.email, profileId: 'profile' }));
    expect(api.signIn).toHaveBeenCalledExactlyOnceWith(preview.email, '  moje heslo 123  ');
    expect(api.clear).toHaveBeenCalled();
    expect(screen.getByText('Authenticated app')).toBeInTheDocument();
    expect(screen.queryByLabelText('Heslo')).not.toBeInTheDocument();
  });

  it('shows an actionable server failure without exposing its raw details', async () => {
    api.complete.mockRejectedValue(new ActivationError('activation_unavailable'));
    renderActivation();
    await screen.findByLabelText('Heslo');
    enterPasswords();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/nyní není dostupná/i);
    expect(api.signIn).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Aktivovat účet' })).toBeEnabled();
  });

  it('clears the used invitation/passwords and offers normal login when activation succeeds but login fails', async () => {
    api.signIn.mockRejectedValue(new Error('raw private transport detail'));
    renderActivation();
    await screen.findByLabelText('Heslo');
    enterPasswords();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Účet je aktivní/);
    expect(screen.queryByLabelText('Heslo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aktivovat účet' })).not.toBeInTheDocument();
    expect(api.clear).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: /přihlášení/i }));
    expect(screen.getByText('Normal login')).toBeInTheDocument();
    expect(api.complete).toHaveBeenCalledTimes(1);
  });

  it('does not call the API while disabled or without a valid invitation', async () => {
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false');
    const view = renderActivation();
    expect(screen.getByRole('alert')).toHaveTextContent(/není zapnutá/i);
    expect(api.preview).not.toHaveBeenCalled();
    view.unmount();
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    renderActivation(null);
    expect(screen.getByRole('alert')).toHaveTextContent(/neplatný/i);
    await waitFor(() => expect(api.preview).not.toHaveBeenCalled());
  });

  it('can still submit after the StrictMode effect cleanup/replay', async () => {
    api.signIn.mockRejectedValue(new Error('login unavailable'));
    renderActivation(token, 1, true);
    await screen.findByLabelText('Heslo');
    enterPasswords();
    submit();
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith(token, '  moje heslo 123  '));
  });

  it('refuses an expired preview even if the server returns it as successful', async () => {
    api.preview.mockResolvedValue({ ...preview, expiresAt: '2020-01-01T00:00:00Z' });
    renderActivation();
    expect(await screen.findByRole('alert')).toHaveTextContent('Platnost pozvánky vypršela');
    expect(screen.queryByLabelText('Heslo')).not.toBeInTheDocument();
  });

  it('does not sign in or navigate for a response received after leaving activation', async () => {
    let finish: (value: { status: string; email: string; profileId: string }) => void;
    api.complete.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = renderActivation();
    await screen.findByLabelText('Heslo');
    enterPasswords();
    submit();
    view.unmount();
    await act(async () => finish({ status: 'active', email: preview.email, profileId: 'profile' }));
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('discards an older preview when a new invitation arrives on the same route', async () => {
    let finishOld: (value: typeof preview) => void;
    api.preview.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }));
    const view = renderActivation();
    const nextToken = 'b'.repeat(64);
    const nextPreview = { ...preview, email: 'new@example.test', firstName: 'Nová' };
    api.preview.mockResolvedValueOnce(nextPreview);
    view.rerender(activationTree(nextToken, 2));
    expect(await screen.findByLabelText('E-mail')).toHaveValue(nextPreview.email);
    await act(async () => finishOld(preview));
    expect(screen.getByLabelText('E-mail')).toHaveValue(nextPreview.email);
    enterPasswords();
    submit();
    await waitFor(() => expect(api.complete).toHaveBeenCalledWith(nextToken, '  moje heslo 123  '));
  });

  it('clears entered passwords when replacing the invitation on the same route', async () => {
    const view = renderActivation();
    await screen.findByLabelText('Heslo');
    enterPasswords();
    view.rerender(activationTree('b'.repeat(64), 2));
    await screen.findByLabelText('Heslo');
    expect(screen.getByLabelText('Heslo')).toHaveValue('');
    expect(screen.getByLabelText('Heslo znovu')).toHaveValue('');
  });
});
