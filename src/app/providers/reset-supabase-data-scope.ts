import { resetSupabaseAppData } from '../../lib/app-data';
import { resetSupabaseCrewRatingsHydration } from '../../features/crew/services/crew-ratings.service';
import { retireBillingDataScope } from '../../features/invoice-billing/identity-scope';
import { resetSupabaseClientsHydration } from '../../features/clients/services/clients.service';
import { resetSupabaseCrewHydration } from '../../features/crew/services/crew.service';
import { resetSupabaseEventsHydration } from '../../features/events/services/events.service';
import { resetSupabaseFleetHydration } from '../../features/fleet/services/fleet.service';
import { resetSupabaseInvoicesHydration } from '../../features/invoices/services/invoices.service';
import { resetSupabaseProjectsHydration } from '../../features/projects/services/projects.service';
import { resetSupabaseReceiptsHydration } from '../../features/receipts/services/receipts.service';
import { resetSupabaseCandidatesHydration } from '../../features/recruitment/services/candidates.service';
import { resetSupabaseTimelogsHydration } from '../../features/timelogs/services/timelogs.service';
import { resetSupabaseWarehouseHydration } from '../../features/warehouse/services/warehouse.service';
import { queryClient } from '../../lib/query-client';

const resetHydrationGuards = () => {
  resetSupabaseClientsHydration();
  resetSupabaseProjectsHydration();
  resetSupabaseEventsHydration();
  resetSupabaseCrewHydration();
  resetSupabaseReceiptsHydration();
  resetSupabaseTimelogsHydration();
  resetSupabaseInvoicesHydration();
  resetSupabaseCandidatesHydration();
  resetSupabaseFleetHydration();
  resetSupabaseWarehouseHydration();
  resetSupabaseCrewRatingsHydration();
};

let scopeVersion = 0;

export const getSupabaseDataScopeVersion = () => scopeVersion;

export const resetSupabaseDataScope = async (): Promise<void> => {
  scopeVersion += 1;
  retireBillingDataScope();
  resetHydrationGuards();
  // Start cancellation and evict synchronously. A late cancellation completion
  // must never evict the next identity's cache or restart old observers.
  const cancellation = queryClient.cancelQueries();
  queryClient.removeQueries();
  resetSupabaseAppData();
  await cancellation;
};
