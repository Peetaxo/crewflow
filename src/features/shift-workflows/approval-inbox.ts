import type { Timelog } from '../../types';
import { isTimelogApprovalActionable } from '../timelogs/services/timelog-approval-presentation';
import { canSubmitTimelog } from '../timelogs/services/timelog-permissions';
import { isShiftApprovalGroupActionable, selectShiftApprovalGroups } from './shift-approval-groups';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import { localShiftWorkflowId } from './shift-workflows.local';
import type { ShiftWorkflowRound } from './shift-workflows.model';

export const localCanonicalReport = (report: Timelog): Timelog => ({
  ...report,
  supabaseId: localShiftWorkflowId('timelog', report.id),
  eventSupabaseId: localShiftWorkflowId('event', report.eid),
  contractorProfileId: report.contractorProfileId ? localShiftWorkflowId('profile', report.contractorProfileId) : undefined,
});

export function getApprovalGroups(visible: Timelog[], all: Timelog[], rounds: ShiftWorkflowRound[], scope: ShiftWorkflowScope) {
  if (rounds.length === 0) return { legacy: visible, rounds: [] };
  const local = scope.source === 'local';
  const canonical = local ? all.map(localCanonicalReport) : all;
  const selected = local ? visible.map(localCanonicalReport) : visible;
  const actor = local && scope.profileId ? { ...scope, profileId: localShiftWorkflowId('profile', scope.profileId) } : scope;
  const groups = selectShiftApprovalGroups(selected, canonical, rounds);
  const legacy = new Set(groups.legacy);
  return {
    legacy: visible.filter((_, index) => legacy.has(selected[index])),
    rounds: groups.rounds.map(group => ({ ...group, canAct: isShiftApprovalGroupActionable(group, actor) })),
  };
}

export function getApprovalInbox(visible: Timelog[], all: Timelog[], rounds: ShiftWorkflowRound[] | undefined, scope: ShiftWorkflowScope) {
  if (!rounds) return { legacy: [], rounds: [], count: 0 };
  const groups = getApprovalGroups(visible, all, rounds, scope);
  const crew = scope.role === 'crew';
  const legacy = groups.legacy.filter(report => crew
    ? Boolean(scope.profileId) && report.contractorProfileId === scope.profileId && canSubmitTimelog(report, 'crew')
    : isTimelogApprovalActionable(report, scope.role, scope.profileId));
  const profileId = scope.source === 'local' && scope.profileId ? localShiftWorkflowId('profile', scope.profileId) : scope.profileId;
  const actionable = groups.rounds.filter(group => group.canAct || (
    crew && group.complete && group.round.contractorProfileId === profileId && group.round.status === 'rejected'
    && group.timelogs.every(report => report.status === 'rejected')
  ));
  return { legacy, rounds: actionable, count: legacy.length + actionable.length };
}

/** An event can handle a complete submission for one event. Keep cross-event decisions together. */
export function splitEventRounds(visible: Timelog[], rounds: ReturnType<typeof getApprovalGroups>['rounds'], local: boolean) {
  const byId = new Map(visible.map(report => [local ? report.id : report.supabaseId, report]));
  const byReport = new Map<Timelog, typeof rounds[number]>();
  const separate = rounds.filter(group => {
    if (!group.complete || group.round.workflowId !== null || group.round.eventIds.length !== 1 || group.timelogs.length !== 1) return true;
    const part = group.timelogs[0];
    if (!local && !part.supabaseId) return true;
    const original = byId.get(local ? part.id : part.supabaseId);
    if (!original) return true;
    byReport.set(original, group);
    return false;
  });
  return { separate, byReport };
}
