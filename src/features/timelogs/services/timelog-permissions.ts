import type { Role, Timelog } from '../../../types';

type TimelogPermissionTarget = Pick<Timelog, 'status'>;

export const canCreateTimelog = (role: Role) => role !== 'coo';

export const canEditTimelog = (timelog: TimelogPermissionTarget, role: Role) => {
  if (role === 'crew') {
    return timelog.status === 'draft' || timelog.status === 'rejected';
  }

  if (role === 'crewhead') {
    return timelog.status === 'draft' || timelog.status === 'pending_ch';
  }

  return false;
};

export const canSubmitTimelog = (timelog: TimelogPermissionTarget, role: Role) => (
  (role === 'crew' && (timelog.status === 'draft' || timelog.status === 'rejected'))
  || (role === 'crewhead' && timelog.status === 'draft')
);

export const canSeeTimelogNote = (role: Role) => role !== 'coo';
