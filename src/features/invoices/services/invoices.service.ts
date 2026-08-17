import { toast } from 'sonner';
import { appDataSource } from '../../../lib/app-config';
import { KM_RATE } from '../../../data';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapInvoice } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { Contractor, Event, Invoice, ReceiptItem, Timelog } from '../../../types';
import { calculateTotalHours } from '../../../utils';
import {
  getTimelogs,
  markTimelogsAsApproved,
  markTimelogsAsInvoiced,
  markTimelogsAsPaid,
  markTimelogsAsPaidForInvoice,
} from '../../timelogs/services/timelogs.service';
import {
  getReceipts,
  markReceiptsAsAttached,
  markReceiptsAsReimbursed,
  markReceiptsAsReimbursedForInvoice,
} from '../../receipts/services/receipts.service';
import {
  buildSelfBillingInvoiceNumber,
  getInvoiceDueDate,
  getInvoiceIssueDate,
} from './invoice-numbering';
import {
  buildCustomerSnapshot,
  buildSupplierSnapshot,
  resolveSingleInvoiceClient,
  validateInvoiceSnapshots,
} from './invoice-customer-resolution';
import {
  createInvoiceAtomicRpc,
  deleteInvoiceAtomicRpc,
  markInvoicePaidAtomicRpc,
  markInvoiceSentAtomicRpc,
  type InvoiceMutationRpcResult,
} from './invoice-mutation-rpc.service';

type BillingItem = {
  jobNumber: string;
  eventIds: Set<number>;
  timelogIds: number[];
  receiptIds: number[];
  hours: number;
  amountHours: number;
  km: number;
  amountKm: number;
  amountReceipts: number;
};

type BillingBatch = {
  contractorProfileId?: string;
  items: Map<string, BillingItem>;
  eventIds: Set<number>;
  timelogIds: number[];
  receiptIds: number[];
};

const syncInvoiceQueryData = () => {
  const snapshot = getLocalAppState();
  queryClient.setQueryData(queryKeys.invoices.all, snapshot.invoices ?? []);
  queryClient.setQueryData(queryKeys.timelogs.all, snapshot.timelogs ?? []);
  queryClient.setQueryData(queryKeys.receipts.all, snapshot.receipts ?? []);
};

export type InvoiceCreateCandidate = {
  contractorProfileId?: string;
  contractorName: string;
  timelogCount: number;
  receiptCount: number;
  totalAmount: number;
};

export type InvoiceCreatePreviewItem = {
  jobNumber: string;
  eventIds: number[];
  timelogIds: number[];
  receiptIds: number[];
  timelogEntries: Array<{
    timelogId: number;
    eventName: string;
    jobNumber: string;
    hours: number;
    amountHours: number;
    km: number;
    amountKm: number;
  }>;
  receiptEntries: Array<{
    receiptId: number;
    amount: number;
  }>;
  hours: number;
  amountHours: number;
  km: number;
  amountKm: number;
  amountReceipts: number;
  totalAmount: number;
};

export type InvoiceCreatePreview = {
  contractorProfileId?: string;
  contractorName: string;
  items: InvoiceCreatePreviewItem[];
  timelogIds: number[];
  receiptIds: number[];
  totalHours: number;
  totalKm: number;
  totalAmountHours: number;
  totalAmountKm: number;
  totalAmountReceipts: number;
  totalAmount: number;
};

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  job_number: string;
  event_id: string | null;
  hours: number | null;
  amount_hours: number | null;
  km: number | null;
  amount_km: number | null;
  amount_receipts: number | null;
  total_amount: number | null;
  created_at: string;
};

type InvoiceTimelogRow = {
  id: string;
  invoice_id: string;
  timelog_id: string;
  created_at: string;
};

type InvoiceReceiptRow = {
  id: string;
  invoice_id: string;
  receipt_id: string;
  created_at: string;
};

let invoicesHydrationPromise: Promise<void> | null = null;
let invoicesLoaded = false;

const findContractorByIdentity = (
  contractors: Contractor[],
  contractorProfileId: string | undefined,
): Contractor | null => {
  if (!contractorProfileId) {
    return null;
  }

  return contractors.find((contractor) => contractor.profileId === contractorProfileId) ?? null;
};

const findEvent = (events: Event[], id: number): Event | null => (
  events.find((event) => event.id === id) ?? null
);

const round2 = (value: number): number => Math.round(value * 100) / 100;

const uniqueSortedNumbers = (values: Iterable<number>): number[] => (
  Array.from(new Set(values)).sort((a, b) => a - b)
);

const uniqueSortedStrings = (values: Iterable<string>): string[] => (
  Array.from(new Set(values)).filter(Boolean).sort((a, b) => a.localeCompare(b))
);

const normalizeJobNumber = (jobNumber: string | null | undefined): string => {
  const normalized = (jobNumber ?? '').trim().toUpperCase();
  return normalized || 'BEZ JOB';
};

const safeSelect = async <TRow>(table: string, select = '*', orderBy = 'created_at'): Promise<TRow[]> => {
  if (!supabase) {
    throw new Error('Faktury se nepodařilo načíst.');
  }

  const result = await supabase.from(table).select(select).order(orderBy);
  if (result.error) {
    console.error(`Unexpected invoice hydration error for ${table}`, result.error);
    throw new Error('Faktury se nepodařilo načíst.');
  }

  return (result.data ?? []) as TRow[];
};

const getSupabaseIdRows = async (
  table: string,
  orderBy: string,
): Promise<Array<{ id: string }>> => safeSelect<{ id: string }>(table, 'id', orderBy);

const getNextInvoiceSequence = async (invoiceYear: number, contractorProfileId: string): Promise<number> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    const existingCount = (getLocalAppState().invoices ?? []).filter((invoice) => (
      invoice.contractorProfileId === contractorProfileId
      && invoice.invoiceNumber?.startsWith(`SF-${invoiceYear}-`)
    )).length;
    return existingCount + 1;
  }

  const result = await supabase.rpc('next_self_billing_invoice_sequence', {
    p_invoice_year: invoiceYear,
    p_supplier_profile_id: contractorProfileId,
  });

  if (result.error || typeof result.data !== 'number') {
    console.error('Unexpected invoice sequence RPC error', result.error ?? result.data);
    throw new Error('Číslo faktury se nepodařilo vygenerovat.');
  }

  return result.data;
};

const buildBillingBatches = (): BillingBatch[] => {
  const snapshot = getLocalAppState();
  const contractors = snapshot.contractors ?? [];
  const events = snapshot.events ?? [];
  const timelogs = getTimelogs() ?? [];
  const receipts = getReceipts() ?? [];
  const existingInvoiceTimelogIds = new Set(
    (snapshot.invoices ?? []).flatMap((invoice) => invoice.timelogIds ?? []),
  );
  const existingInvoiceReceiptIds = new Set(
    (snapshot.invoices ?? []).flatMap((invoice) => invoice.receiptIds ?? []),
  );
  const approvedTimelogs = timelogs.filter((timelog) => (
    timelog.status === 'approved' && !existingInvoiceTimelogIds.has(timelog.id)
  ));
  const approvedReceipts = receipts.filter((receipt) => (
    receipt.status === 'approved' && !existingInvoiceReceiptIds.has(receipt.id)
  ));

  const grouped = new Map<string, BillingBatch>();

  const getBatchKey = (contractor: Contractor): string => contractor.profileId ?? '';

  const getBatch = (contractor: Contractor): BillingBatch => {
    const key = getBatchKey(contractor);
    const existing = grouped.get(key);
    if (existing) return existing;

    const created: BillingBatch = {
      contractorProfileId: contractor.profileId,
      items: new Map<string, BillingItem>(),
      eventIds: new Set<number>(),
      timelogIds: [],
      receiptIds: [],
    };
    grouped.set(key, created);
    return created;
  };

  const getItem = (batch: BillingBatch, jobNumber: string): BillingItem => {
    const existing = batch.items.get(jobNumber);
    if (existing) return existing;

    const created: BillingItem = {
      jobNumber,
      eventIds: new Set<number>(),
      timelogIds: [],
      receiptIds: [],
      hours: 0,
      amountHours: 0,
      km: 0,
      amountKm: 0,
      amountReceipts: 0,
    };
    batch.items.set(jobNumber, created);
    return created;
  };

  approvedTimelogs.forEach((timelog) => {
    const contractor = findContractorByIdentity(contractors, timelog.contractorProfileId);
    const event = findEvent(events, timelog.eid);
    if (!contractor || !event) return;

    const batch = getBatch(contractor);
    const jobNumber = normalizeJobNumber(event.job);
    const item = getItem(batch, jobNumber);
    const hours = round2(calculateTotalHours(timelog.days));
    const amountHours = Math.round(hours * contractor.rate);
    const amountKm = Math.round(timelog.km * KM_RATE);

    item.hours = round2(item.hours + hours);
    item.amountHours += amountHours;
    item.km = round2(item.km + timelog.km);
    item.amountKm += amountKm;
    item.eventIds.add(timelog.eid);
    item.timelogIds.push(timelog.id);

    batch.eventIds.add(timelog.eid);
    batch.timelogIds.push(timelog.id);
  });

  approvedReceipts.forEach((receipt) => {
    const contractor = findContractorByIdentity(contractors, receipt.contractorProfileId);
    const event = findEvent(events, receipt.eid);
    if (!contractor) return;

    const batch = getBatch(contractor);
    const jobNumber = normalizeJobNumber(receipt.job || event?.job);
    const item = getItem(batch, jobNumber);

    item.amountReceipts += Math.round(receipt.amount);
    if (receipt.eid) {
      item.eventIds.add(receipt.eid);
      batch.eventIds.add(receipt.eid);
    }
    item.receiptIds.push(receipt.id);
    batch.receiptIds.push(receipt.id);
  });

  return Array.from(grouped.values())
    .filter((batch) => batch.timelogIds.length > 0 || batch.receiptIds.length > 0);
};

const buildInvoiceFromBatch = (
  batch: BillingBatch,
  index: number,
): Invoice => {
  const contractors = getLocalAppState().contractors ?? [];
  const contractor = findContractorByIdentity(contractors, batch.contractorProfileId);
  const itemList = Array.from(batch.items.values());
  const jobNumbers = uniqueSortedStrings(itemList.map((item) => item.jobNumber));
  const hours = round2(itemList.reduce((sum, item) => sum + item.hours, 0));
  const hAmt = itemList.reduce((sum, item) => sum + item.amountHours, 0);
  const km = round2(itemList.reduce((sum, item) => sum + item.km, 0));
  const kAmt = itemList.reduce((sum, item) => sum + item.amountKm, 0);
  const receiptAmt = itemList.reduce((sum, item) => sum + item.amountReceipts, 0);
  const primaryEventId = uniqueSortedNumbers(batch.eventIds)[0] ?? 0;
  const uniqueId = `FAK-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${index + 1}`;

  return {
    id: uniqueId,
    contractorProfileId: batch.contractorProfileId ?? contractor?.profileId,
    eid: primaryEventId,
    hours,
    hAmt,
    km,
    kAmt,
    receiptAmt,
    total: hAmt + kAmt + receiptAmt,
    job: jobNumbers.join(', '),
    jobNumbers,
    timelogIds: uniqueSortedNumbers(batch.timelogIds),
    receiptIds: uniqueSortedNumbers(batch.receiptIds),
    eventIds: uniqueSortedNumbers(batch.eventIds),
    status: 'draft',
    sentAt: null,
  };
};

const batchToPreview = (
  batch: BillingBatch,
  contractors: Contractor[],
): InvoiceCreatePreview => {
  const contractor = findContractorByIdentity(contractors, batch.contractorProfileId);
  const snapshot = getLocalAppState();
  const timelogById = new Map((snapshot.timelogs ?? []).map((timelog) => [timelog.id, timelog]));
  const receiptById = new Map((snapshot.receipts ?? []).map((receipt) => [receipt.id, receipt]));
  const eventById = new Map((snapshot.events ?? []).map((event) => [event.id, event]));
  const items = Array.from(batch.items.values())
    .map((item) => {
      const timelogEntries = uniqueSortedNumbers(item.timelogIds).map((timelogId) => {
        const timelog = timelogById.get(timelogId);
        const event = timelog ? eventById.get(timelog.eid) : null;
        const hours = timelog ? round2(calculateTotalHours(timelog.days)) : 0;
        const amountHours = contractor ? Math.round(hours * contractor.rate) : 0;
        const km = timelog ? round2(timelog.km) : 0;
        const amountKm = Math.round(km * KM_RATE);

        return {
          timelogId,
          eventName: event?.name ?? 'Neznama akce',
          jobNumber: event?.job ?? item.jobNumber,
          hours,
          amountHours,
          km,
          amountKm,
        };
      });

      const receiptEntries = uniqueSortedNumbers(item.receiptIds).map((receiptId) => {
        const receipt = receiptById.get(receiptId);
        return {
          receiptId,
          amount: Math.round(receipt?.amount ?? 0),
        };
      });

      return {
        jobNumber: item.jobNumber,
        eventIds: uniqueSortedNumbers(item.eventIds),
        timelogIds: uniqueSortedNumbers(item.timelogIds),
        receiptIds: uniqueSortedNumbers(item.receiptIds),
        timelogEntries,
        receiptEntries,
        hours: round2(item.hours),
        amountHours: item.amountHours,
        km: round2(item.km),
        amountKm: item.amountKm,
        amountReceipts: item.amountReceipts,
        totalAmount: item.amountHours + item.amountKm + item.amountReceipts,
      };
    })
    .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));

  const totalHours = round2(items.reduce((sum, item) => sum + item.hours, 0));
  const totalKm = round2(items.reduce((sum, item) => sum + item.km, 0));
  const totalAmountHours = items.reduce((sum, item) => sum + item.amountHours, 0);
  const totalAmountKm = items.reduce((sum, item) => sum + item.amountKm, 0);
  const totalAmountReceipts = items.reduce((sum, item) => sum + item.amountReceipts, 0);

  return {
    contractorProfileId: batch.contractorProfileId ?? contractor?.profileId,
    contractorName: contractor?.name ?? '',
    items,
    timelogIds: uniqueSortedNumbers(batch.timelogIds),
    receiptIds: uniqueSortedNumbers(batch.receiptIds),
    totalHours,
    totalKm,
    totalAmountHours,
    totalAmountKm,
    totalAmountReceipts,
    totalAmount: totalAmountHours + totalAmountKm + totalAmountReceipts,
  };
};

const buildBatchFromSelection = (
  contractorProfileId: string,
  selectedTimelogIds: number[],
  selectedReceiptIds: number[],
): BillingBatch | null => {
  const snapshot = getLocalAppState();
  const contractors = snapshot.contractors ?? [];
  const events = snapshot.events ?? [];
  const timelogs = getTimelogs() ?? [];
  const receipts = getReceipts() ?? [];
  const contractor = contractors.find((item) => item.profileId === contractorProfileId) ?? null;

  if (!contractor) {
    throw new Error('Kontraktor pro fakturaci nebyl nalezen.');
  }

  const timelogIdSet = new Set(selectedTimelogIds);
  const receiptIdSet = new Set(selectedReceiptIds);
  const existingInvoiceTimelogIds = new Set(
    (snapshot.invoices ?? []).flatMap((invoice) => invoice.timelogIds ?? []),
  );
  const existingInvoiceReceiptIds = new Set(
    (snapshot.invoices ?? []).flatMap((invoice) => invoice.receiptIds ?? []),
  );
  const selectedTimelogs = timelogs.filter((timelog) => (
    timelog.contractorProfileId === contractor.profileId
    && timelog.status === 'approved'
    && timelogIdSet.has(timelog.id)
  ));
  const selectedReceipts = receipts.filter((receipt) => (
    receipt.contractorProfileId === contractor.profileId
    && receipt.status === 'approved'
    && receiptIdSet.has(receipt.id)
  ));

  const duplicatedTimelog = selectedTimelogs.find((timelog) => existingInvoiceTimelogIds.has(timelog.id));
  if (duplicatedTimelog) {
    throw new Error('Nektere vybrane timelogy uz jsou v jine fakture.');
  }

  const duplicatedReceipt = selectedReceipts.find((receipt) => existingInvoiceReceiptIds.has(receipt.id));
  if (duplicatedReceipt) {
    throw new Error('Nektere vybrane uctenky uz jsou v jine fakture.');
  }

  if (selectedTimelogs.length === 0 && selectedReceipts.length === 0) {
    return null;
  }

  const batch: BillingBatch = {
    contractorProfileId: contractor.profileId,
    items: new Map<string, BillingItem>(),
    eventIds: new Set<number>(),
    timelogIds: [],
    receiptIds: [],
  };

  const getItem = (jobNumber: string): BillingItem => {
    const existing = batch.items.get(jobNumber);
    if (existing) return existing;

    const created: BillingItem = {
      jobNumber,
      eventIds: new Set<number>(),
      timelogIds: [],
      receiptIds: [],
      hours: 0,
      amountHours: 0,
      km: 0,
      amountKm: 0,
      amountReceipts: 0,
    };
    batch.items.set(jobNumber, created);
    return created;
  };

  selectedTimelogs.forEach((timelog) => {
    const event = findEvent(events, timelog.eid);
    if (!event) return;

    const jobNumber = normalizeJobNumber(event.job);
    const item = getItem(jobNumber);
    const hours = round2(calculateTotalHours(timelog.days));
    const amountHours = Math.round(hours * contractor.rate);
    const amountKm = Math.round(timelog.km * KM_RATE);

    item.hours = round2(item.hours + hours);
    item.amountHours += amountHours;
    item.km = round2(item.km + timelog.km);
    item.amountKm += amountKm;
    item.eventIds.add(timelog.eid);
    item.timelogIds.push(timelog.id);

    batch.eventIds.add(timelog.eid);
    batch.timelogIds.push(timelog.id);
  });

  selectedReceipts.forEach((receipt) => {
    const event = findEvent(events, receipt.eid);
    const jobNumber = normalizeJobNumber(receipt.job || event?.job);
    const item = getItem(jobNumber);

    item.amountReceipts += Math.round(receipt.amount);
    if (receipt.eid) {
      item.eventIds.add(receipt.eid);
      batch.eventIds.add(receipt.eid);
    }
    item.receiptIds.push(receipt.id);
    batch.receiptIds.push(receipt.id);
  });

  return batch;
};

const mapSupabaseInvoices = (
  invoiceRows: InvoiceItemRow[] | Array<Record<string, unknown>>,
  profileRows: Array<{ id: string }>,
  eventRows: Array<{ id: string }>,
  invoiceItems: InvoiceItemRow[],
  invoiceTimelogs: InvoiceTimelogRow[],
  invoiceReceipts: InvoiceReceiptRow[],
  timelogRows: Array<{ id: string }>,
  receiptRows: Array<{ id: string }>,
): Invoice[] => {
  const profileIdMap = new Map(
    profileRows.map((row, index) => [row.id, index + 1]),
  );
  const eventIdMap = new Map(
    eventRows.map((row, index) => [row.id, index + 1]),
  );
  const timelogIdMap = new Map(timelogRows.map((row, index) => [row.id, index + 1]));
  const receiptIdMap = new Map(receiptRows.map((row, index) => [row.id, index + 1]));

  const invoiceItemsByInvoiceId = new Map<string, InvoiceItemRow[]>();
  invoiceItems.forEach((row) => {
    const current = invoiceItemsByInvoiceId.get(row.invoice_id) ?? [];
    current.push(row);
    invoiceItemsByInvoiceId.set(row.invoice_id, current);
  });

  const invoiceTimelogsByInvoiceId = new Map<string, InvoiceTimelogRow[]>();
  invoiceTimelogs.forEach((row) => {
    const current = invoiceTimelogsByInvoiceId.get(row.invoice_id) ?? [];
    current.push(row);
    invoiceTimelogsByInvoiceId.set(row.invoice_id, current);
  });

  const invoiceReceiptsByInvoiceId = new Map<string, InvoiceReceiptRow[]>();
  invoiceReceipts.forEach((row) => {
    const current = invoiceReceiptsByInvoiceId.get(row.invoice_id) ?? [];
    current.push(row);
    invoiceReceiptsByInvoiceId.set(row.invoice_id, current);
  });

  const currentInvoices = getLocalAppState().invoices ?? [];
  const localInvoicesById = new Map(currentInvoices.map((invoice) => [invoice.id, invoice]));

  return invoiceRows.map((row) => {
    const localInvoice = localInvoicesById.get(row.id);
    const items = invoiceItemsByInvoiceId.get(row.id) ?? [];
    const jobNumbers = uniqueSortedStrings([
      ...items.map((item) => item.job_number),
      row.job_number ?? '',
      ...(localInvoice?.jobNumbers ?? []),
    ]);
    const eventIds = uniqueSortedNumbers([
      ...items
        .map((item) => item.event_id ? (eventIdMap.get(item.event_id) ?? Number.NaN) : Number.NaN)
        .filter((itemId) => !Number.isNaN(itemId)),
      row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : Number.NaN,
      ...(localInvoice?.eventIds ?? []),
    ].filter((itemId) => !Number.isNaN(itemId)));
    const timelogSupabaseIds = uniqueSortedStrings([
      row.timelog_id ?? '',
      ...(invoiceTimelogsByInvoiceId.get(row.id) ?? []).map((item) => item.timelog_id),
    ]);
    const receiptSupabaseIds = uniqueSortedStrings(
      (invoiceReceiptsByInvoiceId.get(row.id) ?? []).map((item) => item.receipt_id),
    );
    const linkedTimelogIds = uniqueSortedNumbers(
      timelogSupabaseIds
        .map((timelogId) => timelogIdMap.get(timelogId) ?? Number.NaN)
        .filter((itemId) => !Number.isNaN(itemId)),
    );
    const linkedReceiptIds = uniqueSortedNumbers(
      receiptSupabaseIds
        .map((receiptId) => receiptIdMap.get(receiptId) ?? Number.NaN)
        .filter((itemId) => !Number.isNaN(itemId)),
    );
    const timelogIds = linkedTimelogIds.length > 0 ? linkedTimelogIds : (localInvoice?.timelogIds ?? []);
    const receiptIds = linkedReceiptIds.length > 0 ? linkedReceiptIds : (localInvoice?.receiptIds ?? []);

    return {
      ...mapInvoice(row),
      contractorProfileId: row.contractor_id,
      eid: eventIds[0] ?? (row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : 0),
      job: jobNumbers.join(', ') || localInvoice?.job || row.job_number || '',
      jobNumbers,
      timelogIds,
      timelogSupabaseIds,
      receiptIds,
      receiptSupabaseIds,
      eventIds,
    };
  });
};

const fetchInvoicesSnapshotUnsafe = async (): Promise<Invoice[]> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return getLocalAppState().invoices ?? [];
  }

  const [
    invoicesResult,
    profilesResult,
    eventsResult,
    invoiceItems,
    invoiceTimelogs,
    invoiceReceipts,
    timelogRows,
    receiptRows,
  ] = await Promise.all([
    supabase.from('invoices').select('*').order('created_at'),
    supabase.from('profiles').select('id').order('last_name').order('first_name'),
    supabase.from('events').select('id').order('date_from').order('name'),
    safeSelect<InvoiceItemRow>('invoice_items', '*', 'created_at'),
    safeSelect<InvoiceTimelogRow>('invoice_timelogs', '*', 'created_at'),
    safeSelect<InvoiceReceiptRow>('invoice_receipts', '*', 'created_at'),
    getSupabaseIdRows('timelogs', 'created_at'),
    getSupabaseIdRows('receipts', 'created_at'),
  ]);

  const firstError = invoicesResult.error ?? profilesResult.error ?? eventsResult.error;
  if (firstError) {
    console.error('Unexpected invoice hydration error', firstError);
    throw new Error('Faktury se nepodařilo načíst.');
  }

  return mapSupabaseInvoices(
    (invoicesResult.data ?? []) as Array<Record<string, unknown>>,
    profilesResult.data ?? [],
    eventsResult.data ?? [],
    invoiceItems,
    invoiceTimelogs,
    invoiceReceipts,
    timelogRows,
    receiptRows,
  );
};

export const fetchInvoicesSnapshot = async (): Promise<Invoice[]> => {
  try {
    return await fetchInvoicesSnapshotUnsafe();
  } catch (error) {
    if (error instanceof Error && error.message === 'Faktury se nepodařilo načíst.') {
      throw error;
    }
    console.error('Unexpected invoice snapshot load failure', error);
    throw new Error('Faktury se nepodařilo načíst.');
  }
};

const hydrateInvoicesFromSupabase = async (): Promise<void> => {
  const supabaseInvoices = await fetchInvoicesSnapshot();
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    invoices: supabaseInvoices,
  }));
};

const ensureSupabaseInvoicesLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (invoicesLoaded) {
    return;
  }

  if (invoicesHydrationPromise) {
    return;
  }

  invoicesHydrationPromise = hydrateInvoicesFromSupabase()
    .then(() => {
      invoicesLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist faktury ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      invoicesHydrationPromise = null;
    });
};

const INVALID_INVOICE_SELECTION_MESSAGE = 'Faktura obsahuje neplatné nebo neúplné údaje.';

const requireStableTargets = <T extends { id: number; supabaseId?: string; updatedAt?: string }>(
  allRows: T[],
  selectedIds: number[],
): Array<{ id: string; expected_updated_at: string }> => {
  const requestedIds = uniqueSortedNumbers(selectedIds);
  if (requestedIds.length !== selectedIds.length) {
    throw new Error(INVALID_INVOICE_SELECTION_MESSAGE);
  }
  const selectedRows = requestedIds.map((id) => allRows.find((row) => row.id === id));
  if (
    selectedRows.some((row) => !row?.supabaseId || !row.updatedAt)
    || selectedRows.length !== requestedIds.length
  ) {
    throw new Error(INVALID_INVOICE_SELECTION_MESSAGE);
  }

  const targets = selectedRows.map((row) => ({
    id: row!.supabaseId!,
    expected_updated_at: row!.updatedAt!,
  }));
  if (new Set(targets.map((target) => target.id)).size !== targets.length) {
    throw new Error(INVALID_INVOICE_SELECTION_MESSAGE);
  }
  if (targets.some((target) => allRows.filter((row) => row.supabaseId === target.id).length !== 1)) {
    throw new Error(INVALID_INVOICE_SELECTION_MESSAGE);
  }
  return targets.sort((left, right) => left.id.localeCompare(right.id));
};

const reconcileInvoiceMutationChildren = (
  result: InvoiceMutationRpcResult,
  removeInvoiceId?: string,
) => {
  const timelogsById = new Map(result.timelogs.map((row) => [row.id, row]));
  const receiptsById = new Map(result.receipts.map((row) => [row.id, row]));
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    invoices: removeInvoiceId
      ? (snapshot.invoices ?? []).filter((invoice) => invoice.id !== removeInvoiceId)
      : snapshot.invoices,
    timelogs: (snapshot.timelogs ?? []).map((timelog) => {
      const canonical = timelog.supabaseId ? timelogsById.get(timelog.supabaseId) : undefined;
      return canonical
        ? { ...timelog, status: canonical.status, updatedAt: canonical.updatedAt }
        : timelog;
    }),
    receipts: (snapshot.receipts ?? []).map((receipt) => {
      const canonical = receipt.supabaseId ? receiptsById.get(receipt.supabaseId) : undefined;
      return canonical
        ? { ...receipt, status: canonical.status, updatedAt: canonical.updatedAt }
        : receipt;
    }),
  }));
};

const persistSupabaseGeneratedInvoice = async (
  invoice: Invoice,
): Promise<InvoiceMutationRpcResult | null> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return null;
  }

  const snapshot = getLocalAppState();
  const contractorId = invoice.contractorProfileId;
  if (!contractorId || !invoice.supplierSnapshot || !invoice.customerSnapshot) {
    throw new Error(INVALID_INVOICE_SELECTION_MESSAGE);
  }

  const eventsById = new Map((snapshot.events ?? []).map((event) => [event.id, event]));
  const timelogs = snapshot.timelogs ?? [];
  const receipts = snapshot.receipts ?? [];
  const timelogTargets = requireStableTargets(timelogs, invoice.timelogIds ?? []);
  const receiptTargets = requireStableTargets(receipts, invoice.receiptIds ?? []);
  const eventIds = uniqueSortedNumbers(invoice.eventIds ?? []);
  const eventRows = eventIds.map((id) => eventsById.get(id));
  if (
    eventRows.some((event) => !event?.supabaseId)
    || new Set(eventRows.map((event) => event!.supabaseId)).size !== eventRows.length
  ) {
    throw new Error(INVALID_INVOICE_SELECTION_MESSAGE);
  }

  const items = (invoice.jobNumbers ?? []).map((jobNumber) => {
    const itemTimelogs = timelogs.filter((timelog) => (
      (invoice.timelogIds ?? []).includes(timelog.id)
      && normalizeJobNumber(eventsById.get(timelog.eid)?.job) === jobNumber
    ));
    const itemReceipts = receipts.filter((receipt) => (
      (invoice.receiptIds ?? []).includes(receipt.id)
      && normalizeJobNumber(receipt.job || eventsById.get(receipt.eid)?.job) === jobNumber
    ));
    const itemEventIds = uniqueSortedNumbers([
      ...itemTimelogs.map((timelog) => timelog.eid),
      ...itemReceipts.map((receipt) => receipt.eid),
    ]);
    const itemEventRows = itemEventIds.map((id) => eventsById.get(id));
    if (itemEventRows.some((event) => !event?.supabaseId)) {
      throw new Error(INVALID_INVOICE_SELECTION_MESSAGE);
    }
    const hours = round2(itemTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0));
    const amountHours = itemTimelogs.reduce((sum, timelog) => {
      const contractor = findContractorByIdentity(snapshot.contractors ?? [], timelog.contractorProfileId);
      return sum + Math.round(calculateTotalHours(timelog.days) * (contractor?.rate ?? 0));
    }, 0);
    const km = round2(itemTimelogs.reduce((sum, timelog) => sum + timelog.km, 0));
    const amountKm = itemTimelogs.reduce((sum, timelog) => sum + Math.round(timelog.km * KM_RATE), 0);
    const amountReceipts = itemReceipts.reduce((sum, receipt) => sum + Math.round(receipt.amount), 0);
    return {
      job_number: jobNumber,
      event_id: itemEventRows[0]?.supabaseId ?? null,
      hours,
      amount_hours: amountHours,
      km,
      amount_km: amountKm,
      amount_receipts: amountReceipts,
      total_amount: amountHours + amountKm + amountReceipts,
    };
  });

  return createInvoiceAtomicRpc({
    invoice: {
      contractor_id: contractorId,
      event_id: eventRows[0]?.supabaseId ?? null,
      job_number: invoice.job,
      total_hours: invoice.hours,
      amount_hours: invoice.hAmt,
      amount_km: invoice.kAmt,
      amount_receipts: invoice.receiptAmt ?? 0,
      total_amount: invoice.total,
      invoice_number: invoice.invoiceNumber ?? '',
      issue_date: invoice.issueDate ?? '',
      taxable_supply_date: invoice.taxableSupplyDate ?? '',
      due_date: invoice.dueDate ?? '',
      currency: invoice.currency ?? 'CZK',
      supplier_snapshot: invoice.supplierSnapshot as unknown as import('../../../lib/database.types').Json,
      customer_snapshot: invoice.customerSnapshot as unknown as import('../../../lib/database.types').Json,
    },
    items,
    timelogs: timelogTargets,
    receipts: receiptTargets,
  });
};

export const getInvoices = (search = ''): Invoice[] => {
  ensureSupabaseInvoicesLoaded();
  const snapshot = getLocalAppState();
  const query = search.trim().toLowerCase();
  const safeInvoices = snapshot.invoices ?? [];
  const safeEvents = snapshot.events ?? [];
  const safeContractors = snapshot.contractors ?? [];

  if (!query) {
    return safeInvoices;
  }

  return safeInvoices.filter((invoice) => {
    const event = invoice.eid ? findEvent(safeEvents, invoice.eid) : null;
    const contractor = findContractorByIdentity(safeContractors, invoice.contractorProfileId);

    return (
      invoice.id.toLowerCase().includes(query)
      || invoice.job.toLowerCase().includes(query)
      || contractor?.name.toLowerCase().includes(query)
      || event?.name.toLowerCase().includes(query)
      || event?.job.toLowerCase().includes(query)
      || false
    );
  });
};

export const getPendingInvoiceBatchCount = (): number => buildBillingBatches().length;

export const getInvoiceCreateCandidates = (): InvoiceCreateCandidate[] => {
  const snapshot = getLocalAppState();
  const contractors = snapshot.contractors ?? [];

  return buildBillingBatches()
    .map((batch) => {
      const contractor = findContractorByIdentity(contractors, batch.contractorProfileId);
      const preview = batchToPreview(batch, contractors);

      return {
        contractorProfileId: batch.contractorProfileId,
        contractorName: contractor?.name ?? '',
        timelogCount: batch.timelogIds.length,
        receiptCount: batch.receiptIds.length,
        totalAmount: preview.totalAmount,
      };
    })
    .sort((a, b) => a.contractorName.localeCompare(b.contractorName));
};

export const getInvoiceCreatePreview = (contractorProfileId: string): InvoiceCreatePreview | null => {
  const snapshot = getLocalAppState();
  const contractors = snapshot.contractors ?? [];
  const batch = buildBillingBatches().find((item) => item.contractorProfileId === contractorProfileId);
  if (!batch) return null;
  return batchToPreview(batch, contractors);
};

export const getInvoiceDependencies = (): { events: Event[]; contractors: Contractor[]; timelogs: Timelog[] } => {
  ensureSupabaseInvoicesLoaded();
  const snapshot = getLocalAppState();

  return {
    events: snapshot.events ?? [],
    contractors: snapshot.contractors ?? [],
    timelogs: snapshot.timelogs ?? [],
  };
};

export const generateInvoices = async (): Promise<Invoice[]> => {
  const batches = buildBillingBatches();

  if (batches.length === 0) {
    toast.info('Zadne schvalene vykazy ani uctenky k fakturaci.');
    return [];
  }

  const newInvoices: Invoice[] = [];
  for (const batch of batches) {
    if (!batch.contractorProfileId) {
      continue;
    }
    const created = await createInvoiceFromSelection(
      batch.contractorProfileId,
      uniqueSortedNumbers(batch.timelogIds),
      uniqueSortedNumbers(batch.receiptIds),
    );
    if (created) {
      newInvoices.push(created);
    }
  }

  return newInvoices;
};

export const createInvoiceFromSelection = async (
  contractorProfileId: string,
  selectedTimelogIds: number[],
  selectedReceiptIds: number[],
): Promise<Invoice | null> => {
  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const currentSnapshot = getLocalAppState();
    const selectedTimelogs = selectedTimelogIds.map((id) => (
      (currentSnapshot.timelogs ?? []).find((row) => row.id === id)
    ));
    const selectedReceipts = selectedReceiptIds.map((id) => (
      (currentSnapshot.receipts ?? []).find((row) => row.id === id)
    ));
    requireStableTargets(currentSnapshot.timelogs ?? [], selectedTimelogIds);
    requireStableTargets(currentSnapshot.receipts ?? [], selectedReceiptIds);
    if (
      selectedTimelogs.some((row) => row?.status !== 'approved' || row.contractorProfileId !== contractorProfileId)
      || selectedReceipts.some((row) => row?.status !== 'approved' || row.contractorProfileId !== contractorProfileId)
    ) {
      throw new Error(INVALID_INVOICE_SELECTION_MESSAGE);
    }
  }
  const batch = buildBatchFromSelection(contractorProfileId, selectedTimelogIds, selectedReceiptIds);
  if (!batch) {
    toast.info('Neni co fakturovat.');
    return null;
  }

  const snapshot = getLocalAppState();
  const contractor = findContractorByIdentity(snapshot.contractors ?? [], contractorProfileId);
  if (!contractor) {
    throw new Error('Dodavatel pro fakturu nebyl nalezen.');
  }

  const client = resolveSingleInvoiceClient({
    timelogs: snapshot.timelogs ?? [],
    receipts: snapshot.receipts ?? [],
    selectedTimelogIds,
    selectedReceiptIds,
    events: snapshot.events ?? [],
    projects: snapshot.projects ?? [],
    clients: snapshot.clients ?? [],
  });

  const supplierSnapshot = buildSupplierSnapshot(contractor);
  const customerSnapshot = buildCustomerSnapshot(client);
  const snapshotErrors = validateInvoiceSnapshots(supplierSnapshot, customerSnapshot);
  if (snapshotErrors.length > 0) {
    throw new Error(`PDF fakturacni udaje nejsou kompletni. ${snapshotErrors[0]}`);
  }

  const issueDate = getInvoiceIssueDate();
  const invoiceYear = Number(issueDate.slice(0, 4));
  const sequence = await getNextInvoiceSequence(invoiceYear, contractorProfileId);
  const [firstName = '', ...lastNameParts] = contractor.name.split(' ');
  const invoiceNumber = buildSelfBillingInvoiceNumber({
    year: invoiceYear,
    firstName,
    lastName: lastNameParts.join(' ') || contractor.name,
    sequence,
  });

  const draftInvoice = {
    ...buildInvoiceFromBatch(batch, 0),
    invoiceNumber,
    issueDate,
    taxableSupplyDate: issueDate,
    dueDate: getInvoiceDueDate(issueDate),
    currency: 'CZK' as const,
    supplierSnapshot,
    customerSnapshot,
    pdfPath: null,
    pdfGeneratedAt: null,
  };
  const persisted = await persistSupabaseGeneratedInvoice(draftInvoice);
  const invoice = persisted ? {
    ...draftInvoice,
    id: persisted.invoice.id,
    updatedAt: persisted.invoice.updatedAt,
    status: persisted.invoice.status,
    paidAt: persisted.invoice.paidAt,
    timelogSupabaseIds: persisted.timelogs.map((row) => row.id),
    receiptSupabaseIds: persisted.receipts.map((row) => row.id),
  } : draftInvoice;

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: [...(currentSnapshot.invoices ?? []), invoice],
  }));
  if (persisted) {
    reconcileInvoiceMutationChildren(persisted);
  }
  syncInvoiceQueryData();

  if (!persisted && (invoice.timelogIds ?? []).length > 0) {
    await markTimelogsAsInvoiced(invoice.timelogIds ?? []);
  }
  if (!persisted && (invoice.receiptIds ?? []).length > 0) {
    await markReceiptsAsAttached(invoice.receiptIds ?? []);
  }

  toast.success('Faktura byla vytvorena.');
  return invoice;
};

export const approveInvoice = async (id: string): Promise<Invoice | null> => {
  const snapshot = getLocalAppState();
  const invoice = (snapshot.invoices ?? []).find((item) => item.id === id);

  if (!invoice) {
    return null;
  }

  const paidAt = new Date().toISOString();
  const persisted = appDataSource === 'supabase' && supabase && isSupabaseConfigured
    ? await markInvoicePaidAtomicRpc({
      id,
      expectedStatus: invoice.status,
      expectedUpdatedAt: invoice.updatedAt ?? (() => { throw new Error(INVALID_INVOICE_SELECTION_MESSAGE); })(),
      paidAt,
    })
    : null;

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: (currentSnapshot.invoices ?? []).map((item) => item.id === id ? {
      ...item,
      status: 'paid',
      paidAt: persisted?.invoice.paidAt ?? paidAt,
      updatedAt: persisted?.invoice.updatedAt ?? item.updatedAt,
    } : item),
  }));
  if (persisted) {
    reconcileInvoiceMutationChildren(persisted);
  }
  syncInvoiceQueryData();

  if (!persisted && (invoice.timelogIds ?? []).length > 0) {
    await markTimelogsAsPaid(invoice.timelogIds ?? []);
  } else if (!persisted) {
    if (invoice.contractorProfileId) {
      await markTimelogsAsPaidForInvoice(invoice.eid, invoice.contractorProfileId);
    }
  }
  if (!persisted && (invoice.receiptIds ?? []).length > 0) {
    await markReceiptsAsReimbursed(invoice.receiptIds ?? []);
  } else if (!persisted) {
    if (invoice.contractorProfileId) {
      await markReceiptsAsReimbursedForInvoice(invoice.eid, invoice.contractorProfileId);
    }
  }

  return {
    ...invoice,
    status: 'paid',
    paidAt: persisted?.invoice.paidAt ?? paidAt,
    updatedAt: persisted?.invoice.updatedAt ?? invoice.updatedAt,
  };
};

export const sendInvoice = async (id: string): Promise<Invoice | null> => {
  const snapshot = getLocalAppState();
  const invoice = (snapshot.invoices ?? []).find((item) => item.id === id);

  if (!invoice) {
    return null;
  }

  const sentAt = new Date().toISOString();
  const persisted = appDataSource === 'supabase'
    ? await markInvoiceSentAtomicRpc({
      id,
      expectedUpdatedAt: invoice.updatedAt ?? (() => { throw new Error(INVALID_INVOICE_SELECTION_MESSAGE); })(),
      sentAt,
    })
    : null;

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: (currentSnapshot.invoices ?? []).map((item) => (
      item.id === id ? {
        ...item,
        status: 'sent',
        sentAt,
        updatedAt: persisted?.invoice.updatedAt ?? item.updatedAt,
      } : item
    )),
  }));
  if (persisted) {
    reconcileInvoiceMutationChildren(persisted);
  }
  syncInvoiceQueryData();

  return {
    ...invoice,
    status: 'sent',
    sentAt,
    updatedAt: persisted?.invoice.updatedAt ?? invoice.updatedAt,
  };
};

export const deleteInvoice = async (id: string): Promise<boolean> => {
  const snapshot = getLocalAppState();
  const invoice = (snapshot.invoices ?? []).find((item) => item.id === id);

  if (!invoice) {
    return false;
  }

  if (appDataSource !== 'supabase' && (invoice.timelogIds ?? []).length > 0) {
    await markTimelogsAsApproved(invoice.timelogIds ?? []);
  }

  const persisted = appDataSource === 'supabase' && supabase && isSupabaseConfigured
    ? await deleteInvoiceAtomicRpc({
      id,
      expectedStatus: invoice.status,
      expectedUpdatedAt: invoice.updatedAt ?? (() => { throw new Error(INVALID_INVOICE_SELECTION_MESSAGE); })(),
    })
    : null;

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: (currentSnapshot.invoices ?? []).filter((item) => item.id !== id),
  }));
  if (persisted) {
    reconcileInvoiceMutationChildren(persisted, id);
  }

  if ((invoice.timelogIds ?? []).length > 0 || (invoice.receiptIds ?? []).length > 0) {
    updateLocalAppState((currentSnapshot) => ({
      ...currentSnapshot,
      receipts: (currentSnapshot.receipts ?? []).map((receipt) => (
        invoice.receiptIds?.includes(receipt.id)
          ? { ...receipt, status: 'approved' as const }
          : receipt
      )),
    }));
  }

  syncInvoiceQueryData();

  return true;
};

export const subscribeToInvoiceChanges = (listener: () => void): (() => void) => {
  ensureSupabaseInvoicesLoaded();
  return subscribeToLocalAppState(() => listener());
};

export const resetSupabaseInvoicesHydration = () => {
  invoicesHydrationPromise = null;
  invoicesLoaded = false;
};
