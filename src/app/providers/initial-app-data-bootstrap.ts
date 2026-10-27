import { loadSupabaseCrew } from '../../features/crew/services/crew.service';
import { loadSupabaseEvents } from '../../features/events/services/events.service';
import { loadSupabaseProjects } from '../../features/projects/services/projects.service';
import { loadSupabaseTimelogs } from '../../features/timelogs/services/timelogs.service';
import { getLocalAppState } from '../../lib/app-data';
import { queryClient } from '../../lib/query-client';
import { queryKeys } from '../../lib/query-keys';
import { getSupabaseDataScopeVersion, resetSupabaseDataScope } from './reset-supabase-data-scope';

let bootstrapGeneration = 0;

export const bootstrapInitialAppData = async (isActive: () => boolean = () => true): Promise<void> => {
  if (!isActive()) return;
  const generation = ++bootstrapGeneration;
  const reset = resetSupabaseDataScope();
  const scopeVersion = getSupabaseDataScopeVersion();
  const isCurrent = () => isActive() && generation === bootstrapGeneration
    && scopeVersion === getSupabaseDataScopeVersion();
  await reset;
  if (!isCurrent()) return;
  await Promise.all([
    loadSupabaseEvents(),
    loadSupabaseTimelogs(),
    loadSupabaseCrew(),
    loadSupabaseProjects(),
  ]);

  if (!isCurrent()) return;
  const snapshot = getLocalAppState();
  queryClient.setQueryData(queryKeys.events.all, snapshot.events ?? []);
  queryClient.setQueryData(queryKeys.timelogs.all, snapshot.timelogs ?? []);
};
