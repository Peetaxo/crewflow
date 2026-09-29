import React, { useEffect, useMemo, useState } from 'react';
import type { Contractor, Event, Timelog } from '../../types';
import { useAppContext } from '../../context/useAppContext';
import { useTimelogsQuery } from '../timelogs/queries/useTimelogsQuery';
import { useEventsQuery } from '../events/queries/useEventsQuery';
import { useShiftWorkflows } from './useShiftWorkflows';
import { localShiftWorkflowId } from './shift-workflows.local';
import { selectShiftApprovalGroups, selectShiftReviewTarget } from './shift-approval-groups';
import { SharedApprovalCard } from './SharedApprovalCard';
import { readShiftRoundHistory, type ShiftRoundAction } from './shift-round-history';
import { compareShiftWorkflowTimestamps } from './shift-workflow-time';

const localCanonicalReport = (report: Timelog): Timelog => ({ ...report,
  supabaseId: localShiftWorkflowId('timelog', report.id), eventSupabaseId: localShiftWorkflowId('event', report.eid),
  contractorProfileId: report.contractorProfileId ? localShiftWorkflowId('profile', report.contractorProfileId) : undefined,
});

/** All list surfaces share membership, presentation and the same global editor. */
export function useSharedApprovals(timelogs: Timelog[], events: Event[], contractors: Contractor[]) {
  const workflows = useShiftWorkflows();
  const allTimelogs = useTimelogsQuery().data ?? timelogs;
  const allEvents = useEventsQuery().data ?? events;
  const { setEditingTimelog, role } = useAppContext();
  const local = workflows.scope.source === 'local';
  const canonical = useMemo(() => local ? allTimelogs.map(localCanonicalReport) : allTimelogs, [local, allTimelogs]);
  const canonicalEvents = useMemo(() => local ? allEvents.map((event) => ({ ...event,
    supabaseId: localShiftWorkflowId('event', event.id),
  })) : allEvents, [allEvents, local]);
  const people = useMemo(() => local ? contractors.map((person) => ({ ...person,
    profileId: person.profileId ? localShiftWorkflowId('profile', person.profileId) : person.profileId,
  })) : contractors, [contractors, local]);
  const snapshot = workflows.ready && !workflows.query.isError ? workflows.query.data : undefined;
  const historyKey = JSON.stringify([workflows.scopeKey, snapshot?.rounds.map((round) => [round.id, round.updatedAt])]);
  const [history, setHistory] = useState<{ key: string; actions: ShiftRoundAction[]; error?: string } | null>(null);
  useEffect(() => {
    if (!workflows.ready || !snapshot) return;
    const controller = new AbortController();
    let active = true;
    void readShiftRoundHistory(workflows.scope, snapshot.rounds.map((round) => round.id), controller.signal).then(
      (actions) => { if (active) setHistory({ key: historyKey, actions }); },
      () => { if (active) setHistory({ key: historyKey, actions: [], error: 'Historie schvalování není dostupná.' }); },
    );
    return () => { active = false; controller.abort(); };
  }, [historyKey, snapshot, workflows.ready, workflows.scope]);

  const groupsFor = (visible: Timelog[]) => {
    return selectShiftApprovalGroups(local ? visible.map(localCanonicalReport) : visible, canonical, snapshot?.rounds ?? []);
  };
  const legacyOnly = (visible: Timelog[]) => {
    if (!snapshot) return [];
    const sharedIds = new Set(groupsFor(visible).rounds.flatMap((group) => group.round.timelogIds));
    return visible.filter((report) => !sharedIds.has((local ? localCanonicalReport(report) : report).supabaseId ?? ''));
  };
  const cards = (visible: Timelog[]) => <>
    {!snapshot && <p role="status" className="mb-3 text-sm">{workflows.query.isError
      ? 'Společné výkazy se nepodařilo načíst. Obnovte data před rozhodnutím.'
      : 'Načítám společné výkazy…'}</p>}
    {groupsFor(visible).rounds.map((group) => {
      const relatedRoundIds = new Set(snapshot?.rounds.filter((round) => round.contractorProfileId === group.round.contractorProfileId
        && compareShiftWorkflowTimestamps(round.updatedAt, group.round.updatedAt) <= 0 && (round.id === group.round.id
          || (group.round.workflowId !== null && round.workflowId === group.round.workflowId)
          || round.timelogIds.some((id) => group.round.timelogIds.includes(id))
          || round.eventIds.some((id) => group.round.eventIds.includes(id)))).map((round) => round.id));
      return <SharedApprovalCard key={group.round.id} group={group} contractors={people}
        events={canonicalEvents} role={local ? role : workflows.scope.role}
        onOpen={(report) => setEditingTimelog(local ? allTimelogs.find((item) => item.id === report.id) ?? report : report)}
        history={history?.key === historyKey ? history.actions.filter((action) => relatedRoundIds.has(action.roundId)) : []} />;
    })}
    {snapshot && history?.key === historyKey && history.error && <p role="status" className="text-xs">{history.error}</p>}
  </>;
  const reviewSelection = (ids: number[]) => {
    if (!workflows.ready || !snapshot || workflows.query.isError) throw new Error('Společné výkazy se ještě nenačetly. Obnovte data a zkuste to znovu.');
    const selected = ids.map((id) => {
      const shown = timelogs.filter((report) => report.id === id);
      if (shown.length !== 1) throw new Error('Výběr výkazů se změnil. Obnovte data.');
      const identity = local ? localCanonicalReport(shown[0]) : shown[0];
      const matches = canonical.filter((report) => identity.supabaseId && report.supabaseId === identity.supabaseId
        && report.eventSupabaseId === identity.eventSupabaseId && report.contractorProfileId === identity.contractorProfileId);
      if (matches.length !== 1) throw new Error('Identita výkazu se změnila. Obnovte data.');
      return matches[0];
    });
    let target = selectShiftReviewTarget(selected.map((report) => report.id), canonical, snapshot);
    if (!target && selected.some((report, index) => report.id !== ids[index])) {
      if (selected.length !== 1) throw new Error('Výběr výkazů se změnil. Otevřete je jednotlivě.');
      target = selected[0];
    }
    if (!target) return false;
    setEditingTimelog(local ? allTimelogs.find((report) => report.id === target.id) ?? target : target);
    return true;
  };
  return { cards, legacyOnly, reviewSelection, groupsFor, ready: Boolean(snapshot), identityKey: `${workflows.scopeKey}:${workflows.ready}` };
}
