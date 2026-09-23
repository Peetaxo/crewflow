import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/providers/useAuth';
import { useAppContext } from '../../context/useAppContext';
import { appDataSource } from '../../lib/app-config';
import { readShiftWorkflowSnapshot, saveShiftWorkflow } from './shift-workflows.gateway';
import { ShiftWorkflowError, type SaveShiftWorkflow, type ShiftWorkflowScope } from './shift-workflows.contract';

export const shiftWorkflowQueryKey = (scope: ShiftWorkflowScope) => [
  'shift-workflows', scope.source, scope.userId, scope.profileId, scope.role,
] as const;

type Activation = { active: boolean; fingerprint: string };
type SaveVariables = { activation: Activation; scope: ShiftWorkflowScope; command: SaveShiftWorkflow };
const inactive = () => new ShiftWorkflowError('denied', 'Přístup k propojeným směnám se změnil. Obnovte data.');
// Several surfaces can consume one scope. Retiring one must not cancel the
// request still owned by another; retiring the last removes its private data.
const consumers = new WeakMap<QueryClient, Map<string, number>>();

export function useShiftWorkflows(enabled = true) {
  const auth = useAuth();
  const context = useAppContext();
  const queryClient = useQueryClient();
  const effectiveRole = appDataSource === 'local' ? context.role : auth.role ?? 'crew';
  const scope = useMemo<ShiftWorkflowScope>(() => ({
    source: appDataSource, userId: auth.currentUserId, profileId: auth.currentProfileId,
    role: effectiveRole,
  }), [auth.currentUserId, auth.currentProfileId, effectiveRole]);
  const scopeKey = JSON.stringify(shiftWorkflowQueryKey(scope));
  const ready = enabled && (scope.source === 'local' || (
    auth.isAuthenticated && !auth.isLoading && !auth.isRoleSwitching
    && Boolean(auth.currentUserId && auth.currentProfileId && auth.role)
  ));
  const fingerprint = JSON.stringify([scopeKey, ready]);
  const activation = useMemo<Activation>(() => ({ active: false, fingerprint }), [fingerprint]);
  const activeRef = useRef<Activation | null>(null);
  const isCurrent = useCallback((candidate: Activation) => candidate.active && activeRef.current === candidate, []);

  useLayoutEffect(() => {
    activation.active = ready;
    activeRef.current = activation;
    const key = shiftWorkflowQueryKey(scope);
    const scopeConsumers = consumers.get(queryClient) ?? new Map<string, number>();
    consumers.set(queryClient, scopeConsumers);
    if (ready) scopeConsumers.set(scopeKey, (scopeConsumers.get(scopeKey) ?? 0) + 1);
    return () => {
      activation.active = false;
      if (activeRef.current === activation) activeRef.current = null;
      if (!ready) return;
      const remaining = (scopeConsumers.get(scopeKey) ?? 1) - 1;
      if (remaining > 0) {
        scopeConsumers.set(scopeKey, remaining);
        return;
      }
      scopeConsumers.delete(scopeKey);
      // Cancellation prevents a late old promise from repopulating removed data.
      void queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.removeQueries({ queryKey: key, exact: true });
    };
  }, [activation, queryClient, ready, scope, scopeKey]);

  const read = useCallback(async ({ signal }: { signal: AbortSignal }) => {
    const snapshot = await readShiftWorkflowSnapshot(scope, signal);
    if (signal.aborted) throw inactive();
    return snapshot;
  }, [scope]);
  const query = useQuery({
    queryKey: shiftWorkflowQueryKey(scope), enabled: ready, retry: false, gcTime: 0, queryFn: read,
  });
  const mutation = useMutation({
    mutationKey: shiftWorkflowQueryKey(scope), retry: false,
    mutationFn: async ({ activation: captured, scope: capturedScope, command }: SaveVariables) => {
      if (!isCurrent(captured)) throw inactive();
      const result = await saveShiftWorkflow(capturedScope, command);
      if (!isCurrent(captured)) throw inactive();
      await queryClient.invalidateQueries({ queryKey: shiftWorkflowQueryKey(capturedScope), exact: true });
      if (!isCurrent(captured)) throw inactive();
      return result;
    },
  });
  const mutateAsync = mutation.mutateAsync;
  const save = useCallback((command: SaveShiftWorkflow) => {
    if (!isCurrent(activation)) return Promise.reject(inactive());
    return mutateAsync({ activation, scope: { ...scope }, command: structuredClone(command) });
  }, [activation, isCurrent, mutateAsync, scope]);
  const reload = useCallback(async () => {
    if (!isCurrent(activation)) throw inactive();
    // The observer updates options in a passive effect. Fetch the captured key
    // explicitly so even a layout-effect reload cannot dispatch the prior scope.
    const result = await queryClient.fetchQuery({
      queryKey: shiftWorkflowQueryKey(scope), queryFn: read, staleTime: 0, gcTime: 0, retry: false,
    });
    if (!isCurrent(activation)) throw inactive();
    // Do not return QueryObserverResult: it contains another unscoped refetch.
    return result;
  }, [activation, isCurrent, queryClient, read, scope]);

  return {
    scope, scopeKey, ready, save, reload,
    saving: ready && mutation.isPending && mutation.variables?.activation === activation,
    query: {
      data: ready ? query.data : undefined,
      error: ready ? query.error : null,
      isPending: query.isPending,
      isFetching: ready && query.isFetching,
      isError: ready && query.isError,
      refetch: reload,
    },
  };
}
