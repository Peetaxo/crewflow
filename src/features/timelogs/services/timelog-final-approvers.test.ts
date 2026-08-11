import { describe, expect, it } from 'vitest';
import type { Contractor, Event, Timelog } from '../../../types';
import {
  filterEligibleTimelogFinalApprovers,
  getCurrentPendingTimelogApproval,
  getDefaultTimelogFinalApproverIds,
  hasActiveTimelogApprovals,
  type TimelogFinalApprover,
} from './timelog-final-approvers';

const contractor = (profileId: string, name: string): Contractor => ({
  id: Number(profileId.replace(/\D/g, '')) || 1,
  profileId,
  userId: `user-${profileId}`,
  name,
  ii: name.slice(0, 2).toUpperCase(),
  bg: '#fff',
  fg: '#000',
  tags: [],
  events: 0,
  rate: 250,
  phone: '',
  email: '',
  ico: '',
  dic: '',
  bank: '',
  city: '',
  reliable: true,
  note: '',
});

const event = (contactProfileId: string | null): Event => ({
  id: 1,
  name: 'Event',
  job: 'JOB',
  startDate: '2026-08-11',
  endDate: '2026-08-11',
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'upcoming',
  client: 'Nodu',
  contactProfileId,
});

const timelog = (contractorProfileId: string): Timelog => ({
  id: 10,
  eid: 1,
  contractorProfileId,
  days: [{ d: '2026-08-11', f: '09:00', t: '17:00', type: 'provoz' }],
  km: 0,
  note: '',
  status: 'pending_ch',
});

describe('timelog final approver selection', () => {
  it('keeps only management-capable Nodu profiles and excludes contractor/current user', () => {
    const candidates: TimelogFinalApprover[] = [
      { profileId: 'profile-crewhead', name: 'CrewHead', roles: ['crewhead'] },
      { profileId: 'profile-coo', name: 'COO', roles: ['coo'] },
      { profileId: 'profile-crew', name: 'Crew', roles: ['crew'] },
      { profileId: 'profile-contractor', name: 'Contractor', roles: ['crewhead'] },
      { profileId: 'profile-current', name: 'Current', roles: ['coo'] },
    ];

    expect(filterEligibleTimelogFinalApprovers(candidates, timelog('profile-contractor'), 'profile-current')).toEqual([
      { profileId: 'profile-coo', name: 'COO', roles: ['coo'] },
      { profileId: 'profile-crewhead', name: 'CrewHead', roles: ['crewhead'] },
    ]);
  });

  it('selects the event contact by default only when that profile is eligible', () => {
    const eligible = [
      { profileId: 'profile-coo', name: 'COO', roles: ['coo'] },
      { profileId: 'profile-crewhead', name: 'CrewHead', roles: ['crewhead'] },
    ] satisfies TimelogFinalApprover[];

    expect(getDefaultTimelogFinalApproverIds(event('profile-crewhead'), eligible)).toEqual(['profile-crewhead']);
    expect(getDefaultTimelogFinalApproverIds(event('profile-crew'), eligible)).toEqual([]);
    expect(getDefaultTimelogFinalApproverIds(event(null), eligible)).toEqual([]);
  });

  it('builds a conservative local fallback from internal contractor profiles', () => {
    const localContractors = [
      contractor('profile-1', 'Petr Heitzer'),
      contractor('profile-2', 'Jana Nova'),
    ];

    expect(filterEligibleTimelogFinalApprovers(
      localContractors.map((item) => ({ profileId: item.profileId as string, name: item.name, roles: ['crewhead'] })),
      timelog('profile-1'),
      'profile-2',
    )).toEqual([]);
  });

  it('finds only the current profile pending approval without falling back to another approver', () => {
    const assignedTimelog = {
      approvals: [
        {
          id: 'approval-other',
          approvalRoundId: 'round-1',
          timelogId: 'timelog-1',
          approverProfileId: 'profile-other',
          status: 'pending' as const,
          requestedByProfileId: 'profile-manager',
          requestedAt: '2026-08-11T10:00:00.000Z',
          resolvedAt: null,
          supersededAt: null,
          note: '',
        },
        {
          id: 'approval-current',
          approvalRoundId: 'round-1',
          timelogId: 'timelog-1',
          approverProfileId: 'profile-current',
          status: 'pending' as const,
          requestedByProfileId: 'profile-manager',
          requestedAt: '2026-08-11T10:00:00.000Z',
          resolvedAt: null,
          supersededAt: null,
          note: '',
        },
      ],
    };

    expect(hasActiveTimelogApprovals(assignedTimelog)).toBe(true);
    expect(getCurrentPendingTimelogApproval(assignedTimelog, 'profile-current')?.id).toBe('approval-current');
    expect(getCurrentPendingTimelogApproval(assignedTimelog, 'profile-missing')).toBeNull();
    expect(getCurrentPendingTimelogApproval(assignedTimelog, null)).toBeNull();
  });
});
