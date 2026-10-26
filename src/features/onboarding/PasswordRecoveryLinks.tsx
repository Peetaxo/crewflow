import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { PasswordRecoveryLinkContext, consumeBrowserRecoveryToken, parsePasswordRecoveryLink } from './password-recovery-link';
import { isLocalOnboardingPilot } from './local-pilot';

const PasswordRecoveryLinks = ({ children, gateChildren = true }: { children: ReactNode; gateChildren?: boolean }) => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => { navigateRef.current = navigate; }, [navigate]);
  const { pathname } = useLocation();
  const enabled = isLocalOnboardingPilot();
  const nativePlatform = Capacitor.isNativePlatform();
  const [nativeReady, setNativeReady] = useState(() => !enabled || !nativePlatform);
  const [recovery, setRecovery] = useState({ token: null as string | null, revision: 0, ready: false });
  const browserCaptured = useRef(false);
  const clearToken = useCallback(() => setRecovery((current) => current.token ? { ...current, token: null } : current), []);
  const acceptToken = useCallback((token: string) => {
    setRecovery((current) => current.token === token ? current : { token, revision: current.revision + 1, ready: true });
    navigateRef.current('/reset-password', { replace: true });
    setNativeReady(true);
  }, []);

  // Layout timing scrubs the browser URL before the recovery form is painted.
  useLayoutEffect(() => {
    if (browserCaptured.current) return;
    browserCaptured.current = true;
    const token = consumeBrowserRecoveryToken();
    if (token && enabled) acceptToken(token);
    else setRecovery((current) => ({ ...current, ready: true }));
  }, [acceptToken, enabled]);

  useEffect(() => {
    if (pathname !== '/reset-password') clearToken();
  }, [clearToken, pathname]);

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.pathname !== '/reset-password') return;
      const token = consumeBrowserRecoveryToken();
      if (token && enabled) acceptToken(token);
      else setRecovery((current) => ({ token: null, revision: current.revision + 1, ready: true }));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [acceptToken, enabled]);

  useEffect(() => {
    if (!enabled || !nativePlatform) return;
    let cancelled = false;
    let receivedWarmUrl = false;
    let listener: PluginListenerHandle | undefined;
    const acceptUrl = (url: string) => {
      if (cancelled) return;
      const token = parsePasswordRecoveryLink(url);
      if (token) acceptToken(token);
    };

    void App.addListener('appUrlOpen', ({ url }) => {
      if (cancelled) return;
      receivedWarmUrl = true;
      acceptUrl(url);
      setNativeReady(true);
    }).then((handle) => {
      if (cancelled) void handle.remove().catch(() => {});
      else listener = handle;
    }).catch(() => { /* A failed plugin registration must not expose the recovery URL. */ });

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url && !receivedWarmUrl) acceptUrl(launch.url);
    }).catch(() => { /* Normal app launches may have no available URL. */ })
      .finally(() => { if (!cancelled) setNativeReady(true); });

    return () => {
      cancelled = true;
      if (listener) void listener.remove().catch(() => {});
    };
  }, [acceptToken, enabled, nativePlatform]);

  const value = useMemo(() => ({ ...recovery, ready: recovery.ready && nativeReady, clearToken }), [clearToken, recovery, nativeReady]);
  const awaitingRecoveryRoute = Boolean(recovery.token) && pathname !== '/reset-password';
  return (
    <PasswordRecoveryLinkContext.Provider value={value}>
      {!gateChildren || (nativeReady && !awaitingRecoveryRoute) ? children : <div role="status" className="flex min-h-screen items-center justify-center bg-[color:var(--nodu-paper)] text-[color:var(--nodu-text)]">Otevírám aplikaci…</div>}
    </PasswordRecoveryLinkContext.Provider>
  );
};
export default PasswordRecoveryLinks;
