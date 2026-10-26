import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordView from './ForgotPasswordView';
import ResetPasswordView from './ResetPasswordView';
import { PasswordRecoveryLinkContext } from './password-recovery-link';
import { PasswordRecoveryError } from './services/password-recovery.service';
const api = vi.hoisted(() => ({ enabled: true, request: vi.fn(), createOperation: vi.fn(), complete: vi.fn(), dispose: vi.fn(), clear: vi.fn(), signOut: vi.fn(), session: null as object | null }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => ({ signOut: api.signOut, session: api.session }) }));
vi.mock('./services/password-recovery.service', async (original) => ({ ...await original<typeof import('./services/password-recovery.service')>(), isPasswordRecoveryEnabled: () => api.enabled, requestPasswordRecovery: api.request, createPasswordRecoveryOperation: api.createOperation }));
const token = 'Opaque_URL-safe-Token_123456789';
const tree = (kind: 'request' | 'reset' = 'reset', capability: string | null = token, revision = 1, strict = false) => {
  const view = kind === 'request' ? <ForgotPasswordView /> : <ResetPasswordView />;
  return <MemoryRouter initialEntries={[kind === 'request' ? '/forgot-password' : '/reset-password']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PasswordRecoveryLinkContext.Provider value={{ token: capability, revision, ready: true, clearToken: api.clear }}><Routes><Route path="/forgot-password" element={kind === 'request' ? view : <div>New request</div>} /><Route path="/reset-password" element={strict ? <StrictMode>{view}</StrictMode> : view} /><Route path="/login" element={<div>Normal login</div>} /></Routes></PasswordRecoveryLinkContext.Provider></MemoryRouter>;
};
const enter = (password = 'password', confirmation = password) => { fireEvent.change(screen.getByLabelText('Nové heslo'), { target: { value: password } }); fireEvent.change(screen.getByLabelText('Nové heslo znovu'), { target: { value: confirmation } }); };
const submit = () => fireEvent.submit(screen.getByRole('button', { name: 'Uložit nové heslo' }).closest('form')!);
describe('password recovery forms', () => {
  beforeEach(() => {
    vi.clearAllMocks(); api.enabled = true; api.session = null;
    api.request.mockResolvedValue(undefined); api.complete.mockResolvedValue(undefined); api.signOut.mockResolvedValue(undefined);
    api.createOperation.mockReturnValue({ complete: api.complete, dispose: api.dispose });
  });
  it('requests a test email and shows one generic confirmation without echoing the address', async () => {
    render(tree('request')); fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'pilot@crewflow-onboarding.test' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Poslat odkaz' }).closest('form')!);
    expect(await screen.findByRole('status')).toHaveTextContent('Pokud pro tento e-mail existuje účet');
    expect(api.request).toHaveBeenCalledWith('pilot@crewflow-onboarding.test'); expect(screen.queryByText('pilot@crewflow-onboarding.test')).not.toBeInTheDocument();
  });
  it('prevents duplicate recovery email requests while one is pending', async () => {
    let finish!: () => void; api.request.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    render(tree('request')); fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'pilot@crewflow-onboarding.test' } });
    const form = screen.getByRole('button', { name: 'Poslat odkaz' }).closest('form')!; fireEvent.submit(form); fireEvent.submit(form);
    expect(api.request).toHaveBeenCalledTimes(1); await act(async () => finish());
  });
  it('does not create or verify a recovery session merely by opening the form', () => {
    render(tree()); expect(screen.getByLabelText('Nové heslo')).toBeInTheDocument();
    expect(screen.getByText(/alespoň 8 znaků/)).toBeInTheDocument(); expect(api.createOperation).not.toHaveBeenCalled(); expect(api.complete).not.toHaveBeenCalled(); expect(api.signOut).not.toHaveBeenCalled();
  });
  it.each(['1234567', '🔒'.repeat(7), 'x'.repeat(73), '🔒'.repeat(19)])('validates the shared 8-codepoint/72-byte bounds before verification', (password) => {
    render(tree()); enter(password); submit(); expect(screen.getByRole('alert')).toHaveTextContent(/8 znaků|příliš dlouhé/); expect(api.createOperation).not.toHaveBeenCalled();
  });
  it('requires matching confirmation before creating a recovery operation', () => {
    render(tree()); enter('password', 'otherpass'); submit(); expect(screen.getByRole('alert')).toHaveTextContent('Hesla se neshodují'); expect(api.createOperation).not.toHaveBeenCalled();
  });
  it('accepts eight Unicode codepoints, blocks duplicate submits and waits for explicit login continuation', async () => {
    let finish!: () => void; api.complete.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; })); api.session = { user: { id: 'existing' } };
    render(tree()); enter('🔒'.repeat(8)); const form = screen.getByRole('button', { name: 'Uložit nové heslo' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form); expect(api.complete).toHaveBeenCalledExactlyOnceWith('🔒'.repeat(8)); expect(api.signOut).not.toHaveBeenCalled();
    await act(async () => finish()); expect(screen.queryByLabelText('Nové heslo')).not.toBeInTheDocument(); expect(api.clear).toHaveBeenCalled();
    expect(screen.getByText(/Pokračováním odhlásíš/)).toBeInTheDocument(); expect(api.signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Přihlásit se novým heslem' })); await screen.findByText('Normal login'); expect(api.signOut).toHaveBeenCalledExactlyOnceWith();
  });
  it('keeps an isolated operation for a retry while hiding all provider diagnostics', async () => {
    api.complete.mockRejectedValueOnce(new PasswordRecoveryError('unavailable')); render(tree()); enter(); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Zkus to znovu/); submit(); await screen.findByRole('button', { name: 'Přihlásit se novým heslem' });
    expect(api.createOperation).toHaveBeenCalledExactlyOnceWith(token); expect(api.complete).toHaveBeenCalledTimes(2);
  });
  it('offers another request for invalid/expired/used links and disposes the capability', async () => {
    api.complete.mockRejectedValueOnce(new PasswordRecoveryError('invalid_link')); render(tree()); enter(); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/neplatný nebo jeho platnost vypršela/); expect(api.clear).toHaveBeenCalled(); expect(screen.queryByLabelText('Nové heslo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Poslat nový odkaz' })); expect(screen.getByText('New request')).toBeInTheDocument();
  });
  it('rejects a missing capability and keeps disabled pages offline', () => {
    const view = render(tree('reset', null)); expect(screen.getByRole('alert')).toHaveTextContent(/neplatný/); expect(api.createOperation).not.toHaveBeenCalled(); view.unmount();
    api.enabled = false; render(tree()); expect(screen.getByRole('alert')).toHaveTextContent(/není zapnutá/); expect(api.createOperation).not.toHaveBeenCalled();
  });
  it('disposes when leaving and suppresses late completion/navigation', async () => {
    let finish!: () => void; api.complete.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const view = render(tree()); enter(); submit(); view.unmount(); expect(api.dispose).toHaveBeenCalled();
    await act(async () => finish()); expect(api.signOut).not.toHaveBeenCalled(); expect(api.clear).not.toHaveBeenCalled();
  });
  it('replaces the operation and clears passwords for a newer link revision', async () => {
    let finish!: () => void; api.complete.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const view = render(tree()); enter(); submit(); view.rerender(tree('reset', 'Different_URL-safe-Token_123456', 2)); expect(api.dispose).toHaveBeenCalled();
    expect(screen.getByLabelText('Nové heslo')).toHaveValue(''); await act(async () => finish()); expect(api.clear).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Přihlásit se novým heslem' })).not.toBeInTheDocument();
  });
  it('supports explicit submission following StrictMode cleanup/replay', async () => {
    render(tree('reset', token, 1, true)); enter(); submit(); await waitFor(() => expect(api.complete).toHaveBeenCalledExactlyOnceWith('password'));
  });
});
