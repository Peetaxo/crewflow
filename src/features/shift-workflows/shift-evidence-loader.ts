import { getLocalAppState } from '../../lib/app-data';
import type { Contractor, Event, EventCrewAssignment, Timelog } from '../../types';
import { getLifecycleSnapshotGeneration } from '../event-lifecycle-generation';
import { fetchEventsSnapshot } from '../events/services/events.service';
import { loadTimelogsSnapshot } from '../timelogs/services/timelogs.service';
import { canManageShiftWorkflows, canonicalUuid, ShiftWorkflowError, type ShiftWorkflowScope, type ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { canonicalizeLocalShiftData, localShiftWorkflowId } from './shift-workflows.local';
import { readShiftWorkflowManagerAssignments } from './shift-workflows.management-loader';
import { resolveShiftWorkflowContext, type ShiftWorkflowContext } from './shift-workflows.model';

export interface ShiftEvidenceData {
  context: ShiftWorkflowContext; events: Event[]; contractor: Contractor; legacy: boolean;
}

/** Read-only preparation. Missing canonical reports are never manufactured. */
export async function loadShiftEvidenceData(scope: ShiftWorkflowScope, opened: Timelog,
  readSnapshot: () => Promise<ShiftWorkflowSnapshot>, signal: AbortSignal,
): Promise<ShiftEvidenceData> {
  const profileId = scope.source === 'local' && opened.contractorProfileId
    ? localShiftWorkflowId('profile', opened.contractorProfileId) : opened.contractorProfileId;
  const actorProfile = scope.source === 'local' && scope.profileId ? localShiftWorkflowId('profile', scope.profileId) : scope.profileId;
  const anchor = scope.source === 'local' ? localShiftWorkflowId('event', opened.eid) : opened.eventSupabaseId;
  const assertCurrent = () => {
    if (signal.aborted || (!canManageShiftWorkflows(scope.role) && (scope.role !== 'crew' || actorProfile !== profileId))) {
      throw new ShiftWorkflowError('denied', 'Přístup k evidenci se změnil.');
    }
  };
  assertCurrent();
  if (!canonicalUuid.safeParse(profileId).success || !canonicalUuid.safeParse(anchor).success) {
    throw new ShiftWorkflowError('invalid', 'Evidenci chybí jednoznačná identita. Obnovte data.');
  }
  const generation = getLifecycleSnapshotGeneration();
  const [snapshot, loadedEvents, loadedReports, managerAssignments] = await Promise.all([
    readSnapshot(), fetchEventsSnapshot(), loadTimelogsSnapshot(),
    scope.source === 'supabase' && canManageShiftWorkflows(scope.role)
      ? readShiftWorkflowManagerAssignments(scope, signal, profileId!) : Promise.resolve(null),
  ]);
  assertCurrent();
  if (generation !== getLifecycleSnapshotGeneration()) throw new ShiftWorkflowError('conflict', 'Data se během načítání změnila. Načtěte evidenci znovu.');
  const appState = getLocalAppState();
  const local = scope.source === 'local' ? canonicalizeLocalShiftData(appState) : null;
  const events = local?.events ?? loadedEvents;
  const timelogs = local?.timelogs ?? loadedReports;
  const contractor = appState.contractors.find((c) => (scope.source === 'local' && c.profileId ? localShiftWorkflowId('profile', c.profileId) : c.profileId) === profileId);
  if (!contractor) throw new ShiftWorkflowError('invalid', 'Člena crew se nepodařilo načíst.');
  const assignments: EventCrewAssignment[] = local?.eventCrewAssignments ?? (managerAssignments
    ? managerAssignments.map((a) => ({ eventId: events.find((e) => e.supabaseId === a.event_id)?.id ?? Number.NaN,
      eventSupabaseId: a.event_id, contractorProfileId: a.profile_id, name: '' }))
    : snapshot.assignedEventIds.map((eventId) => ({ eventId: events.find((e) => e.supabaseId === eventId)?.id ?? Number.NaN,
      eventSupabaseId: eventId, contractorProfileId: profileId!, name: '' })));
  const context = resolveShiftWorkflowContext({ anchorEventId: anchor!, contractorProfileId: profileId!,
    workflows: snapshot.workflows, rounds: snapshot.rounds, assignments, events, timelogs });
  if (!context) throw new ShiftWorkflowError('invalid', 'Části společné evidence nejsou jednoznačné nebo už nejsou dostupné. Obnovte data.');
  const legacy = context.workflowId === null && context.activeRound === null
    && context.timelogs.some((t) => ['pending_ch', 'pending_coo', 'pending_crew_confirmation'].includes(t.status))
    && !snapshot.rounds.some((r) => r.contractorProfileId === profileId && r.eventIds.includes(anchor!));
  return { context, contractor: structuredClone(contractor), events: context.eventIds.map((id) => events.find((e) => e.supabaseId === id)!), legacy };
}
