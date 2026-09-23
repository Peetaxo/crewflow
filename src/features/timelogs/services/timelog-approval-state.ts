import type { Timelog, TimelogApproval } from '../../../types';

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
