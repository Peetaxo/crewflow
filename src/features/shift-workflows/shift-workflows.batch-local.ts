import type { Timelog, TimelogApproval, TimelogStatus } from '../../types';
import { normalizeMealSelection } from '../../utils';
import { createStableDraftUuid } from '../stable-draft-identity';
import { assertTimelogComplete } from '../timelogs/services/timelog-validation';
import { mapTimelogConfirmationSnapshot } from '../timelogs/services/timelog-confirmation-snapshot';
import { assertShiftBatchCommand, parseShiftBatchResult } from './shift-workflows.batch-contract';
import type { ShiftBatchCommand, ShiftReportPayload } from './shift-workflows.batch-commands';
import { canManageShiftWorkflows, canonicalUuid, ShiftWorkflowError, shiftWorkflowConflict, type ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftWorkflow } from './shift-workflows.model';
import { canonicalizeLocalShiftData, localShiftWorkflowId, type LocalShiftData, type LocalShiftRound } from './shift-workflows.local';

// This re-export uses the same membership/round singleton, never another store.
export { executeLocalShiftBatch } from './shift-workflows.local';

export interface LocalShiftRequest { actor: string; payload: string; result: unknown }
export interface LocalShiftBatchOptions {
  now?: () => number;
  /** Atomically replace all hours. Synchronous subscribers may read the store. */
  commitTimelogs?: (timelogs: Timelog[]) => void;
}
interface Dependencies extends LocalShiftBatchOptions {
  getData: () => LocalShiftData;
  getWorkflows: () => ShiftWorkflow[];
  getRounds: () => LocalShiftRound[];
  setRounds: (rounds: LocalShiftRound[]) => void;
  requests: Map<string, LocalShiftRequest>;
}
interface ReportMetadata { submittedAt: string | null; approvedAt: string | null; snapshot: unknown }
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
));
const active = (round: LocalShiftRound) => ['pending_ch', 'pending_coo', 'pending_crew_confirmation'].includes(round.status);
const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length
  && new Set(b).size === b.length && a.every((id) => b.includes(id));
const invalid = (message = 'Části společné evidence nejsou jednoznačné. Obnovte data.'): never => {
  throw new ShiftWorkflowError('invalid', message);
};
const denied = (message = 'Nepodařilo se ověřit oprávnění a profil přihlášeného uživatele.'): never => {
  throw new ShiftWorkflowError('denied', message);
};
const complete = (reports: Timelog[]) => reports.forEach((report) => {
  try { assertTimelogComplete(report); } catch (error) { invalid((error as Error).message); }
});

/** In-memory mirror of the public atomic RPC protocol, exclusively for local data. */
export function createLocalShiftBatchExecutor(deps: Dependencies) {
  let metadata = new Map<string, ReportMetadata>();
  let committing = false;
  const execute = (scope: ShiftWorkflowScope, command: ShiftBatchCommand): unknown => {
    if (scope.source !== 'local') denied('Lokální náhled nelze použít pro vzdálená data.');
    assertShiftBatchCommand(command);
    const raw = deps.getData();
    const data = canonicalizeLocalShiftData(raw);
    const rounds = deps.getRounds();
    const profileId = scope.profileId ? localShiftWorkflowId('profile', scope.profileId) : null;
    const profiles = (raw.contractors ?? []).filter((p) => p.profileId).map((p) => ({
      ...p, profileId: localShiftWorkflowId('profile', p.profileId!),
    }));
    const bound = (profile: string, user: string) => Boolean(user)
      && profiles.filter((p) => p.userId === user).length === 1
      && profiles.filter((p) => p.profileId === profile).length === 1
      && profiles.some((p) => p.profileId === profile && p.userId === user);
    if (!scope.userId || !profileId || !bound(profileId, scope.userId)) denied();
    if (command.kind !== 'transition' && (scope.role !== 'crew' || profileId !== command.contractorProfileId)) denied();
    const round = command.roundId ? rounds.find((r) => r.id === command.roundId) : undefined;
    const actor = stableJson([scope.userId, profileId]);
    const payload = stableJson(command);
    const previous = deps.requests.get(command.requestId);
    if (previous) {
      if (previous.actor !== actor || previous.payload !== payload) invalid('Požadavek má jiné údaje. Obnovte výběr.');
      if (command.kind === 'transition' && (!round || (!canManageShiftWorkflows(scope.role)
        && !(scope.role === 'crew' && round.contractorProfileId === profileId && round.contractorUserId === scope.userId)))) denied();
      return structuredClone(previous.result);
    }
    if (committing) throw shiftWorkflowConflict();
    if (!deps.commitTimelogs) denied('Lokální úložiště není připravené pro zápis.');
    const reports = data.timelogs;
    if (new Set(reports.map((t) => t.supabaseId)).size !== reports.length
      || new Set(data.events.map((e) => e.supabaseId)).size !== data.events.length) invalid();
    const validateFrozen = (r: LocalShiftRound) => {
      if (!Number.isInteger(r.expectedItemCount) || r.expectedItemCount < 1
        || r.timelogIds.length !== r.expectedItemCount || r.eventIds.length !== r.expectedItemCount
        || !sameSet(r.timelogIds, r.timelogIds) || !sameSet(r.eventIds, r.eventIds)
        || r.timelogIds.some((id, index) => !reports.some((t) => t.supabaseId === id
          && t.eventSupabaseId === r.eventIds[index] && t.contractorProfileId === r.contractorProfileId))
        || r.eventIds.some((id) => !data.events.some((e) => e.supabaseId === id))) invalid('Propojené směny se nepodařilo bezpečně načíst.');
    };
    const inputs = command.kind === 'transition' ? command.targets : command.timelogs;
    const ids = inputs.map((t) => t.id);
    const selected = ids.map((id) => reports.find((t) => t.supabaseId === id) ?? invalid());
    let currentRound: LocalShiftRound | undefined;
    if (command.kind === 'transition') {
      if (!round) invalid();
      currentRound = round!;
      validateFrozen(currentRound);
      if (currentRound.workflowId !== command.workflowId || currentRound.contractorProfileId !== command.contractorProfileId
        || !active(currentRound) || currentRound.updatedAt !== command.expectedRoundUpdatedAt
        || !sameSet(ids, currentRound.timelogIds)) throw shiftWorkflowConflict();
      if (!bound(currentRound.contractorProfileId, currentRound.contractorUserId)) denied();
      const allowed = currentRound.status === 'pending_ch' && scope.role === 'crewhead'
        ? ['handoff', 'correct', 'return'] : currentRound.status === 'pending_coo' && scope.role === 'coo'
          ? ['approve', 'return'] : currentRound.status === 'pending_crew_confirmation' && scope.role === 'crew'
            && profileId === currentRound.contractorProfileId && scope.userId === currentRound.contractorUserId ? ['confirm'] : [];
      if (!allowed.includes(command.action)) denied();
      if (command.affectedEventId !== null && !currentRound.eventIds.includes(command.affectedEventId)) invalid();
    } else {
      const workflows = deps.getWorkflows();
      const workflow = command.workflowId ? workflows.find((w) => w.id === command.workflowId) : undefined;
      const eventIds = workflow?.eventIds ?? (command.workflowId === null ? [command.anchorEventId] : []);
      if (!eventIds.includes(command.anchorEventId) || eventIds.some((id) => !data.events.some((e) => e.supabaseId === id))) invalid();
      if (command.workflowId === null && workflows.some((w) => w.eventIds.includes(command.anchorEventId))) invalid();
      const assigned = data.eventCrewAssignments.filter((a) => a.contractorProfileId === profileId && eventIds.includes(a.eventSupabaseId));
      if (!assigned.some((a) => a.eventSupabaseId === command.anchorEventId)) denied();
      const cohortRounds = rounds.filter((r) => r.contractorProfileId === profileId && r.workflowId === command.workflowId
        && (command.workflowId !== null || r.eventIds.includes(command.anchorEventId)));
      if (command.kind === 'submit' && (round || cohortRounds.some(active))) throw shiftWorkflowConflict();
      if (command.kind === 'save' && command.roundId !== null) {
        if (!round || round.status !== 'pending_crew_confirmation' || round.contractorProfileId !== profileId
          || round.contractorUserId !== scope.userId || round.workflowId !== command.workflowId
          || !round.eventIds.includes(command.anchorEventId)) throw shiftWorkflowConflict();
        currentRound = round;
        validateFrozen(round);
        if (!sameSet(ids, round.timelogIds)) invalid();
      } else {
        const assignedReports = assigned.map((a) => {
          const found = reports.filter((t) => t.eventSupabaseId === a.eventSupabaseId && t.contractorProfileId === profileId);
          if (found.length !== 1) invalid('Chybí jednoznačný výkaz přiřazené směny. Obnovte data.');
          return found[0];
        });
        const eligible = assignedReports.filter((t) => ['draft', 'rejected'].includes(t.status)
          && !rounds.some((r) => active(r) && r.timelogIds.includes(t.supabaseId!)));
        if (!sameSet(ids, eligible.map((t) => t.supabaseId!))) invalid();
      }
      if (rounds.some((r) => r.contractorUserId !== scope.userId && r.timelogIds.some((id) => ids.includes(id)))) denied();
    }
    selected.forEach((report, index) => {
      const input = inputs[index];
      if (report.contractorProfileId !== command.contractorProfileId || report.updatedAt !== input.expected_updated_at
        || report.status !== input.expected_status || (currentRound && report.status !== currentRound.status)
        || ('event_id' in input && input.event_id !== report.eventSupabaseId)) throw shiftWorkflowConflict();
      if (rounds.some((r) => active(r) && r.id !== currentRound?.id && r.timelogIds.includes(report.supabaseId!))) throw shiftWorkflowConflict();
    });
    const writes = command.kind === 'transition' ? command.corrections : command.timelogs;
    if (writes) {
      for (const write of writes) {
        const target = selected.find((t) => t.supabaseId === write.id);
        if (!target || target.eventSupabaseId !== write.event_id) invalid();
        for (const day of write.days) {
          if (reports.some((t) => t.supabaseId !== write.id && t.days.some((d) => d.id === day.id))) invalid('Záznam dne patří jinému výkazu.');
        }
      }
    }
    const now = new Date(Math.max((deps.now ?? Date.now)(), ...selected.map((t) => Date.parse(t.updatedAt!) + 1),
      currentRound ? Date.parse(currentRound.updatedAt) + 1 : 0)).toISOString();
    const nextMetadata = new Map(metadata);
    const metadataFor = (report: Timelog): ReportMetadata => nextMetadata.get(report.supabaseId!)
      ?? { submittedAt: null, approvedAt: null, snapshot: report.crewConfirmationSnapshot ?? null };
    const receiptReport = (report: Timelog) => {
      const meta = metadataFor(report);
      const approvals = (report.approvals ?? []).filter((a) => a.supersededAt === null);
      if (approvals.length > 1) invalid('Schválení výkazu není jednoznačné.');
      const approval = approvals[0];
      return { id: report.supabaseId!, event_id: report.eventSupabaseId!, contractor_id: report.contractorProfileId!,
        status: report.status, updated_at: report.updatedAt!, km: report.km, note: report.note, review_note: report.reviewNote ?? null,
        crew_confirmation_snapshot: meta.snapshot, submitted_at: meta.submittedAt, approved_at: meta.approvedAt,
        days: report.days.map((d) => { const meals = normalizeMealSelection(d); return {
          id: d.id!, date: d.d, time_from: d.f, time_to: d.t, day_type: d.type, note: d.note ?? '', meal: meals[0] ?? null, meals,
        }; }), approval: approval ? { id: approval.id, approval_round_id: approval.approvalRoundId, status: approval.status,
          updated_at: approval.updatedAt, approver_profile_id: approval.approverProfileId, approver_user_id: approval.approverUserId } : null };
    };
    const applyWrite = (report: Timelog, input?: ShiftReportPayload): Timelog => input ? { ...report,
      km: input.km, note: input.note, days: input.days.map((d) => ({ id: d.id, d: d.date, f: d.time_from, t: d.time_to,
        type: d.day_type, note: d.note, meal: d.meal, meals: [...d.meals] })),
    } : report;
    let nextStatus: TimelogStatus | undefined;
    let approver: { profileId: string; userId: string } | undefined;
    if (command.kind === 'submit') nextStatus = 'pending_ch';
    if (command.kind === 'transition') {
      nextStatus = ({ handoff: 'pending_coo', correct: 'pending_crew_confirmation', confirm: 'pending_ch',
        approve: 'approved', return: 'rejected' } as const)[command.action];
      if (command.action === 'handoff') {
        const configured = selected.map((t) => {
          const event = data.events.find((e) => e.supabaseId === t.eventSupabaseId)!;
          const configuredId = (event.contactApprovesHours ?? true) ? event.contactProfileId : event.timelogApproverProfileId;
          if (!configuredId) invalid('Akce nemá nastaveného schvalovatele hodin.');
          return localShiftWorkflowId('profile', configuredId!);
        });
        if (new Set(configured).size !== 1) invalid('Směny nemají společného schvalovatele hodin.');
        const person = profiles.find((p) => p.profileId === configured[0]);
        if (!person?.userId || !bound(person.profileId, person.userId) || !canonicalUuid.safeParse(person.userId).success) denied('Schvalovatel hodin nemá ověřený profil.');
        approver = { profileId: person.profileId, userId: person.userId };
        if (approver.profileId === profileId || approver.profileId === command.contractorProfileId
          || approver.userId === scope.userId || approver.userId === currentRound!.contractorUserId) denied('Schvalovatel hodin musí být jiná osoba než CH a člen crew.');
        complete(selected);
        selected.forEach((t) => {
          const approvals = (t.approvals ?? []).filter((a) => a.supersededAt === null);
          if (approvals.length > 1 || approvals.some((a) => a.status === 'pending')) invalid();
        });
      }
      if (currentRound!.status === 'pending_coo') {
        selected.forEach((t) => {
          const approvals = (t.approvals ?? []).filter((a) => a.supersededAt === null);
          const a = approvals[0];
          if (approvals.length !== 1 || a.status !== 'pending') invalid();
          if (a.approverProfileId !== profileId || a.approverUserId !== scope.userId
            || !bound(a.approverProfileId, a.approverUserId) || !bound(a.requestedByProfileId, a.requestedByUserId)
            || a.approverProfileId === a.requestedByProfileId || a.approverUserId === a.requestedByUserId
            || a.approverProfileId === command.contractorProfileId || a.approverUserId === currentRound!.contractorUserId) denied();
        });
      }
      if (command.action === 'confirm' || command.action === 'approve') complete(selected);
    }
    const updated = selected.map((report): Timelog => {
      const meta = { ...metadataFor(report) };
      let next = { ...applyWrite(report, writes?.find((t) => t.id === report.supabaseId)), updatedAt: now, status: nextStatus ?? report.status };
      if (command.kind === 'submit') {
        meta.submittedAt = now; meta.approvedAt = null; meta.snapshot = null;
        next = { ...next, reviewNote: undefined, crewConfirmationSnapshot: null };
      }
      if (command.kind === 'transition') {
        if (command.action === 'correct') {
          const { crew_confirmation_snapshot: _old, ...before } = receiptReport(report);
          meta.snapshot = before;
          next.crewConfirmationSnapshot = mapTimelogConfirmationSnapshot(before, { id: report.supabaseId!, event_id: report.eventSupabaseId!,
            contractor_id: report.contractorProfileId!, updated_at: now });
        }
        if (command.action === 'correct' || command.action === 'return') next.reviewNote = command.note.trim();
        if (approver) {
          const approval: TimelogApproval = { id: createStableDraftUuid(), approvalRoundId: createStableDraftUuid(), timelogId: report.supabaseId!,
            approverProfileId: approver.profileId, approverUserId: approver.userId, requestedByProfileId: profileId!, requestedByUserId: scope.userId!,
            status: 'pending', requestedAt: now, resolvedAt: null, supersededAt: null, note: '', updatedAt: now };
          next.approvals = [...(report.approvals ?? []).map((a) => a.supersededAt === null ? { ...a, supersededAt: now, updatedAt: now } : a), approval];
        } else if (currentRound!.status === 'pending_coo') {
          next.approvals = (report.approvals ?? []).map((a) => a.supersededAt === null ? { ...a,
            status: command.action === 'approve' ? 'approved' : 'returned', resolvedAt: now, updatedAt: now, note: command.note.trim() } : a);
          if (command.action === 'approve') { meta.approvedAt = now; next.reviewNote = undefined; }
        }
      }
      nextMetadata.set(report.supabaseId!, meta);
      return next;
    });
    if (command.kind === 'submit') complete(updated);
    let nextRound = currentRound ? { ...currentRound, status: nextStatus ?? currentRound.status, updatedAt: now } as LocalShiftRound : undefined;
    if (nextRound && command.kind === 'transition' && ['correct', 'return'].includes(command.action)) nextRound.note = command.note.trim();
    if (command.kind === 'submit') {
      const order = deps.getWorkflows().find((w) => w.id === command.workflowId)?.eventIds ?? [command.anchorEventId];
      const ordered = [...selected].sort((a, b) => order.indexOf(a.eventSupabaseId!) - order.indexOf(b.eventSupabaseId!));
      nextRound = { id: command.roundId!, workflowId: command.workflowId, contractorProfileId: command.contractorProfileId,
        contractorUserId: scope.userId!, expectedItemCount: selected.length, status: 'pending_ch', note: '', updatedAt: now,
        eventIds: ordered.map((t) => t.eventSupabaseId!), timelogIds: ordered.map((t) => t.supabaseId!) };
    }
    const result = { request_id: command.requestId, workflow_id: command.workflowId,
      round: nextRound ? { id: nextRound.id, workflow_id: nextRound.workflowId, contractor_id: nextRound.contractorProfileId,
        status: nextRound.status, event_ids: nextRound.eventIds, timelog_ids: nextRound.timelogIds, note: nextRound.note, updated_at: nextRound.updatedAt } : null,
      timelogs: updated.map(receiptReport) };
    // Validate the complete response before making any state visible.
    parseShiftBatchResult(result, command);
    const nextRounds = nextRound ? [...rounds.filter((r) => r.id !== nextRound!.id), nextRound] : rounds;
    const byLocalId = new Map(updated.map((t) => [t.id, t]));
    const nextReports = raw.timelogs.map((t) => {
      const changed = byLocalId.get(t.id);
      // Preserve the app's local profile identity; canonical IDs stay at this boundary.
      return changed ? { ...changed, contractorProfileId: t.contractorProfileId,
        supabaseId: t.supabaseId, eventSupabaseId: t.eventSupabaseId } : t;
    });
    const oldMetadata = metadata;
    committing = true;
    metadata = nextMetadata;
    deps.setRounds(nextRounds);
    deps.requests.set(command.requestId, { actor, payload, result: structuredClone(result) });
    try {
      deps.commitTimelogs!(structuredClone(nextReports));
    } catch (error) {
      // updateLocalAppState publishes after storing the entire snapshot. A
      // subscriber exception cannot undo that committed transaction. A storage
      // failure before assignment restores every private piece of the store.
      if (stableJson(deps.getData().timelogs) !== stableJson(nextReports)) {
        metadata = oldMetadata;
        deps.setRounds(rounds);
        deps.requests.delete(command.requestId);
        throw error;
      }
    } finally { committing = false; }
    return structuredClone(result);
  };
  return execute;
}
