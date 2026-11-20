import type { Timelog, TimelogApproval } from '../../../types';
import { normalizeMealSelection } from '../../../utils';

export const APPROVED_HOURS_STATUSES: readonly Timelog['status'][] = ['approved', 'invoiced', 'paid'];
export const hasApprovedHours = (timelog: Pick<Timelog, 'status'>) => APPROVED_HOURS_STATUSES.includes(timelog.status);

export const getActiveTimelogApproval = (timelog: Timelog): TimelogApproval | null => {
  const activeApprovals = (timelog.approvals ?? []).filter((approval) => approval.supersededAt === null);
  return activeApprovals.length === 1 ? activeApprovals[0] : null;
};

export const isTimelogWaitingForProfile = (
  timelog: Timelog,
  profileId?: string,
): boolean => {
  if (timelog.status !== 'pending_coo') return false;

  const approvals = timelog.approvals ?? [];
  if (approvals.length === 0) return true;

  const activeApproval = getActiveTimelogApproval(timelog);
  return activeApproval?.status === 'pending'
    && profileId !== undefined
    && activeApproval.approverProfileId === profileId;
};

/** Local edits may preserve updatedAt, so compare the reviewed evidence as well as both versions. */
export const getTimelogReviewKey = (report: Timelog): string => JSON.stringify([
  report.id, report.supabaseId, report.eventSupabaseId ?? report.eid, report.contractorProfileId,
  report.status, report.updatedAt,
  (report.approvals ?? []).filter(approval => approval.supersededAt === null).map(approval => [
    approval.id, approval.updatedAt, approval.timelogId, approval.status, approval.approverProfileId, approval.approverUserId,
  ]),
  report.days.map(day => [day.id, day.d, day.f, day.t, day.type, normalizeMealSelection(day), day.note ?? '']),
  report.km, report.note ?? '', report.reviewNote ?? '',
]);
