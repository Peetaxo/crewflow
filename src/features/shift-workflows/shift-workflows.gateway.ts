import { supabase } from '../../lib/supabase';
import {
  assertShiftWorkflowCommand, canManageShiftWorkflows, parseShiftWorkflowMutation,
  parseShiftWorkflowSnapshot, ShiftWorkflowError, shiftWorkflowAmbiguous, shiftWorkflowConflict,
  shiftWorkflowTimestamp,
  type SaveShiftWorkflow, type ShiftWorkflowScope,
} from './shift-workflows.contract';
import { readLocalShiftWorkflows, saveLocalShiftWorkflow } from './shift-workflows.local';

type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };
type MembershipArguments = {
  p_request_id: string; p_workflow_id: string | null; p_event_ids: string[];
  p_expected_revision: number; p_event_versions: Record<string, string>;
  p_confirm_cross_project: boolean; p_confirm_moves: boolean; p_delete: boolean;
};
type WorkflowClient = {
  rpc(name: 'read_shift_workflows'): { abortSignal(signal: AbortSignal): PromiseLike<RpcResponse> };
  rpc(name: 'save_shift_workflow_atomic', args: MembershipArguments): PromiseLike<RpcResponse>;
};

const tokenMessages: Record<string, string> = {
  shift_workflow_invalid: 'Výběr směn není platný.',
  shift_workflow_versions_invalid: 'Chybí aktuální verze některé dotčené směny. Obnovte data.',
  shift_workflow_not_found: 'Propojení již není dostupné. Obnovte data.',
  shift_workflow_event_not_found: 'Některá směna již není dostupná. Obnovte data.',
  shift_workflow_move_confirmation_required: 'Potvrďte přesun směny z jiného propojení.',
  shift_workflow_cross_project_confirmation_required: 'Potvrďte propojení různých projektů nebo jobnumber.',
  shift_workflow_request_conflict: 'Požadavek má jiné údaje. Obnovte výběr.',
  shift_workflow_too_many_affected_events: 'Výběr zasahuje příliš mnoho směn.',
};

function mapError(error: NonNullable<RpcResponse['error']>): ShiftWorkflowError {
  if (error.code === '40001') return shiftWorkflowConflict();
  if (error.code === '42501') return new ShiftWorkflowError('denied', 'K této operaci nemáte oprávnění.');
  if (error.message === 'shift_workflow_membership_locked') return new ShiftWorkflowError(
    'blocked', 'Propojení nelze změnit: některé hodiny už byly odeslány, schvalovány nebo fakturovány.',
  );
  const message = error.message && tokenMessages[error.message];
  return message ? new ShiftWorkflowError('invalid', message) : shiftWorkflowAmbiguous();
}

function clientFor(scope: ShiftWorkflowScope): WorkflowClient {
  if (!supabase || !scope.userId || !scope.profileId) {
    throw new ShiftWorkflowError('denied', 'Pro práci s propojenými směnami se přihlaste.');
  }
  return supabase as unknown as WorkflowClient;
}

function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Čtení bylo přerušeno.', 'AbortError');
}

export async function readShiftWorkflowSnapshot(scope: ShiftWorkflowScope, signal = new AbortController().signal) {
  assertActive(signal);
  if (scope.source === 'local') return readLocalShiftWorkflows(scope);
  const client = clientFor(scope);
  let response: RpcResponse;
  try {
    response = await client.rpc('read_shift_workflows').abortSignal(signal);
  } catch {
    assertActive(signal);
    throw new ShiftWorkflowError('ambiguous', 'Propojené směny se nepodařilo načíst. Zkuste to znovu.');
  }
  assertActive(signal);
  if (response.error) throw mapError(response.error);
  return parseShiftWorkflowSnapshot(response.data, scope);
}

export async function saveShiftWorkflow(scope: ShiftWorkflowScope, command: SaveShiftWorkflow) {
  if (!canManageShiftWorkflows(scope.role)) {
    throw new ShiftWorkflowError('denied', 'Propojení směn může měnit pouze produkce.');
  }
  assertShiftWorkflowCommand(command);
  if (scope.source === 'local') return saveLocalShiftWorkflow(scope, command);
  if (Object.values(command.eventVersions).some((value) => !shiftWorkflowTimestamp.safeParse(value).success)) {
    throw new ShiftWorkflowError('invalid', 'Chybí aktuální verze některé dotčené směny. Obnovte data.');
  }
  const client = clientFor(scope);
  let response: RpcResponse;
  try {
    response = await client.rpc('save_shift_workflow_atomic', {
      p_request_id: command.requestId, p_workflow_id: command.workflowId,
      p_event_ids: command.eventIds, p_expected_revision: command.expectedRevision,
      p_event_versions: command.eventVersions, p_confirm_cross_project: command.confirmCrossProject,
      p_confirm_moves: command.confirmMoves, p_delete: command.deleteWorkflow,
    });
  } catch {
    throw shiftWorkflowAmbiguous();
  }
  if (response.error) throw mapError(response.error);
  return parseShiftWorkflowMutation(response.data, command);
}
