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
  const activeApproval = getActiveTimelogApproval(timelog);
  const configuredProfileId = event?.timelogApproverProfileId
    ?? (event?.contactApprovesHours ? event.contactProfileId : null)
    ?? event?.contactProfileId
    ?? null;
  const approverProfileId = activeApproval?.approverProfileId ?? configuredProfileId;

  if (approverProfileId) {
    const approver = contractors.find((contractor) => contractor.profileId === approverProfileId);
    if (approver) return approver.name;
  }

  return event?.contactPerson?.trim() || null;
};
