import type { Json } from '../../../lib/database.types';
import { supabase } from '../../../lib/supabase';
import type { InvoiceStatus, ReceiptStatus, TimelogStatus } from '../../../types';

const GENERIC_ERROR_MESSAGE = 'Operaci s fakturou se nepodařilo dokončit.';

const ERROR_MESSAGES = {
  invoice_mutation_invalid: 'Faktura obsahuje neplatné nebo neúplné údaje.',
  invoice_not_found: 'Faktura už neexistuje nebo k ní nemáte přístup.',
  invoice_create_conflict: 'Vybrané položky se mezitím změnily. Obnovte data a zkuste to znovu.',
  invoice_sent_conflict: 'Faktura nebo její položky se mezitím změnily. Obnovte data a zkuste to znovu.',
  invoice_paid_conflict: 'Faktura nebo její položky se mezitím změnily. Obnovte data a zkuste to znovu.',
  invoice_delete_conflict: 'Faktura nebo její položky se mezitím změnily. Obnovte data a zkuste to znovu.',
  invoice_has_protected_items: 'Fakturu nelze změnit, protože obsahuje položky v chráněném stavu.',
  invoice_unauthorized: 'K této operaci s fakturou nemáte oprávnění.',
} as const;

const INVOICE_STATUSES: readonly InvoiceStatus[] = ['draft', 'sent', 'paid'];
const TIMELOG_STATUSES: readonly TimelogStatus[] = [
  'draft',
  'pending_crew_confirmation',
  'pending_ch',
  'pending_coo',
  'approved',
  'invoiced',
  'paid',
  'rejected',
];
const RECEIPT_STATUSES: readonly ReceiptStatus[] = [
  'draft',
  'submitted',
  'approved',
  'attached',
  'reimbursed',
  'rejected',
];

export interface InvoiceCreateAtomicHeader {
  contractor_id: string;
  event_id: string | null;
  job_number: string;
  total_hours: number;
  amount_hours: number;
  amount_km: number;
  amount_receipts: number;
  total_amount: number;
  invoice_number: string;
  issue_date: string;
  taxable_supply_date: string;
  due_date: string;
  currency: 'CZK';
  supplier_snapshot: Json;
  customer_snapshot: Json;
}

export interface InvoiceCreateAtomicItem {
  job_number: string;
  event_id: string | null;
  hours: number;
  amount_hours: number;
  km: number;
  amount_km: number;
  amount_receipts: number;
  total_amount: number;
}

export interface InvoiceMutationTarget {
  id: string;
  expected_updated_at: string;
}

export interface CreateInvoiceAtomicInput {
  invoice: InvoiceCreateAtomicHeader;
  items: InvoiceCreateAtomicItem[];
  timelogs: InvoiceMutationTarget[];
  receipts: InvoiceMutationTarget[];
}

export interface InvoiceMutationChildResult<TStatus extends TimelogStatus | ReceiptStatus> {
  id: string;
  status: TStatus;
  updatedAt: string;
}

export interface InvoiceMutationRpcResult {
  invoice: {
    id: string;
    status: InvoiceStatus;
    updatedAt: string;
    paidAt: string | null;
  };
  timelogs: InvoiceMutationChildResult<TimelogStatus>[];
  receipts: InvoiceMutationChildResult<ReceiptStatus>[];
}

interface VersionedInvoiceMutationInput {
  id: string;
  expectedStatus: InvoiceStatus;
  expectedUpdatedAt: string;
}

interface MarkInvoicePaidAtomicInput extends VersionedInvoiceMutationInput {
  paidAt: string;
}

interface MarkInvoiceSentAtomicInput {
  id: string;
  expectedUpdatedAt: string;
  sentAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const toDomainError = (error: unknown): Error => {
  const rawMessage = isRecord(error) && typeof error.message === 'string'
    ? error.message
    : '';
  const token = (Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>)
    .find((candidate) => (
      new RegExp(`(^|[^A-Za-z0-9_])${candidate}($|[^A-Za-z0-9_])`).test(rawMessage)
    ));

  if (token) {
    return new Error(ERROR_MESSAGES[token]);
  }

  console.error('Unexpected atomic invoice mutation RPC error', error);
  return new Error(GENERIC_ERROR_MESSAGE);
};

const parseChildResults = <TStatus extends TimelogStatus | ReceiptStatus>(
  value: unknown,
  statuses: readonly TStatus[],
  expectedStatus: TStatus,
): InvoiceMutationChildResult<TStatus>[] | null => {
  if (!Array.isArray(value)) return null;

  const results: InvoiceMutationChildResult<TStatus>[] = [];
  for (const item of value) {
    if (
      !isRecord(item)
      || !hasText(item.id)
      || !hasText(item.updated_at)
      || !statuses.includes(item.status as TStatus)
      || item.status !== expectedStatus
    ) {
      return null;
    }
    results.push({ id: item.id, status: item.status as TStatus, updatedAt: item.updated_at });
  }

  const ids = results.map((item) => item.id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1].localeCompare(id) >= 0)) {
    return null;
  }
  return results;
};

const parseMutationResult = (
  data: unknown,
  expected: {
    invoiceId?: string;
    invoiceStatus: InvoiceStatus;
    timelogStatus: TimelogStatus;
    receiptStatus: ReceiptStatus;
  },
): InvoiceMutationRpcResult => {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  const timelogs = isRecord(row)
    ? parseChildResults(row.timelogs, TIMELOG_STATUSES, expected.timelogStatus)
    : null;
  const receipts = isRecord(row)
    ? parseChildResults(row.receipts, RECEIPT_STATUSES, expected.receiptStatus)
    : null;
  if (
    !isRecord(row)
    || !hasText(row.invoice_id)
    || (expected.invoiceId !== undefined && row.invoice_id !== expected.invoiceId)
    || !hasText(row.invoice_updated_at)
    || !INVOICE_STATUSES.includes(row.invoice_status as InvoiceStatus)
    || row.invoice_status !== expected.invoiceStatus
    || (row.paid_at !== null && !hasText(row.paid_at))
    || timelogs === null
    || receipts === null
  ) {
    console.error('Unexpected atomic invoice mutation response', data);
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  return {
    invoice: {
      id: row.invoice_id,
      status: row.invoice_status as InvoiceStatus,
      updatedAt: row.invoice_updated_at,
      paidAt: row.paid_at as string | null,
    },
    timelogs,
    receipts,
  };
};

const assertClient = () => {
  if (!supabase) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
  return supabase;
};

const runRpc = async (
  functionName: 'create_invoice_atomic' | 'mark_invoice_sent_atomic' | 'mark_invoice_paid_atomic' | 'delete_invoice_atomic',
  args: Record<string, Json | undefined>,
  expected: Parameters<typeof parseMutationResult>[1],
): Promise<InvoiceMutationRpcResult> => {
  const result = await assertClient().rpc(functionName, args);
  if (result.error) {
    throw toDomainError(result.error);
  }
  return parseMutationResult(result.data, expected);
};

export const createInvoiceAtomicRpc = async (
  input: CreateInvoiceAtomicInput,
): Promise<InvoiceMutationRpcResult> => runRpc(
  'create_invoice_atomic',
  {
    p_invoice: input.invoice as unknown as Json,
    p_items: [...input.items].sort((left, right) => (
      `${left.job_number}\u0000${left.event_id ?? ''}`.localeCompare(`${right.job_number}\u0000${right.event_id ?? ''}`)
    )) as unknown as Json,
    p_timelogs: [...input.timelogs].sort((left, right) => left.id.localeCompare(right.id)) as unknown as Json,
    p_receipts: [...input.receipts].sort((left, right) => left.id.localeCompare(right.id)) as unknown as Json,
  },
  {
    invoiceStatus: 'draft',
    timelogStatus: 'invoiced',
    receiptStatus: 'attached',
  },
);

export const markInvoicePaidAtomicRpc = async (
  input: MarkInvoicePaidAtomicInput,
): Promise<InvoiceMutationRpcResult> => runRpc(
  'mark_invoice_paid_atomic',
  {
    p_invoice_id: input.id,
    p_expected_status: input.expectedStatus,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_paid_at: input.paidAt,
  },
  {
    invoiceId: input.id,
    invoiceStatus: 'paid',
    timelogStatus: 'paid',
    receiptStatus: 'reimbursed',
  },
);

export const markInvoiceSentAtomicRpc = async (
  input: MarkInvoiceSentAtomicInput,
): Promise<InvoiceMutationRpcResult> => runRpc(
  'mark_invoice_sent_atomic',
  {
    p_invoice_id: input.id,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_sent_at: input.sentAt,
  },
  {
    invoiceId: input.id,
    invoiceStatus: 'sent',
    timelogStatus: 'invoiced',
    receiptStatus: 'attached',
  },
);

export const deleteInvoiceAtomicRpc = async (
  input: VersionedInvoiceMutationInput,
): Promise<InvoiceMutationRpcResult> => runRpc(
  'delete_invoice_atomic',
  {
    p_invoice_id: input.id,
    p_expected_status: input.expectedStatus,
    p_expected_updated_at: input.expectedUpdatedAt,
  },
  {
    invoiceId: input.id,
    invoiceStatus: 'draft',
    timelogStatus: 'approved',
    receiptStatus: 'approved',
  },
);
