import { useEffect } from 'react';
import { appDataSource } from '../../lib/app-config';
import { getLocalAppData, updateLocalAppState } from '../../lib/app-data';
import { resetSupabaseClientsHydration } from '../../features/clients/services/clients.service';
import { resetSupabaseCrewHydration } from '../../features/crew/services/crew.service';
import { resetSupabaseEventsHydration } from '../../features/events/services/events.service';
import { resetSupabaseInvoicesHydration } from '../../features/invoices/services/invoices.service';
import { resetSupabaseProjectsHydration } from '../../features/projects/services/projects.service';
import { resetSupabaseReceiptsHydration } from '../../features/receipts/services/receipts.service';
import { resetSupabaseCandidatesHydration } from '../../features/recruitment/services/candidates.service';
import { resetSupabaseTimelogsHydration } from '../../features/timelogs/services/timelogs.service';
import { useAuth } from './AuthProvider';

const resetSupabaseHydrationState = () => {
  resetSupabaseClientsHydration();
  resetSupabaseProjectsHydration();
  resetSupabaseEventsHydration();
  resetSupabaseCrewHydration();
  resetSupabaseReceiptsHydration();
  resetSupabaseTimelogsHydration();
  resetSupabaseInvoicesHydration();
  resetSupabaseCandidatesHydration();
};

const AppDataBootstrap = () => {
  const { isAuthRequired, isAuthenticated } = useAuth();

  useEffect(() => {
    if (appDataSource !== 'supabase') return;

    if (isAuthRequired && !isAuthenticated) {
      resetSupabaseHydrationState();
      updateLocalAppState(() => getLocalAppData());
    }
  }, [isAuthRequired, isAuthenticated]);

  return null;
};

export default AppDataBootstrap;
