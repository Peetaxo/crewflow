import type { Contractor, Event, Role, Timelog } from '../../../types';
import { getActiveTimelogApproval, isTimelogWaitingForProfile } from './timelog-approval-state';

export const isTimelogApprovalActionable = (
  timelog: Timelog,
  role: Role,
  currentProfileId?: string | null,
): boolean => {
  if (role === 'crewhead') return timelog.status === 'pending_ch';
  if (role !== 'coo') return false;
  return isTimelogWaitingForProfile(timelog, currentProfileId ?? undefined);
};

export const getTimelogApprovalAssigneeName = (
  timelog: Timelog,
  event: Event | null | undefined,
  contractors: Contractor[],
): string | null => {
  if (timelog.status !== 'pending_ch' && timelog.status !== 'pending_coo') return null;

  // Legacy events omit this flag; mappers and approval handoff treat that as contact approval.
  const usesContactRoute = event?.contactApprovesHours !== false;
  const configuredProfileId = usesContactRoute
    ? event?.contactProfileId ?? null
    : event?.timelogApproverProfileId ?? null;
  let approverProfileId = configuredProfileId;

  if (timelog.status === 'pending_coo' && (timelog.approvals?.length ?? 0) > 0) {
    const activeApproval = getActiveTimelogApproval(timelog);
    if (activeApproval?.status !== 'pending') return null;
    approverProfileId = activeApproval.approverProfileId;
  }

  if (approverProfileId) {
    const approver = contractors.find((contractor) => contractor.profileId === approverProfileId);
    if (approver) return approver.name;
  }

  return usesContactRoute ? event?.contactPerson?.trim() || null : null;
};
