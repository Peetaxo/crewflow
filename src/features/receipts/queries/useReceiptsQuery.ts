import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { useOperationalQueryOptions } from '../../../lib/operational-query-options';
import { fetchReceiptsSnapshot } from '../services/receipts.service';

export const useReceiptsQuery = () => {
  const freshness = useOperationalQueryOptions();
  return useQuery({
    ...freshness,
    queryKey: queryKeys.receipts.all,
    queryFn: fetchReceiptsSnapshot,
  });
};
