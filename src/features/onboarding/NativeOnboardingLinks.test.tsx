import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import App from '../../App';
import { useActivationLink } from './activation-link';
import { usePasswordRecoveryLink } from './password-recovery-link';

const native = vi.hoisted(() => ({ addListener: vi.fn(), getLaunchUrl: vi.fn(), mounted: vi.fn(), operational: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: native.addListener, getLaunchUrl: native.getLaunchUrl } }));
vi.mock('../../lib/supabase', () => ({ supabase: null }));
vi.mock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('../../app/providers/AuthProvider', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('../../pages/Index.tsx', () => ({ default: () => { native.operational(); return <div>Operational app</div>; } }));
vi.mock('./ActivationView', () => ({ default: () => <CapturedRoute /> }));
vi.mock('./ResetPasswordView', () => ({ default: () => <CapturedRoute /> }));

const activation = 'a'.repeat(64);
const recovery = 'Opaque_URL-safe-Token_123456789';
const activationUrl = `nodu-test://activate#token=${activation}`;
const recoveryUrl = `nodu-test://reset-password#token_hash=${recovery}`;
const CapturedRoute = () => {
  const { pathname, hash } = useLocation();
  const invitation = useActivationLink();
  const reset = usePasswordRecoveryLink();
  native.mounted({ pathname, hash, activation: invitation.token, recovery: reset.token });
  return <div>{pathname === '/activate' ? 'Activation form' : 'Recovery form'}</div>;
};

describe('combined native onboarding routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431');
    window.history.replaceState(null, '', '/app');
    window.localStorage.clear(); window.sessionStorage.clear();
  });

  it.each([
    ['warm recovery over cold activation', recoveryUrl, activationUrl, '/reset-password', 'Recovery form', recovery],
    ['warm activation over cold recovery', activationUrl, recoveryUrl, '/activate', 'Activation form', activation],
  ])('keeps %s while both cold lookups are pending', async (_label, warmUrl, coldUrl, path, formName, capability) => {
    const listeners = new Set<(event: { url: string }) => void>();
    native.addListener.mockImplementation(async (_name, listener) => {
      listeners.add(listener);
      return { remove: async () => { listeners.delete(listener); } };
    });
    let finishCold!: (value: { url: string }) => void;
    const cold = new Promise<{ url: string }>((resolve) => { finishCold = resolve; });
    native.getLaunchUrl.mockReturnValue(cold);
    render(<App />);
    expect(native.operational).not.toHaveBeenCalled(); expect(native.mounted).not.toHaveBeenCalled();
    expect(listeners.size).toBe(2);
    act(() => { for (const listener of listeners) listener({ url: warmUrl }); });
    expect(await screen.findByText(formName)).toBeInTheDocument();
    expect(native.operational).not.toHaveBeenCalled();
    await act(async () => finishCold({ url: coldUrl }));
    expect(await screen.findByText(formName)).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe(path));
    expect(native.operational).not.toHaveBeenCalled();
    expect(native.mounted.mock.calls.every(([captured]) => captured.pathname === path && captured.hash === '')).toBe(true);
    expect(native.mounted).toHaveBeenLastCalledWith(expect.objectContaining(path === '/activate' ? { activation: capability, recovery: null } : { activation: null, recovery: capability }));
    expect(window.location.href).not.toContain(activation); expect(window.location.href).not.toContain(recovery);
    expect(JSON.stringify(window.history.state)).not.toContain(capability); expect(document.body.textContent).not.toContain(capability);
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });
});
