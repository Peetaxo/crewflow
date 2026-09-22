import { describe, expect, it } from 'vitest';
import type { Contractor, Event, Timelog, TimelogApproval } from '../../../types';
import {
  getTimelogApprovalAssigneeName,
  isTimelogApprovalActionable,
} from './timelog-approval-presentation';

const activeApproval = (approverProfileId: string): TimelogApproval => ({
  id: '11111111-1111-4111-8111-111111111111',
  approvalRoundId: '22222222-2222-4222-8222-222222222222',
  timelogId: '33333333-3333-4333-8333-333333333333',
  approverProfileId,
  approverUserId: '44444444-4444-4444-8444-444444444444',
  status: 'pending',
  requestedByProfileId: '55555555-5555-4555-8555-555555555555',
  requestedByUserId: '66666666-6666-4666-8666-666666666666',
  requestedAt: '2026-09-20T08:00:00Z',
  resolvedAt: null,
  supersededAt: null,
  note: '',
  updatedAt: '2026-09-20T08:00:00Z',
});

const timelog = (overrides: Partial<Timelog> = {}): Timelog => ({
  id: 1,
  eid: 1,
  days: [{ d: '2026-09-20', f: '08:00', t: '16:00', type: 'provoz' }],
  km: 0,
  note: '',
  status: 'pending_coo',
  ...overrides,
});

const contractors = [
  { profileId: 'profile-coo', name: 'Jana Schvalovatelka' },
  { profileId: 'profile-contact', name: 'Karel Kontakt' },
] as Contractor[];

describe('timelog approval presentation', () => {
  it('allows a targeted COO action only for the active assignee and fails closed without identity', () => {
    const targeted = timelog({ approvals: [activeApproval('profile-coo')] });

    expect(isTimelogApprovalActionable(targeted, 'coo', 'profile-coo')).toBe(true);
    expect(isTimelogApprovalActionable(targeted, 'coo', 'profile-other')).toBe(false);
    expect(isTimelogApprovalActionable(targeted, 'coo', null)).toBe(false);
  });

  it('keeps legacy pending COO reports actionable while CH remains role based', () => {
    expect(isTimelogApprovalActionable(timelog({ approvals: [] }), 'coo', null)).toBe(true);
    expect(isTimelogApprovalActionable(timelog({ status: 'pending_ch' }), 'crewhead', null)).toBe(true);
    expect(isTimelogApprovalActionable(timelog({ status: 'pending_ch' }), 'coo', 'profile-coo')).toBe(false);
  });

  it('resolves the active approver name and falls back to configured event routing', () => {
    const event = {
      timelogApproverProfileId: 'profile-contact',
      contactProfileId: 'profile-contact',
      contactPerson: 'Karel Kontakt',
    } as Event;

    expect(getTimelogApprovalAssigneeName(
      timelog({ approvals: [activeApproval('profile-coo')] }),
      event,
      contractors,
    )).toBe('Jana Schvalovatelka');
    expect(getTimelogApprovalAssigneeName(timelog({ status: 'pending_ch' }), event, contractors)).toBe('Karel Kontakt');
  });
});
