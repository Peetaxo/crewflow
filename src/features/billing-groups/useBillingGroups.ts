import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/providers/useAuth';
import { useAppContext } from '../../context/useAppContext';
import { getLocalAppState } from '../../lib/app-data';
import { appDataSource } from '../../lib/app-config';
import { fetchEventsSnapshot } from '../events/services/events.service';
import { fetchTimelogsSnapshot } from '../timelogs/services/timelogs.service';
import { BillingError, readBillingGroups, saveBillingGroup } from './billing-groups.gateway';
import type { BillingScope, SaveBillingGroup } from './billing-groups.model';

type BillingActivation = {
  fingerprint: string;
  active: boolean;
};

type SaveVariables = {
  activation: BillingActivation;
  command: SaveBillingGroup;
  scope: BillingScope;
  scopeKey: string;
};

const inactiveMessage = 'Fakturační skupiny mezitím změnily přístupový rozsah. Obnovte data.';

export const billingQueryKey = (scope: BillingScope) => (
  ['billing-groups', scope.source, scope.userId, scope.profileId, scope.role] as const
);

function inactive(): never {
  throw new BillingError('denied', inactiveMessage);
}

function isCurrent(
  activationRef: React.MutableRefObject<BillingActivation | null>,
  activation: BillingActivation,
): boolean {
  return activation.active && activationRef.current === activation;
}

export function useBillingGroups(enabled = true) {
  const auth = useAuth();
  const context = useAppContext();
  const queryClient = useQueryClient();
  const scope = useMemo<BillingScope>(() => ({
    source: appDataSource,
    userId: auth.currentUserId,
    profileId: auth.currentProfileId,
    role: appDataSource === 'local' ? context.role : (auth.role ?? 'crew'),
  }), [auth.currentProfileId, auth.currentUserId, auth.role, context.role]);
  const scopeKey = useMemo(() => JSON.stringify(billingQueryKey(scope)), [scope]);
  const ready = enabled && (
    scope.source === 'local'
    || (!auth.isLoading
      && !auth.isRoleSwitching
      && auth.isAuthenticated
      && auth.role !== null
      && auth.currentUserId !== null)
  );
  const activationRef = useRef<BillingActivation | null>(null);
  const fingerprint = `${ready ? 'ready' : 'paused'}:${scopeKey}`;
  const activation = useMemo<BillingActivation>(
    () => ({ fingerprint, active: false }),
    [fingerprint],
  );

  useLayoutEffect(() => {
    activation.active = ready;
    activationRef.current = activation;
    return () => {
      activation.active = false;
      if (activationRef.current === activation) activationRef.current = null;
    };
  }, [activation, ready]);

  const query = useQuery({
    queryKey: billingQueryKey(scope),
    enabled: ready,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!isCurrent(activationRef, activation)) inactive();
      const [snapshot, events, timelogs] = await Promise.all([
        readBillingGroups(scope, signal),
        fetchEventsSnapshot(),
        fetchTimelogsSnapshot(),
      ]);
      if (signal.aborted || !isCurrent(activationRef, activation)) inactive();

      return {
        snapshot,
        events,
        timelogs,
        projects: getLocalAppState().projects,
      };
    },
  });

  const mutation = useMutation({
    mutationKey: billingQueryKey(scope),
    retry: false,
    mutationFn: async ({ activation: capturedActivation, command, scope: capturedScope, scopeKey: capturedScopeKey }: SaveVariables) => {
      if (!isCurrent(activationRef, capturedActivation) || capturedScopeKey !== JSON.stringify(billingQueryKey(capturedScope))) {
        inactive();
      }
      const result = await saveBillingGroup(capturedScope, command);
      await queryClient.invalidateQueries({
        queryKey: billingQueryKey(capturedScope),
        exact: true,
      });
      if (!isCurrent(activationRef, capturedActivation)) inactive();
      return result;
    },
  });

  const save = useCallback((command: SaveBillingGroup) => {
    if (!isCurrent(activationRef, activation)) return Promise.reject(new BillingError('denied', inactiveMessage));
    const capturedScope = { ...scope };
    const capturedScopeKey = scopeKey;
    return mutation.mutateAsync({
      activation,
      command,
      scope: capturedScope,
      scopeKey: capturedScopeKey,
    });
  }, [activation, mutation, scope, scopeKey]);

  const refetch = query.refetch;
  const reload = useCallback(() => {
    if (!isCurrent(activationRef, activation)) {
      return Promise.reject(new BillingError('denied', inactiveMessage));
    }
    return refetch();
  }, [activation, refetch]);

  return { scope, scopeKey, ready, query, save, reload };
}
