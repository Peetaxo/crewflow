import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchInvoiceApprovalDocuments } from '../services/invoice-approval-sync.service';

export const useInvoiceApprovalsQuery = () => (
  useQuery({
    queryKey: queryKeys.invoiceApprovals.all,
    queryFn: fetchInvoiceApprovalDocuments,
  })
);
