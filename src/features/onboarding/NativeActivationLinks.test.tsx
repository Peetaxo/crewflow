import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NativeActivationLinks from './NativeActivationLinks';
import { useActivationLink } from './activation-link';
import nativeConfig from '../../../capacitor.config';

const native = vi.hoisted(() => ({ enabled: true, addListener: vi.fn(), getLaunchUrl: vi.fn(), remove: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.enabled } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: native.addListener, getLaunchUrl: native.getLaunchUrl } }));
vi.mock('../../lib/supabase', () => ({ supabase: null }));
const token = 'a'.repeat(64);
const secondToken = 'b'.repeat(64);
let onOpen: (event: { url: string }) => void;

const Destination = () => {
  const location = useLocation();
  const { token: invitationToken, clearToken } = useActivationLink();
  const navigate = useNavigate();
  return <><div data-testid="path">{location.pathname}</div><div data-testid="token">{invitationToken}</div><button onClick={clearToken}>Clear</button><button onClick={() => navigate('/login')}>Leave</button></>;
};
const renderLinks = (strict = false) => {
  const tree = <MemoryRouter initialEntries={[window.location.pathname === '/activate' ? '/activate' : '/app']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NativeActivationLinks><Routes><Route path="*" element={<Destination />} /></Routes></NativeActivationLinks></MemoryRouter>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
};

describe('native activation handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.remove.mockResolvedValue(undefined);
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    vi.stubEnv('VITE_ONBOARDING_TRUSTED_ORIGINS', 'https://crew.example.test');
    native.enabled = true;
    native.getLaunchUrl.mockResolvedValue(undefined);
    native.addListener.mockImplementation(async (_name, handler) => { onOpen = handler; return { remove: native.remove }; });
  });

  it('routes a cold start through memory without putting the secret in router history', async () => {
    native.getLaunchUrl.mockResolvedValue({ url: `nodu://activate#token=${token}` });
    renderLinks();
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/activate'));
    expect(screen.getByTestId('token')).toHaveTextContent(token);
    expect(JSON.stringify(window.history.state)).not.toContain(token);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('resolves a cold activation URL before mounting the operational route', async () => {
    let finishCold: (value: { url: string }) => void;
    native.getLaunchUrl.mockReturnValue(new Promise((resolve) => { finishCold = resolve; }));
    const OperationalGate = vi.fn(() => <div>Operational gate</div>);
    render(<MemoryRouter initialEntries={['/app']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NativeActivationLinks><Routes><Route path="/app" element={<OperationalGate />} /><Route path="/activate" element={<Destination />} /></Routes></NativeActivationLinks></MemoryRouter>);
    expect(OperationalGate).not.toHaveBeenCalled();
    await act(async () => finishCold({ url: `nodu://activate#token=${token}` }));
    expect(screen.getByTestId('token')).toHaveTextContent(token);
    expect(OperationalGate).not.toHaveBeenCalled();
  });

  it('handles warm opens including a different invitation on the same route', async () => {
    renderLinks();
    await waitFor(() => expect(native.addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function)));
    act(() => onOpen({ url: `nodu://activate#token=${token}` }));
    expect(screen.getByTestId('path')).toHaveTextContent('/activate');
    expect(screen.getByTestId('token')).toHaveTextContent(token);
    act(() => onOpen({ url: `https://crew.example.test/activate#token=${secondToken}` }));
    expect(screen.getByTestId('token')).toHaveTextContent(secondToken);
    act(() => screen.getByText('Leave').click());
    expect(screen.getByTestId('token')).toBeEmptyDOMElement();
  });

  it('does not let a delayed cold URL replace a newer warm invitation', async () => {
    let finishCold: (value: { url: string }) => void;
    native.getLaunchUrl.mockReturnValue(new Promise((resolve) => { finishCold = resolve; }));
    renderLinks();
    act(() => onOpen({ url: `nodu://activate#token=${secondToken}` }));
    await act(async () => finishCold({ url: `nodu://activate#token=${token}` }));
    expect(screen.getByTestId('token')).toHaveTextContent(secondToken);
  });

  it('accepts the unique simulator scheme only for the explicitly enabled local pilot', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431');
    renderLinks(); await screen.findByTestId('path');
    act(() => onOpen({ url: `nodu-test://activate#token=${token}` }));
    expect(screen.getByTestId('path')).toHaveTextContent('/activate');
    expect(screen.getByTestId('token')).toHaveTextContent(token);
  });

  it('rejects the simulator scheme outside the local pilot', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    renderLinks(); await screen.findByTestId('path');
    act(() => onOpen({ url: `nodu-test://activate#token=${token}` }));
    expect(screen.getByTestId('path')).toHaveTextContent('/app');
    expect(screen.getByTestId('token')).toBeEmptyDOMElement();
  });

  it('rejects external links without navigation', async () => {
    renderLinks();
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/app'));
    act(() => onOpen({ url: `https://evil.example/activate#token=${token}` }));
    expect(screen.getByTestId('path')).toHaveTextContent('/app');
    expect(screen.getByTestId('token')).toBeEmptyDOMElement();
  });

  it('removes a listener that resolves after unmount and ignores pending launch URLs', async () => {
    let finishListener: (value: { remove: typeof native.remove }) => void;
    let finishCold: (value: { url: string }) => void;
    native.addListener.mockReturnValue(new Promise((resolve) => { finishListener = resolve; }));
    native.getLaunchUrl.mockReturnValue(new Promise((resolve) => { finishCold = resolve; }));
    const view = renderLinks();
    view.unmount();
    await act(async () => {
      finishListener({ remove: native.remove });
      finishCold({ url: `nodu://activate#token=${token}` });
    });
    expect(native.remove).toHaveBeenCalledTimes(1);
  });

  it('cleans up a mounted listener', async () => {
    const view = renderLinks();
    await act(async () => {});
    view.unmount();
    expect(native.remove).toHaveBeenCalledTimes(1);
  });

  it('captures and scrubs browser fragments safely under StrictMode', async () => {
    native.enabled = false;
    window.history.replaceState(null, '', `/activate#token=${token}`);
    renderLinks(true);
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent(token));
    expect(window.location.hash).toBe('');
    expect(native.addListener).not.toHaveBeenCalled();
  });

  it('does not register native listeners while disabled and still scrubs the browser token', async () => {
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false');
    window.history.replaceState(null, '', `/activate#token=${token}`);
    renderLinks();
    expect(screen.getByTestId('token')).toBeEmptyDOMElement();
    expect(window.location.hash).toBe('');
    expect(native.addListener).not.toHaveBeenCalled();
    expect(native.getLaunchUrl).not.toHaveBeenCalled();
  });

  it('registers the pilot scheme and official plugin in both native targets', () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(read('ios/App/App/Info.plist')).toMatch(/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>nodu<\/string>/);
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:scheme="nodu" android:host="activate"');
    expect(manifest).toContain('android.intent.action.VIEW');
    expect(manifest).toContain('android.intent.category.BROWSABLE');
    expect(read('ios/App/CapApp-SPM/Package.swift')).toContain('CapacitorApp');
    expect(read('android/capacitor.settings.gradle')).toContain('@capacitor/app/android');
    expect(JSON.parse(read('package.json')).dependencies['@capacitor/app']).toBe('8.1.2');
  });

  it('disables native bridge logging so launch invitation tokens cannot enter debug logs', () => {
    expect(nativeConfig.loggingBehavior).toBe('none');
    expect(nativeConfig.ios?.loggingBehavior ?? nativeConfig.loggingBehavior).toBe('none');
    expect(nativeConfig.android?.loggingBehavior ?? nativeConfig.loggingBehavior).toBe('none');
  });
});
