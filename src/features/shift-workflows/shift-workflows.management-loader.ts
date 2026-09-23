import { getLocalAppState } from '../../lib/app-data';
import { supabase } from '../../lib/supabase';
import type { EventCrewAssignment } from '../../types';
import { z } from 'zod';
import { fetchEventsSnapshot } from '../events/services/events.service';
import { fetchInvoicesSnapshot } from '../invoices/services/invoices.service';
import { fetchTimelogsSnapshot } from '../timelogs/services/timelogs.service';
import { canManageShiftWorkflows, canonicalUuid, ShiftWorkflowError, type ShiftWorkflowScope, type ShiftWorkflowSnapshot } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';

const assignmentPage = z.array(z.object({ event_id: canonicalUuid, profile_id: canonicalUuid }).strict());

export async function loadShiftWorkflowManagementData(
  scope: ShiftWorkflowScope, readSnapshot: () => Promise<ShiftWorkflowSnapshot>, signal: AbortSignal, profileId: string,
): Promise<ShiftWorkflowManagementData> {
  const assertAccess = () => {
    if (signal.aborted || !canManageShiftWorkflows(scope.role)) {
      throw new ShiftWorkflowError('denied', 'Přístup k propojeným směnám se změnil.');
    }
  };
  assertAccess();
  if (scope.source === 'supabase' && (!supabase || !canonicalUuid.safeParse(profileId).success)) {
    throw new ShiftWorkflowError('invalid', 'Členovi crew chybí serverová identita. Obnovte data.');
  }
  // The ordinary event projection also includes historical timelog-derived
  // assignments. Those must never become candidates for a new shared workflow.
  const readAssignments = async () => {
    const rows: { event_id: string; profile_id: string }[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ; offset += 500) {
      assertAccess();
      const result = await supabase!.from('event_assignments').select('event_id,profile_id')
        .eq('profile_id', profileId).order('event_id').range(offset, offset + 499).abortSignal(signal);
      assertAccess();
      const parsed = assignmentPage.safeParse(result.data);
      if (result.error || !parsed.success) throw new ShiftWorkflowError('invalid', 'Aktuální přiřazení směn se nepodařilo načíst.');
      for (const row of parsed.data) {
        if (row.profile_id !== profileId || seen.has(row.event_id)) {
          throw new ShiftWorkflowError('invalid', 'Aktuální přiřazení směn není jednoznačné. Obnovte data.');
        }
        seen.add(row.event_id);
        rows.push(row);
      }
      if (parsed.data.length < 500) return rows;
    }
  };
  const [snapshot, events, timelogs, invoices, assignments] = await Promise.all([
    readSnapshot(), fetchEventsSnapshot(), fetchTimelogsSnapshot(), fetchInvoicesSnapshot(),
    scope.source === 'supabase' ? readAssignments() : Promise.resolve(null),
  ]);
  assertAccess();
  const eventCrewAssignments: EventCrewAssignment[] = assignments === null
    ? getLocalAppState().eventCrewAssignments.filter((a) => a.contractorProfileId === profileId)
    : assignments.map((row) => {
      const event = events.find((e) => e.supabaseId === row.event_id);
      if (!event) throw new ShiftWorkflowError('invalid', 'Některá přiřazená směna není dostupná. Obnovte data.');
      return { eventId: event.id, eventSupabaseId: row.event_id, contractorProfileId: row.profile_id, name: '' };
    });
  return { snapshot, events, timelogs, invoices, eventCrewAssignments };
}
