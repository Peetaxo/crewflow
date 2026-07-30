import type { Role, Timelog } from '../../../types';

type TimelogPermissionTarget = Pick<Timelog, 'status'>;

export const canCreateTimelog = (role: Role) => role === 'crew';

export const canEditTimelog = (timelog: TimelogPermissionTarget, role: Role) => {
  if (role === 'crew') {
    return timelog.status === 'draft'
      || timelog.status === 'rejected'
      || timelog.status === 'pending_crew_confirmation';
  }

  if (role === 'crewhead') {
    return timelog.status === 'pending_ch';
  }

  return false;
};

export const canSubmitTimelog = (timelog: TimelogPermissionTarget, role: Role) => (
  (
    role === 'crew'
    && (
      timelog.status === 'draft'
      || timelog.status === 'rejected'
      || timelog.status === 'pending_crew_confirmation'
    )
  )
);

export const canSeeTimelogNote = (role: Role) => role !== 'coo';
