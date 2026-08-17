import { supabase } from '../../../lib/supabase';
import type { Timelog, TimelogStatus } from '../../../types';

const GENERIC_ERROR_MESSAGE = 'Operaci s výkazem se nepodařilo dokončit.';

const ERROR_MESSAGES = {
  timelog_mutation_invalid: 'Výkaz obsahuje neplatné údaje nebo směny.',
  timelog_mutation_not_found: 'Výkaz už neexistuje nebo k němu nemáte přístup.',
  timelog_mutation_conflict: 'Výkaz se mezitím změnil. Obnovte data a zkuste to znovu.',
  timelog_mutation_blocked: 'Výkaz v tomto stavu nelze smazat.',
  timelog_import_unauthorized: 'Import schváleného výkazu může provést pouze COO.',
} as const;

const TIMELOG_STATUSES: readonly TimelogStatus[] = [
  'draft',
  'pending_crew_confirmation',
  'pending_ch',
  'pending_coo',
  'approved',
  'invoiced',
  'paid',
  'rejected',
];

export interface TimelogMutationRpcResult {
  id: string;
  updated_at: string;
  status: TimelogStatus;
}

export interface TimelogStatusMutationTarget {
  id: string;
  expectedUpdatedAt: string;
}

interface TimelogWriteRpcInput {
  timelogId: string | null;
  eventId: string;
  contractorId: string;
  expectedUpdatedAt: string | null;
  expectedStatus: TimelogStatus | null;
  km: number;
  note: string;
  days: Timelog['days'];
}

interface SaveTimelogRpcInput extends TimelogWriteRpcInput {
  status: TimelogStatus;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isTimelogStatus = (value: unknown): value is TimelogStatus => (
  typeof value === 'string' && TIMELOG_STATUSES.includes(value as TimelogStatus)
);

const parseMutationResult = (data: unknown): TimelogMutationRpcResult => {
  if (
    !isRecord(data)
    || typeof data.id !== 'string'
    || data.id.length === 0
    || typeof data.updated_at !== 'string'
    || data.updated_at.length === 0
    || !isTimelogStatus(data.status)
  ) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  return {
    id: data.id,
    updated_at: data.updated_at,
    status: data.status,
  };
};

const parseMutationResults = (data: unknown): TimelogMutationRpcResult[] => {
  if (!Array.isArray(data)) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  return data.map(parseMutationResult);
};

const toDomainError = (error: unknown): Error => {
  const rawMessage = isRecord(error) && typeof error.message === 'string'
    ? error.message
    : '';
  const token = (Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>)
    .find((candidate) => (
      new RegExp(`(^|[^A-Za-z0-9_])${candidate}($|[^A-Za-z0-9_])`).test(rawMessage)
    ));

  if (token) {
    return new Error(ERROR_MESSAGES[token]);
  }

  console.error('Unexpected timelog mutation RPC error', error);
  return new Error(GENERIC_ERROR_MESSAGE);
};

const normalizeDays = (days: Timelog['days']) => (
  days
    .map(({ d, f, t, type, note }) => ({
      date: d,
      time_from: f,
      time_to: t,
      day_type: type,
      note: note?.trim() || null,
    }))
    .sort((left, right) => (
      `${left.date}\u0000${left.time_from}\u0000${left.time_to}\u0000${left.day_type}\u0000${left.note ?? ''}`
        .localeCompare(
          `${right.date}\u0000${right.time_from}\u0000${right.time_to}\u0000${right.day_type}\u0000${right.note ?? ''}`,
        )
    ))
);

const assertClient = () => {
  if (!supabase) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
  return supabase;
};

export const saveTimelogAtomicRpc = async (
  input: SaveTimelogRpcInput,
): Promise<TimelogMutationRpcResult> => {
  const result = await assertClient().rpc('save_timelog_atomic', {
    p_timelog_id: input.timelogId,
    p_event_id: input.eventId,
    p_contractor_id: input.contractorId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_expected_status: input.expectedStatus,
    p_km: input.km,
    p_note: input.note,
    p_status: input.status,
    p_days: normalizeDays(input.days),
  });

  if (result.error) {
    throw toDomainError(result.error);
  }

  return parseMutationResult(result.data);
};

export const transitionTimelogStatusesAtomicRpc = async ({
  targets,
  expectedStatus,
  nextStatus,
}: {
  targets: TimelogStatusMutationTarget[];
  expectedStatus: TimelogStatus;
  nextStatus: TimelogStatus;
}): Promise<TimelogMutationRpcResult[]> => {
  const sortedTargets = [...targets]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, expectedUpdatedAt }) => ({
      id,
      expected_updated_at: expectedUpdatedAt,
    }));
  const result = await assertClient().rpc('transition_timelog_statuses_atomic', {
    p_targets: sortedTargets,
    p_expected_status: expectedStatus,
    p_next_status: nextStatus,
  });

  if (result.error) {
    throw toDomainError(result.error);
  }

  return parseMutationResults(result.data);
};

export const deleteTimelogAtomicRpc = async ({
  id,
  expectedUpdatedAt,
  expectedStatus,
}: {
  id: string;
  expectedUpdatedAt: string;
  expectedStatus: TimelogStatus;
}): Promise<TimelogMutationRpcResult> => {
  const result = await assertClient().rpc('delete_timelog_atomic', {
    p_timelog_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_expected_status: expectedStatus,
  });

  if (result.error) {
    throw toDomainError(result.error);
  }

  return parseMutationResult(result.data);
};

export const importApprovedTimelogAtomicRpc = async (
  input: TimelogWriteRpcInput,
): Promise<TimelogMutationRpcResult> => {
  const result = await assertClient().rpc('import_approved_timelog_atomic', {
    p_timelog_id: input.timelogId,
    p_event_id: input.eventId,
    p_contractor_id: input.contractorId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_expected_status: input.expectedStatus,
    p_km: input.km,
    p_note: input.note,
    p_days: normalizeDays(input.days),
  });

  if (result.error) {
    throw toDomainError(result.error);
  }

  return parseMutationResult(result.data);
};
