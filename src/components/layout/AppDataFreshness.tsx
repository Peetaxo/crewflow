import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useSyncExternalStore } from 'react';
import { useQueryClient, onlineManager, focusManager, type Query } from '@tanstack/react-query';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../../app/providers/useAuth';
import { useAppContext } from '../../context/useAppContext';
import { appDataSource } from '../../lib/app-config';
import { isOperationalAuthReady } from '../../lib/operational-query-options';

const sharedPrefixes = new Set(['events', 'timelogs', 'receipts']);
const privatePrefixes = new Set(['shift-workflows', 'invoices', 'invoice-approvals', 'invoice-billing', 'invoice-billing-actors']);

export default function AppDataFreshness() {
  const auth = useAuth();
  const { currentTab, selectedEventId, selectedProjectIdForStats } = useAppContext();
  const client = useQueryClient();
  const { currentUserId, currentProfileId, role } = auth;
  const ready = appDataSource === 'supabase' && isOperationalAuthReady(auth);
  const scopeKey = JSON.stringify([currentUserId, currentProfileId, role, ready]);
  const activation = useMemo(() => ({ active: false, scopeKey }), [scopeKey]);
  useLayoutEffect(() => {
    activation.active = ready;
    return () => { activation.active = false; };
  }, [activation, ready]);

  const currentQuery = useCallback((query: Query) => {
    if (!ready || !query.isActive()) return false;
    const [prefix, source, userId, profileId, queryRole] = query.queryKey;
    if (sharedPrefixes.has(String(prefix))) return true;
    return privatePrefixes.has(String(prefix)) && source === 'supabase'
      && userId === currentUserId && profileId === currentProfileId && queryRole === role;
  }, [currentProfileId, currentUserId, ready, role]);

  const connectivity = useMemo(() => ({
    scopeKey, online: navigator.onLine !== false, awaitingRead: new WeakSet<Query>(),
  }), [scopeKey]);
  const [, updateConnectivity] = useReducer(value => value + 1, 0);
  const subscribe = useCallback((notify: () => void) => {
    const cache = client.getQueryCache();
    for (const query of cache.findAll({ predicate: currentQuery })) {
      if (query.state.status === 'error' || query.state.fetchStatus === 'paused') connectivity.awaitingRead.add(query);
    }
    return cache.subscribe(event => {
      if (currentQuery(event.query)) {
        if (event.type === 'updated' && event.action.type === 'success' && !event.action.manual) {
          connectivity.awaitingRead.delete(event.query);
        } else if (event.query.state.status === 'error' || event.query.state.fetchStatus === 'paused') {
          connectivity.awaitingRead.add(event.query);
        }
      }
      notify();
    });
  }, [client, connectivity, currentQuery]);
  const snapshot = useCallback(() => {
    const queries = client.getQueryCache().findAll({ predicate: currentQuery });
    const stale = queries.length > 0 && (!connectivity.online || queries.some(query => (
      query.state.status === 'error' || query.state.fetchStatus === 'paused' || connectivity.awaitingRead.has(query)
    )));
    if (!stale) return 'fresh';
    return queries.some(query => query.state.data !== undefined) ? 'stale-cached' : 'stale-empty';
  }, [client, connectivity, currentQuery]);
  const freshness = useSyncExternalStore(subscribe, snapshot);

  const markAwaitingRead = useCallback(() => {
    for (const query of client.getQueryCache().findAll({ predicate: currentQuery })) connectivity.awaitingRead.add(query);
  }, [client, connectivity, currentQuery]);
  const reconcileConnectivity = useCallback(() => {
    const nowOnline = navigator.onLine !== false;
    if (connectivity.online !== nowOnline) {
      markAwaitingRead();
      connectivity.online = nowOnline;
      updateConnectivity();
    }
    return nowOnline;
  }, [connectivity, markAwaitingRead]);
  const refresh = useCallback(() => {
    if (!activation.active || !reconcileConnectivity()) return;
    // Focus, visibility, navigation and multiple consumers share an in-flight read.
    void client.refetchQueries({ type: 'active', predicate: currentQuery }, { cancelRefetch: false });
  }, [activation, client, currentQuery, reconcileConnectivity]);

  useEffect(() => {
    if (!ready) return;
    const resume = () => {
      if (!activation.active || document.visibilityState === 'hidden') return;
      refresh();
    };
    const offline = () => {
      if (!activation.active) return;
      markAwaitingRead();
      connectivity.online = false;
      updateConnectivity();
    };
    const onlineAgain = () => {
      if (!activation.active) return;
      reconcileConnectivity();
      resume();
    };
    window.addEventListener('focus', resume);
    window.addEventListener('online', onlineAgain);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', resume);
    let disposed = false;
    let removeNative: (() => Promise<void>) | undefined;
    const native = Capacitor.isNativePlatform();
    if (native) {
      let nativeEvents = 0;
      const applyNativeState = ({ isActive }: { isActive: boolean }) => {
        if (disposed || !activation.active) return;
        // WKWebView can remain visible while its native app is in the background.
        focusManager.setFocused(isActive);
        if (!isActive) return;
        // A WebView can miss browser connectivity events while suspended.
        onlineManager.setOnline(navigator.onLine !== false);
        refresh();
      };
      void App.addListener('appStateChange', state => {
        nativeEvents += 1;
        applyNativeState(state);
      }).then(handle => {
        if (disposed) void handle.remove().catch(() => {});
        else removeNative = () => handle.remove();
      }).catch(() => {});
      void App.getState().then(state => {
        if (nativeEvents === 0) applyNativeState(state);
      }).catch(() => {});
    }
    return () => {
      disposed = true;
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', onlineAgain);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', resume);
      void removeNative?.().catch(() => {});
      if (native) focusManager.setFocused(undefined);
    };
  }, [activation, connectivity, markAwaitingRead, ready, reconcileConnectivity, refresh]);

  // Badge observers stay mounted across surfaces, so a tab/detail open needs an
  // explicit read even when the query is fresh and already has consumers.
  useEffect(() => {
    if (document.visibilityState !== 'hidden') refresh();
  }, [currentTab, selectedEventId, selectedProjectIdForStats, refresh]);

  if (!ready || freshness === 'fresh') return null;
  return <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
    <div><p className="font-medium">Data nemusí být aktuální</p>
      <p>{freshness === 'stale-cached' ? 'Zobrazená data jsou z posledního načtení.' : 'Data se nepodařilo načíst.'}</p></div>
    <button type="button" className="rounded-lg border border-current px-3 py-2 font-medium" onClick={refresh}>Zkusit obnovit</button>
  </div>;
}
