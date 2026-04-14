import { useEffect } from 'react';
import { toast } from 'sonner';
import { appDataSource } from '../../lib/app-config';
import { getLocalAppData, getSupabaseAppData, updateLocalAppState } from '../../lib/app-data';
import { useAuth } from './AuthProvider';

const AppDataBootstrap = () => {
  const { isAuthRequired, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (appDataSource !== 'supabase') return;

    if (isAuthRequired && !isAuthenticated) {
      updateLocalAppState(() => getLocalAppData());
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const snapshot = await getSupabaseAppData();
        if (isCancelled) return;
        updateLocalAppState(() => snapshot);
        toast.success('Aplikace nacetla data ze Supabase.');
      } catch (error) {
        if (isCancelled) return;
        const message = error instanceof Error ? error.message : 'Nepodarilo se nacist data ze Supabase.';
        toast.warning(`Supabase data se nepodarilo nacist: ${message}`);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [isAuthRequired, isAuthenticated, user?.id]);

  return null;
};

export default AppDataBootstrap;
