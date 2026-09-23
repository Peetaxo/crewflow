import { z } from 'zod';
import type { Role } from '../../types';
import type { ShiftWorkflow, ShiftWorkflowRound } from './shift-workflows.model';

export interface ShiftWorkflowScope {
  source: 'local' | 'supabase';
  userId: string | null;
  profileId: string | null;
  role: Role;
}

export interface ShiftWorkflowSnapshot {
  revision: number | null;
  workflows: ShiftWorkflow[];
  rounds: ShiftWorkflowRound[];
  assignedEventIds: string[];
}

export interface SaveShiftWorkflow {
  requestId: string;
  /** Null creates a workflow; the server allocates its identity. */
  workflowId: string | null;
  eventIds: string[];
  expectedRevision: number;
  /** Includes removed members and every remaining member of a moved-from workflow. */
  eventVersions: Record<string, string>;
  confirmCrossProject: boolean;
  confirmMoves: boolean;
  deleteWorkflow: boolean;
}

export interface ShiftWorkflowMutationResult {
  requestId: string;
  workflowId: string;
  revision: number;
}

export class ShiftWorkflowError extends Error {
  constructor(
    readonly kind: 'conflict' | 'denied' | 'invalid' | 'blocked' | 'ambiguous',
    message: string,
  ) {
    super(message);
    this.name = 'ShiftWorkflowError';
  }
}

export const canManageShiftWorkflows = (role: Role) => role === 'crewhead' || role === 'coo';
export const canonicalUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const shiftWorkflowTimestamp = z.string().datetime({ offset: true });
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const uuidSet = z.array(canonicalUuid).refine(unique);
const snapshotSchema = z.object({
  revision: z.number().int().nonnegative().nullable(),
  workflows: z.array(z.object({
    id: canonicalUuid, event_ids: uuidSet, updated_at: shiftWorkflowTimestamp,
  }).strict()),
  rounds: z.array(z.object({
    id: canonicalUuid, workflow_id: canonicalUuid.nullable(), contractor_id: canonicalUuid,
    status: z.enum(['pending_ch', 'pending_crew_confirmation', 'pending_coo', 'approved', 'rejected']),
    event_ids: uuidSet.refine((ids) => ids.length > 0),
    timelog_ids: uuidSet.refine((ids) => ids.length > 0),
    note: z.string(), updated_at: shiftWorkflowTimestamp,
  }).strict()),
  assigned_event_ids: uuidSet,
}).strict();

export function parseShiftWorkflowSnapshot(value: unknown, scope: ShiftWorkflowScope): ShiftWorkflowSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  const invalid = () => new ShiftWorkflowError('invalid', 'Propojené směny se nepodařilo bezpečně načíst.');
  if (!parsed.success) throw invalid();
  const data = parsed.data;
  const manager = canManageShiftWorkflows(scope.role);
  const assigned = new Set(data.assigned_event_ids);
  if ((manager ? data.revision === null : data.revision !== null)
    || !unique(data.workflows.map((item) => item.id))
    || !unique(data.workflows.flatMap((item) => item.event_ids))
    || !unique(data.rounds.map((item) => item.id))
    || data.rounds.some((item) => item.event_ids.length !== item.timelog_ids.length)
    || (!manager && (
      !scope.profileId
      || data.workflows.some((item) => item.event_ids.length === 0 || item.event_ids.some((id) => !assigned.has(id)))
      || data.rounds.some((item) => item.contractor_id !== scope.profileId)
    ))) throw invalid();

  return {
    revision: data.revision,
    workflows: data.workflows.map((item) => ({ id: item.id, eventIds: item.event_ids, updatedAt: item.updated_at })),
    rounds: data.rounds.map((item) => ({
      id: item.id, workflowId: item.workflow_id, contractorProfileId: item.contractor_id,
      status: item.status, eventIds: item.event_ids, timelogIds: item.timelog_ids,
      note: item.note, updatedAt: item.updated_at,
    })),
    assignedEventIds: data.assigned_event_ids,
  };
}

const commandSchema = z.object({
  requestId: canonicalUuid, workflowId: canonicalUuid.nullable(),
  eventIds: uuidSet.refine((ids) => ids.length <= 200),
  expectedRevision: z.number().int().nonnegative(),
  eventVersions: z.record(canonicalUuid, z.string().min(1)),
  confirmCrossProject: z.boolean(), confirmMoves: z.boolean(), deleteWorkflow: z.boolean(),
}).strict();

export function assertShiftWorkflowCommand(command: SaveShiftWorkflow): void {
  if (!commandSchema.safeParse(command).success
    || (command.deleteWorkflow ? !command.workflowId || command.eventIds.length !== 0
      : command.eventIds.length < (command.workflowId === null ? 2 : 1))) {
    throw new ShiftWorkflowError('invalid', 'Výběr směn není platný. Obnovte data.');
  }
}

export const shiftWorkflowConflict = () => new ShiftWorkflowError(
  'conflict', 'Data se mezitím změnila. Obnovte výběr a znovu jej potvrďte.',
);
export const shiftWorkflowAmbiguous = () => new ShiftWorkflowError(
  'ambiguous', 'Výsledek uložení není potvrzen. Opakujte stejný požadavek.',
);

export function parseShiftWorkflowMutation(value: unknown, command: SaveShiftWorkflow): ShiftWorkflowMutationResult {
  const parsed = z.object({
    request_id: canonicalUuid, workflow_id: canonicalUuid, revision: z.number().int().nonnegative(),
  }).strict().safeParse(value);
  if (!parsed.success || parsed.data.request_id !== command.requestId
    || (command.workflowId !== null && parsed.data.workflow_id !== command.workflowId)
    || parsed.data.revision !== command.expectedRevision + 1) throw shiftWorkflowAmbiguous();
  return { requestId: parsed.data.request_id, workflowId: parsed.data.workflow_id, revision: parsed.data.revision };
}
