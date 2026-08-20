import { useEffect } from 'react';
import { appDataSource } from '../../lib/app-config';
import { getLocalAppData, updateLocalAppState } from '../../lib/app-data';
import { resetSupabaseDataScope } from './reset-supabase-data-scope';
import { useAuth } from './useAuth';

const AppDataBootstrap = () => {
  const { isAuthRequired, isAuthenticated } = useAuth();

  useEffect(() => {
    if (appDataSource !== 'supabase') return;

    void resetSupabaseDataScope().catch((error) => {
      console.warn('Nepodařilo se obnovit datový rozsah přihlášeného uživatele.', error);
    });

    if (isAuthRequired && !isAuthenticated) {
      updateLocalAppState(() => getLocalAppData());
    }
  }, [isAuthRequired, isAuthenticated]);

  return null;
};

export default AppDataBootstrap;
