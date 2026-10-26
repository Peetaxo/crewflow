import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PasswordRecoveryLinks from './PasswordRecoveryLinks';
import { usePasswordRecoveryLink } from './password-recovery-link';
const native = vi.hoisted(() => ({ enabled: true, addListener: vi.fn(), getLaunchUrl: vi.fn(), remove: vi.fn(), source: 'supabase' }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.enabled } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: native.addListener, getLaunchUrl: native.getLaunchUrl } }));
vi.mock('../../lib/app-config', () => ({ get appDataSource() { return native.source; } }));
const token = 'Opaque_URL-safe-Token_123456789';
const nextToken = 'Different_URL-safe-Token_123456';
let onOpen: (event: { url: string }) => void;
const Destination = () => {
  const location = useLocation(); const { token: capability, revision } = usePasswordRecoveryLink(); const navigate = useNavigate();
  return <><div data-testid="path">{location.pathname}</div><div data-testid="token">{capability}</div><div data-testid="revision">{revision}</div><button onClick={() => navigate('/login')}>Leave</button></>;
};
const renderLinks = (strict = false) => {
  const tree = <MemoryRouter initialEntries={[window.location.pathname === '/reset-password' ? '/reset-password' : '/app']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PasswordRecoveryLinks><Routes><Route path="*" element={<Destination />} /></Routes></PasswordRecoveryLinks></MemoryRouter>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};
describe('native and web recovery handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks(); native.enabled = true; native.source = 'supabase'; native.remove.mockResolvedValue(undefined);
    native.getLaunchUrl.mockResolvedValue(undefined);
    native.addListener.mockImplementation(async (_name, handler) => { onOpen = handler; return { remove: native.remove }; });
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true'); vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431');
    window.history.replaceState(null, '', '/'); window.localStorage.clear(); window.sessionStorage.clear();
  });
  it('captures a cold native launch before mounting the operational route', async () => {
    native.getLaunchUrl.mockResolvedValue({ url: `nodu-test://reset-password#token_hash=${token}` });
    renderLinks(); await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/reset-password'));
    expect(screen.getByTestId('token')).toHaveTextContent(token); expect(window.location.hash).toBe('');
    expect(JSON.stringify(window.history.state)).not.toContain(token); expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });
  it('revises warm capabilities without resetting duplicate opens and clears them when leaving', async () => {
    renderLinks(); await screen.findByTestId('path');
    act(() => onOpen({ url: `nodu-test://reset-password#token_hash=${token}` }));
    expect(screen.getByTestId('revision')).toHaveTextContent('1');
    act(() => onOpen({ url: `nodu-test://reset-password#token_hash=${token}` }));
    expect(screen.getByTestId('revision')).toHaveTextContent('1');
    act(() => onOpen({ url: `nodu-test://reset-password#token_hash=${nextToken}` }));
    expect(screen.getByTestId('token')).toHaveTextContent(nextToken); expect(screen.getByTestId('revision')).toHaveTextContent('2');
    act(() => screen.getByText('Leave').click()); expect(screen.getByTestId('token')).toBeEmptyDOMElement();
  });
  it('never lets an older cold launch replace a newer warm activation or recovery', async () => {
    let finish!: (value: { url: string }) => void; native.getLaunchUrl.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderLinks(); act(() => onOpen({ url: `nodu-test://reset-password#token_hash=${nextToken}` }));
    await act(async () => finish({ url: `nodu-test://reset-password#token_hash=${token}` }));
    expect(screen.getByTestId('token')).toHaveTextContent(nextToken);
  });
  it('scrubs the browser capability before rendering children, including StrictMode replay', async () => {
    native.enabled = false; window.history.replaceState(null, '', `/reset-password#token_hash=${token}`);
    renderLinks(true); expect(screen.getByTestId('token')).toHaveTextContent(token); expect(window.location.hash).toBe('');
    expect(native.addListener).not.toHaveBeenCalled();
  });
  it('captures a later browser hash change and isolates it into a fresh revision', async () => {
    native.enabled = false; renderLinks();
    act(() => { window.history.replaceState(null, '', `/reset-password#token_hash=${token}`); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(screen.getByTestId('token')).toHaveTextContent(token); expect(window.location.hash).toBe('');
  });
  it('invalidates the older operation boundary when a malformed browser link replaces it', () => {
    native.enabled = false; window.history.replaceState(null, '', `/reset-password#token_hash=${token}`); renderLinks();
    act(() => { window.history.replaceState(null, '', '/reset-password#token_hash=bad'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(screen.getByTestId('token')).toBeEmptyDOMElement(); expect(screen.getByTestId('revision')).toHaveTextContent('2'); expect(window.location.hash).toBe('');
  });

  it('rejects untrusted warm links without navigation', async () => {
    renderLinks(); await screen.findByTestId('path'); act(() => onOpen({ url: `https://evil.test/reset-password#token_hash=${token}` }));
    expect(screen.getByTestId('path')).toHaveTextContent('/app'); expect(screen.getByTestId('token')).toBeEmptyDOMElement();
  });
  it.each(['false', 'remote'])('stays offline while gate is %s and still scrubs browser data', (gate) => {
    if (gate === 'false') vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false'); else vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    window.history.replaceState(null, '', `/reset-password#token_hash=${token}`); renderLinks();
    expect(screen.getByTestId('token')).toBeEmptyDOMElement(); expect(window.location.hash).toBe('');
    expect(native.addListener).not.toHaveBeenCalled(); expect(native.getLaunchUrl).not.toHaveBeenCalled();
  });
  it('removes a listener resolved after unmount and ignores a pending launch', async () => {
    let finishListener!: (handle: { remove: typeof native.remove }) => void; let finishLaunch!: (value: { url: string }) => void;
    native.addListener.mockReturnValue(new Promise((resolve) => { finishListener = resolve; })); native.getLaunchUrl.mockReturnValue(new Promise((resolve) => { finishLaunch = resolve; }));
    const view = renderLinks(); view.unmount();
    await act(async () => { finishListener({ remove: native.remove }); finishLaunch({ url: `nodu-test://reset-password#token_hash=${token}` }); });
    expect(native.remove).toHaveBeenCalledTimes(1);
  });
});
