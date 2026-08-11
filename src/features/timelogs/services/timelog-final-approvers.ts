import type { Event, Role, Timelog } from '../../../types';

export interface TimelogFinalApprover {
  profileId: string;
  name: string;
  roles: Role[];
}

const APPROVER_ROLE_ORDER: Role[] = ['coo', 'crewhead', 'crew'];

const hasManagementRole = (approver: TimelogFinalApprover) => (
  approver.roles.some((role) => role === 'crewhead' || role === 'coo')
);

const sortByRoleAndName = (first: TimelogFinalApprover, second: TimelogFinalApprover) => {
  const firstRoleIndex = Math.min(...first.roles.map((role) => APPROVER_ROLE_ORDER.indexOf(role)).filter((index) => index >= 0));
  const secondRoleIndex = Math.min(...second.roles.map((role) => APPROVER_ROLE_ORDER.indexOf(role)).filter((index) => index >= 0));

  return firstRoleIndex - secondRoleIndex || first.name.localeCompare(second.name, 'cs-CZ');
};

export const filterEligibleTimelogFinalApprovers = (
  approvers: TimelogFinalApprover[],
  timelog: Pick<Timelog, 'contractorProfileId'>,
  currentProfileId: string | null,
): TimelogFinalApprover[] => (
  approvers
    .filter((approver) => (
      approver.profileId
      && hasManagementRole(approver)
      && approver.profileId !== timelog.contractorProfileId
      && approver.profileId !== currentProfileId
    ))
    .sort(sortByRoleAndName)
);

export const getDefaultTimelogFinalApproverIds = (
  event: Pick<Event, 'contactProfileId'> | null | undefined,
  eligibleApprovers: TimelogFinalApprover[],
): string[] => {
  const contactProfileId = event?.contactProfileId ?? null;
  if (!contactProfileId) return [];

  return eligibleApprovers.some((approver) => approver.profileId === contactProfileId)
    ? [contactProfileId]
    : [];
};
