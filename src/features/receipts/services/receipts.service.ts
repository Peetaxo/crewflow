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

const requireCurrentReceiptMutationEpoch = (
  expectedEpoch: number | undefined,
  errorMessage = RECEIPT_WRITE_GENERIC_ERROR,
): void => {
  if (expectedEpoch !== undefined && expectedEpoch !== receiptsHydrationEpoch) {
    throw new Error(errorMessage);
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

const receiptWriteErrorCouldHaveCommitted = (
  error: unknown,
  operation: 'insert' | 'update',
): boolean => {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : '';
  if (code === 'PGRST116' || code === '42501') return false;
  if (code.startsWith('23')) return operation === 'insert' && code === '23505';
  return true;
};

interface ReceiptMutationControl {
  markRequestStarted: () => void;
  markCanonicalCommit: () => void;
}

interface ReceiptMutationOptions<T> {
  recover?: (receipts: ReceiptItem[]) => T | undefined;
  shouldRecover?: (error: unknown) => boolean;
  expectedEpoch?: number;
  epochErrorMessage?: string;
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
  eventRows: NonNullable<Awaited<ReturnType<typeof supabase.from<'events'>>>['data']>,
) => {
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

  const [receiptsResult, eventsResult] = await Promise.all([
    supabase.from('receipts').select('*').order('created_at'),
    supabase.from('events').select('id').order('date_from').order('name'),
  ]);

  const firstError = receiptsResult.error ?? eventsResult.error;
  if (firstError) {
    console.error('Unexpected receipt hydration error', firstError);
    throw new Error('Účtenky se nepodařilo načíst.');
  }

  return mapSupabaseReceipts(
    receiptsResult.data ?? [],
    eventsResult.data ?? [],
  );
};

const commitReceiptsSnapshot = (
  receipts: ReceiptItem[],
  expectedEpoch?: number,
  epochErrorMessage?: string,
): void => {
  requireCurrentReceiptMutationEpoch(expectedEpoch, epochErrorMessage);
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts,
  }));
  requireCurrentReceiptMutationEpoch(expectedEpoch, epochErrorMessage);
  queryClient.setQueryData(queryKeys.receipts.all, receipts);
};

type ReceiptHydrationAttempt = {
  receipts: ReceiptItem[];
  committed: boolean;
  retryForGeneration: boolean;
};

const loadAndCommitReceiptsSnapshot = async (
  expectedEpoch: number,
): Promise<ReceiptHydrationAttempt> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return {
      receipts: getLocalAppState().receipts ?? [],
      committed: true,
      retryForGeneration: false,
    };
  }
  if (expectedEpoch !== receiptsHydrationEpoch) {
    return {
      receipts: getLocalAppState().receipts ?? [],
      committed: false,
      retryForGeneration: false,
    };
  }

  const generation = getLifecycleSnapshotGeneration();
  const receipts = await loadReceiptsSnapshot();
  if (expectedEpoch !== receiptsHydrationEpoch) {
    return {
      receipts: getLocalAppState().receipts ?? [],
      committed: false,
      retryForGeneration: false,
    };
  }
  if (generation !== getLifecycleSnapshotGeneration()) {
    return {
      receipts: getLocalAppState().receipts ?? [],
      committed: false,
      retryForGeneration: true,
    };
  }
  if (expectedEpoch !== receiptsHydrationEpoch) {
    return {
      receipts: getLocalAppState().receipts ?? [],
      committed: false,
      retryForGeneration: false,
    };
  }
  commitReceiptsSnapshot(receipts, expectedEpoch);
  return { receipts, committed: true, retryForGeneration: false };
};

const loadAndCommitReceiptsSnapshotWithRetry = async (
  expectedEpoch: number,
): Promise<ReceiptHydrationAttempt> => {
  const firstAttempt = await loadAndCommitReceiptsSnapshot(expectedEpoch);
  if (firstAttempt.committed || !firstAttempt.retryForGeneration) {
    return firstAttempt;
  }
  if (expectedEpoch !== receiptsHydrationEpoch) {
    return {
      receipts: getLocalAppState().receipts ?? [],
      committed: false,
      retryForGeneration: false,
    };
  }
  return loadAndCommitReceiptsSnapshot(expectedEpoch);
};

export const fetchReceiptsSnapshot = async (): Promise<ReceiptItem[]> => {
  const hydrationEpoch = receiptsHydrationEpoch;
  return (await loadAndCommitReceiptsSnapshotWithRetry(hydrationEpoch)).receipts;
};

const runReceiptMutation = <T>(
  key: string,
  mutation: (control: ReceiptMutationControl) => Promise<T>,
  options: ReceiptMutationOptions<T> = {},
): Promise<T> => runLifecycleDataMutation([`receipt:${key}`], async () => {
  const usesSupabase = appDataSource === 'supabase';
  const epochErrorMessage = options.epochErrorMessage ?? RECEIPT_WRITE_GENERIC_ERROR;
  let requestStarted = false;
  let canonicalGenerationAdvanced = false;
  if (usesSupabase) {
    requireCurrentReceiptMutationEpoch(options.expectedEpoch, epochErrorMessage);
  }
  if (usesSupabase) {
    advanceLifecycleSnapshotGeneration();
  }

  const markCanonicalCommit = () => {
    requireCurrentReceiptMutationEpoch(options.expectedEpoch, epochErrorMessage);
    if (usesSupabase && !canonicalGenerationAdvanced) {
      advanceLifecycleSnapshotGeneration();
      canonicalGenerationAdvanced = true;
    }
  };

  try {
    const result = await mutation({
      markRequestStarted: () => { requestStarted = true; },
      markCanonicalCommit,
    });
    requireCurrentReceiptMutationEpoch(options.expectedEpoch, epochErrorMessage);
    return result;
  } catch (error) {
    if (usesSupabase && options.expectedEpoch !== undefined && options.expectedEpoch !== receiptsHydrationEpoch) {
      throw new Error(epochErrorMessage);
    }
    if (
      usesSupabase
      && requestStarted
      && supabase
      && isSupabaseConfigured
      && (options.shouldRecover?.(error) ?? true)
    ) {
      try {
        const receipts = await loadReceiptsSnapshot();
        requireCurrentReceiptMutationEpoch(options.expectedEpoch, epochErrorMessage);
        const recovered = options.recover?.(receipts);
        if (!options.recover || recovered !== undefined) {
          markCanonicalCommit();
          commitReceiptsSnapshot(receipts, options.expectedEpoch, epochErrorMessage);
          if (recovered !== undefined) {
            return recovered;
          }
        }
      } catch (recoveryError) {
        console.error('Unexpected receipt mutation recovery error', recoveryError);
      }
    }
    throw error;
  }
});

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
  const hydrationPromise = loadAndCommitReceiptsSnapshotWithRetry(hydrationEpoch)
    .then((result) => {
      if (result.committed && hydrationEpoch === receiptsHydrationEpoch) {
        receiptsLoaded = true;
      }
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist uctenky ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      if (receiptsHydrationPromise === hydrationPromise) {
        receiptsHydrationPromise = null;
      }
    });
  receiptsHydrationPromise = hydrationPromise;
};

const invalidateReceiptQueries = () => {
  queryClient.setQueryData(queryKeys.receipts.all, getLocalAppState().receipts ?? []);
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
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

export const updateReceiptStatus = async (id: number, action: ReceiptAction): Promise<ReceiptItem> => {
  const mutationEpoch = receiptsHydrationEpoch;
  const initiatingSnapshot = getLocalAppState();
  const initiatingMatches = appDataSource === 'supabase'
    ? (initiatingSnapshot.receipts ?? []).filter((receipt) => receipt.id === id)
    : [];
  const initiatingReceipt = initiatingMatches.length === 1
    ? { ...initiatingMatches[0] }
    : null;

  if (
    appDataSource === 'supabase'
    && (
      !initiatingReceipt?.supabaseId
      || !initiatingReceipt.updatedAt
      || initiatingMatches.length !== 1
      || initiatingSnapshot.receipts.filter(
        (receipt) => receipt.supabaseId === initiatingReceipt.supabaseId,
      ).length !== 1
    )
  ) {
    throw new Error(RECEIPT_INVALID_ERROR);
  }

  return runReceiptMutation(
    initiatingReceipt?.supabaseId ?? String(id),
    async ({ markRequestStarted, markCanonicalCommit }) => {
  requireCurrentReceiptMutationEpoch(
    appDataSource === 'supabase' ? mutationEpoch : undefined,
    RECEIPT_WRITE_GENERIC_ERROR,
  );
  const statusMap: Record<ReceiptAction, ReceiptStatus> = {
    submit: 'submitted',
    approve: 'approved',
    reimburse: 'reimbursed',
    reject: 'rejected',
  };
  const nextStatus = statusMap[action];
  const currentReceipt = initiatingReceipt
    ?? (getLocalAppState().receipts ?? []).find((receipt) => receipt.id === id);
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
    requireCurrentReceiptMutationEpoch(mutationEpoch, RECEIPT_WRITE_GENERIC_ERROR);
    markCanonicalCommit();
    const currentStableMatches = (getLocalAppState().receipts ?? [])
      .filter((receipt) => receipt.supabaseId === currentReceipt.supabaseId);
    if (currentStableMatches.length !== 1) {
      throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
    }
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
    {
      expectedEpoch: appDataSource === 'supabase' ? mutationEpoch : undefined,
      epochErrorMessage: RECEIPT_WRITE_GENERIC_ERROR,
    },
  );
};

const matchesSavedReceipt = (actual: ReceiptItem, expected: ReceiptItem): boolean => (
  actual.supabaseId === expected.supabaseId
  && actual.eventSupabaseId === expected.eventSupabaseId
  && actual.contractorProfileId === expected.contractorProfileId
  && actual.job === expected.job
  && actual.title === expected.title
  && actual.vendor === expected.vendor
  && actual.amount === expected.amount
  && actual.paidAt === expected.paidAt
  && actual.note === expected.note
  && actual.status === expected.status
);

const commitSavedReceipt = (
  receipt: ReceiptItem,
  preferredLocalId: number,
  expectedEpoch?: number,
): ReceiptItem => {
  requireCurrentReceiptMutationEpoch(expectedEpoch);
  let committedReceipt: ReceiptItem | null = null;
  updateLocalAppState((snapshot) => {
    const stableMatchIndex = receipt.supabaseId
      ? snapshot.receipts.findIndex((item) => item.supabaseId === receipt.supabaseId)
      : -1;
    const currentReceipt = stableMatchIndex >= 0 ? snapshot.receipts[stableMatchIndex] : undefined;
    const eventMatch = receipt.eventSupabaseId
      ? snapshot.events.find((event) => event.supabaseId === receipt.eventSupabaseId)
      : snapshot.events.find((event) => event.id === receipt.eid);
    const localId = currentReceipt?.id ?? (
      snapshot.receipts.some((item) => item.id === preferredLocalId)
        ? Math.max(0, ...snapshot.receipts.map((item) => item.id)) + 1
        : preferredLocalId
    );
    committedReceipt = {
      ...receipt,
      id: localId,
      eid: eventMatch?.id ?? receipt.eid,
    };
    return {
      ...snapshot,
      receipts: stableMatchIndex >= 0
        ? snapshot.receipts.map((item, index) => (index === stableMatchIndex ? committedReceipt! : item))
        : [...snapshot.receipts, committedReceipt],
    };
  });
  requireCurrentReceiptMutationEpoch(expectedEpoch);
  if (!committedReceipt) throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
  return committedReceipt;
};

export const saveReceipt = async (updated: ReceiptItem): Promise<ReceiptItem> => {
  const mutationEpoch = receiptsHydrationEpoch;
  let operation: 'insert' | 'update' = 'insert';
  let expectedReceipt: ReceiptItem | null = null;
  try {
    return await runReceiptMutation(
      updated.supabaseId ?? `missing:${updated.id}`,
      async ({ markRequestStarted, markCanonicalCommit }) => {
        if (appDataSource === 'supabase') {
          requireCurrentReceiptMutationEpoch(mutationEpoch);
        }
        let normalizedReceipt = normalizeReceipt({ ...updated });
        if (!normalizedReceipt.eid || !normalizedReceipt.contractorProfileId || !normalizedReceipt.title || normalizedReceipt.amount <= 0) {
          throw new Error('Vyplnte akci, nazev uctenky a castku.');
        }

        if (appDataSource === 'supabase') {
          if (!updated.supabaseId || !updated.eventSupabaseId) {
            throw new Error(RECEIPT_INVALID_ERROR);
          }
          if (!supabase || !isSupabaseConfigured) {
            console.error('Receipt save requires an available Supabase client and stable identity');
            throw new Error(RECEIPT_WRITE_GENERIC_ERROR);
          }

          const currentSnapshot = getLocalAppState();
          const eventMatches = (currentSnapshot.events ?? []).filter((event) => (
            event.supabaseId === updated.eventSupabaseId
          ));
          if (eventMatches.length !== 1) {
            throw new Error(RECEIPT_INVALID_ERROR);
          }
          const existingMatches = (currentSnapshot.receipts ?? []).filter((receipt) => (
            receipt.supabaseId === updated.supabaseId
          ));
          if (existingMatches.length > 1) {
            throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
          }
          const existing = existingMatches[0];
          if (existing) {
            if (
              !existing.updatedAt
              || (updated.updatedAt !== undefined && updated.updatedAt !== existing.updatedAt)
            ) {
              throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
            }
            if (
              !DELETABLE_RECEIPT_STATUSES.includes(existing.status)
              || normalizedReceipt.status !== existing.status
            ) {
              throw new Error(RECEIPT_INVALID_ERROR);
            }
            normalizedReceipt = {
              ...normalizedReceipt,
              id: existing.id,
              updatedAt: existing.updatedAt,
              status: existing.status,
            };
            operation = 'update';
          } else {
            if (updated.updatedAt !== undefined) {
              throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
            }
            if (normalizedReceipt.status !== 'draft') {
              throw new Error(RECEIPT_INVALID_ERROR);
            }
            normalizedReceipt = { ...normalizedReceipt, updatedAt: undefined, status: 'draft' };
            operation = 'insert';
          }
          normalizedReceipt = {
            ...normalizedReceipt,
            supabaseId: updated.supabaseId,
            eventSupabaseId: updated.eventSupabaseId,
            eid: eventMatches[0].id,
          };
          expectedReceipt = normalizedReceipt;

          const payload = {
            contractor_id: normalizedReceipt.contractorProfileId,
            event_id: updated.eventSupabaseId,
            job_number: normalizedReceipt.job,
            name: normalizedReceipt.title,
            supplier: normalizedReceipt.vendor,
            amount: normalizedReceipt.amount,
            paid_at: normalizedReceipt.paidAt,
            note: normalizedReceipt.note,
          };
          requireCurrentReceiptMutationEpoch(mutationEpoch);
          markRequestStarted();
          const result = operation === 'update'
            ? await supabase
                .from('receipts')
                .update(payload)
                .eq('id', updated.supabaseId)
                .eq('updated_at', normalizedReceipt.updatedAt!)
                .eq('status', normalizedReceipt.status)
                .select('id,updated_at,event_id,status')
                .single()
            : await supabase
                .from('receipts')
                .insert({ id: updated.supabaseId, ...payload, status: 'draft' })
                .select('id,updated_at,event_id,status')
                .single();
          requireCurrentReceiptMutationEpoch(mutationEpoch);

          if (result.error) throw result.error;
          if (
            result.data?.id !== updated.supabaseId
            || typeof result.data.updated_at !== 'string'
            || result.data.event_id !== updated.eventSupabaseId
            || result.data.status !== normalizedReceipt.status
          ) {
            console.error(`Unexpected receipt ${operation} response`, result.data);
            throw new Error(RECEIPT_WRITE_GENERIC_ERROR);
          }
          markCanonicalCommit();
          normalizedReceipt = {
            ...normalizedReceipt,
            supabaseId: result.data.id,
            updatedAt: result.data.updated_at,
            eventSupabaseId: result.data.event_id,
            status: result.data.status,
          };
        }

        if (appDataSource !== 'supabase') {
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
        }

        requireCurrentReceiptMutationEpoch(mutationEpoch);
        const committedReceipt = commitSavedReceipt(
          normalizedReceipt,
          updated.id,
          mutationEpoch,
        );
        requireCurrentReceiptMutationEpoch(mutationEpoch);
        invalidateReceiptQueries();
        return committedReceipt;
      },
      {
        expectedEpoch: appDataSource === 'supabase' ? mutationEpoch : undefined,
        epochErrorMessage: RECEIPT_WRITE_GENERIC_ERROR,
        shouldRecover: (error) => Boolean(expectedReceipt)
          && receiptWriteErrorCouldHaveCommitted(error, operation),
        recover: (receipts) => {
          if (!expectedReceipt?.supabaseId) return undefined;
          const matches = receipts.filter((receipt) => receipt.supabaseId === expectedReceipt!.supabaseId);
          if (matches.length !== 1 || !matchesSavedReceipt(matches[0], expectedReceipt)) {
            return undefined;
          }
          return matches[0];
        },
      },
    );
  } catch (error) {
    if (error instanceof Error && [
      RECEIPT_WRITE_GENERIC_ERROR,
      RECEIPT_WRITE_CONFLICT_ERROR,
      RECEIPT_WRITE_UNAUTHORIZED_ERROR,
      RECEIPT_INVALID_ERROR,
      'Vyplnte akci, nazev uctenky a castku.',
    ].includes(error.message)) {
      throw error;
    }
    throw mapReceiptWriteError(operation === 'insert' ? 'create' : 'update', error);
  }
};

export const deleteReceipt = async (id: number): Promise<{ id: number }> => {
  const mutationEpoch = receiptsHydrationEpoch;
  const initiatingSnapshot = getLocalAppState();
  const initiatingMatches = appDataSource === 'supabase'
    ? (initiatingSnapshot.receipts ?? []).filter((receipt) => receipt.id === id)
    : [];
  const initiatingReceipt = initiatingMatches.length === 1
    ? { ...initiatingMatches[0] }
    : null;

  if (
    appDataSource === 'supabase'
    && (
      !initiatingReceipt?.supabaseId
      || !initiatingReceipt.updatedAt
      || initiatingMatches.length !== 1
      || initiatingSnapshot.receipts.filter(
        (receipt) => receipt.supabaseId === initiatingReceipt.supabaseId,
      ).length !== 1
    )
  ) {
    throw new Error(RECEIPT_DELETE_CONFLICT_ERROR);
  }

  return runReceiptMutation(
    initiatingReceipt?.supabaseId ?? String(id),
    async ({ markRequestStarted, markCanonicalCommit }) => {
  requireCurrentReceiptMutationEpoch(
    appDataSource === 'supabase' ? mutationEpoch : undefined,
    RECEIPT_DELETE_GENERIC_ERROR,
  );
  const currentReceipt = initiatingReceipt
    ?? (getLocalAppState().receipts ?? []).find((receipt) => receipt.id === id);
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
    requireCurrentReceiptMutationEpoch(mutationEpoch, RECEIPT_DELETE_GENERIC_ERROR);
    markCanonicalCommit();
  }

  const currentStableMatches = stableReceiptId
    ? (getLocalAppState().receipts ?? [])
      .filter((receipt) => receipt.supabaseId === stableReceiptId)
    : [];
  if (stableReceiptId && currentStableMatches.length > 1) {
    throw new Error(RECEIPT_DELETE_CONFLICT_ERROR);
  }
  const deletedLocalId = currentStableMatches[0]?.id ?? id;
  requireCurrentReceiptMutationEpoch(
    appDataSource === 'supabase' ? mutationEpoch : undefined,
    RECEIPT_DELETE_GENERIC_ERROR,
  );
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    receipts: snapshot.receipts.filter((receipt) => (
      stableReceiptId ? receipt.supabaseId !== stableReceiptId : receipt.id !== id
    )),
  }));

  invalidateReceiptQueries();
  return { id: deletedLocalId };
    },
    {
      expectedEpoch: appDataSource === 'supabase' ? mutationEpoch : undefined,
      epochErrorMessage: RECEIPT_DELETE_GENERIC_ERROR,
    },
  );
};

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
  void queryClient.cancelQueries({ queryKey: queryKeys.receipts.all });
};
