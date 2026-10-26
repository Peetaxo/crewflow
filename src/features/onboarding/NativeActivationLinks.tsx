import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { ActivationLinkContext, consumeBrowserActivationToken, parseActivationLink } from './activation-link';
import { isLocalOnboardingPilot } from './local-pilot';
import { isOnboardingEnabled } from './services/activation.service';

const NativeActivationLinks = ({ children, gateChildren = true }: { children: ReactNode; gateChildren?: boolean }) => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => { navigateRef.current = navigate; }, [navigate]);
  const { pathname } = useLocation();
  const enabled = isOnboardingEnabled();
  const nativePlatform = Capacitor.isNativePlatform();
  const [nativeReady, setNativeReady] = useState(() => !enabled || !nativePlatform);
  const [invitation, setInvitation] = useState({ token: null as string | null, revision: 0, ready: false });
  const browserCaptured = useRef(false);
  const clearToken = useCallback(() => setInvitation((current) => current.token ? { ...current, token: null } : current), []);
  const acceptToken = useCallback((token: string) => {
    setInvitation((current) => current.token === token ? current : { token, revision: current.revision + 1, ready: true });
    navigateRef.current('/activate', { replace: true });
    setNativeReady(true);
  }, []);

  // Layout timing scrubs the browser URL before the activation form is painted.
  useLayoutEffect(() => {
    if (browserCaptured.current) return;
    browserCaptured.current = true;
    const token = consumeBrowserActivationToken();
    if (token && enabled) acceptToken(token);
    else setInvitation((current) => ({ ...current, ready: true }));
  }, [acceptToken, enabled]);

  useEffect(() => {
    if (pathname !== '/activate') clearToken();
  }, [clearToken, pathname]);

  useEffect(() => {
    const onHashChange = () => {
      const token = consumeBrowserActivationToken();
      if (token && enabled) acceptToken(token);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [acceptToken, enabled]);

  useEffect(() => {
    if (!enabled || !nativePlatform) return;
    let cancelled = false;
    let receivedWarmUrl = false;
    let listener: PluginListenerHandle | undefined;
    const trustedOrigins = (import.meta.env.VITE_ONBOARDING_TRUSTED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    const acceptUrl = (url: string) => {
      if (cancelled) return;
      const token = parseActivationLink(url, trustedOrigins, isLocalOnboardingPilot());
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
    }).catch(() => { /* A failed plugin registration must not expose the invitation URL. */ });

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url && !receivedWarmUrl) acceptUrl(launch.url);
    }).catch(() => { /* Normal app launches may have no available URL. */ })
      .finally(() => { if (!cancelled) setNativeReady(true); });

    return () => {
      cancelled = true;
      if (listener) void listener.remove().catch(() => {});
    };
  }, [acceptToken, enabled, nativePlatform]);

  const value = useMemo(() => ({ ...invitation, ready: invitation.ready && nativeReady, clearToken }), [clearToken, invitation, nativeReady]);
  const awaitingActivationRoute = Boolean(invitation.token) && pathname !== '/activate';
  return (
    <ActivationLinkContext.Provider value={value}>
      {!gateChildren || (nativeReady && !awaitingActivationRoute) ? children : <div role="status" className="flex min-h-screen items-center justify-center bg-[color:var(--nodu-paper)] text-[color:var(--nodu-text)]">Otevírám aplikaci…</div>}
    </ActivationLinkContext.Provider>
  );
};
export default NativeActivationLinks;
