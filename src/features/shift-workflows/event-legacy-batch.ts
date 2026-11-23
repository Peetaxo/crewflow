import type { Event, Timelog } from '../../types';
import { calculateTotalHours } from '../../utils';
import { getLifecycleSnapshotGeneration } from '../event-lifecycle-generation';
import { addAmounts } from '../events/services/event-hours-costs';
import { billingUuid, type BillingQuote } from '../invoice-billing/contract';
import { billingService } from '../invoice-billing/service';
import { createStableDraftUuid } from '../stable-draft-identity';
import { isTimelogApprovalActionable } from '../timelogs/services/timelog-approval-presentation';
import { getActiveTimelogApproval, getTimelogReviewKey } from '../timelogs/services/timelog-approval-state';
import { loadTimelogsSnapshot, updateTimelogStatuses, type TimelogActionOptions } from '../timelogs/services/timelogs.service';
import { localAmount, type ReviewedEventItem } from './event-round-batch';
import { compareShiftWorkflowTimestamps } from './shift-workflow-time';
import { shiftWorkflowConflict, type ShiftWorkflowScope, type ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { localShiftWorkflowId } from './shift-workflows.local';

export async function prepareLegacyEventBatch(event: Event, entries: { report: Timelog; name: string }[],
  scope: ShiftWorkflowScope, assertCurrent: () => void, reload: () => Promise<ShiftWorkflowSnapshot>): Promise<ReviewedEventItem[]> {
  if (!entries.length) return [];
  assertCurrent();
  const local = scope.source === 'local';
  const approve = scope.role === 'coo';
  if ((!approve && scope.role !== 'crewhead') || !scope.userId || !scope.profileId) throw shiftWorkflowConflict();
  const reports = structuredClone(entries.map(entry => entry.report));
  const ids = reports.map(report => report.id);
  const keys = reports.map(getTimelogReviewKey);
  const eventId = local ? localShiftWorkflowId('event', event.id) : event.supabaseId;
  const stableIds = reports.map(report => local ? localShiftWorkflowId('timelog', report.id) : report.supabaseId ?? '');
  if (!eventId || new Set(stableIds).size !== ids.length || new Set(ids).size !== ids.length
    || reports.some(report => {
      const active = getActiveTimelogApproval(report);
      const sameEvent = local ? report.eid === event.id : report.eventSupabaseId === eventId;
      return !sameEvent || (!local && (!billingUuid.safeParse(report.supabaseId).success || !report.updatedAt))
        || !isTimelogApprovalActionable(report, scope.role, scope.profileId)
        || (approve && active && (active.approverUserId !== scope.userId
          || active.timelogId !== (report.supabaseId ?? `local-timelog-${report.id}`)));
    })) throw shiftWorkflowConflict();

  const verify = async (current: () => void) => {
    current();
    const generation = getLifecycleSnapshotGeneration();
    const [snapshot, fresh] = await Promise.all([reload(), loadTimelogsSnapshot()]);
    current();
    if (generation !== getLifecycleSnapshotGeneration() || snapshot.workflows.some(group => group.eventIds.includes(eventId))
      || snapshot.rounds.some(round => round.timelogIds.some(id => stableIds.includes(id)))) throw shiftWorkflowConflict();
    reports.forEach((report, index) => {
      const matches = fresh.filter(row => local ? row.id === report.id : row.supabaseId === report.supabaseId);
      if (matches.length !== 1 || getTimelogReviewKey(matches[0]) !== keys[index]) throw shiftWorkflowConflict();
    });
  };

  await verify(assertCurrent);
  const options: TimelogActionOptions = { currentProfileId: scope.profileId, expectedReviewKeys: keys };
  let quote: BillingQuote | undefined;
  if (approve && !local) {
    quote = await billingService.quote(stableIds);
    assertCurrent();
    if (quote.timelogIds.length !== ids.length || quote.preview.reports.length !== ids.length) throw shiftWorkflowConflict();
    for (const report of reports) {
      const source = quote.preview.reports.find(row => row.timelogId === report.supabaseId);
      if (!source || !quote.timelogIds.includes(source.timelogId) || source.eventId !== eventId
        || source.contractorId !== report.contractorProfileId || source.status !== report.status
        || compareShiftWorkflowTimestamps(source.reportUpdatedAt, report.updatedAt!) !== 0) throw shiftWorkflowConflict();
    }
    options.billingApproval = { quoteId: quote.id, targets: reports.map(report => {
      const active = getActiveTimelogApproval(report);
      return { id: report.supabaseId!, expectedUpdatedAt: report.updatedAt!, approvalId: active?.id ?? null, approvalUpdatedAt: active?.updatedAt ?? null };
    }) };
  } else if (!local) {
    options.handoffTargets = reports.map(report => ({ id: report.supabaseId!, expectedUpdatedAt: report.updatedAt!,
      approvalId: createStableDraftUuid(), approvalRoundId: createStableDraftUuid() }));
  }
  const prices = approve && local ? reports.map(localAmount) : undefined;
  const amount = prices ? prices.reduce(addAmounts, 0) : quote?.preview.totalAmount ?? null;
  let attempted = false;
  return [{ key: JSON.stringify(['legacy', stableIds]), count: reports.length, name: entries.map(entry => entry.name).join(', '),
    hours: reports.reduce((total, report) => total + calculateTotalHours(report.days), 0), amount, quote,
    write: async current => {
      current();
      if (!attempted || local) {
        await verify(current);
        if (prices && reports.some((report, index) => localAmount(report) !== prices[index])) throw shiftWorkflowConflict();
      }
      // Remote retries carry the exact stable UUIDs, versions and server quote or handoff tokens.
      attempted = true;
      return updateTimelogStatuses(ids, approve ? 'coo' : 'ch', { ...options, assertCurrent: current });
    },
  }];
}
