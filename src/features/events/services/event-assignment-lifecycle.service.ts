import { supabase } from '../../../lib/supabase';
import type { Timelog, TimelogStatus } from '../../../types';

const GENERIC_ERROR_MESSAGE = 'Operaci s Crew se nepodařilo dokončit.';

const ERROR_MESSAGES = {
  crew_lifecycle_unauthorized: 'Tuto akci může provést pouze CrewHead nebo COO.',
  crew_lifecycle_not_found: 'Akce nebo člen Crew nebyl nalezen.',
  crew_assignment_conflict: 'Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.',
  crew_assignment_invalid_days: 'Pro přiřazení Crew nejsou k dispozici platné směny.',
  crew_removal_blocked: 'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.',
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
    .find((token) => rawMessage.includes(token));

  if (matchedToken) {
    return new Error(ERROR_MESSAGES[matchedToken]);
  }

  console.error('Unexpected Crew lifecycle RPC error', error);
  return new Error(GENERIC_ERROR_MESSAGE);
};

const assertRpcResponse = (data: unknown): Record<string, unknown> => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  return data as Record<string, unknown>;
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

  return assertRpcResponse(result.data) as unknown as AssignEventCrewRpcResult;
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

  return assertRpcResponse(result.data) as unknown as RemoveEventCrewRpcResult;
};
