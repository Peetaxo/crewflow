import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { useOperationalQueryOptions } from '../../../lib/operational-query-options';
import { fetchEventsSnapshot } from '../services/events.service';

export const useEventsQuery = () => {
  const freshness = useOperationalQueryOptions();
  return useQuery({
    ...freshness,
    queryKey: queryKeys.events.all,
    queryFn: fetchEventsSnapshot,
  });
};
