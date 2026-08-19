import { supabase } from '../../../lib/supabase';
import type { Timelog, TimelogStatus } from '../../../types';

const GENERIC_ERROR_MESSAGE = 'Operaci s Crew se nepodařilo dokončit.';

const ERROR_MESSAGES = {
  crew_lifecycle_unauthorized: 'Tuto akci může provést pouze CrewHead nebo COO.',
  crew_lifecycle_not_found: 'Akce nebo člen Crew nebyl nalezen.',
  crew_assignment_conflict: 'Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.',
  crew_assignment_invalid_days: 'Pro přiřazení Crew nejsou k dispozici platné směny.',
  crew_removal_blocked: 'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.',
  crew_application_conflict: 'Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.',
  crew_withdrawal_conflict: 'Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.',
} as const;

export interface AssignEventCrewRpcResult {
  event_id: string;
  profile_id: string;
  assignment_id: string;
  timelog_id: string;
  application_id: string | null;
  timelog_created: boolean;
  crew_filled: number;
}

export interface RemoveEventCrewRpcResult {
  event_id: string;
  profile_id: string;
  application_id: string | null;
  assignment_removed: boolean;
  timelog_removed: boolean;
  crew_filled: number;
}

const toDomainError = (error: unknown): Error => {
  const rawMessage = typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message
    : '';

  const matchedToken = (Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>)
    .find((token) => new RegExp(`(^|[^A-Za-z0-9_])${token}($|[^A-Za-z0-9_])`).test(rawMessage));

  if (matchedToken) {
    return new Error(ERROR_MESSAGES[matchedToken]);
  }

  console.error('Unexpected Crew lifecycle RPC error', error);
  return new Error(GENERIC_ERROR_MESSAGE);
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isNonemptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0
);

const isApplicationId = (value: unknown): value is string | null => (
  value === null || isNonemptyString(value)
);

const isCrewCount = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && Number.isInteger(value)
  && value >= 0
);

const assertAssignEventCrewRpcResult = (data: unknown): asserts data is AssignEventCrewRpcResult => {
  if (
    !isRecord(data)
    || !isNonemptyString(data.event_id)
    || !isNonemptyString(data.profile_id)
    || !isNonemptyString(data.assignment_id)
    || !isNonemptyString(data.timelog_id)
    || !isApplicationId(data.application_id)
    || typeof data.timelog_created !== 'boolean'
    || !isCrewCount(data.crew_filled)
  ) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
};

const assertRemoveEventCrewRpcResult = (data: unknown): asserts data is RemoveEventCrewRpcResult => {
  if (
    !isRecord(data)
    || !isNonemptyString(data.event_id)
    || !isNonemptyString(data.profile_id)
    || !isApplicationId(data.application_id)
    || typeof data.assignment_removed !== 'boolean'
    || typeof data.timelog_removed !== 'boolean'
    || !isCrewCount(data.crew_filled)
  ) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
};

export const isDisposableTimelogStatus = (status: TimelogStatus): boolean => (
  status === 'draft' || status === 'rejected'
);

export const assignEventCrewRpc = async ({
  eventId,
  profileId,
  applicationId,
  days,
}: {
  eventId: string;
  profileId: string;
  applicationId?: string | null;
  days: Timelog['days'];
}): Promise<AssignEventCrewRpcResult> => {
  if (!supabase) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  const result = await supabase.rpc('assign_event_crew', {
    p_event_id: eventId,
    p_profile_id: profileId,
    p_application_id: applicationId ?? null,
    p_days: days.map(({ d, f, t, type, note }) => ({
      date: d,
      time_from: f,
      time_to: t,
      day_type: type,
      note: note?.trim() || null,
    })),
  });

  if (result.error) {
    throw toDomainError(result.error);
  }

  assertAssignEventCrewRpcResult(result.data);
  return result.data;
};

export const removeEventCrewRpc = async (
  eventId: string,
  profileId: string,
): Promise<RemoveEventCrewRpcResult> => {
  if (!supabase) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  const result = await supabase.rpc('remove_event_crew', {
    p_event_id: eventId,
    p_profile_id: profileId,
  });

  if (result.error) {
    throw toDomainError(result.error);
  }

  assertRemoveEventCrewRpcResult(result.data);
  return result.data;
};

export const approveEventWithdrawalRpc = async (
  eventId: string,
  profileId: string,
  applicationId: string,
): Promise<RemoveEventCrewRpcResult> => {
  if (!supabase) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  const result = await supabase.rpc('approve_event_withdrawal', {
    p_event_id: eventId,
    p_profile_id: profileId,
    p_application_id: applicationId,
  });

  if (result.error) {
    throw toDomainError(result.error);
  }

  assertRemoveEventCrewRpcResult(result.data);
  return result.data;
};
