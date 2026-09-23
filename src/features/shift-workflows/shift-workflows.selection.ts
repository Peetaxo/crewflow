import type { Event } from '../../types';
import {
  assertShiftWorkflowCommand, canManageShiftWorkflows, canonicalUuid, ShiftWorkflowError,
  shiftWorkflowTimestamp, type SaveShiftWorkflow, type ShiftWorkflowScope, type ShiftWorkflowSnapshot,
} from './shift-workflows.contract';
import { localShiftEventVersion, localShiftWorkflowId } from './shift-workflows.local';

export function shiftWorkflowEventId(event: Event, source: ShiftWorkflowScope['source']): string {
  if (source === 'local') return localShiftWorkflowId('event', event.id);
  if (!canonicalUuid.safeParse(event.supabaseId).success) {
    throw new ShiftWorkflowError('invalid', 'Akci chybí jednoznačná serverová identita. Obnovte data.');
  }
  return event.supabaseId!;
}

export function buildShiftWorkflowCommand(input: {
  scope: ShiftWorkflowScope; snapshot: ShiftWorkflowSnapshot; workflowId: string | null;
  eventIds: string[]; events: Event[]; requestId: string;
  confirmMoves: boolean; confirmCrossProject: boolean; deleteWorkflow: boolean;
}): SaveShiftWorkflow {
  const { scope, snapshot, workflowId, eventIds } = input;
  const invalid = (message = 'Výběr směn není aktuální. Obnovte data.'): never => {
    throw new ShiftWorkflowError('invalid', message);
  };
  if (!canManageShiftWorkflows(scope.role)) throw new ShiftWorkflowError('denied', 'Propojení směn může měnit pouze produkce.');
  if (snapshot.revision === null) invalid();
  const target = snapshot.workflows.find((w) => w.id === workflowId);
  if (workflowId !== null && !target) invalid();
  const selected = new Set(eventIds);
  const sources = snapshot.workflows.filter((w) => w.id !== workflowId && w.eventIds.some((id) => selected.has(id)));
  if (sources.length && !input.confirmMoves) invalid('Potvrďte přesun směny z jiného propojení.');
  const affected = new Set([...eventIds, ...(target?.eventIds ?? []), ...sources.flatMap((w) => w.eventIds)]);
  const events = new Map<string, Event>();
  for (const event of input.events) {
    // Unpersisted drafts unrelated to this selection are not a remote identity.
    if (scope.source === 'supabase' && !event.supabaseId) continue;
    const id = shiftWorkflowEventId(event, scope.source);
    if (events.has(id)) invalid();
    events.set(id, event);
  }
  const eventVersions: Record<string, string> = {};
  for (const id of [...affected].sort()) {
    const event = events.get(id);
    if (!event) invalid();
    const version = scope.source === 'local' ? localShiftEventVersion(event!) : event!.updatedAt;
    if (!version || (scope.source === 'supabase' && !shiftWorkflowTimestamp.safeParse(version).success)) invalid();
    eventVersions[id] = version!;
  }
  const projectKeys = new Set(eventIds.map((id) => {
    const event = events.get(id)!;
    return JSON.stringify([event.projectId ?? null, event.job]);
  }));
  if (projectKeys.size > 1 && !input.confirmCrossProject) invalid('Potvrďte propojení různých projektů nebo jobnumber.');
  const command: SaveShiftWorkflow = {
    requestId: input.requestId, workflowId, eventIds: [...eventIds].sort(),
    expectedRevision: snapshot.revision!, eventVersions,
    confirmMoves: input.confirmMoves, confirmCrossProject: input.confirmCrossProject,
    deleteWorkflow: input.deleteWorkflow,
  };
  assertShiftWorkflowCommand(command);
  return command;
}
