import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchTimelogsSnapshot } from '../services/timelogs.service';

export const useTimelogsQuery = () => (
  useQuery({
    queryKey: queryKeys.timelogs.all,
    queryFn: fetchTimelogsSnapshot,
  })
);
