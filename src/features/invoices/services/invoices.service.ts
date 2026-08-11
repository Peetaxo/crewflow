import { toast } from 'sonner';
import { appDataSource } from '../../../lib/app-config';
import { KM_RATE } from '../../../data';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapInvoice } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type {
  Contractor,
  EntityId,
  Event,
  EventId,
  Invoice,
  ReceiptId,
  ReceiptItem,
  Timelog,
  TimelogId,
} from '../../../types';
import { calculateMealAllowance, calculateTotalHours } from '../../../utils';
import {
  getTimelogs,
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

type BillingItem = {
  jobNumber: string;
  eventIds: Set<EventId>;
  timelogIds: TimelogId[];
  receiptIds: ReceiptId[];
  hours: number;
  amountHours: number;
  km: number;
  amountKm: number;
  amountMeals: number;
  amountReceipts: number;
};

type BillingBatch = {
  contractorProfileId?: string;
  items: Map<string, BillingItem>;
  eventIds: Set<EventId>;
  timelogIds: TimelogId[];
  receiptIds: ReceiptId[];
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
  eventIds: EventId[];
  timelogIds: TimelogId[];
  receiptIds: ReceiptId[];
  timelogEntries: Array<{
    timelogId: TimelogId;
    eventName: string;
    jobNumber: string;
    hours: number;
    amountHours: number;
    km: number;
    amountKm: number;
    amountMeals: number;
  }>;
  receiptEntries: Array<{
    receiptId: ReceiptId;
    amount: number;
  }>;
  hours: number;
  amountHours: number;
  km: number;
  amountKm: number;
  amountMeals: number;
  amountReceipts: number;
  totalAmount: number;
};

export type InvoiceCreatePreview = {
  contractorProfileId?: string;
  contractorName: string;
  items: InvoiceCreatePreviewItem[];
  timelogIds: TimelogId[];
  receiptIds: ReceiptId[];
  totalHours: number;
  totalKm: number;
  totalAmountHours: number;
  totalAmountKm: number;
  totalAmountMeals: number;
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
  amount_meals?: number | null;
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

const isPersistedSupabaseId = (id: EntityId | null | undefined): id is string => (
  typeof id === 'string' && id.trim().length > 0 && !id.startsWith('local:')
);

const findEvent = (events: Event[], id: EventId): Event | null => (
  events.find((event) => event.id === id || event.supabaseId === id) ?? null
);

const calculateTimelogMealAllowanceForEvent = (timelog: Timelog, event: Event | null): number => (
  calculateMealAllowance(timelog.days, { enabled: Boolean(event?.mealAllowanceEnabled) })
);

const getBillingEventId = (event: Event | null, fallback: EventId): EventId => (
  event?.supabaseId ?? event?.id ?? fallback
);

const getBillingTimelogId = (timelog: Timelog): TimelogId => (
  timelog.supabaseId ?? timelog.id
);

const getBillingReceiptId = (receipt: ReceiptItem): ReceiptId => (
  receipt.supabaseId ?? receipt.id
);

const mapByEntityIdentity = <TItem extends { id: EntityId; supabaseId?: string | null }>(
  items: TItem[],
): Map<EntityId, TItem> => {
  const map = new Map<EntityId, TItem>();
  items.forEach((item) => {
    map.set(item.id, item);
    if (item.supabaseId) {
      map.set(item.supabaseId, item);
    }
  });
  return map;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

const uniqueSortedEntityIds = <TId extends EntityId>(values: Iterable<TId>): TId[] => (
  Array.from(new Set(values)).sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }

    return String(a).localeCompare(String(b), 'cs', { numeric: true });
  })
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
    return [];
  }

  const result = await supabase.from(table).select(select).order(orderBy);
  if (result.error) {
    console.warn(`Nepodarilo se nacist ${table} ze Supabase.`, result.error);
    return [];
  }

  return (result.data ?? []) as TRow[];
};

const getSupabaseIdRows = async (
  table: string,
  orderBy: string,
): Promise<Array<{ id: string }>> => safeSelect<{ id: string }>(table, 'id', orderBy);

const mapStoredSupabaseIds = (
  items: Array<{ id: EntityId; supabaseId?: string | null }>,
): Map<EntityId, string> => {
  const entries = items.flatMap((item): Array<[EntityId, string]> => {
    if (item.supabaseId) {
      return [[item.id, item.supabaseId]];
    }

    if (isPersistedSupabaseId(item.id)) {
      return [[item.id, item.id]];
    }

    return [];
  });

  return new Map(entries);
};

const addFallbackIdsByLocalOrder = (
  map: Map<EntityId, string>,
  localItems: Array<{ id: EntityId }>,
  rows: Array<{ id: string }>,
): Map<EntityId, string> => {
  rows.forEach((row, index) => {
    const localId = localItems[index]?.id;
    if (localId != null && !map.has(localId)) {
      map.set(localId, row.id);
    }
  });

  return map;
};

const getSupabaseTimelogIdMap = async (): Promise<Map<EntityId, string>> => {
  const localTimelogs = getLocalAppState().timelogs ?? [];
  const directMap = mapStoredSupabaseIds(localTimelogs);

  if (directMap.size === localTimelogs.length && localTimelogs.length > 0) {
    return directMap;
  }

  const rows = await getSupabaseIdRows('timelogs', 'created_at');
  return addFallbackIdsByLocalOrder(directMap, localTimelogs, rows);
};

const getSupabaseReceiptIdMap = async (): Promise<Map<EntityId, string>> => {
  const localReceipts = getLocalAppState().receipts ?? [];
  const directMap = mapStoredSupabaseIds(localReceipts);

  if (directMap.size === localReceipts.length && localReceipts.length > 0) {
    return directMap;
  }

  const rows = await getSupabaseIdRows('receipts', 'created_at');
  return addFallbackIdsByLocalOrder(directMap, localReceipts, rows);
};

const getSupabaseEventIdMap = async (): Promise<Map<EntityId, string>> => {
  const localEvents = getLocalAppState().events ?? [];
  const directMap = mapStoredSupabaseIds(localEvents);

  if (directMap.size === localEvents.length && localEvents.length > 0) {
    return directMap;
  }

  const rows = await safeSelect<{ id: string; date_from: string | null; name: string }>(
    'events',
    'id,date_from,name',
    'date_from',
  );
  const sortedRows = [...rows].sort((a, b) => (
    `${a.date_from ?? ''}|${a.name}`.localeCompare(`${b.date_from ?? ''}|${b.name}`)
  ));
  return addFallbackIdsByLocalOrder(directMap, localEvents, sortedRows);
};

const resolveSupabaseRowId = (
  id: EntityId,
  idMap: Map<EntityId, string>,
): string | null => {
  if (isPersistedSupabaseId(id)) {
    return id;
  }

  return idMap.get(id) ?? null;
};

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
    throw new Error(result.error?.message ?? 'Nepodarilo se vygenerovat cislo faktury.');
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
      eventIds: new Set<EventId>(),
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
      eventIds: new Set<EventId>(),
      timelogIds: [],
      receiptIds: [],
      hours: 0,
      amountHours: 0,
      km: 0,
      amountKm: 0,
      amountMeals: 0,
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
    const billingEventId = getBillingEventId(event, timelog.eid);
    const billingTimelogId = getBillingTimelogId(timelog);
    const item = getItem(batch, jobNumber);
    const hours = round2(calculateTotalHours(timelog.days));
    const amountHours = Math.round(hours * contractor.rate);
    const amountKm = Math.round(timelog.km * KM_RATE);
    const amountMeals = Math.round(calculateTimelogMealAllowanceForEvent(timelog, event));

    item.hours = round2(item.hours + hours);
    item.amountHours += amountHours;
    item.km = round2(item.km + timelog.km);
    item.amountKm += amountKm;
    item.amountMeals += amountMeals;
    item.eventIds.add(billingEventId);
    item.timelogIds.push(billingTimelogId);

    batch.eventIds.add(billingEventId);
    batch.timelogIds.push(billingTimelogId);
  });

  approvedReceipts.forEach((receipt) => {
    const contractor = findContractorByIdentity(contractors, receipt.contractorProfileId);
    const event = findEvent(events, receipt.eid);
    if (!contractor) return;

    const batch = getBatch(contractor);
    const jobNumber = normalizeJobNumber(receipt.job || event?.job);
    const billingReceiptId = getBillingReceiptId(receipt);
    const billingEventId = getBillingEventId(event, receipt.eid);
    const item = getItem(batch, jobNumber);

    item.amountReceipts += Math.round(receipt.amount);
    if (receipt.eid) {
      item.eventIds.add(billingEventId);
      batch.eventIds.add(billingEventId);
    }
    item.receiptIds.push(billingReceiptId);
    batch.receiptIds.push(billingReceiptId);
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
  const mealAmt = itemList.reduce((sum, item) => sum + item.amountMeals, 0);
  const receiptAmt = itemList.reduce((sum, item) => sum + item.amountReceipts, 0);
  const primaryEventId = uniqueSortedEntityIds(batch.eventIds)[0] ?? 0;
  const uniqueId = `FAK-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${index + 1}`;

  return {
    id: uniqueId,
    contractorProfileId: batch.contractorProfileId ?? contractor?.profileId,
    eid: primaryEventId,
    hours,
    hAmt,
    km,
    kAmt,
    mealAmt,
    receiptAmt,
    total: hAmt + kAmt + mealAmt + receiptAmt,
    job: jobNumbers.join(', '),
    jobNumbers,
    timelogIds: uniqueSortedEntityIds(batch.timelogIds),
    receiptIds: uniqueSortedEntityIds(batch.receiptIds),
    eventIds: uniqueSortedEntityIds(batch.eventIds),
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
  const timelogById = mapByEntityIdentity(snapshot.timelogs ?? []);
  const receiptById = mapByEntityIdentity(snapshot.receipts ?? []);
  const eventById = mapByEntityIdentity(snapshot.events ?? []);
  const items = Array.from(batch.items.values())
    .map((item) => {
      const timelogEntries = uniqueSortedEntityIds(item.timelogIds).map((timelogId) => {
        const timelog = timelogById.get(timelogId);
        const event = timelog ? eventById.get(timelog.eid) : null;
        const hours = timelog ? round2(calculateTotalHours(timelog.days)) : 0;
        const amountHours = contractor ? Math.round(hours * contractor.rate) : 0;
        const km = timelog ? round2(timelog.km) : 0;
        const amountKm = Math.round(km * KM_RATE);
        const amountMeals = timelog ? Math.round(calculateTimelogMealAllowanceForEvent(timelog, event)) : 0;

        return {
          timelogId,
          eventName: event?.name ?? 'Neznama akce',
          jobNumber: event?.job ?? item.jobNumber,
          hours,
          amountHours,
          km,
          amountKm,
          amountMeals,
        };
      });

      const receiptEntries = uniqueSortedEntityIds(item.receiptIds).map((receiptId) => {
        const receipt = receiptById.get(receiptId);
        return {
          receiptId,
          amount: Math.round(receipt?.amount ?? 0),
        };
      });

      return {
        jobNumber: item.jobNumber,
        eventIds: uniqueSortedEntityIds(item.eventIds),
        timelogIds: uniqueSortedEntityIds(item.timelogIds),
        receiptIds: uniqueSortedEntityIds(item.receiptIds),
        timelogEntries,
        receiptEntries,
        hours: round2(item.hours),
        amountHours: item.amountHours,
        km: round2(item.km),
        amountKm: item.amountKm,
        amountMeals: item.amountMeals,
        amountReceipts: item.amountReceipts,
        totalAmount: item.amountHours + item.amountKm + item.amountMeals + item.amountReceipts,
      };
    })
    .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));

  const totalHours = round2(items.reduce((sum, item) => sum + item.hours, 0));
  const totalKm = round2(items.reduce((sum, item) => sum + item.km, 0));
  const totalAmountHours = items.reduce((sum, item) => sum + item.amountHours, 0);
  const totalAmountKm = items.reduce((sum, item) => sum + item.amountKm, 0);
  const totalAmountMeals = items.reduce((sum, item) => sum + item.amountMeals, 0);
  const totalAmountReceipts = items.reduce((sum, item) => sum + item.amountReceipts, 0);

  return {
    contractorProfileId: batch.contractorProfileId ?? contractor?.profileId,
    contractorName: contractor?.name ?? '',
    items,
    timelogIds: uniqueSortedEntityIds(batch.timelogIds),
    receiptIds: uniqueSortedEntityIds(batch.receiptIds),
    totalHours,
    totalKm,
    totalAmountHours,
    totalAmountKm,
    totalAmountMeals,
    totalAmountReceipts,
    totalAmount: totalAmountHours + totalAmountKm + totalAmountMeals + totalAmountReceipts,
  };
};

const buildBatchFromSelection = (
  contractorProfileId: string,
  selectedTimelogIds: TimelogId[],
  selectedReceiptIds: ReceiptId[],
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
    eventIds: new Set<EventId>(),
    timelogIds: [],
    receiptIds: [],
  };

  const getItem = (jobNumber: string): BillingItem => {
    const existing = batch.items.get(jobNumber);
    if (existing) return existing;

    const created: BillingItem = {
      jobNumber,
      eventIds: new Set<EventId>(),
      timelogIds: [],
      receiptIds: [],
      hours: 0,
      amountHours: 0,
      km: 0,
      amountKm: 0,
      amountMeals: 0,
      amountReceipts: 0,
    };
    batch.items.set(jobNumber, created);
    return created;
  };

  selectedTimelogs.forEach((timelog) => {
    const event = findEvent(events, timelog.eid);
    if (!event) return;

    const jobNumber = normalizeJobNumber(event.job);
    const billingEventId = getBillingEventId(event, timelog.eid);
    const billingTimelogId = getBillingTimelogId(timelog);
    const item = getItem(jobNumber);
    const hours = round2(calculateTotalHours(timelog.days));
    const amountHours = Math.round(hours * contractor.rate);
    const amountKm = Math.round(timelog.km * KM_RATE);
    const amountMeals = Math.round(calculateTimelogMealAllowanceForEvent(timelog, event));

    item.hours = round2(item.hours + hours);
    item.amountHours += amountHours;
    item.km = round2(item.km + timelog.km);
    item.amountKm += amountKm;
    item.amountMeals += amountMeals;
    item.eventIds.add(billingEventId);
    item.timelogIds.push(billingTimelogId);

    batch.eventIds.add(billingEventId);
    batch.timelogIds.push(billingTimelogId);
  });

  selectedReceipts.forEach((receipt) => {
    const event = findEvent(events, receipt.eid);
    const jobNumber = normalizeJobNumber(receipt.job || event?.job);
    const billingReceiptId = getBillingReceiptId(receipt);
    const billingEventId = getBillingEventId(event, receipt.eid);
    const item = getItem(jobNumber);

    item.amountReceipts += Math.round(receipt.amount);
    if (receipt.eid) {
      item.eventIds.add(billingEventId);
      batch.eventIds.add(billingEventId);
    }
    item.receiptIds.push(billingReceiptId);
    batch.receiptIds.push(billingReceiptId);
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
  const profileIdSet = new Set(profileRows.map((row) => row.id));
  const eventIdSet = new Set(eventRows.map((row) => row.id));
  const timelogIdSet = new Set(timelogRows.map((row) => row.id));
  const receiptIdSet = new Set(receiptRows.map((row) => row.id));

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
    const eventIds = uniqueSortedEntityIds([
      ...items
        .map((item) => item.event_id)
        .filter((itemId): itemId is string => Boolean(itemId && eventIdSet.has(itemId))),
      row.event_id && eventIdSet.has(row.event_id) ? row.event_id : null,
      ...(localInvoice?.eventIds ?? []),
    ].filter((itemId): itemId is EventId => itemId != null));
    const linkedTimelogIds = uniqueSortedEntityIds(
      (invoiceTimelogsByInvoiceId.get(row.id) ?? [])
        .map((item) => item.timelog_id)
        .filter((itemId): itemId is string => timelogIdSet.has(itemId)),
    );
    const linkedReceiptIds = uniqueSortedEntityIds(
      (invoiceReceiptsByInvoiceId.get(row.id) ?? [])
        .map((item) => item.receipt_id)
        .filter((itemId): itemId is string => receiptIdSet.has(itemId)),
    );
    const timelogIds = linkedTimelogIds.length > 0 ? linkedTimelogIds : (localInvoice?.timelogIds ?? []);
    const receiptIds = linkedReceiptIds.length > 0 ? linkedReceiptIds : (localInvoice?.receiptIds ?? []);

    return {
      ...mapInvoice(row),
      contractorProfileId: profileIdSet.has(row.contractor_id) ? row.contractor_id : row.contractor_id,
      eid: eventIds[0] ?? (row.event_id ?? ''),
      job: jobNumbers.join(', ') || localInvoice?.job || row.job_number || '',
      jobNumbers,
      timelogIds,
      receiptIds,
      eventIds,
    };
  });
};

export const fetchInvoicesSnapshot = async (): Promise<Invoice[]> => {
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
    throw new Error(firstError.message);
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

const persistSupabaseGeneratedInvoice = async (invoice: Invoice): Promise<string | null> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return null;
  }

  const [eventIdMap, timelogIdMap, receiptIdMap] = await Promise.all([
    getSupabaseEventIdMap(),
    getSupabaseTimelogIdMap(),
    getSupabaseReceiptIdMap(),
  ]);

  const contractorRowId = invoice.contractorProfileId
    ?? findContractorByIdentity(getLocalAppState().contractors ?? [], invoice.contractorProfileId)?.profileId;
  if (!contractorRowId) {
    throw new Error('Nepodarilo se sparovat kontraktora pro fakturaci.');
  }

  const eventRowIds = (invoice.eventIds ?? [])
    .map((eventId) => resolveSupabaseRowId(eventId, eventIdMap))
    .filter((value): value is string => Boolean(value));
  const timelogRowIds = (invoice.timelogIds ?? [])
    .map((timelogId) => resolveSupabaseRowId(timelogId, timelogIdMap))
    .filter((value): value is string => Boolean(value));
  const receiptRowIds = (invoice.receiptIds ?? [])
    .map((receiptId) => resolveSupabaseRowId(receiptId, receiptIdMap))
    .filter((value): value is string => Boolean(value));

  const invoiceInsert = await supabase
    .from('invoices')
    .insert({
      contractor_id: contractorRowId,
      event_id: eventRowIds[0] ?? null,
      timelog_id: null,
      job_number: invoice.job,
      total_hours: invoice.hours,
      amount_hours: invoice.hAmt,
      amount_km: invoice.kAmt,
      amount_meals: invoice.mealAmt ?? 0,
      amount_receipts: invoice.receiptAmt ?? 0,
      total_amount: invoice.total,
      invoice_number: invoice.invoiceNumber ?? null,
      issue_date: invoice.issueDate ?? null,
      taxable_supply_date: invoice.taxableSupplyDate ?? null,
      due_date: invoice.dueDate ?? null,
      currency: invoice.currency ?? 'CZK',
      supplier_snapshot: invoice.supplierSnapshot ?? null,
      customer_snapshot: invoice.customerSnapshot ?? null,
      pdf_path: invoice.pdfPath ?? null,
      pdf_generated_at: invoice.pdfGeneratedAt ?? null,
      status: invoice.status,
      sent_at: invoice.sentAt,
    })
    .select('id')
    .single();

  if (invoiceInsert.error || !invoiceInsert.data) {
    throw new Error(invoiceInsert.error?.message ?? 'Nepodarilo se vytvorit fakturu.');
  }

  const persistedInvoiceId = invoiceInsert.data.id;

  const snapshot = getLocalAppState();
  const timelogById = mapByEntityIdentity(snapshot.timelogs ?? []);
  const receiptById = mapByEntityIdentity(snapshot.receipts ?? []);
  const eventById = mapByEntityIdentity(snapshot.events ?? []);
  const contractor = findContractorByIdentity(snapshot.contractors ?? [], invoice.contractorProfileId);

  const items = new Map<string, BillingItem>();
  (invoice.timelogIds ?? []).forEach((timelogId) => {
    const timelog = timelogById.get(timelogId);
    if (!timelog || !contractor) return;
    const event = eventById.get(timelog.eid);
    const jobNumber = normalizeJobNumber(event?.job);
    const current = items.get(jobNumber) ?? {
      jobNumber,
      eventIds: new Set<EventId>(),
      timelogIds: [],
      receiptIds: [],
      hours: 0,
      amountHours: 0,
      km: 0,
      amountKm: 0,
      amountMeals: 0,
      amountReceipts: 0,
    };
    const hours = round2(calculateTotalHours(timelog.days));
    current.hours = round2(current.hours + hours);
    current.amountHours += Math.round(hours * contractor.rate);
    current.km = round2(current.km + timelog.km);
    current.amountKm += Math.round(timelog.km * KM_RATE);
    current.amountMeals += Math.round(calculateTimelogMealAllowanceForEvent(timelog, event ?? null));
    current.timelogIds.push(timelogId);
    if (timelog.eid) current.eventIds.add(timelog.eid);
    items.set(jobNumber, current);
  });

  (invoice.receiptIds ?? []).forEach((receiptId) => {
    const receipt = receiptById.get(receiptId);
    if (!receipt) return;
    const event = eventById.get(receipt.eid);
    const jobNumber = normalizeJobNumber(receipt.job || event?.job);
    const current = items.get(jobNumber) ?? {
      jobNumber,
      eventIds: new Set<EventId>(),
      timelogIds: [],
      receiptIds: [],
      hours: 0,
      amountHours: 0,
      km: 0,
      amountKm: 0,
      amountMeals: 0,
      amountReceipts: 0,
    };
    current.amountReceipts += Math.round(receipt.amount);
    current.receiptIds.push(receiptId);
    if (receipt.eid) current.eventIds.add(receipt.eid);
    items.set(jobNumber, current);
  });

  const itemRows = Array.from(items.values()).map((item) => ({
    invoice_id: persistedInvoiceId,
    job_number: item.jobNumber,
    event_id: Array.from(item.eventIds)
      .map((eventId) => resolveSupabaseRowId(eventId, eventIdMap))
      .find(Boolean) ?? null,
    hours: item.hours,
    amount_hours: item.amountHours,
    km: item.km,
    amount_km: item.amountKm,
    amount_meals: item.amountMeals,
    amount_receipts: item.amountReceipts,
    total_amount: item.amountHours + item.amountKm + item.amountMeals + item.amountReceipts,
  }));

  if (itemRows.length > 0) {
    const itemInsert = await supabase.from('invoice_items').insert(itemRows);
    if (itemInsert.error) {
      throw new Error(itemInsert.error.message);
    }
  }

  if (timelogRowIds.length > 0) {
    const linkInsert = await supabase.from('invoice_timelogs').insert(
      timelogRowIds.map((timelogRowId) => ({
        invoice_id: persistedInvoiceId,
        timelog_id: timelogRowId,
      })),
    );
    if (linkInsert.error) {
      throw new Error(linkInsert.error.message);
    }

    const timelogStatusUpdate = await supabase
      .from('timelogs')
      .update({ status: 'invoiced' })
      .in('id', timelogRowIds);
    if (timelogStatusUpdate.error) {
      throw new Error(timelogStatusUpdate.error.message);
    }
  }

  if (receiptRowIds.length > 0) {
    const receiptLinkInsert = await supabase.from('invoice_receipts').insert(
      receiptRowIds.map((receiptRowId) => ({
        invoice_id: persistedInvoiceId,
        receipt_id: receiptRowId,
      })),
    );
    if (receiptLinkInsert.error) {
      throw new Error(receiptLinkInsert.error.message);
    }

    const receiptStatusUpdate = await supabase
      .from('receipts')
      .update({ status: 'attached' })
      .in('id', receiptRowIds);
    if (receiptStatusUpdate.error) {
      throw new Error(receiptStatusUpdate.error.message);
    }
  }

  return persistedInvoiceId;
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
      uniqueSortedEntityIds(batch.timelogIds),
      uniqueSortedEntityIds(batch.receiptIds),
    );
    if (created) {
      newInvoices.push(created);
    }
  }

  return newInvoices;
};

export const createInvoiceFromSelection = async (
  contractorProfileId: string,
  selectedTimelogIds: TimelogId[],
  selectedReceiptIds: ReceiptId[],
): Promise<Invoice | null> => {
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
  const persistedInvoiceId = await persistSupabaseGeneratedInvoice(draftInvoice);
  const invoice = persistedInvoiceId ? { ...draftInvoice, id: persistedInvoiceId } : draftInvoice;

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: [...(currentSnapshot.invoices ?? []), invoice],
  }));
  syncInvoiceQueryData();

  if ((invoice.timelogIds ?? []).length > 0) {
    await markTimelogsAsInvoiced(invoice.timelogIds ?? []);
  }
  if ((invoice.receiptIds ?? []).length > 0) {
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

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const invoiceUpdate = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (invoiceUpdate.error) {
      throw new Error(invoiceUpdate.error.message);
    }

    const timelogIdMap = await getSupabaseTimelogIdMap();
    const receiptIdMap = await getSupabaseReceiptIdMap();

    const timelogRowIds = (invoice.timelogIds ?? [])
      .map((timelogId) => resolveSupabaseRowId(timelogId, timelogIdMap))
      .filter((value): value is string => Boolean(value));
    const receiptRowIds = (invoice.receiptIds ?? [])
      .map((receiptId) => resolveSupabaseRowId(receiptId, receiptIdMap))
      .filter((value): value is string => Boolean(value));

    if (timelogRowIds.length > 0) {
      const timelogUpdate = await supabase
        .from('timelogs')
        .update({ status: 'paid' })
        .in('id', timelogRowIds);

      if (timelogUpdate.error) {
        throw new Error(timelogUpdate.error.message);
      }
    }

    if (receiptRowIds.length > 0) {
      const receiptUpdate = await supabase
        .from('receipts')
        .update({ status: 'reimbursed' })
        .in('id', receiptRowIds);

      if (receiptUpdate.error) {
        throw new Error(receiptUpdate.error.message);
      }
    }
  }

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: (currentSnapshot.invoices ?? []).map((item) => item.id === id ? { ...item, status: 'paid' } : item),
  }));
  syncInvoiceQueryData();

  if ((invoice.timelogIds ?? []).length > 0) {
    await markTimelogsAsPaid(invoice.timelogIds ?? []);
  } else {
    if (invoice.contractorProfileId) {
      await markTimelogsAsPaidForInvoice(invoice.eid, invoice.contractorProfileId);
    }
  }
  if ((invoice.receiptIds ?? []).length > 0) {
    await markReceiptsAsReimbursed(invoice.receiptIds ?? []);
  } else {
    if (invoice.contractorProfileId) {
      await markReceiptsAsReimbursedForInvoice(invoice.eid, invoice.contractorProfileId);
    }
  }

  return {
    ...invoice,
    status: 'paid',
  };
};

export const sendInvoice = async (id: string): Promise<Invoice | null> => {
  const snapshot = getLocalAppState();
  const invoice = (snapshot.invoices ?? []).find((item) => item.id === id);

  if (!invoice) {
    return null;
  }

  const sentAt = new Date().toISOString();

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const invoiceUpdate = await supabase
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: sentAt,
      })
      .eq('id', id);

    if (invoiceUpdate.error) {
      throw new Error(invoiceUpdate.error.message);
    }
  }

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: (currentSnapshot.invoices ?? []).map((item) => (
      item.id === id ? { ...item, status: 'sent', sentAt } : item
    )),
  }));
  syncInvoiceQueryData();

  return {
    ...invoice,
    status: 'sent',
    sentAt,
  };
};

export const deleteInvoice = async (id: string): Promise<boolean> => {
  const snapshot = getLocalAppState();
  const invoice = (snapshot.invoices ?? []).find((item) => item.id === id);

  if (!invoice) {
    return false;
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const timelogIdMap = await getSupabaseTimelogIdMap();
    const receiptIdMap = await getSupabaseReceiptIdMap();

    const timelogRowIds = (invoice.timelogIds ?? [])
      .map((timelogId) => resolveSupabaseRowId(timelogId, timelogIdMap))
      .filter((value): value is string => Boolean(value));
    const receiptRowIds = (invoice.receiptIds ?? [])
      .map((receiptId) => resolveSupabaseRowId(receiptId, receiptIdMap))
      .filter((value): value is string => Boolean(value));

    if (timelogRowIds.length > 0) {
      const timelogUpdate = await supabase
        .from('timelogs')
        .update({ status: 'approved' })
        .in('id', timelogRowIds);

      if (timelogUpdate.error) {
        throw new Error(timelogUpdate.error.message);
      }
    }

    if (receiptRowIds.length > 0) {
      const receiptUpdate = await supabase
        .from('receipts')
        .update({ status: 'approved' })
        .in('id', receiptRowIds);

      if (receiptUpdate.error) {
        throw new Error(receiptUpdate.error.message);
      }
    }

    const invoiceDelete = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (invoiceDelete.error) {
      throw new Error(invoiceDelete.error.message);
    }
  }

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: (currentSnapshot.invoices ?? []).filter((item) => item.id !== id),
  }));

  if ((invoice.timelogIds ?? []).length > 0 || (invoice.receiptIds ?? []).length > 0) {
    updateLocalAppState((currentSnapshot) => ({
      ...currentSnapshot,
      timelogs: (currentSnapshot.timelogs ?? []).map((timelog) => (
        invoice.timelogIds?.includes(timelog.id)
          ? { ...timelog, status: 'approved' as const }
          : timelog
      )),
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
