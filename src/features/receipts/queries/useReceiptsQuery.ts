import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchReceiptsSnapshot } from '../services/receipts.service';

export const useReceiptsQuery = () => (
  useQuery({
    queryKey: queryKeys.receipts.all,
    queryFn: fetchReceiptsSnapshot,
  })
);
