import { usePrivateInvoiceQuery } from '../../invoice-billing/useBillingScope';
import { fetchInvoicesSnapshot } from '../services/invoices.service';
export const useInvoicesQuery = () => usePrivateInvoiceQuery('invoices', fetchInvoicesSnapshot).query;
