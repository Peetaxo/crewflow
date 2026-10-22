import type { Contractor } from '../../../types';

export const resolveCrewName = (member: Pick<Contractor, 'name' | 'firstName' | 'lastName'>) => {
  if (member.firstName !== undefined || member.lastName !== undefined) {
    return { firstName: member.firstName ?? '', lastName: member.lastName ?? '' };
  }

  const parts = member.name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
    : { firstName: parts[0] ?? '', lastName: '' };
};
