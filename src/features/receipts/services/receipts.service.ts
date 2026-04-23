import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
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

const invalidateReceiptQueries = () => {
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
};

const getContractorProfileIdFromLocalState = (contractorId: number): string | undefined => (
  (getLocalAppState().contractors ?? []).find((contractor) => contractor.id === contractorId)?.profileId
);

const getSupabaseEventIdMap = async (): Promise<Map<number, string>> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const result = await supabase
    .from('events')
    .select('id')
    .order('date_from')
    .order('name');

  if (result.error) {
    throw new Error(result.error.message);
  }

  return new Map((result.data ?? []).map((row, index) => [index + 1, row.id]));
};

const getSupabaseReceiptRowIds = async (): Promise<string[]> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const result = await supabase
    .from('receipts')
    .select('id')
    .order('created_at');

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []).map((row) => row.id);
};

const getSupabaseReceiptRowId = async (localReceiptId: number): Promise<string> => {
  const receiptRowIds = await getSupabaseReceiptRowIds();
  const rowId = receiptRowIds[localReceiptId - 1];

  if (!rowId) {
    throw new Error('Nepodarilo se sparovat uctenku s databazovym zaznamem.');
  }

  return rowId;
};

const persistSupabaseReceiptStatus = async (
  localReceiptIds: number[],
  nextStatus: ReceiptStatus,
): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const receiptRowIds = await getSupabaseReceiptRowIds();
  const rowIds = Array.from(new Set(localReceiptIds.map((localId) => {
    const rowId = receiptRowIds[localId - 1];
    if (!rowId) {
      throw new Error('Nepodarilo se sparovat uctenku s databazovym zaznamem.');
    }
    return rowId;
  })));

  await Promise.all(rowIds.map(async (rowId) => {
    const result = await supabase
      .from('receipts')
      .update({ status: nextStatus })
      .eq('id', rowId);

    if (result.error) {
      throw new Error(result.error.message);
    }
  }));
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
  contractorProfileId: getContractorProfileIdFromLocalState(contractorId),
  eid: 0,
  job: '',
  title: '',
  vendor: '',
  amount: 0,
  paidAt: new Date().toISOString().split('T')[0],
  note: '',
  status: 'draft',
});

export const updateReceiptStatus = async (id: number, action: ReceiptAction): Promise<ReceiptItem> => {
  const statusMap: Record<ReceiptAction, ReceiptStatus> = {
    submit: 'submitted',
    approve: 'approved',
    reimburse: 'reimbursed',
    reject: 'rejected',
  };
  const nextStatus = statusMap[action];

  await persistSupabaseReceiptStatus([id], nextStatus);

  let updatedReceipt: ReceiptItem | null = null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) => {
      if (receipt.id !== id) return receipt;

      updatedReceipt = {
        ...receipt,
        status: nextStatus,
      };

      return updatedReceipt;
    }),
  }));

  if (!updatedReceipt) {
    throw new Error('Uctenka nebyla nalezena.');
  }

  invalidateReceiptQueries();
  return updatedReceipt;
};

export const saveReceipt = async (updated: ReceiptItem): Promise<ReceiptItem> => {
  const normalizedReceipt = normalizeReceipt({
    ...updated,
    contractorProfileId: updated.contractorProfileId ?? getContractorProfileIdFromLocalState(updated.cid),
  });

  if (!normalizedReceipt.eid || !normalizedReceipt.cid || !normalizedReceipt.title || normalizedReceipt.amount <= 0) {
    throw new Error('Vyplnte akci, nazev uctenky a castku.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const existing = (getLocalAppState().receipts ?? []).some((receipt) => receipt.id === normalizedReceipt.id);
    const eventIdMap = await getSupabaseEventIdMap();
    const contractorRowId = normalizedReceipt.contractorProfileId;
    const eventRowId = eventIdMap.get(normalizedReceipt.eid);

    if (!contractorRowId || !eventRowId) {
      throw new Error('Nepodarilo se sparovat uctenku s databazovym zaznamem.');
    }

    const payload = {
      contractor_id: contractorRowId,
      event_id: eventRowId,
      job_number: normalizedReceipt.job,
      name: normalizedReceipt.title,
      supplier: normalizedReceipt.vendor,
      amount: normalizedReceipt.amount,
      paid_at: normalizedReceipt.paidAt,
      note: normalizedReceipt.note,
      status: normalizedReceipt.status,
    };

    if (existing) {
      const receiptRowId = await getSupabaseReceiptRowId(normalizedReceipt.id);
      const receiptUpdate = await supabase
        .from('receipts')
        .update(payload)
        .eq('id', receiptRowId);

      if (receiptUpdate.error) {
        throw new Error(receiptUpdate.error.message);
      }
    } else {
      const receiptInsert = await supabase
        .from('receipts')
        .insert(payload);

      if (receiptInsert.error) {
        throw new Error(receiptInsert.error.message);
      }
    }
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

  invalidateReceiptQueries();
  return normalizedReceipt;
};

export const deleteReceipt = async (id: number): Promise<{ id: number }> => {
  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const receiptRowId = await getSupabaseReceiptRowId(id);
    const receiptDelete = await supabase
      .from('receipts')
      .delete()
      .eq('id', receiptRowId);

    if (receiptDelete.error) {
      throw new Error(receiptDelete.error.message);
    }
  }

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.filter((receipt) => receipt.id !== id),
  }));

  invalidateReceiptQueries();
  return { id };
};

export const markApprovedReceiptsAsAttached = async (): Promise<ReceiptItem[]> => {
  const updatedReceipts: ReceiptItem[] = [];
  const localReceiptIds = (getLocalAppState().receipts ?? [])
    .filter((receipt) => receipt.status === 'approved')
    .map((receipt) => receipt.id);

  if (localReceiptIds.length > 0) {
    await persistSupabaseReceiptStatus(localReceiptIds, 'attached');
  }

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

  invalidateReceiptQueries();
  return updatedReceipts;
};

export const markReceiptsAsAttached = async (receiptIds: number[]): Promise<ReceiptItem[]> => {
  const idSet = new Set(receiptIds);
  const updatedReceipts: ReceiptItem[] = [];

  if (receiptIds.length > 0) {
    await persistSupabaseReceiptStatus(receiptIds, 'attached');
  }

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

  invalidateReceiptQueries();
  return updatedReceipts;
};

export const markReceiptsAsReimbursedForInvoice = async (
  eventId: number,
  contractorId: number,
): Promise<ReceiptItem[]> => {
  const updatedReceipts: ReceiptItem[] = [];
  const localReceiptIds = (getLocalAppState().receipts ?? [])
    .filter((receipt) => receipt.eid === eventId && receipt.cid === contractorId && receipt.status === 'attached')
    .map((receipt) => receipt.id);

  if (localReceiptIds.length > 0) {
    await persistSupabaseReceiptStatus(localReceiptIds, 'reimbursed');
  }

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

  invalidateReceiptQueries();
  return updatedReceipts;
};

export const markReceiptsAsReimbursed = async (receiptIds: number[]): Promise<ReceiptItem[]> => {
  const idSet = new Set(receiptIds);
  const updatedReceipts: ReceiptItem[] = [];

  if (receiptIds.length > 0) {
    await persistSupabaseReceiptStatus(receiptIds, 'reimbursed');
  }

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

  invalidateReceiptQueries();
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
