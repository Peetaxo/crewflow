import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchEventsSnapshot } from '../services/events.service';

export const useEventsQuery = () => (
  useQuery({
    queryKey: queryKeys.events.all,
    queryFn: fetchEventsSnapshot,
  })
);
