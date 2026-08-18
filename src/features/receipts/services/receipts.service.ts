import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapReceipt } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { Contractor, Event, ReceiptItem, ReceiptStatus } from '../../../types';
import {
  advanceLifecycleSnapshotGeneration,
  getLifecycleSnapshotGeneration,
  runLifecycleDataMutation,
} from '../../event-lifecycle-generation';
import { createStableDraftUuid } from '../../stable-draft-identity';
import {
  transitionReceiptStatusesAtomicRpc,
  type ReceiptMutationResult,
} from './receipt-mutation-rpc.service';

type ReceiptAction = 'submit' | 'approve' | 'reimburse' | 'reject';
const DELETABLE_RECEIPT_STATUSES: ReceiptStatus[] = ['draft', 'rejected'];
const RECEIPT_DELETE_GENERIC_ERROR = 'Účtenku se nepodařilo smazat.';
const RECEIPT_DELETE_CONFLICT_ERROR = 'Účtenka se mezitím změnila. Obnovte data a zkuste to znovu.';
const RECEIPT_DELETE_UNAUTHORIZED_ERROR = 'Účtenku nelze smazat, protože k ní nemáte oprávnění.';
const RECEIPT_DELETE_PROTECTED_ERROR = 'Účtenku lze smazat pouze jako koncept nebo po zamítnutí.';
const RECEIPT_WRITE_GENERIC_ERROR = 'Účtenku se nepodařilo uložit.';
const RECEIPT_WRITE_CONFLICT_ERROR = 'Účtenka se mezitím změnila. Obnovte data a zkuste to znovu.';
const RECEIPT_WRITE_UNAUTHORIZED_ERROR = 'Účtenku nelze uložit, protože k ní nemáte oprávnění.';
const RECEIPT_INVALID_ERROR = 'Účtenka obsahuje neplatné nebo neúplné údaje.';
let receiptsHydrationPromise: Promise<void> | null = null;
let receiptsLoaded = false;
let receiptsHydrationEpoch = 0;
type ReceiptCreateIntent = {
  localId: number;
  supabaseId: string;
  ambiguous: boolean;
  activeReservations: number;
};
type ReceiptSaveIdentity = {
  supabaseId: string;
  source: 'explicit' | 'canonical' | 'create';
  createIntent?: ReceiptCreateIntent;
};
const receiptCreateIntentByLocalId = new Map<number, ReceiptCreateIntent>();

const reserveReceiptSaveIdentity = (receipt: ReceiptItem): ReceiptSaveIdentity => {
  if (receipt.supabaseId) {
    return { supabaseId: receipt.supabaseId, source: 'explicit' };
  }

  const localMatches = (getLocalAppState().receipts ?? []).filter((item) => item.id === receipt.id);
  const canonicalIds = [...new Set(
    localMatches.map((item) => item.supabaseId).filter((id): id is string => Boolean(id)),
  )];
  if (canonicalIds.length > 1) {
    throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
  }
  if (canonicalIds[0]) {
    return { supabaseId: canonicalIds[0], source: 'canonical' };
  }

  let intent = receiptCreateIntentByLocalId.get(receipt.id);
  if (!intent) {
    const supabaseId = globalThis.crypto?.randomUUID();
    if (!supabaseId) {
      console.error('Receipt create requires a stable client UUID');
      throw new Error(RECEIPT_WRITE_GENERIC_ERROR);
    }
    intent = {
      localId: receipt.id,
      supabaseId,
      ambiguous: false,
      activeReservations: 0,
    };
    receiptCreateIntentByLocalId.set(receipt.id, intent);
  }
  intent.activeReservations += 1;
  return { supabaseId: intent.supabaseId, source: 'create', createIntent: intent };
};

const releaseReceiptSaveIdentity = (identity: ReceiptSaveIdentity | null): void => {
  if (identity?.createIntent) {
    identity.createIntent.activeReservations = Math.max(0, identity.createIntent.activeReservations - 1);
  }
};

const clearReceiptCreateIntent = (localId: number | null, supabaseId: string | null): void => {
  if (localId != null) {
    const intent = receiptCreateIntentByLocalId.get(localId);
    if (!supabaseId || intent?.supabaseId === supabaseId) {
      receiptCreateIntentByLocalId.delete(localId);
    }
  }
  if (!supabaseId) return;
  for (const [intentLocalId, intent] of receiptCreateIntentByLocalId.entries()) {
    if (intent.supabaseId === supabaseId) {
      receiptCreateIntentByLocalId.delete(intentLocalId);
    }
  }
};

const resetInactiveReceiptCreateIntents = (): void => {
  for (const [localId, intent] of receiptCreateIntentByLocalId.entries()) {
    if (intent.activeReservations === 0) {
      receiptCreateIntentByLocalId.delete(localId);
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const mapReceiptDeleteError = (error: unknown): Error => {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : '';
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : '';

  if (/(^|[^A-Za-z0-9_])receipt_delete_conflict($|[^A-Za-z0-9_])/.test(message) || code === 'PGRST116') {
    return new Error(RECEIPT_DELETE_CONFLICT_ERROR);
  }

  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new Error(RECEIPT_DELETE_UNAUTHORIZED_ERROR);
  }

  console.error('Unexpected receipt delete error', error);
  return new Error(RECEIPT_DELETE_GENERIC_ERROR);
};

const mapReceiptWriteError = (context: 'create' | 'update', error: unknown): Error => {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : '';
  const message = isRecord(error) && typeof error.message === 'string' ? error.message : '';

  if (code === 'PGRST116' || /receipt_mutation_conflict/.test(message)) {
    return new Error(RECEIPT_WRITE_CONFLICT_ERROR);
  }
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return new Error(RECEIPT_WRITE_UNAUTHORIZED_ERROR);
  }

  console.error(`Unexpected receipt ${context} error`, error);
  return new Error(RECEIPT_WRITE_GENERIC_ERROR);
};

interface ReceiptMutationControl {
  markRequestStarted: () => void;
  markCanonicalCommit: () => void;
}

interface ReceiptMutationOptions<T> {
  recover?: (receipts: ReceiptItem[]) => T | undefined;
}

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
  const contractor = contractors.find((item) => item.profileId === receipt.contractorProfileId);
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
    eventSupabaseId: row.event_id ?? undefined,
    contractorProfileId: row.contractor_id,
    eid: row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : 0,
  }));
};

const loadReceiptsSnapshot = async (): Promise<ReceiptItem[]> => {
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
    console.error('Unexpected receipt hydration error', firstError);
    throw new Error('Účtenky se nepodařilo načíst.');
  }

  return mapSupabaseReceipts(
    receiptsResult.data ?? [],
    profilesResult.data ?? [],
    eventsResult.data ?? [],
  );
};

type ReceiptSnapshotGenerationResult = {
  receipts: ReceiptItem[];
  committed: boolean;
};

const loadReceiptSnapshotForGeneration = async (): Promise<ReceiptSnapshotGenerationResult> => {
  const generation = getLifecycleSnapshotGeneration();
  const receipts = await loadReceiptsSnapshot();
  if (generation !== getLifecycleSnapshotGeneration()) {
    return { receipts: getLocalAppState().receipts ?? [], committed: false };
  }
  return { receipts, committed: true };
};

export const fetchReceiptsSnapshot = async (): Promise<ReceiptItem[]> => (
  (await loadReceiptSnapshotForGeneration()).receipts
);

const commitReceiptsSnapshot = (receipts: ReceiptItem[]): void => {
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts,
  }));
  queryClient.setQueryData(queryKeys.receipts.all, receipts);
  resetInactiveReceiptCreateIntents();
};

const runReceiptMutation = <T>(
  key: string,
  mutation: (control: ReceiptMutationControl) => Promise<T>,
  options: ReceiptMutationOptions<T> = {},
): Promise<T> => runLifecycleDataMutation([`receipt:${key}`], async () => {
  const usesSupabase = appDataSource === 'supabase';
  let requestStarted = false;
  let canonicalGenerationAdvanced = false;
  if (usesSupabase) {
    advanceLifecycleSnapshotGeneration();
  }

  const markCanonicalCommit = () => {
    if (usesSupabase && !canonicalGenerationAdvanced) {
      advanceLifecycleSnapshotGeneration();
      canonicalGenerationAdvanced = true;
    }
  };

  try {
    return await mutation({
      markRequestStarted: () => { requestStarted = true; },
      markCanonicalCommit,
    });
  } catch (error) {
    if (usesSupabase && requestStarted && supabase && isSupabaseConfigured) {
      try {
        const receipts = await loadReceiptsSnapshot();
        markCanonicalCommit();
        commitReceiptsSnapshot(receipts);
        const recovered = options.recover?.(receipts);
        if (recovered !== undefined) {
          return recovered;
        }
      } catch (recoveryError) {
        console.error('Unexpected receipt mutation recovery error', recoveryError);
      }
    }
    throw error;
  }
});

const hydrateReceiptsFromSupabase = async (): Promise<boolean> => {
  const result = await loadReceiptSnapshotForGeneration();
  if (!result.committed) return false;
  commitReceiptsSnapshot(result.receipts);
  return true;
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

  const hydrationEpoch = receiptsHydrationEpoch;
  let retryAfterStaleHydration = false;
  receiptsHydrationPromise = hydrateReceiptsFromSupabase()
    .then((committed) => {
      if (hydrationEpoch !== receiptsHydrationEpoch) return;
      receiptsLoaded = committed;
      retryAfterStaleHydration = !committed;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist uctenky ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      if (hydrationEpoch !== receiptsHydrationEpoch) return;
      receiptsHydrationPromise = null;
      if (retryAfterStaleHydration) {
        ensureSupabaseReceiptsLoaded();
      }
    });
};

const invalidateReceiptQueries = () => {
  queryClient.setQueryData(queryKeys.receipts.all, getLocalAppState().receipts ?? []);
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
};

const resolveReceiptEventSupabaseId = (
  receipt: ReceiptItem,
  existing: ReceiptItem | undefined,
  events: Event[],
): string => {
  const currentEvent = events.find((event) => event.id === receipt.eid);
  const explicitId = receipt.eventSupabaseId;
  const currentId = currentEvent?.supabaseId;
  const existingId = existing?.eid === receipt.eid ? existing.eventSupabaseId : undefined;
  if (explicitId && currentId && explicitId !== currentId) {
    throw new Error(RECEIPT_INVALID_ERROR);
  }
  const eventId = explicitId ?? currentId ?? existingId;
  if (!eventId || events.filter((event) => event.supabaseId === eventId).length !== 1) {
    throw new Error(RECEIPT_INVALID_ERROR);
  }
  return eventId;
};

const isAllowedReceiptTransition = (current: ReceiptStatus, next: ReceiptStatus): boolean => (
  ((current === 'draft' || current === 'rejected') && next === 'submitted')
  || (current === 'submitted' && (next === 'approved' || next === 'rejected'))
  || (current === 'approved' && next === 'reimbursed')
);

const reconcileReceiptStatus = (canonical: ReceiptMutationResult): ReceiptItem | null => {
  let reconciled: ReceiptItem | null = null;
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) => {
      if (receipt.supabaseId !== canonical.id) return receipt;
      reconciled = { ...receipt, status: canonical.status, updatedAt: canonical.updatedAt };
      return reconciled;
    }),
  }));
  return reconciled;
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

export const createEmptyReceipt = (
  contractorProfileId?: string,
): ReceiptItem => {
  return ({
    id: Math.max(0, ...getLocalAppState().receipts.map((receipt) => receipt.id)) + 1,
    supabaseId: appDataSource === 'supabase' ? createStableDraftUuid() : undefined,
    contractorProfileId,
    eid: 0,
    job: '',
    title: '',
    vendor: '',
    amount: 0,
    paidAt: new Date().toISOString().split('T')[0],
    note: '',
    status: 'draft',
  });
};

export const updateReceiptStatus = async (id: number, action: ReceiptAction): Promise<ReceiptItem> => runReceiptMutation(
  String(id),
  async ({ markRequestStarted, markCanonicalCommit }) => {
  const statusMap: Record<ReceiptAction, ReceiptStatus> = {
    submit: 'submitted',
    approve: 'approved',
    reimburse: 'reimbursed',
    reject: 'rejected',
  };
  const nextStatus = statusMap[action];
  const currentReceipt = (getLocalAppState().receipts ?? []).find((receipt) => receipt.id === id);
  if (!currentReceipt || !isAllowedReceiptTransition(currentReceipt.status, nextStatus)) {
    throw new Error(RECEIPT_INVALID_ERROR);
  }

  let updatedReceipt: ReceiptItem | null;
  if (appDataSource === 'supabase') {
    if (!currentReceipt.supabaseId || !currentReceipt.updatedAt) {
      throw new Error(RECEIPT_INVALID_ERROR);
    }
    markRequestStarted();
    const [canonical] = await transitionReceiptStatusesAtomicRpc({
      receipts: [{ id: currentReceipt.supabaseId, expected_updated_at: currentReceipt.updatedAt }],
      expectedStatus: currentReceipt.status,
      nextStatus,
    });
    markCanonicalCommit();
    updatedReceipt = reconcileReceiptStatus(canonical);
  } else {
    updatedReceipt = null;
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      receipts: snapshot.receipts.map((receipt) => {
        if (receipt.id !== id) return receipt;
        updatedReceipt = { ...receipt, status: nextStatus };
        return updatedReceipt;
      }),
    }));
  }

  if (!updatedReceipt) throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);

  invalidateReceiptQueries();
  return updatedReceipt;
  },
);

const matchesCreatedReceipt = (actual: ReceiptItem, expected: ReceiptItem): boolean => (
  actual.supabaseId === expected.supabaseId
  && actual.eventSupabaseId === expected.eventSupabaseId
  && actual.contractorProfileId === expected.contractorProfileId
  && actual.job === expected.job
  && actual.title === expected.title
  && actual.vendor === expected.vendor
  && actual.amount === expected.amount
  && actual.paidAt === expected.paidAt
  && actual.note === expected.note
  && actual.status === 'draft'
);

export const saveReceipt = async (updated: ReceiptItem): Promise<ReceiptItem> => {
  const saveIdentity = appDataSource === 'supabase'
    ? reserveReceiptSaveIdentity(updated)
    : null;
  let recoverCreatedReceipt: ((receipts: ReceiptItem[]) => ReceiptItem | undefined) | undefined;
  try {
    return await runReceiptMutation(
      saveIdentity?.supabaseId ?? String(updated.id),
      async ({ markRequestStarted, markCanonicalCommit }) => {
      let normalizedReceipt = normalizeReceipt({ ...updated });

      if (!normalizedReceipt.eid || !normalizedReceipt.contractorProfileId || !normalizedReceipt.title || normalizedReceipt.amount <= 0) {
        throw new Error('Vyplnte akci, nazev uctenky a castku.');
      }

      if (appDataSource === 'supabase') {
        if (!supabase || !isSupabaseConfigured) {
          console.error('Receipt save requires an available Supabase client');
          throw new Error(RECEIPT_WRITE_GENERIC_ERROR);
        }
        if (!saveIdentity) {
          console.error('Receipt save requires a stable identity');
          throw new Error(RECEIPT_WRITE_GENERIC_ERROR);
        }
        normalizedReceipt = {
          ...normalizedReceipt,
          supabaseId: saveIdentity.supabaseId,
        };
        const currentSnapshot = getLocalAppState();
        const currentLocalStableIds = [...new Set(
          (currentSnapshot.receipts ?? [])
            .filter((receipt) => receipt.id === updated.id)
            .map((receipt) => receipt.supabaseId)
            .filter((id): id is string => Boolean(id)),
        )];
        if (
          !updated.supabaseId
          && currentLocalStableIds.length > 0
          && !currentLocalStableIds.includes(saveIdentity.supabaseId)
        ) {
          throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
        }
        const existingMatches = (currentSnapshot.receipts ?? [])
          .filter((receipt) => receipt.supabaseId === saveIdentity.supabaseId);
        if (existingMatches.length > 1) {
          throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
        }
        let existing = existingMatches[0];
        if (saveIdentity.source === 'explicit' && !existing) {
          throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
        }
        if (saveIdentity.source === 'canonical' && !existing) {
          throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
        }
        const contractorRowId = normalizedReceipt.contractorProfileId;
        const eventRowId = resolveReceiptEventSupabaseId(
          normalizedReceipt,
          existing,
          currentSnapshot.events ?? [],
        );

        if (!contractorRowId || !eventRowId) {
          throw new Error(RECEIPT_INVALID_ERROR);
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
        };

        if (!existing) {
          if (normalizedReceipt.status !== 'draft') {
            throw new Error(RECEIPT_INVALID_ERROR);
          }
          normalizedReceipt = {
            ...normalizedReceipt,
            eventSupabaseId: eventRowId,
            status: 'draft',
          };
          const expectedReceipt = normalizedReceipt;
          recoverCreatedReceipt = (receipts) => {
            const matches = receipts.filter((receipt) => receipt.supabaseId === saveIdentity.supabaseId);
            if (matches.length !== 1 || !matchesCreatedReceipt(matches[0], expectedReceipt)) {
              return undefined;
            }
            clearReceiptCreateIntent(updated.id, saveIdentity.supabaseId);
            return matches[0];
          };

          if (saveIdentity.createIntent?.ambiguous) {
            let receipts: ReceiptItem[];
            try {
              receipts = await loadReceiptsSnapshot();
            } catch (recoveryError) {
              console.error('Authoritative receipt create preflight failed', recoveryError);
              throw new Error(RECEIPT_WRITE_GENERIC_ERROR);
            }
            advanceLifecycleSnapshotGeneration();
            commitReceiptsSnapshot(receipts);
            const recovered = recoverCreatedReceipt(receipts);
            if (recovered) return recovered;
            if (receipts.some((receipt) => receipt.supabaseId === saveIdentity.supabaseId)) {
              throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
            }
            saveIdentity.createIntent.ambiguous = false;
            existing = undefined;
          }
        }

        if (existing) {
          if (
            !existing.supabaseId
            || !existing.updatedAt
            || !DELETABLE_RECEIPT_STATUSES.includes(existing.status)
            || normalizedReceipt.status !== existing.status
          ) {
            throw new Error(RECEIPT_INVALID_ERROR);
          }
          markRequestStarted();
          const receiptUpdate = await supabase
            .from('receipts')
            .update(payload)
            .eq('id', existing.supabaseId)
            .eq('updated_at', existing.updatedAt)
            .eq('status', existing.status)
            .select('id,updated_at,event_id,status')
            .single();

          if (receiptUpdate.error) {
            throw mapReceiptWriteError('update', receiptUpdate.error);
          }
          if (
            receiptUpdate.data?.id !== existing.supabaseId
            || typeof receiptUpdate.data.updated_at !== 'string'
            || receiptUpdate.data.event_id !== eventRowId
            || receiptUpdate.data.status !== existing.status
          ) {
            console.error('Unexpected receipt update response', receiptUpdate.data);
            throw new Error(RECEIPT_WRITE_GENERIC_ERROR);
          }
          normalizedReceipt = {
            ...normalizedReceipt,
            supabaseId: receiptUpdate.data.id,
            updatedAt: receiptUpdate.data.updated_at,
            eventSupabaseId: receiptUpdate.data.event_id,
            status: receiptUpdate.data.status,
          };
        } else {
          if (saveIdentity.createIntent) {
            saveIdentity.createIntent.ambiguous = true;
          }
          markRequestStarted();
          const receiptInsert = await supabase
            .from('receipts')
            .insert({ id: saveIdentity.supabaseId, ...payload, status: 'draft' })
            .select('id,updated_at,event_id,status')
            .single();

          if (receiptInsert.error) {
            throw mapReceiptWriteError('create', receiptInsert.error);
          }
          if (
            receiptInsert.data?.id !== saveIdentity.supabaseId
            || typeof receiptInsert.data.updated_at !== 'string'
            || receiptInsert.data.event_id !== eventRowId
            || receiptInsert.data.status !== 'draft'
          ) {
            console.error('Unexpected receipt create response', receiptInsert.data);
            throw new Error(RECEIPT_WRITE_GENERIC_ERROR);
          }
          normalizedReceipt = {
            ...normalizedReceipt,
            updatedAt: receiptInsert.data.updated_at,
          };
        }
        markCanonicalCommit();
      }

      let committedReceipt: ReceiptItem | null = null;
      updateLocalAppState((snapshot) => {
        const stableMatch = normalizedReceipt.supabaseId
          ? snapshot.receipts.find((receipt) => receipt.supabaseId === normalizedReceipt.supabaseId)
          : undefined;
        const localMatch = stableMatch ?? snapshot.receipts.find((receipt) => receipt.id === normalizedReceipt.id);
        const eventMatch = normalizedReceipt.eventSupabaseId
          ? snapshot.events.find((event) => event.supabaseId === normalizedReceipt.eventSupabaseId)
          : undefined;
        committedReceipt = {
          ...normalizedReceipt,
          id: localMatch?.id ?? (
            snapshot.receipts.some((receipt) => receipt.id === normalizedReceipt.id)
              ? Math.max(0, ...snapshot.receipts.map((receipt) => receipt.id)) + 1
              : normalizedReceipt.id
          ),
          eid: eventMatch?.id ?? normalizedReceipt.eid,
        };

        return {
          ...snapshot,
          receipts: localMatch
            ? snapshot.receipts.map((receipt) => (
                receipt === localMatch ? committedReceipt! : receipt
              ))
            : [...snapshot.receipts, committedReceipt],
        };
      });

      if (!committedReceipt) throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
      clearReceiptCreateIntent(updated.id, committedReceipt.supabaseId ?? null);
      invalidateReceiptQueries();
      return committedReceipt;
      },
      { recover: (receipts) => recoverCreatedReceipt?.(receipts) },
    );
  } finally {
    releaseReceiptSaveIdentity(saveIdentity);
  }
};

export const deleteReceipt = async (id: number): Promise<{ id: number }> => runReceiptMutation(
  String(id),
  async ({ markRequestStarted, markCanonicalCommit }) => {
  const currentReceipt = (getLocalAppState().receipts ?? []).find((receipt) => receipt.id === id);
  if (!currentReceipt) {
    throw new Error(RECEIPT_DELETE_CONFLICT_ERROR);
  }

  if (!DELETABLE_RECEIPT_STATUSES.includes(currentReceipt.status)) {
    throw new Error(RECEIPT_DELETE_PROTECTED_ERROR);
  }

  const stableReceiptId = currentReceipt.supabaseId;

  if (appDataSource === 'supabase') {
    if (!supabase || !isSupabaseConfigured) {
      console.error('Receipt delete requires an available Supabase client');
      throw new Error(RECEIPT_DELETE_GENERIC_ERROR);
    }

    if (!stableReceiptId || !currentReceipt.updatedAt) {
      throw new Error(RECEIPT_DELETE_CONFLICT_ERROR);
    }

    markRequestStarted();
    const receiptDelete = await supabase
      .from('receipts')
      .delete()
      .eq('id', stableReceiptId)
      .eq('updated_at', currentReceipt.updatedAt)
      .in('status', DELETABLE_RECEIPT_STATUSES)
      .select('id')
      .single();

    if (receiptDelete.error) {
      throw mapReceiptDeleteError(receiptDelete.error);
    }

    if (receiptDelete.data?.id !== stableReceiptId) {
      console.error('Unexpected receipt delete response', receiptDelete.data);
      throw new Error(RECEIPT_DELETE_GENERIC_ERROR);
    }
    markCanonicalCommit();
  }

  clearReceiptCreateIntent(id, stableReceiptId ?? null);

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.filter((receipt) => (
      stableReceiptId ? receipt.supabaseId !== stableReceiptId : receipt.id !== id
    )),
  }));

  invalidateReceiptQueries();
  return { id };
  },
);

export const markApprovedReceiptsAsAttached = async (): Promise<ReceiptItem[]> => {
  if (appDataSource === 'supabase') {
    throw new Error('Změnu účtenek musí dokončit atomická operace s fakturou.');
  }
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

  invalidateReceiptQueries();
  return updatedReceipts;
};

export const markReceiptsAsAttached = async (receiptIds: number[]): Promise<ReceiptItem[]> => {
  if (appDataSource === 'supabase') {
    throw new Error('Změnu účtenek musí dokončit atomická operace s fakturou.');
  }
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

  invalidateReceiptQueries();
  return updatedReceipts;
};

export const markReceiptsAsReimbursedForInvoice = async (
  eventId: number,
  contractorProfileId: string,
): Promise<ReceiptItem[]> => {
  if (appDataSource === 'supabase') {
    throw new Error('Změnu účtenek musí dokončit atomická operace s fakturou.');
  }
  const updatedReceipts: ReceiptItem[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.map((receipt) => {
      if (receipt.eid !== eventId || receipt.contractorProfileId !== contractorProfileId || receipt.status !== 'attached') return receipt;

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
  if (appDataSource === 'supabase') {
    throw new Error('Změnu účtenek musí dokončit atomická operace s fakturou.');
  }
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

  invalidateReceiptQueries();
  return updatedReceipts;
};

export const subscribeToReceiptChanges = (listener: () => void): (() => void) => {
  ensureSupabaseReceiptsLoaded();
  return subscribeToLocalAppState(() => listener());
};

export const resetSupabaseReceiptsHydration = () => {
  receiptsHydrationEpoch += 1;
  receiptsHydrationPromise = null;
  receiptsLoaded = false;
  receiptCreateIntentByLocalId.clear();
};
