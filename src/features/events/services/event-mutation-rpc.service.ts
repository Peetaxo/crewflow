import { supabase } from '../../../lib/supabase';

const GENERIC_ERROR_MESSAGE = 'Akci se nepodařilo smazat.';

const ERROR_MESSAGES = {
  event_has_protected_timelogs: 'Akci nelze smazat, protože obsahuje chráněné výkazy.',
  event_has_protected_receipts: 'Akci nelze smazat, protože obsahuje chráněné účtenky.',
  event_delete_conflict: 'Akce se mezitím změnila. Obnovte data a zkuste to znovu.',
  event_not_found: 'Akce už neexistuje nebo k ní nemáte přístup.',
} as const;

export interface EventDeleteRpcResult {
  eventId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

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

  console.error('Unexpected atomic event delete RPC error', error);
  return new Error(GENERIC_ERROR_MESSAGE);
};

const parseDeleteResult = (data: unknown, expectedEventId: string): EventDeleteRpcResult => {
  if (
    !Array.isArray(data)
    || data.length !== 1
    || !isRecord(data[0])
    || data[0].event_id !== expectedEventId
  ) {
    console.error('Unexpected atomic event delete response', data);
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  return { eventId: expectedEventId };
};

export const deleteEventAtomicRpc = async (
  eventId: string,
  expectedUpdatedAt: string,
): Promise<EventDeleteRpcResult> => {
  if (!supabase) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  const result = await supabase.rpc('delete_event_atomic', {
    p_event_id: eventId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (result.error) {
    throw toDomainError(result.error);
  }

  return parseDeleteResult(result.data, eventId);
};
