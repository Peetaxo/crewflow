import type { Timelog } from '../../types';
import type { ShiftWorkflowSnapshot } from './shift-workflows.contract';
import type { ShiftWorkflowRound } from './shift-workflows.model';
import { compareShiftWorkflowTimestamps } from './shift-workflow-time';

export interface ShiftApprovalGroup {
  round: ShiftWorkflowRound;
  timelogs: Timelog[];
  complete: boolean;
}

/** Only persisted membership identifies a round. Filtering one part never truncates it. */
export function selectShiftApprovalGroups(visible: Timelog[], all: Timelog[], rounds: ShiftWorkflowRound[]) {
  const visibleIds = new Set(visible.map((report) => report.supabaseId).filter(Boolean));
  const latestByTimelog = new Map<string, ShiftWorkflowRound>();
  for (const round of [...rounds].sort((a, b) => compareShiftWorkflowTimestamps(a.updatedAt, b.updatedAt))) {
    for (const id of round.timelogIds) latestByTimelog.set(id, round);
  }
  const selected = rounds.filter((round) => round.timelogIds.some((id) => visibleIds.has(id) && latestByTimelog.get(id) === round));
  return {
    rounds: selected.map((round): ShiftApprovalGroup => {
      const timelogs = round.timelogIds.flatMap((id) => all.filter((report) => report.supabaseId === id));
      const complete = timelogs.length === round.timelogIds.length
        && new Set(timelogs.map((report) => report.supabaseId)).size === round.timelogIds.length
        && timelogs.every((report) => report.contractorProfileId === round.contractorProfileId
          && round.eventIds.includes(report.eventSupabaseId ?? ''));
      return { round, timelogs, complete };
    }),
    legacy: visible.filter((report) => !report.supabaseId || !latestByTimelog.has(report.supabaseId)),
  };
}

export function selectShiftReviewTarget(ids: number[], reports: Timelog[], snapshot: ShiftWorkflowSnapshot): Timelog | null {
  const selected = reports.filter((report) => ids.includes(report.id));
  if (selected.length !== new Set(ids).size) throw new Error('Výkaz již není dostupný. Obnovte data.');
  if (selected.some((report) => report.status === 'draft' || report.status === 'rejected')) {
    if (selected.length === 1) return selected[0];
    throw new Error('Společné výkazy otevřete a potvrďte každý samostatně. Hromadná akce nebyla provedena.');
  }
  const groups = selectShiftApprovalGroups(selected, reports, snapshot.rounds);
  const linked = groups.legacy.filter((report) => snapshot.workflows.some((workflow) => workflow.eventIds.includes(report.eventSupabaseId ?? '')));
  if (!groups.rounds.length && !linked.length) return null;
  if (groups.rounds.length !== 1 || groups.legacy.length) {
    if (selected.length === 1 && linked.length === 1) return selected[0];
    throw new Error('Společné výkazy otevřete a potvrďte každý samostatně. Hromadná akce nebyla provedena.');
  }
  return groups.rounds[0].timelogs[0] ?? selected[0];
}
