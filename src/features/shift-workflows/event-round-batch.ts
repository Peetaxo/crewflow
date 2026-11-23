import type { Event, Timelog } from '../../types';
import { getLocalAppState } from '../../lib/app-data';
import { calculateMealAllowance, calculateTotalHours } from '../../utils';
import { getLifecycleSnapshotGeneration } from '../event-lifecycle-generation';
import { priceApprovedLog, totalCrewCosts } from '../events/services/event-hours-costs';
import type { BillingQuote } from '../invoice-billing/contract';
import { billingService } from '../invoice-billing/service';
import { createStableDraftUuid } from '../stable-draft-identity';
import { getTimelogReviewKey } from '../timelogs/services/timelog-approval-state';
import { loadTimelogsSnapshot } from '../timelogs/services/timelogs.service';
import { localCanonicalReport } from './approval-inbox';
import { isShiftApprovalGroupActionable, selectShiftApprovalGroups, type ShiftApprovalGroup } from './shift-approval-groups';
import { compareShiftWorkflowTimestamps } from './shift-workflow-time';
import { writeShiftEvidenceBatch } from './shift-evidence-write';
import { prepareShiftTransition } from './shift-workflows.batch-commands';
import { shiftWorkflowConflict, type ShiftWorkflowScope, type ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { canonicalizeLocalShiftData, localShiftWorkflowId } from './shift-workflows.local';

export interface EventRoundEntry { group: ShiftApprovalGroup; report: Timelog; name: string }
export interface ReviewedEventItem {
  key: string; name: string; count?: number; hours: number; amount: number | null; quote?: BillingQuote;
  write: (assertCurrent: () => void) => Promise<unknown>;
}

export function localAmount(report: Timelog) {
  const state = getLocalAppState();
  const member = state.contractors.find(p => p.profileId === report.contractorProfileId);
  const event = state.events.find(e => e.id === report.eid);
  if (!event || !member) throw shiftWorkflowConflict();
  const meals = calculateMealAllowance(report.days, { enabled: Boolean(event.mealAllowanceEnabled) });
  return totalCrewCosts(priceApprovedLog(Math.round(calculateTotalHours(report.days) * 60), meals, report.km,
    member.hasKnownRate === false ? null : member.rate).costs);
}

/** Read roster versions and evidence once for the whole selection. Each frozen round
 * still needs its own optimistic transition and, on Supabase, its own billing quote. */
export async function prepareEventRoundBatch(event: Event, entries: EventRoundEntry[], scope: ShiftWorkflowScope,
  reload: () => Promise<ShiftWorkflowSnapshot>, assertCurrent: () => void): Promise<ReviewedEventItem[]> {
  const local = scope.source === 'local';
  const eventId = local ? localShiftWorkflowId('event', event.id) : event.supabaseId;
  const actor = local && scope.profileId ? { ...scope, profileId: localShiftWorkflowId('profile', scope.profileId) } : scope;
  if (!eventId || !entries.length || !['crewhead', 'coo'].includes(scope.role)
    || new Set(entries.map(e => e.group.round.id)).size !== entries.length
    || new Set(entries.map(e => e.group.round.timelogIds[0])).size !== entries.length) throw shiftWorkflowConflict();
  const generation = getLifecycleSnapshotGeneration();
  const [snapshot, reports] = await Promise.all([reload(), loadTimelogsSnapshot()]);
  assertCurrent();
  if (generation !== getLifecycleSnapshotGeneration()) throw shiftWorkflowConflict();
  const canonical = local ? canonicalizeLocalShiftData({ events: [], timelogs: reports, invoices: [], eventCrewAssignments: [] }).timelogs : reports;
  const current = selectShiftApprovalGroups(canonical, canonical, snapshot.rounds);
  const groups = new Map(current.rounds.map(g => [g.round.id, g]));
  const result: ReviewedEventItem[] = [];
  for (const entry of entries) {
    const group = groups.get(entry.group.round.id);
    const report = group?.timelogs[0];
    const raw = reports.find(item => local ? item.id === entry.report.id : item.supabaseId === entry.report.supabaseId);
    if (!raw || !report || !group || !isShiftApprovalGroupActionable(group, actor)
      || !isShiftApprovalGroupActionable(entry.group, actor)) throw shiftWorkflowConflict();
    const shown = local ? localCanonicalReport(raw) : raw;
    const singleRound = (g: ShiftApprovalGroup) => g.timelogs.length === 1 && g.round.timelogIds.length === 1
      && g.round.eventIds.length === 1 && g.round.eventIds[0] === eventId && g.round.timelogIds[0] === shown.supabaseId;
    if (!singleRound(group) || !singleRound(entry.group) || group.round.updatedAt !== entry.group.round.updatedAt
      || group.round.workflowId !== entry.group.round.workflowId || group.round.contractorProfileId !== shown.contractorProfileId
      || getTimelogReviewKey(raw) !== getTimelogReviewKey(entry.report)
      || getTimelogReviewKey(entry.group.timelogs[0]) !== getTimelogReviewKey(shown)) throw shiftWorkflowConflict();
    const approve = scope.role === 'coo';
    let quote: BillingQuote | undefined;
    if (approve && !local) {
      assertCurrent();
      quote = await billingService.quote([report.supabaseId!]);
      assertCurrent();
      const source = quote.preview.reports[0];
      if (quote.timelogIds.length !== 1 || quote.timelogIds[0] !== report.supabaseId || quote.preview.reports.length !== 1
        || source.timelogId !== report.supabaseId || source.eventId !== eventId || source.contractorId !== report.contractorProfileId
        || source.status !== 'pending_coo' || compareShiftWorkflowTimestamps(source.reportUpdatedAt, report.updatedAt!) !== 0) throw shiftWorkflowConflict();
    }
    const amount = quote ? quote.preview.totalAmount : approve ? localAmount(raw) : null;
    const command = prepareShiftTransition({ workflowId: group.round.workflowId, contractorProfileId: group.round.contractorProfileId,
      anchorEventId: eventId, eventIds: [eventId], timelogs: [report], activeRound: group.round },
      createStableDraftUuid(), approve ? 'approve' : 'handoff', { billingQuoteId: quote?.id });
    let attempted = false;
    result.push({ key: group.round.id, name: entry.name, hours: calculateTotalHours(report.days), amount, quote,
      write: async current => {
        current();
        if (!attempted && approve && local && localAmount(raw) !== amount) throw shiftWorkflowConflict();
        attempted = true;
        return writeShiftEvidenceBatch(scope, command, current);
      } });
  }
  return result;
}
