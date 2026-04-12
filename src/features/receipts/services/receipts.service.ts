import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { Contractor, Event, ReceiptItem, ReceiptStatus } from '../../../types';

type ReceiptAction = 'submit' | 'approve' | 'reimburse' | 'reject';

const normalizeReceipt = (receipt: ReceiptItem): ReceiptItem => ({
  ...receipt,
  job: receipt.job.trim().toUpperCase(),
  title: receipt.title.trim(),
  vendor: receipt.vendor.trim(),
  note: receipt.note.trim(),
});

const matchesSearch = (
  receipt: ReceiptItem,
  query: string,
  contractors: Contractor[],
  events: Event[],
) => {
  if (!query) return true;

  const event = events.find((item) => item.id === receipt.eid);
  const contractor = contractors.find((item) => item.id === receipt.cid);
  if (!event || !contractor) return false;

  return (
    receipt.title.toLowerCase().includes(query)
    || receipt.vendor.toLowerCase().includes(query)
    || receipt.job.toLowerCase().includes(query)
    || event.name.toLowerCase().includes(query)
    || contractor.name.toLowerCase().includes(query)
  );
};

export const getReceipts = (search = ''): ReceiptItem[] => {
  const snapshot = getLocalAppState();
  const query = search.trim().toLowerCase();

  if (!query) return snapshot.receipts;

  return snapshot.receipts.filter((receipt) => (
    matchesSearch(receipt, query, snapshot.contractors, snapshot.events)
  ));
};

export const getReceiptById = (id: number | null): ReceiptItem | null => {
  if (id == null) return null;
  return getLocalAppState().receipts.find((receipt) => receipt.id === id) ?? null;
};

export const getReceiptDependencies = (): { events: Event[]; contractors: Contractor[] } => {
  const snapshot = getLocalAppState();
  return {
    events: snapshot.events,
    contractors: snapshot.contractors,
  };
};

export const createEmptyReceipt = (contractorId: number): ReceiptItem => ({
  id: Math.max(0, ...getLocalAppState().receipts.map((receipt) => receipt.id)) + 1,
  cid: contractorId,
  eid: 0,
  job: '',
  title: '',
  vendor: '',
  amount: 0,
  paidAt: new Date().toISOString().split('T')[0],
  note: '',
  status: 'draft',
});

export const updateReceiptStatus = (id: number, action: ReceiptAction): ReceiptItem => {
  const statusMap: Record<ReceiptAction, ReceiptStatus> = {
    submit: 'submitted',
    approve: 'approved',
    reimburse: 'reimbursed',
    reject: 'rejected',
  };

  let updatedReceipt: ReceiptItem | null = null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) => {
      if (receipt.id !== id) return receipt;

      updatedReceipt = {
        ...receipt,
        status: statusMap[action],
      };

      return updatedReceipt;
    }),
  }));

  if (!updatedReceipt) {
    throw new Error('Uctenka nebyla nalezena.');
  }

  return updatedReceipt;
};

export const saveReceipt = (updated: ReceiptItem): ReceiptItem => {
  const normalizedReceipt = normalizeReceipt(updated);

  if (!normalizedReceipt.eid || !normalizedReceipt.cid || !normalizedReceipt.title || normalizedReceipt.amount <= 0) {
    throw new Error('Vyplnte akci, nazev uctenky a castku.');
  }

  updateLocalAppState((snapshot) => {
    const exists = snapshot.receipts.some((receipt) => receipt.id === normalizedReceipt.id);

    return {
      ...snapshot,
      receipts: exists
        ? snapshot.receipts.map((receipt) => (
            receipt.id === normalizedReceipt.id ? normalizedReceipt : receipt
          ))
        : [...snapshot.receipts, normalizedReceipt],
    };
  });

  return normalizedReceipt;
};

export const deleteReceipt = (id: number): { id: number } => {
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.filter((receipt) => receipt.id !== id),
  }));

  return { id };
};

export const subscribeToReceiptChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);
