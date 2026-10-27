import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/providers/useAuth';
import { useAppContext } from '../../context/useAppContext';
import { appDataSource } from '../../lib/app-config';
import { operationalQueryOptions } from '../../lib/operational-query-options';
import { BillingError, type BillingScope } from './contract';
import { registerBillingActivation } from './identity-scope';
const consumers = new WeakMap<QueryClient, Map<string, number>>();
export const privateInvoiceQueryKey = (prefix: string, scope: BillingScope) => [prefix, scope.source, scope.userId, scope.profileId, scope.role] as const;
export const billingInactive = () => new BillingError('denied', 'Přístup k fakturaci se změnil. Obnovte data.');
export function useBillingScope(enabled = true) {
  const auth = useAuth(); const context = useAppContext();
  const role = appDataSource === 'local' ? context.role : auth.role ?? 'crew';
  const scope = useMemo<BillingScope>(() => ({ source: appDataSource, userId: auth.currentUserId, profileId: auth.currentProfileId, role }), [auth.currentUserId, auth.currentProfileId, role]);
  const ready = enabled && (appDataSource === 'local' || Boolean(auth.isAuthenticated && !auth.isLoading && !auth.isRoleSwitching && auth.currentUserId && auth.currentProfileId && auth.role));
  const scopeKey = JSON.stringify([scope, ready]);
  const activation = useMemo(() => ({ active: false, scopeKey }), [scopeKey]);
  const current = useRef(activation);
  useLayoutEffect(() => { activation.active = ready; current.current = activation; return registerBillingActivation(activation); }, [activation, ready]);
  const capture = useCallback(() => {
    const captured = activation;
    return () => captured.active && current.current === captured;
  }, [activation]);
  return { scope, scopeKey, ready, capture };
}
export function usePrivateInvoiceQuery<T>(prefix: string, read: () => Promise<T>, enabled = true) {
  const identity = useBillingScope(enabled); const client = useQueryClient();
  const { scope, ready, capture } = identity;
  const key = useMemo(() => privateInvoiceQueryKey(prefix, scope), [prefix, scope]);
  const keyText = JSON.stringify(key);
  useLayoutEffect(() => {
    const scopeConsumers = consumers.get(client) ?? new Map<string, number>(); consumers.set(client, scopeConsumers);
    if (ready) scopeConsumers.set(keyText, (scopeConsumers.get(keyText) ?? 0) + 1);
    return () => {
      if (!ready) return;
      const count = (scopeConsumers.get(keyText) ?? 1) - 1;
      if (count > 0) { scopeConsumers.set(keyText, count); return; }
      scopeConsumers.delete(keyText); void client.cancelQueries({ queryKey: key, exact: true }); client.removeQueries({ queryKey: key, exact: true });
    };
  }, [client, key, keyText, ready]);
  const queryFn = useCallback(async ({ signal }: { signal: AbortSignal }) => {
    const result = await read(); if (signal.aborted) throw billingInactive(); return result;
  }, [read]);
  const query = useQuery({ refetchOnWindowFocus: 'always', refetchOnReconnect: 'always', ...operationalQueryOptions(scope.source === 'supabase'),
    queryKey: key, queryFn, enabled: ready, retry: false, gcTime: 0 });
  const reload = useCallback(async () => {
    const isCurrent = capture(); if (!isCurrent()) throw billingInactive();
    const result = await client.fetchQuery({ queryKey: key, queryFn, staleTime: 0, gcTime: 0, retry: false });
    if (!isCurrent()) throw billingInactive(); return result;
  }, [capture, client, key, queryFn]);
  useEffect(() => {
    if (!ready || scope.source !== 'supabase') return;
    const resume = () => { if (document.visibilityState === 'visible') void reload().catch(() => {}); };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [ready, reload, scope.source]);
  return { ...identity, reload, query: { ...query, data: ready ? query.data : undefined, error: ready ? query.error : null, refetch: reload } };
}
