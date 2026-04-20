import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapReceipt } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { Contractor, Event, ReceiptItem, ReceiptStatus } from '../../../types';

type ReceiptAction = 'submit' | 'approve' | 'reimburse' | 'reject';
let receiptsHydrationPromise: Promise<void> | null = null;
let receiptsLoaded = false;

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

const mapSupabaseReceipts = (
  receiptRows: NonNullable<Awaited<ReturnType<typeof supabase.from<'receipts'>>>['data']>,
  profileRows: NonNullable<Awaited<ReturnType<typeof supabase.from<'profiles'>>>['data']>,
  eventRows: NonNullable<Awaited<ReturnType<typeof supabase.from<'events'>>>['data']>,
) => {
  const profileIdMap = new Map(
    profileRows.map((row, index) => [row.id, index + 1]),
  );
  const eventIdMap = new Map(
    eventRows.map((row, index) => [row.id, index + 1]),
  );

  return receiptRows.map((row, index) => ({
    ...mapReceipt(row),
    id: index + 1,
    cid: profileIdMap.get(row.contractor_id) ?? Number.NaN,
    contractorProfileId: row.contractor_id,
    eid: row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : 0,
  }));
};

export const fetchReceiptsSnapshot = async (): Promise<ReceiptItem[]> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return getLocalAppState().receipts ?? [];
  }

  const [receiptsResult, profilesResult, eventsResult] = await Promise.all([
    supabase.from('receipts').select('*').order('created_at'),
    supabase.from('profiles').select('id').order('last_name').order('first_name'),
    supabase.from('events').select('id').order('date_from').order('name'),
  ]);

  const firstError = receiptsResult.error ?? profilesResult.error ?? eventsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  return mapSupabaseReceipts(
    receiptsResult.data ?? [],
    profilesResult.data ?? [],
    eventsResult.data ?? [],
  );
};

const hydrateReceiptsFromSupabase = async (): Promise<void> => {
  const supabaseReceipts = await fetchReceiptsSnapshot();
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: supabaseReceipts,
  }));
};

const ensureSupabaseReceiptsLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (receiptsLoaded) {
    return;
  }

  if (receiptsHydrationPromise) {
    return;
  }

  receiptsHydrationPromise = hydrateReceiptsFromSupabase()
    .then(() => {
      receiptsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist uctenky ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      receiptsHydrationPromise = null;
    });
};

export const getReceipts = (search = ''): ReceiptItem[] => {
  ensureSupabaseReceiptsLoaded();
  const snapshot = getLocalAppState();
  const query = search.trim().toLowerCase();
  const safeReceipts = snapshot.receipts ?? [];
  const safeContractors = snapshot.contractors ?? [];
  const safeEvents = snapshot.events ?? [];

  if (!query) return safeReceipts;

  return safeReceipts.filter((receipt) => (
    matchesSearch(receipt, query, safeContractors, safeEvents)
  ));
};

export const getReceiptById = (id: number | null): ReceiptItem | null => {
  ensureSupabaseReceiptsLoaded();
  if (id == null) return null;
  return (getLocalAppState().receipts ?? []).find((receipt) => receipt.id === id) ?? null;
};

export const getReceiptDependencies = (): { events: Event[]; contractors: Contractor[] } => {
  ensureSupabaseReceiptsLoaded();
  const snapshot = getLocalAppState();
  return {
    events: snapshot.events ?? [],
    contractors: snapshot.contractors ?? [],
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

export const markApprovedReceiptsAsAttached = (): ReceiptItem[] => {
  const updatedReceipts: ReceiptItem[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) => {
      if (receipt.status !== 'approved') return receipt;

      const updatedReceipt = {
        ...receipt,
        status: 'attached' as const,
      };

      updatedReceipts.push(updatedReceipt);
      return updatedReceipt;
    }),
  }));

  return updatedReceipts;
};

export const markReceiptsAsAttached = (receiptIds: number[]): ReceiptItem[] => {
  const idSet = new Set(receiptIds);
  const updatedReceipts: ReceiptItem[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) => {
      if (!idSet.has(receipt.id)) return receipt;

      const updatedReceipt = {
        ...receipt,
        status: 'attached' as const,
      };

      updatedReceipts.push(updatedReceipt);
      return updatedReceipt;
    }),
  }));

  return updatedReceipts;
};

export const markReceiptsAsReimbursedForInvoice = (eventId: number, contractorId: number): ReceiptItem[] => {
  const updatedReceipts: ReceiptItem[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) => {
      if (receipt.eid !== eventId || receipt.cid !== contractorId || receipt.status !== 'attached') return receipt;

      const updatedReceipt = {
        ...receipt,
        status: 'reimbursed' as const,
      };

      updatedReceipts.push(updatedReceipt);
      return updatedReceipt;
    }),
  }));

  return updatedReceipts;
};

export const markReceiptsAsReimbursed = (receiptIds: number[]): ReceiptItem[] => {
  const idSet = new Set(receiptIds);
  const updatedReceipts: ReceiptItem[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) => {
      if (!idSet.has(receipt.id)) return receipt;

      const updatedReceipt = {
        ...receipt,
        status: 'reimbursed' as const,
      };

      updatedReceipts.push(updatedReceipt);
      return updatedReceipt;
    }),
  }));

  return updatedReceipts;
};

export const subscribeToReceiptChanges = (listener: () => void): (() => void) => {
  ensureSupabaseReceiptsLoaded();
  return subscribeToLocalAppState(() => listener());
};

export const resetSupabaseReceiptsHydration = () => {
  receiptsHydrationPromise = null;
  receiptsLoaded = false;
};
