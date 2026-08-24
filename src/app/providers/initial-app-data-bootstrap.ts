import { loadSupabaseCrew } from '../../features/crew/services/crew.service';
import { loadSupabaseEvents } from '../../features/events/services/events.service';
import { loadSupabaseProjects } from '../../features/projects/services/projects.service';
import { loadSupabaseTimelogs } from '../../features/timelogs/services/timelogs.service';
import { getLocalAppState } from '../../lib/app-data';
import { queryClient } from '../../lib/query-client';
import { queryKeys } from '../../lib/query-keys';
import { resetSupabaseDataScope } from './reset-supabase-data-scope';

export const bootstrapInitialAppData = async (): Promise<void> => {
  await resetSupabaseDataScope();
  await Promise.all([
    loadSupabaseEvents(),
    loadSupabaseTimelogs(),
    loadSupabaseCrew(),
    loadSupabaseProjects(),
  ]);

  const snapshot = getLocalAppState();
  queryClient.setQueryData(queryKeys.events.all, snapshot.events ?? []);
  queryClient.setQueryData(queryKeys.timelogs.all, snapshot.timelogs ?? []);
};
