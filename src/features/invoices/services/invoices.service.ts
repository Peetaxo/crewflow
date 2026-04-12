import { toast } from 'sonner';
import { KM_RATE } from '../../../data';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import type { Contractor, Event, Invoice, ReceiptItem, Timelog } from '../../../types';
import { calculateTotalHours } from '../../../utils';
import { getTimelogs, markApprovedTimelogsAsInvoiced, markTimelogsAsPaidForInvoice } from '../../timelogs/services/timelogs.service';
import { getReceipts, markApprovedReceiptsAsAttached, markReceiptsAsReimbursedForInvoice } from '../../receipts/services/receipts.service';

const findContractor = (contractors: Contractor[], id: number): Contractor | null => (
  contractors.find((contractor) => contractor.id === id) ?? null
);

const findEvent = (events: Event[], id: number): Event | null => (
  events.find((event) => event.id === id) ?? null
);

export const getInvoices = (search = ''): Invoice[] => {
  const snapshot = getLocalAppState();
  const query = search.trim().toLowerCase();

  if (!query) {
    return snapshot.invoices;
  }

  return snapshot.invoices.filter((invoice) => {
    const event = findEvent(snapshot.events, invoice.eid);
    const contractor = findContractor(snapshot.contractors, invoice.cid);

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
  const snapshot = getLocalAppState();

  return {
    events: snapshot.events,
    contractors: snapshot.contractors,
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

export const subscribeToInvoiceChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);
