import { supabase } from '../../lib/supabase';
import { fetchTimelogsSnapshot } from '../timelogs/services/timelogs.service';
import { createShiftBatchWriter, type ShiftBatchClient } from './shift-workflows.batch-gateway';
import { executeLocalShiftBatch } from './shift-workflows.batch-local';
import { localShiftWorkflowId } from './shift-workflows.local';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftBatchCommand } from './shift-workflows.batch-commands';

const writer = createShiftBatchWriter({ client: supabase as unknown as ShiftBatchClient | null, localWrite: executeLocalShiftBatch });
export function writeShiftEvidenceBatch(scope: ShiftWorkflowScope, command: ShiftBatchCommand, assertCurrent: () => void) {
  return writer(scope.source === 'local' && scope.profileId
    ? { ...scope, profileId: localShiftWorkflowId('profile', scope.profileId) } : scope, command, assertCurrent);
}
export async function refreshShiftEvidence(assertCurrent: () => void, reloadWorkflows: () => Promise<unknown>) {
  assertCurrent();
  await Promise.all([fetchTimelogsSnapshot(), reloadWorkflows()]);
  assertCurrent();
}
