import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchInvoicesSnapshot } from '../services/invoices.service';

export const useInvoicesQuery = () => (
  useQuery({
    queryKey: queryKeys.invoices.all,
    queryFn: fetchInvoicesSnapshot,
  })
);
