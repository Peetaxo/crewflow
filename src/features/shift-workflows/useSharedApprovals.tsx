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

/** All list surfaces share membership, presentation and the same global editor. */
export function useSharedApprovals(timelogs: Timelog[], events: Event[], contractors: Contractor[]) {
  const workflows = useShiftWorkflows();
  const allTimelogs = useTimelogsQuery().data ?? timelogs;
  const allEvents = useEventsQuery().data ?? events;
  const { setEditingTimelog, role } = useAppContext();
  const local = workflows.scope.source === 'local';
  const canonical = useMemo(() => local ? allTimelogs.map((report) => ({ ...report,
    supabaseId: localShiftWorkflowId('timelog', report.id), eventSupabaseId: localShiftWorkflowId('event', report.eid),
    contractorProfileId: report.contractorProfileId ? localShiftWorkflowId('profile', report.contractorProfileId) : undefined,
  })) : allTimelogs, [local, allTimelogs]);
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
    const ids = new Set(visible.map((report) => report.id));
    return selectShiftApprovalGroups(canonical.filter((report) => ids.has(report.id)), canonical, snapshot?.rounds ?? []);
  };
  const legacyOnly = (visible: Timelog[]) => {
    if (!snapshot) return [];
    const sharedIds = new Set(groupsFor(visible).rounds.flatMap((group) => group.timelogs.map((report) => report.id)));
    return visible.filter((report) => !sharedIds.has(report.id));
  };
  const cards = (visible: Timelog[]) => <>
    {!snapshot && <p role="status" className="mb-3 text-sm">{workflows.query.isError
      ? 'Společné výkazy se nepodařilo načíst. Obnovte data před rozhodnutím.'
      : 'Načítám společné výkazy…'}</p>}
    {groupsFor(visible).rounds.map((group) => <SharedApprovalCard key={group.round.id} group={group} contractors={people}
      events={allEvents} role={local ? role : workflows.scope.role} onOpen={(report) => setEditingTimelog(allTimelogs.find((item) => item.id === report.id) ?? report)}
      history={history?.key === historyKey ? history.actions.filter((action) => action.roundId === group.round.id) : []} />)}
    {snapshot && history?.key === historyKey && history.error && <p role="status" className="text-xs">{history.error}</p>}
  </>;
  const reviewSelection = (ids: number[]) => {
    if (!workflows.ready || !snapshot || workflows.query.isError) throw new Error('Společné výkazy se ještě nenačetly. Obnovte data a zkuste to znovu.');
    const target = selectShiftReviewTarget(ids, canonical, snapshot);
    if (!target) return false;
    setEditingTimelog(allTimelogs.find((report) => report.id === target.id) ?? target);
    return true;
  };
  return { cards, legacyOnly, reviewSelection, groupsFor, ready: Boolean(snapshot), identityKey: `${workflows.scopeKey}:${workflows.ready}` };
}
