import { getLocalAppState } from '../../lib/app-data';
import { fetchEventsSnapshot } from '../events/services/events.service';
import { fetchInvoicesSnapshot } from '../invoices/services/invoices.service';
import { fetchTimelogsSnapshot } from '../timelogs/services/timelogs.service';
import { canManageShiftWorkflows, ShiftWorkflowError, type ShiftWorkflowScope, type ShiftWorkflowSnapshot } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';

export async function loadShiftWorkflowManagementData(
  scope: ShiftWorkflowScope, readSnapshot: () => Promise<ShiftWorkflowSnapshot>, signal: AbortSignal,
): Promise<ShiftWorkflowManagementData> {
  const assertAccess = () => {
    if (signal.aborted || !canManageShiftWorkflows(scope.role)) {
      throw new ShiftWorkflowError('denied', 'Přístup k propojeným směnám se změnil.');
    }
  };
  assertAccess();
  const [snapshot, events, timelogs, invoices] = await Promise.all([
    readSnapshot(), fetchEventsSnapshot(), fetchTimelogsSnapshot(), fetchInvoicesSnapshot(),
  ]);
  assertAccess();
  return { snapshot, events, timelogs, invoices, eventCrewAssignments: getLocalAppState().eventCrewAssignments };
}
