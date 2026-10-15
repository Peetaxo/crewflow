import { usePrivateInvoiceQuery } from '../../invoice-billing/useBillingScope';
import { fetchInvoiceApprovalDocuments } from '../services/invoice-approval-sync.service';
export const useInvoiceApprovalsQuery = () => usePrivateInvoiceQuery('invoice-approvals', fetchInvoiceApprovalDocuments).query;
