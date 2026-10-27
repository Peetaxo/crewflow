import { useAuth } from '../app/providers/useAuth';
import type { AuthContextType } from '../app/providers/auth-context';
import { appDataSource } from './app-config';

type OperationalAuth = Pick<AuthContextType, 'isAuthenticated' | 'isLoading' | 'isRoleSwitching' | 'currentUserId' | 'currentProfileId' | 'role'>;

export const isOperationalAuthReady = (auth: OperationalAuth) => Boolean(
  auth.isAuthenticated && !auth.isLoading && !auth.isRoleSwitching
  && auth.currentUserId && auth.currentProfileId && auth.role,
);

// Leave local/demo and unrelated queries on their existing defaults.
export const operationalQueryOptions = (remote: boolean) => remote ? {
  refetchInterval: () => (
    document.visibilityState !== 'hidden' && navigator.onLine !== false ? 20_000 : false
  ),
  refetchIntervalInBackground: false,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
  refetchOnReconnect: 'always' as const,
} : {};

export function useOperationalQueryOptions() {
  const auth = useAuth();
  const remote = appDataSource === 'supabase';
  return { ...operationalQueryOptions(remote), enabled: !remote || isOperationalAuthReady(auth) };
}
