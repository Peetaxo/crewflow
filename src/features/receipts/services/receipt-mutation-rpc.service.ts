import type { Json } from '../../../lib/database.types';
import { supabase } from '../../../lib/supabase';
import type { ReceiptStatus } from '../../../types';

const GENERIC_ERROR_MESSAGE = 'Operaci s účtenkami se nepodařilo dokončit.';

const ERROR_MESSAGES = {
  receipt_mutation_invalid: 'Účtenky obsahují neplatné nebo neúplné údaje.',
  receipt_mutation_conflict: 'Účtenky se mezitím změnily. Obnovte data a zkuste to znovu.',
  receipt_mutation_unauthorized: 'K této operaci s účtenkami nemáte oprávnění.',
} as const;

export interface ReceiptMutationTarget {
  id: string;
  expected_updated_at: string;
}

export interface ReceiptMutationResult {
  id: string;
  status: ReceiptStatus;
  updatedAt: string;
}

export interface TransitionReceiptStatusesInput {
  receipts: ReceiptMutationTarget[];
  expectedStatus: ReceiptStatus;
  nextStatus: ReceiptStatus;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const hasText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const toDomainError = (error: unknown): Error => {
  const rawMessage = isRecord(error) && typeof error.message === 'string' ? error.message : '';
  const token = (Object.keys(ERROR_MESSAGES) as Array<keyof typeof ERROR_MESSAGES>)
    .find((candidate) => (
      new RegExp(`(^|[^A-Za-z0-9_])${candidate}($|[^A-Za-z0-9_])`).test(rawMessage)
    ));

  if (token) {
    return new Error(ERROR_MESSAGES[token]);
  }

  console.error('Unexpected receipt mutation RPC error', error);
  return new Error(GENERIC_ERROR_MESSAGE);
};

const normalizeTargets = (targets: ReceiptMutationTarget[]): ReceiptMutationTarget[] => {
  const normalized = [...targets].sort((left, right) => left.id.localeCompare(right.id));
  if (
    normalized.length === 0
    || normalized.some((target) => !hasText(target.id) || !hasText(target.expected_updated_at))
    || new Set(normalized.map((target) => target.id)).size !== normalized.length
  ) {
    throw new Error(ERROR_MESSAGES.receipt_mutation_invalid);
  }
  return normalized;
};

const parseResult = (
  data: unknown,
  targets: ReceiptMutationTarget[],
  nextStatus: ReceiptStatus,
): ReceiptMutationResult[] => {
  if (!Array.isArray(data) || data.length !== targets.length) {
    console.error('Unexpected receipt mutation RPC response', data);
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  const parsed = data.map((row, index): ReceiptMutationResult | null => {
    if (
      !isRecord(row)
      || row.id !== targets[index].id
      || row.status !== nextStatus
      || !hasText(row.updated_at)
    ) {
      return null;
    }
    return { id: row.id, status: nextStatus, updatedAt: row.updated_at };
  });

  if (parsed.some((row) => row === null)) {
    console.error('Unexpected receipt mutation RPC response', data);
    throw new Error(GENERIC_ERROR_MESSAGE);
  }

  return parsed as ReceiptMutationResult[];
};

export const transitionReceiptStatusesAtomicRpc = async (
  input: TransitionReceiptStatusesInput,
): Promise<ReceiptMutationResult[]> => {
  if (!supabase) {
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
  const receipts = normalizeTargets(input.receipts);
  const result = await supabase.rpc('transition_receipt_statuses_atomic', {
    p_receipts: receipts as unknown as Json,
    p_expected_status: input.expectedStatus,
    p_next_status: input.nextStatus,
  });
  if (result.error) {
    throw toDomainError(result.error);
  }
  return parseResult(result.data, receipts, input.nextStatus);
};
