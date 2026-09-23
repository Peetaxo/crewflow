import { supabase } from '../../../lib/supabase';
import type {
  EventContactOption,
  TimelogApprovalStatus,
  TimelogStatus,
} from '../../../types';

const INVALID_RESPONSE_MESSAGE = 'Server vrátil neplatnou odpověď pro schválení výkazů.';
const INVALID_REQUEST_MESSAGE = 'Požadavek na schválení obsahuje neplatné údaje.';
const RETURN_NOTE_REQUIRED_MESSAGE = 'Pro vrácení výkazu doplňte poznámku.';

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
const APPROVAL_STATUSES: readonly TimelogApprovalStatus[] = ['pending', 'approved', 'returned'];
const HANDED_OFF_TIMELOG_STATUSES: readonly TimelogStatus[] = [
  'pending_coo',
  'approved',
  'invoiced',
  'paid',
  'rejected',
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TimelogApprovalHandoffTarget {
  id: string;
  expectedUpdatedAt: string;
  approvalId: string;
  approvalRoundId: string;
}

export interface TimelogApprovalHandoffResult {
  id: string;
  updated_at: string;
  status: TimelogStatus;
  approval_id: string;
  approval_round_id: string;
  approval_status: TimelogApprovalStatus;
  approval_updated_at: string;
}

export interface TimelogApprovalResolutionTarget {
  id: string;
  expectedUpdatedAt: string;
  approvalId: string | null;
  approvalUpdatedAt: string | null;
}

export interface TimelogApprovalResolutionResult {
  id: string;
  updated_at: string;
  status: TimelogStatus;
}

interface MappedTimelogApprovalHandoffTarget {
  id: string;
  expected_updated_at: string;
  approval_id: string;
  approval_round_id: string;
}

interface MappedTimelogApprovalResolutionTarget {
  id: string;
  expected_updated_at: string;
  approval_id: string | null;
  approval_updated_at: string | null;
}

type ApprovalResolution = 'approved' | 'returned';
type ApprovalRpcResult = { data: unknown; error: unknown };
type ApprovalRpcClient = {
  rpc: (functionName: string, args?: Record<string, unknown>) => Promise<ApprovalRpcResult>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
const isVersion = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isTimelogStatus = (value: unknown): value is TimelogStatus => (
  typeof value === 'string' && TIMELOG_STATUSES.includes(value as TimelogStatus)
);
const isHandedOffTimelogStatus = (value: unknown): value is TimelogStatus => (
  typeof value === 'string' && HANDED_OFF_TIMELOG_STATUSES.includes(value as TimelogStatus)
);
const isApprovalStatus = (value: unknown): value is TimelogApprovalStatus => (
  typeof value === 'string' && APPROVAL_STATUSES.includes(value as TimelogApprovalStatus)
);

const invalidResponse = (): never => {
  throw new Error(INVALID_RESPONSE_MESSAGE);
};

const invalidRequest = (): never => {
  throw new Error(INVALID_REQUEST_MESSAGE);
};

const hasDuplicates = (values: string[]): boolean => new Set(values).size !== values.length;

const parseContactOptions = (data: unknown): EventContactOption[] => {
  if (!Array.isArray(data)) return invalidResponse();
  const options = data.map((value) => {
    if (
      !isRecord(value)
      || !isUuid(value.profile_id)
      || typeof value.name !== 'string'
      || (value.phone !== null && typeof value.phone !== 'string')
      || typeof value.can_approve_hours !== 'boolean'
    ) return invalidResponse();

    return {
      profileId: value.profile_id,
      name: value.name,
      phone: typeof value.phone === 'string' ? value.phone : '',
      canApproveHours: value.can_approve_hours,
    };
  });
  if (hasDuplicates(options.map((option) => option.profileId))) return invalidResponse();
  return options;
};

const parseHandoffResults = (
  data: unknown,
  targets: MappedTimelogApprovalHandoffTarget[],
): TimelogApprovalHandoffResult[] => {
  if (!Array.isArray(data)) return invalidResponse();
  const results = data.map((value) => {
    if (
      !isRecord(value)
      || !isUuid(value.id)
      || !isVersion(value.updated_at)
      || !isHandedOffTimelogStatus(value.status)
      || !isUuid(value.approval_id)
      || !isUuid(value.approval_round_id)
      || !isApprovalStatus(value.approval_status)
      || !isVersion(value.approval_updated_at)
    ) return invalidResponse();
    return value as unknown as TimelogApprovalHandoffResult;
  });
  if (results.length !== targets.length) return invalidResponse();
  const resultsByTimelogId = new Map(results.map((result) => [result.id, result]));
  if (resultsByTimelogId.size !== results.length) return invalidResponse();
  return targets.map((target) => {
    const result = resultsByTimelogId.get(target.id);
    if (
      !result
      || result.approval_id !== target.approval_id
      || result.approval_round_id !== target.approval_round_id
    ) return invalidResponse();
    return result;
  });
};

const parseResolutionResults = (
  data: unknown,
  targets: MappedTimelogApprovalResolutionTarget[],
): TimelogApprovalResolutionResult[] => {
  if (!Array.isArray(data)) return invalidResponse();
  const results = data.map((value) => {
    if (
      !isRecord(value)
      || !isUuid(value.id)
      || !isVersion(value.updated_at)
      || !isTimelogStatus(value.status)
    ) return invalidResponse();
    return value as unknown as TimelogApprovalResolutionResult;
  });
  if (results.length !== targets.length) return invalidResponse();
  const resultsByTimelogId = new Map(results.map((result) => [result.id, result]));
  if (resultsByTimelogId.size !== results.length) return invalidResponse();
  return targets.map((target) => resultsByTimelogId.get(target.id) ?? invalidResponse());
};

const errorText = (error: unknown): { code: string; message: string } => ({
  code: isRecord(error) && typeof error.code === 'string' ? error.code : '',
  message: isRecord(error) && typeof error.message === 'string'
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error),
});

const includesToken = (message: string, token: string): boolean => (
  new RegExp(`(^|[^A-Za-z0-9_])${token}($|[^A-Za-z0-9_])`).test(message)
);

const toApprovalError = (error: unknown): unknown => {
  const { code, message } = errorText(error);
  if (includesToken(message, 'timelog_approver_unavailable')) {
    return new Error('Vybraný schvalovatel není dostupný. Upravte schvalovatele akce a zkuste to znovu.');
  }
  if (includesToken(message, 'timelog_approval_unauthorized') || code === '42501') {
    return new Error('K této operaci schválení nemáte oprávnění.');
  }
  if (includesToken(message, 'timelog_approval_conflict') || code === '40001') {
    return new Error('Schválení se mezitím změnilo. Obnovte data a zkuste to znovu.');
  }
  if (includesToken(message, 'timelog_approval_invalid') || code === '22023') {
    return new Error(INVALID_REQUEST_MESSAGE);
  }
  if (isRecord(error) || error instanceof Error) return error;
  return new Error(`Operaci schválení se nepodařilo dokončit: ${message || 'neznámá chyba'}`);
};

const getClient = (): ApprovalRpcClient => {
  if (!supabase) throw new Error('Supabase klient pro schválení není dostupný.');
  return supabase as unknown as ApprovalRpcClient;
};

const mapHandoffTargets = (
  targets: TimelogApprovalHandoffTarget[],
): MappedTimelogApprovalHandoffTarget[] => {
  if (targets.length === 0) return invalidRequest();
  const mappedTargets = targets.map((target) => {
    if (
      !isUuid(target.id)
      || !isVersion(target.expectedUpdatedAt)
      || !isUuid(target.approvalId)
      || !isUuid(target.approvalRoundId)
    ) return invalidRequest();
    return {
      id: target.id,
      expected_updated_at: target.expectedUpdatedAt,
      approval_id: target.approvalId,
      approval_round_id: target.approvalRoundId,
    };
  });
  if (
    hasDuplicates(mappedTargets.map((target) => target.id))
    || hasDuplicates(mappedTargets.map((target) => target.approval_id))
    || hasDuplicates(mappedTargets.map((target) => target.approval_round_id))
  ) return invalidRequest();
  return mappedTargets.sort((left, right) => left.id.localeCompare(right.id));
};

const mapResolutionTargets = (
  targets: TimelogApprovalResolutionTarget[],
): MappedTimelogApprovalResolutionTarget[] => {
  if (targets.length === 0) return invalidRequest();
  const mappedTargets = targets.map((target) => {
    const hasValidApproval = target.approvalId === null && target.approvalUpdatedAt === null
      || isUuid(target.approvalId) && isVersion(target.approvalUpdatedAt);
    if (!isUuid(target.id) || !isVersion(target.expectedUpdatedAt) || !hasValidApproval) {
      return invalidRequest();
    }
    return {
      id: target.id,
      expected_updated_at: target.expectedUpdatedAt,
      approval_id: target.approvalId,
      approval_updated_at: target.approvalUpdatedAt,
    };
  });
  if (
    hasDuplicates(mappedTargets.map((target) => target.id))
    || hasDuplicates(mappedTargets.flatMap((target) => (
      target.approval_id === null ? [] : [target.approval_id]
    )))
  ) return invalidRequest();
  return mappedTargets.sort((left, right) => left.id.localeCompare(right.id));
};

export const listEventContactOptionsRpc = async (): Promise<EventContactOption[]> => {
  const result = await getClient().rpc('list_event_contact_options');
  if (result.error) throw toApprovalError(result.error);
  return parseContactOptions(result.data);
};

export const handoffTimelogsForApprovalAtomicRpc = async (
  targets: TimelogApprovalHandoffTarget[],
): Promise<TimelogApprovalHandoffResult[]> => {
  const mappedTargets = mapHandoffTargets(targets);
  const result = await getClient().rpc('handoff_timelogs_for_approval_atomic', {
    p_targets: mappedTargets,
  });
  if (result.error) throw toApprovalError(result.error);
  return parseHandoffResults(result.data, mappedTargets);
};

export const resolveTimelogApprovalsAtomicRpc = async ({
  targets,
  resolution,
  note = '',
}: {
  targets: TimelogApprovalResolutionTarget[];
  resolution: ApprovalResolution;
  note?: string;
}): Promise<TimelogApprovalResolutionResult[]> => {
  if (resolution === 'returned' && note.trim() === '') {
    throw new Error(RETURN_NOTE_REQUIRED_MESSAGE);
  }
  const mappedTargets = mapResolutionTargets(targets);
  const result = await getClient().rpc('resolve_timelog_approvals_atomic', {
    p_targets: mappedTargets,
    p_resolution: resolution,
    p_note: note,
  });
  if (result.error) throw toApprovalError(result.error);
  return parseResolutionResults(result.data, mappedTargets);
};
