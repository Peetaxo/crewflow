import { getLocalAppState, type AppDataSnapshot } from '../../lib/app-data';
import type { Event } from '../../types';
import { createStableDraftUuid } from '../stable-draft-identity';
import {
  assertShiftWorkflowCommand, canManageShiftWorkflows, canonicalUuid, ShiftWorkflowError,
  shiftWorkflowConflict,
  type SaveShiftWorkflow, type ShiftWorkflowMutationResult, type ShiftWorkflowScope,
  type ShiftWorkflowSnapshot,
} from './shift-workflows.contract';
import type { ShiftWorkflow, ShiftWorkflowRound } from './shift-workflows.model';

type LocalData = Pick<AppDataSnapshot, 'events' | 'timelogs' | 'eventCrewAssignments' | 'invoices'>;
const identities = new Map<string, string>();

/** Explicit demo-only identity map. These IDs must never reach a remote writer. */
export function localShiftWorkflowId(kind: 'event' | 'timelog' | 'profile', value: string | number): string {
  if (kind === 'profile' && canonicalUuid.safeParse(value).success) return String(value);
  const key = JSON.stringify([kind, value]);
  let identity = identities.get(key);
  if (!identity) {
    identity = createStableDraftUuid();
    identities.set(key, identity);
  }
  return identity;
}

export function canonicalizeLocalShiftData(data: LocalData) {
  return {
    events: data.events.map((event) => ({ ...structuredClone(event), supabaseId: localShiftWorkflowId('event', event.id) })),
    timelogs: data.timelogs.map((report) => ({
      ...structuredClone(report), supabaseId: localShiftWorkflowId('timelog', report.id),
      eventSupabaseId: localShiftWorkflowId('event', report.eid),
      contractorProfileId: report.contractorProfileId ? localShiftWorkflowId('profile', report.contractorProfileId) : undefined,
    })),
    eventCrewAssignments: data.eventCrewAssignments.map((assignment) => ({
      ...assignment, eventSupabaseId: localShiftWorkflowId('event', assignment.eventId),
      contractorProfileId: localShiftWorkflowId('profile', assignment.contractorProfileId),
    })),
  };
}

const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
));

/** Local records lack updated_at, so the whole event is their optimistic token. */
export const localShiftEventVersion = (event: Event) => stableJson(event);

function invalid(message = 'Výběr směn není platný. Obnovte data.'): never {
  throw new ShiftWorkflowError('invalid', message);
}

type LocalRound = ShiftWorkflowRound & { contractorUserId: string; expectedItemCount: number };
type LocalLedgerEntry = { actor: string; payload: string; result: ShiftWorkflowMutationResult };

export function createLocalShiftWorkflowStore(
  getData: () => LocalData,
  initial: { workflows?: ShiftWorkflow[]; rounds?: LocalRound[]; revision?: number } = {},
) {
  let revision = initial.revision ?? 0;
  let workflows = structuredClone(initial.workflows ?? []);
  const rounds = structuredClone(initial.rounds ?? []);
  const requests = new Map<string, LocalLedgerEntry>();

  const assertLocal = (scope: ShiftWorkflowScope) => {
    if (scope.source !== 'local') throw new ShiftWorkflowError('denied', 'Lokální náhled nelze použít pro vzdálená data.');
  };

  const read = (scope: ShiftWorkflowScope): ShiftWorkflowSnapshot => {
    assertLocal(scope);
    const data = canonicalizeLocalShiftData(getData());
    const profileId = scope.profileId ? localShiftWorkflowId('profile', scope.profileId) : null;
    const assignedEventIds = data.eventCrewAssignments.filter((a) => a.contractorProfileId === profileId)
      .map((a) => a.eventSupabaseId);
    const manager = canManageShiftWorkflows(scope.role);
    const assigned = new Set(assignedEventIds);
    const visibleRounds = rounds.filter((round) => manager || (
      round.contractorProfileId === profileId && round.contractorUserId === scope.userId
    ));
    const reports = new Map(data.timelogs.map((report) => [report.supabaseId, report]));
    const events = new Set(data.events.map((event) => event.supabaseId));
    if (visibleRounds.some((round) => !Number.isInteger(round.expectedItemCount) || round.expectedItemCount < 1
      || round.timelogIds.length !== round.expectedItemCount || round.eventIds.length !== round.expectedItemCount
      || new Set(round.timelogIds).size !== round.expectedItemCount || new Set(round.eventIds).size !== round.expectedItemCount
      || round.timelogIds.some((id, index) => {
        const report = reports.get(id);
        return !report || report.contractorProfileId !== round.contractorProfileId
          || report.eventSupabaseId !== round.eventIds[index] || !events.has(round.eventIds[index]);
      }))) invalid('Propojené směny se nepodařilo bezpečně načíst.');
    return structuredClone({
      revision: manager ? revision : null,
      workflows: manager ? workflows : workflows.flatMap((workflow) => {
        const eventIds = workflow.eventIds.filter((id) => assigned.has(id));
        return eventIds.length ? [{ ...workflow, eventIds }] : [];
      }),
      rounds: visibleRounds.map(({ contractorUserId: _user, expectedItemCount: _count, ...round }) => round),
      assignedEventIds,
    });
  };

  const save = (scope: ShiftWorkflowScope, command: SaveShiftWorkflow): ShiftWorkflowMutationResult => {
    assertLocal(scope);
    if (!canManageShiftWorkflows(scope.role)) {
      throw new ShiftWorkflowError('denied', 'Propojení směn může měnit pouze produkce.');
    }
    assertShiftWorkflowCommand(command);
    // Demo roles have no authenticated user; this fallback is confined to this
    // in-memory store and never authorizes a remote operation.
    const actor = stableJson([scope.userId, scope.profileId, scope.userId ? null : scope.role]);
    const payload = stableJson(command);
    const previous = requests.get(command.requestId);
    if (previous) {
      if (previous.actor !== actor || previous.payload !== payload) invalid('Požadavek má jiné údaje. Obnovte výběr.');
      return structuredClone(previous.result);
    }
    if (command.expectedRevision !== revision) throw shiftWorkflowConflict();
    const target = workflows.find((w) => w.id === command.workflowId);
    if (command.workflowId !== null && !target) invalid('Propojení již není dostupné. Obnovte data.');
    const selected = new Set(command.eventIds);
    const sources = workflows.filter((w) => w.id !== command.workflowId && w.eventIds.some((id) => selected.has(id)));
    const affected = new Set([...command.eventIds, ...(target?.eventIds ?? []), ...sources.flatMap((w) => w.eventIds)]);
    if (affected.size > 1000) invalid();
    const versionKeys = Object.keys(command.eventVersions);
    if (versionKeys.length !== affected.size || versionKeys.some((id) => !affected.has(id))) throw shiftWorkflowConflict();

    const data = getData();
    const events = new Map(data.events.map((event) => [localShiftWorkflowId('event', event.id), event]));
    for (const id of affected) {
      const event = events.get(id);
      if (!event || command.eventVersions[id] !== localShiftEventVersion(event)) throw shiftWorkflowConflict();
    }
    if (sources.length && !command.confirmMoves) invalid('Potvrďte přesun směny z jiného propojení.');
    const projectKeys = new Set(command.eventIds.map((id) => {
      const event = events.get(id)!;
      return stableJson([event.projectId ?? null, event.job]);
    }));
    if (projectKeys.size > 1 && !command.confirmCrossProject) invalid('Potvrďte propojení různých projektů nebo jobnumber.');
    const affectedReports = data.timelogs.filter((t) => affected.has(localShiftWorkflowId('event', t.eid)));
    const affectedReportIds = new Set(affectedReports.map((t) => t.id));
    const affectedReportUuids = new Set(affectedReports.flatMap((t) => t.supabaseId ? [t.supabaseId] : []));
    if (affectedReports.some((t) => t.status !== 'draft' || Boolean(t.approvals?.length))
      || rounds.some((round) => round.eventIds.some((id) => affected.has(id))
        || (round.workflowId !== null && (round.workflowId === target?.id || sources.some((w) => w.id === round.workflowId))))
      || data.invoices.some((invoice) => invoice.timelogIds?.some((id) => affectedReportIds.has(id))
        || invoice.timelogSupabaseIds?.some((id) => affectedReportUuids.has(id)))) {
      throw new ShiftWorkflowError('blocked', 'Propojení nelze změnit: některé hodiny už byly odeslány, schvalovány nebo fakturovány.');
    }

    const workflowId = target?.id ?? createStableDraftUuid();
    const now = new Date().toISOString();
    const next = workflows.filter((w) => w.id !== workflowId).flatMap((w) => {
      if (!sources.some((source) => source.id === w.id)) return [w];
      const eventIds = w.eventIds.filter((id) => !selected.has(id));
      return eventIds.length ? [{ ...w, eventIds, updatedAt: now }] : [];
    });
    if (!command.deleteWorkflow) next.push({ id: workflowId, eventIds: [...command.eventIds], updatedAt: now });
    const result = { requestId: command.requestId, workflowId, revision: revision + 1 };
    // Nothing above mutates canonical events, assignments, hours, or invoices.
    workflows = structuredClone(next);
    revision = result.revision;
    requests.set(command.requestId, { actor, payload, result: structuredClone(result) });
    return result;
  };
  return { read, save };
}

const localStore = createLocalShiftWorkflowStore(getLocalAppState);
export const readLocalShiftWorkflows = localStore.read;
export const saveLocalShiftWorkflow = localStore.save;
