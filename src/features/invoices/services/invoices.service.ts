import { toast } from 'sonner';
import { appDataSource } from '../../../lib/app-config';
import { KM_RATE } from '../../../data';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapInvoice } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { Contractor, Event, Invoice, ReceiptItem, Timelog } from '../../../types';
import { calculateTotalHours } from '../../../utils';
import { getTimelogs, markApprovedTimelogsAsInvoiced, markTimelogsAsPaidForInvoice } from '../../timelogs/services/timelogs.service';
import { getReceipts, markApprovedReceiptsAsAttached, markReceiptsAsReimbursedForInvoice } from '../../receipts/services/receipts.service';
let invoicesHydrationPromise: Promise<void> | null = null;

const findContractor = (contractors: Contractor[], id: number): Contractor | null => (
  contractors.find((contractor) => contractor.id === id) ?? null
);

const findEvent = (events: Event[], id: number): Event | null => (
  events.find((event) => event.id === id) ?? null
);

const hydrateInvoicesFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const [invoicesResult, profilesResult, eventsResult] = await Promise.all([
    supabase.from('invoices').select('*').order('created_at'),
    supabase.from('profiles').select('id').order('last_name').order('first_name'),
    supabase.from('events').select('id').order('date_from').order('name'),
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

  const supabaseInvoices = (invoicesResult.data ?? []).map((row) => ({
    ...mapInvoice(row),
    cid: profileIdMap.get(row.contractor_id) ?? Number.NaN,
    eid: row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : 0,
  }));

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
    const event = findEvent(safeEvents, invoice.eid);
    const contractor = findContractor(safeContractors, invoice.cid);

    if (!event || !contractor) return false;

    return (
      event.name.toLowerCase().includes(query)
      || event.job.toLowerCase().includes(query)
      || contractor.name.toLowerCase().includes(query)
      || invoice.id.toLowerCase().includes(query)
    );
  });
};

export const getInvoiceDependencies = (): { events: Event[]; contractors: Contractor[] } => {
  ensureSupabaseInvoicesLoaded();
  const snapshot = getLocalAppState();

  return {
    events: snapshot.events ?? [],
    contractors: snapshot.contractors ?? [],
  };
};

export const generateInvoices = (): Invoice[] => {
  const snapshot = getLocalAppState();
  const contractors = snapshot.contractors;
  const events = snapshot.events;
  const timelogs = getTimelogs();
  const receipts = getReceipts();
  const approvedTimelogs = timelogs.filter((timelog) => timelog.status === 'approved');
  const approvedReceipts = receipts.filter((receipt) => receipt.status === 'approved');

  if (approvedTimelogs.length === 0 && approvedReceipts.length === 0) {
    toast.info('Zadne schvalene vykazy ani uctenky k fakturaci.');
    return [];
  }

  const grouped = new Map<string, { cid: number; eid: number; timelogs: Timelog[]; receipts: ReceiptItem[] }>();

  approvedTimelogs.forEach((timelog) => {
    const key = `${timelog.cid}-${timelog.eid}`;
    const existing = grouped.get(key) || { cid: timelog.cid, eid: timelog.eid, timelogs: [], receipts: [] };
    existing.timelogs.push(timelog);
    grouped.set(key, existing);
  });

  approvedReceipts.forEach((receipt) => {
    const key = `${receipt.cid}-${receipt.eid}`;
    const existing = grouped.get(key) || { cid: receipt.cid, eid: receipt.eid, timelogs: [], receipts: [] };
    existing.receipts.push(receipt);
    grouped.set(key, existing);
  });

  const newInvoices: Invoice[] = [...grouped.values()]
    .map((group, index) => {
      const contractor = findContractor(contractors, group.cid);
      const event = findEvent(events, group.eid);
      if (!contractor || !event) return null;

      const hours = group.timelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
      const km = group.timelogs.reduce((sum, timelog) => sum + timelog.km, 0);
      const hAmt = Math.round(hours * contractor.rate);
      const kAmt = Math.round(km * KM_RATE);
      const receiptAmt = Math.round(group.receipts.reduce((sum, receipt) => sum + receipt.amount, 0));
      const uniqueId = `FAK-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${index + 1}`;

      return {
        id: uniqueId,
        cid: group.cid,
        eid: group.eid,
        hours: Math.round(hours),
        hAmt,
        km,
        kAmt,
        receiptAmt,
        total: hAmt + kAmt + receiptAmt,
        job: event.job,
        status: 'sent' as const,
        sentAt: new Date().toISOString(),
      };
    })
    .filter((invoice): invoice is Invoice => invoice !== null);

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: [...currentSnapshot.invoices, ...newInvoices],
  }));

  markApprovedTimelogsAsInvoiced();
  markApprovedReceiptsAsAttached();
  toast.success(`Vygenerovano ${newInvoices.length} faktur.`);

  return newInvoices;
};

export const approveInvoice = (id: string): Invoice | null => {
  const snapshot = getLocalAppState();
  const invoice = snapshot.invoices.find((item) => item.id === id);

  if (!invoice) {
    return null;
  }

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    invoices: currentSnapshot.invoices.map((item) => item.id === id ? { ...item, status: 'paid' } : item),
  }));

  markTimelogsAsPaidForInvoice(invoice.eid, invoice.cid);
  markReceiptsAsReimbursedForInvoice(invoice.eid, invoice.cid);

  return {
    ...invoice,
    status: 'paid',
  };
};

export const subscribeToInvoiceChanges = (listener: () => void): (() => void) => {
  ensureSupabaseInvoicesLoaded();
  return subscribeToLocalAppState(() => listener());
};
