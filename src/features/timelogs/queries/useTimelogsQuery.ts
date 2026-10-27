import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { useOperationalQueryOptions } from '../../../lib/operational-query-options';
import { fetchTimelogsSnapshot } from '../services/timelogs.service';

export const useTimelogsQuery = () => {
  const freshness = useOperationalQueryOptions();
  return useQuery({
    ...freshness,
    queryKey: queryKeys.timelogs.all,
    queryFn: fetchTimelogsSnapshot,
  });
};
