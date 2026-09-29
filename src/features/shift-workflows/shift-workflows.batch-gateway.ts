import type { Database } from '../../lib/database.types';
import { advanceLifecycleSnapshotGeneration, runLifecycleDataMutation } from '../event-lifecycle-generation';
import type { ShiftBatchCommand } from './shift-workflows.batch-commands';
import { assertShiftBatchCommand, parseShiftBatchResult } from './shift-workflows.batch-contract';
import { canonicalUuid, ShiftWorkflowError, shiftWorkflowAmbiguous, shiftWorkflowConflict, type ShiftWorkflowScope } from './shift-workflows.contract';

type RpcName = 'save_shift_workflow_drafts_atomic' | 'submit_shift_workflow_round_atomic' | 'transition_shift_workflow_round_atomic';
type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };
export interface ShiftBatchClient {
  rpc<N extends RpcName>(name: N, args: Database['public']['Functions'][N]['Args']): PromiseLike<RpcResponse>;
}
const messages: Record<string, string> = {
  shift_workflow_invalid: 'Společná evidence obsahuje neplatné údaje.',
  shift_workflow_incomplete: 'Doplňte alespoň jeden záznam a platné časy ve všech odesílaných částech.',
  shift_workflow_day_invalid: 'Některý záznam dne se nepodařilo ověřit. Obnovte evidenci.',
  shift_workflow_set_invalid: 'Seznam propojených výkazů se změnil. Obnovte evidenci.',
  shift_workflow_approver_mismatch: 'Propojené směny musí mít stejného určeného schvalovatele. Upravte nastavení směn.',
  shift_workflow_note_required: 'Doplňte důvod a vyberte dotčenou směnu.',
  shift_workflow_round_invalid: 'Schvalovací kolo není úplné. Obnovte evidenci.',
  shift_workflow_request_conflict: 'Tentýž požadavek už obsahuje jiné údaje. Obnovte evidenci.',
};
function errorFor(error: NonNullable<RpcResponse['error']>) {
  if (error.code === '40001' || error.code === 'P0002') return shiftWorkflowConflict();
  if (error.code === '42501') return new ShiftWorkflowError('denied', 'K tomuto kroku nemáte oprávnění.');
  return error.message && messages[error.message]
    ? new ShiftWorkflowError('invalid', messages[error.message]) : shiftWorkflowAmbiguous();
}

export function assertShiftBatchAccess(scope: ShiftWorkflowScope, command: ShiftBatchCommand) {
  const denied = () => new ShiftWorkflowError('denied', 'K této společné evidenci nemáte oprávnění.');
  if (scope.source === 'supabase' && (!canonicalUuid.safeParse(scope.userId).success || !canonicalUuid.safeParse(scope.profileId).success)) throw denied();
  if (command.kind !== 'transition' || command.action === 'confirm') {
    if (scope.role !== 'crew' || scope.profileId !== command.contractorProfileId) throw denied();
  } else {
    const required = command.targets[0].expected_status === 'pending_ch' ? 'crewhead' : 'coo';
    if (scope.role !== required) throw denied();
  }
}

/** The caller owns its activation. It must retire it on identity, role or editor
 * session change; all queued and late work rechecks that exact activation. */
export function createShiftBatchWriter(dependencies: {
  client: ShiftBatchClient | null;
  localWrite: (scope: ShiftWorkflowScope, command: ShiftBatchCommand) => unknown | Promise<unknown>;
}) {
  return async (scope: ShiftWorkflowScope, input: ShiftBatchCommand, assertCurrent: () => void) => {
    assertCurrent();
    const command = structuredClone(input);
    const capturedScope = { ...scope };
    assertShiftBatchCommand(command);
    assertShiftBatchAccess(capturedScope, command);
    const ids = (command.kind === 'transition' ? command.targets : command.timelogs).map((t) => t.id);
    // Exact frozen targets are already expanded before reserving lock keys.
    return runLifecycleDataMutation(ids.map((id) => `timelog:${id}`), async () => {
      assertCurrent();
      assertShiftBatchAccess(capturedScope, command);
      advanceLifecycleSnapshotGeneration();
      try {
        if (capturedScope.source === 'local') {
          const result = await dependencies.localWrite(capturedScope, command);
          assertCurrent();
          return parseShiftBatchResult(result, command);
        }
        const client = dependencies.client;
        if (!client) throw new ShiftWorkflowError('denied', 'Pro práci s evidencí se přihlaste.');
        let response: RpcResponse;
        try {
          if (command.kind === 'transition') {
            response = await client.rpc('transition_shift_workflow_round_atomic', {
              p_request_id: command.requestId, p_round_id: command.roundId, p_expected_round_updated_at: command.expectedRoundUpdatedAt,
              p_targets: command.targets, p_action: command.action, p_note: command.note,
              p_affected_event_id: command.affectedEventId, p_corrections: command.corrections as unknown as Database['public']['Functions']['transition_shift_workflow_round_atomic']['Args']['p_corrections'],
            });
          } else {
            response = await client.rpc(command.kind === 'save' ? 'save_shift_workflow_drafts_atomic' : 'submit_shift_workflow_round_atomic', {
              p_request_id: command.requestId, p_round_id: command.roundId, p_workflow_id: command.workflowId,
              p_contractor_id: command.contractorProfileId, p_anchor_event_id: command.anchorEventId,
              p_timelogs: command.timelogs as unknown as Database['public']['Functions']['save_shift_workflow_drafts_atomic']['Args']['p_timelogs'],
            });
          }
        } catch {
          assertCurrent();
          throw shiftWorkflowAmbiguous();
        }
        assertCurrent();
        if (response.error) throw errorFor(response.error);
        return parseShiftBatchResult(response.data, command);
      } finally {
        // Retire reads started before or during a write, even after an ambiguous
        // network failure; only a fresh scoped hydration may publish afterwards.
        advanceLifecycleSnapshotGeneration();
      }
    });
  };
}
