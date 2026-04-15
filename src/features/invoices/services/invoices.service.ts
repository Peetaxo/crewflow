import { toast } from 'sonner';
import { appDataSource } from '../../../lib/app-config';
import { KM_RATE } from '../../../data';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapInvoice } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { Contractor, Event, Invoice, ReceiptItem, Timelog } from '../../../types';
import { calculateTotalHours } from '../../../utils';
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
  cid: number;
  items: Map<string, BillingItem>;
  eventIds: Set<number>;
  timelogIds: number[];
  receiptIds: number[];
};

export type InvoiceCreateCandidate = {
  contractorId: number;
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
  contractorId: number;
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

const findContractor = (contractors: Contractor[], id: number): Contractor | null => (
  contractors.find((contractor) => contractor.id === id) ?? null
);

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

const getSupabaseTimelogIdMap = async (): Promise<Map<number, string>> => {
  const rows = await getSupabaseIdRows('timelogs', 'created_at');
  const localIds = (getLocalAppState().timelogs ?? []).map((timelog) => timelog.id);
  return new Map(rows.map((row, index) => [localIds[index], row.id]).filter(([localId]) => localId != null));
};

const getSupabaseReceiptIdMap = async (): Promise<Map<number, string>> => {
  const rows = await getSupabaseIdRows('receipts', 'created_at');
  const localIds = (getLocalAppState().receipts ?? []).map((receipt) => receipt.id);
  return new Map(rows.map((row, index) => [localIds[index], row.id]).filter(([localId]) => localId != null));
};

const getSupabaseProfileIdMap = async (): Promise<Map<number, string>> => {
  const rows = await safeSelect<{ id: string; last_name: string | null; first_name: string | null }>(
    'profiles',
    'id,last_name,first_name',
    'last_name',
  );
  const sortedRows = [...rows].sort((a, b) => (
    `${a.last_name ?? ''}|${a.first_name ?? ''}`.localeCompare(`${b.last_name ?? ''}|${b.first_name ?? ''}`)
  ));
  return new Map(sortedRows.map((row, index) => [index + 1, row.id]));
};

const getSupabaseEventIdMap = async (): Promise<Map<number, string>> => {
  const rows = await safeSelect<{ id: string; date_from: string | null; name: string }>(
    'events',
    'id,date_from,name',
    'date_from',
  );
  const sortedRows = [...rows].sort((a, b) => (
    `${a.date_from ?? ''}|${a.name}`.localeCompare(`${b.date_from ?? ''}|${b.name}`)
  ));
  return new Map(sortedRows.map((row, index) => [index + 1, row.id]));
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

  const grouped = new Map<number, BillingBatch>();

  const getBatch = (cid: number): BillingBatch => {
    const existing = grouped.get(cid);
    if (existing) return existing;

    const created: BillingBatch = {
      cid,
      items: new Map<string, BillingItem>(),
      eventIds: new Set<number>(),
      timelogIds: [],
      receiptIds: [],
    };
    grouped.set(cid, created);
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
    const contractor = findContractor(contractors, timelog.cid);
    const event = findEvent(events, timelog.eid);
    if (!contractor || !event) return;

    const batch = getBatch(timelog.cid);
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
    const contractor = findContractor(contractors, receipt.cid);
    const event = findEvent(events, receipt.eid);
    if (!contractor) return;

    const batch = getBatch(receipt.cid);
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
    cid: batch.cid,
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
  const contractor = findContractor(contractors, batch.cid);
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
    contractorId: batch.cid,
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
  contractorId: number,
  selectedTimelogIds: number[],
  selectedReceiptIds: number[],
): BillingBatch | null => {
  const snapshot = getLocalAppState();
  const contractors = snapshot.contractors ?? [];
  const events = snapshot.events ?? [];
  const timelogs = getTimelogs() ?? [];
  const receipts = getReceipts() ?? [];
  const contractor = findContractor(contractors, contractorId);

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
  const selectedTimelogs = timelogs.filter((timelog) => timelog.cid === contractorId && timelog.status === 'approved' && timelogIdSet.has(timelog.id));
  const selectedReceipts = receipts.filter((receipt) => receipt.cid === contractorId && receipt.status === 'approved' && receiptIdSet.has(receipt.id));

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
    cid: contractorId,
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

const hydrateInvoicesFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
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

  const profileIdMap = new Map(
    (profilesResult.data ?? []).map((row, index) => [row.id, index + 1]),
  );
  const eventIdMap = new Map(
    (eventsResult.data ?? []).map((row, index) => [row.id, index + 1]),
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

  const supabaseInvoices = (invoicesResult.data ?? []).map((row) => {
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
    const linkedTimelogIds = uniqueSortedNumbers(
      (invoiceTimelogsByInvoiceId.get(row.id) ?? [])
        .map((item) => timelogIdMap.get(item.timelog_id) ?? Number.NaN)
        .filter((itemId) => !Number.isNaN(itemId)),
    );
    const linkedReceiptIds = uniqueSortedNumbers(
      (invoiceReceiptsByInvoiceId.get(row.id) ?? [])
        .map((item) => receiptIdMap.get(item.receipt_id) ?? Number.NaN)
        .filter((itemId) => !Number.isNaN(itemId)),
    );
    const timelogIds = linkedTimelogIds.length > 0 ? linkedTimelogIds : (localInvoice?.timelogIds ?? []);
    const receiptIds = linkedReceiptIds.length > 0 ? linkedReceiptIds : (localInvoice?.receiptIds ?? []);

    return {
      ...mapInvoice(row),
      cid: profileIdMap.get(row.contractor_id) ?? Number.NaN,
      eid: eventIds[0] ?? (row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : 0),
      job: jobNumbers.join(', ') || localInvoice?.job || row.job_number || '',
      jobNumbers,
      timelogIds,
      receiptIds,
      eventIds,
    };
  });

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    invoices: supabaseInvoices,
  }));
};

const ensureSupabaseInvoicesLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (invoicesHydrationPromise) {
    return;
  }

  invoicesHydrationPromise = hydrateInvoicesFromSupabase()
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

  const [profileIdMap, eventIdMap, timelogIdMap, receiptIdMap] = await Promise.all([
    getSupabaseProfileIdMap(),
    getSupabaseEventIdMap(),
    getSupabaseTimelogIdMap(),
    getSupabaseReceiptIdMap(),
  ]);

  const contractorRowId = profileIdMap.get(invoice.cid);
  if (!contractorRowId) {
    throw new Error('Nepodarilo se sparovat kontraktora pro fakturaci.');
  }

  const eventRowIds = (invoice.eventIds ?? [])
    .map((eventId) => eventIdMap.get(eventId))
    .filter((value): value is string => Boolean(value));
  const timelogRowIds = (invoice.timelogIds ?? [])
    .map((timelogId) => timelogIdMap.get(timelogId))
    .filter((value): value is string => Boolean(value));
  const receiptRowIds = (invoice.receiptIds ?? [])
    .map((receiptId) => receiptIdMap.get(receiptId))
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
      amount_receipts: invoice.receiptAmt ?? 0,
      total_amount: invoice.total,
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
  const timelogById = new Map((snapshot.timelogs ?? []).map((timelog) => [timelog.id, timelog]));
  const receiptById = new Map((snapshot.receipts ?? []).map((receipt) => [receipt.id, receipt]));
  const eventById = new Map((snapshot.events ?? []).map((event) => [event.id, event]));
  const contractor = findContractor(snapshot.contractors ?? [], invoice.cid);

  const items = new Map<string, BillingItem>();
  (invoice.timelogIds ?? []).forEach((timelogId) => {
    const timelog = timelogById.get(timelogId);
    if (!timelog || !contractor) return;
    const event = eventById.get(timelog.eid);
    const jobNumber = normalizeJobNumber(event?.job);
    const current = items.get(jobNumber) ?? {
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
    const hours = round2(calculateTotalHours(timelog.days));
    current.hours = round2(current.hours + hours);
    current.amountHours += Math.round(hours * contractor.rate);
    current.km = round2(current.km + timelog.km);
    current.amountKm += Math.round(timelog.km * KM_RATE);
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
      eventIds: new Set<number>(),
      timelogIds: [],
      receiptIds: [],
      hours: 0,
      amountHours: 0,
      km: 0,
      amountKm: 0,
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
      .map((eventId) => eventIdMap.get(eventId))
      .find(Boolean) ?? null,
    hours: item.hours,
    amount_hours: item.amountHours,
    km: item.km,
    amount_km: item.amountKm,
    amount_receipts: item.amountReceipts,
    total_amount: item.amountHours + item.amountKm + item.amountReceipts,
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
    const contractor = findContractor(safeContractors, invoice.cid);

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
      const contractor = findContractor(contractors, batch.cid);
      const preview = batchToPreview(batch, contractors);

      return {
        contractorId: batch.cid,
        contractorName: contractor?.name ?? '',
        timelogCount: batch.timelogIds.length,
        receiptCount: batch.receiptIds.length,
        totalAmount: preview.totalAmount,
      };
    })
    .sort((a, b) => a.contractorName.localeCompare(b.contractorName));
};

export const getInvoiceCreatePreview = (contractorId: number): InvoiceCreatePreview | null => {
  const snapshot = getLocalAppState();
  const contractors = snapshot.contractors ?? [];
  const batch = buildBillingBatches().find((item) => item.cid === contractorId);
  if (!batch) return null;
  return batchToPreview(batch, contractors);
};

export const getInvoiceDependencies = (): { events: Event[]; contractors: Contractor[] } => {
  ensureSupabaseInvoicesLoaded();
  const snapshot = getLocalAppState();

  return {
    events: snapshot.events ?? [],
    contractors: snapshot.contractors ?? [],
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
    const created = await createInvoiceFromSelection(
      batch.cid,
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
  contractorId: number,
  selectedTimelogIds: number[],
  selectedReceiptIds: number[],
): Promise<Invoice | null> => {
  const batch = buildBatchFromSelection(contractorId, selectedTimelogIds, selectedReceiptIds);
  if (!batch) {
    toast.info('Neni co fakturovat.');
    return null;
  }

  const draftInvoice = buildInvoiceFromBatch(batch, 0);
  const persistedInvoiceId = await persistSupabaseGeneratedInvoice(draftInvoice);
  const invoice = persistedInvoiceId ? { ...draftInvoice, id: persistedInvoiceId } : draftInvoice;

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: [...(currentSnapshot.invoices ?? []), invoice],
  }));

  if ((invoice.timelogIds ?? []).length > 0) {
    markTimelogsAsInvoiced(invoice.timelogIds ?? []);
  }
  if ((invoice.receiptIds ?? []).length > 0) {
    markReceiptsAsAttached(invoice.receiptIds ?? []);
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
      .map((timelogId) => timelogIdMap.get(timelogId))
      .filter((value): value is string => Boolean(value));
    const receiptRowIds = (invoice.receiptIds ?? [])
      .map((receiptId) => receiptIdMap.get(receiptId))
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

  if ((invoice.timelogIds ?? []).length > 0) {
    markTimelogsAsPaid(invoice.timelogIds ?? []);
  } else {
    markTimelogsAsPaidForInvoice(invoice.eid, invoice.cid);
  }
  if ((invoice.receiptIds ?? []).length > 0) {
    markReceiptsAsReimbursed(invoice.receiptIds ?? []);
  } else {
    markReceiptsAsReimbursedForInvoice(invoice.eid, invoice.cid);
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
      .map((timelogId) => timelogIdMap.get(timelogId))
      .filter((value): value is string => Boolean(value));
    const receiptRowIds = (invoice.receiptIds ?? [])
      .map((receiptId) => receiptIdMap.get(receiptId))
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

  return true;
};

export const subscribeToInvoiceChanges = (listener: () => void): (() => void) => {
  ensureSupabaseInvoicesLoaded();
  return subscribeToLocalAppState(() => listener());
};
