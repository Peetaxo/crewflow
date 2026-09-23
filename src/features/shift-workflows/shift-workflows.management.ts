import type { Event, EventCrewAssignment, Invoice, Timelog } from '../../types';
import type { ShiftWorkflowScope, ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { localShiftWorkflowId } from './shift-workflows.local';
import { shiftWorkflowEventId } from './shift-workflows.selection';

export interface ShiftWorkflowManagementData {
  snapshot: ShiftWorkflowSnapshot;
  events: Event[];
  timelogs: Timelog[];
  invoices: Invoice[];
  eventCrewAssignments: EventCrewAssignment[];
}

export const workflowEventTitle = (event: Event) => [event.name, event.job].filter(Boolean).join(' · ');
export const workflowEventDates = (event: Event) => event.startDate === event.endDate
  ? event.startDate : `${event.startDate} – ${event.endDate}`;

const identifiedEvents = (data: ShiftWorkflowManagementData, scope: ShiftWorkflowScope) => data.events
  .filter((event) => scope.source === 'local' || event.supabaseId)
  .map((event) => ({ id: shiftWorkflowEventId(event, scope.source), event }));

export function getWorkflowCandidates(
  data: ShiftWorkflowManagementData, scope: ShiftWorkflowScope, profileId: string, workflowId: string | null,
) {
  const assigned = new Set(data.eventCrewAssignments.filter((a) => a.contractorProfileId === profileId)
    .map((a) => scope.source === 'local' ? localShiftWorkflowId('event', a.eventId) : a.eventSupabaseId));
  const existing = new Set(data.snapshot.workflows.find((w) => w.id === workflowId)?.eventIds ?? []);
  return identifiedEvents(data, scope).filter(({ id }) => assigned.has(id) || existing.has(id))
    .sort((a, b) => a.event.startDate.localeCompare(b.event.startDate) || a.event.name.localeCompare(b.event.name) || a.id.localeCompare(b.id));
}

/** Advisory UI check only. The atomic server mutation repeats every check for all people. */
export function getWorkflowSelectionImpact(
  data: ShiftWorkflowManagementData, scope: ShiftWorkflowScope, workflowId: string | null, eventIds: string[],
) {
  const target = data.snapshot.workflows.find((w) => w.id === workflowId);
  const selected = new Set(eventIds);
  const sources = data.snapshot.workflows.filter((w) => w.id !== workflowId && w.eventIds.some((id) => selected.has(id)));
  const affected = new Set([...eventIds, ...(target?.eventIds ?? []), ...sources.flatMap((w) => w.eventIds)]);
  const events = new Map(identifiedEvents(data, scope).map(({ id, event }) => [id, event]));
  const projectKeys = new Set(eventIds.map((id) => JSON.stringify([events.get(id)?.projectId ?? null, events.get(id)?.job])));
  let blockedReason: string | null = null;
  if ((workflowId && !target) || [...affected].some((id) => !events.has(id))) {
    blockedReason = 'Některá dotčená směna už není dostupná. Obnovte data a zkontrolujte výběr.';
  }
  const eventIdFor = (t: Timelog) => scope.source === 'local' ? localShiftWorkflowId('event', t.eid) : t.eventSupabaseId;
  const reports = data.timelogs.filter((t) => { const id = eventIdFor(t); return id && affected.has(id); });
  const started = reports.find((t) => t.status !== 'draft' || t.approvals?.length);
  if (!blockedReason && started) {
    blockedReason = `${events.get(eventIdFor(started)!)?.name}: již začalo schvalování některého výkazu. Propojení už nelze měnit.`;
  }
  if (!blockedReason && data.snapshot.rounds.some((r) => r.eventIds.some((id) => affected.has(id))
    || (r.workflowId !== null && (r.workflowId === workflowId || sources.some((s) => s.id === r.workflowId))))) {
    blockedReason = 'Dotčené propojení už má historii schvalování. Propojení už nelze měnit.';
  }
  const reportIds = new Set(reports.map((t) => t.id));
  const reportUuids = new Set(reports.flatMap((t) => t.supabaseId ? [t.supabaseId] : []));
  if (!blockedReason && data.invoices.some((i) => i.timelogSupabaseIds?.some((id) => reportUuids.has(id))
    || (scope.source === 'local' && i.timelogIds?.some((id) => reportIds.has(id))))) {
    blockedReason = 'Některý dotčený výkaz už je navázaný na fakturu. Propojení už nelze měnit.';
  }
  return {
    affectedEventIds: [...affected].sort(), sources,
    removedEventIds: (target?.eventIds ?? []).filter((id) => !selected.has(id)),
    crossProject: projectKeys.size > 1, blockedReason,
  };
}
