import { describe, expect, it } from 'vitest';
import type { Contractor, Event, Timelog, TimelogApproval } from '../../../types';
import {
  getTimelogApprovalAssigneeName,
  isTimelogApprovalActionable,
} from './timelog-approval-presentation';

const activeApproval = (
  approverProfileId: string,
  overrides: Partial<TimelogApproval> = {},
): TimelogApproval => ({
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
  ...overrides,
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
  { profileId: 'profile-separate', name: 'Sona Samostatna' },
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

  it('uses the contact route when enabled even if the separate approver field conflicts', () => {
    const event = {
      contactApprovesHours: true,
      contactProfileId: 'profile-contact',
      timelogApproverProfileId: 'profile-separate',
      contactPerson: 'Karel Kontakt',
    } as Event;

    expect(getTimelogApprovalAssigneeName(timelog({ status: 'pending_ch' }), event, contractors)).toBe('Karel Kontakt');
  });

  it('uses only the separate approver route when the contact does not approve hours', () => {
    const eventWithoutSeparateApprover = {
      contactApprovesHours: false,
      contactProfileId: 'profile-contact',
      timelogApproverProfileId: null,
      contactPerson: 'Karel Kontakt',
    } as Event;
    const eventWithSeparateApprover = {
      ...eventWithoutSeparateApprover,
      timelogApproverProfileId: 'profile-separate',
    } as Event;

    expect(getTimelogApprovalAssigneeName(
      timelog({ status: 'pending_ch' }),
      eventWithoutSeparateApprover,
      contractors,
    )).toBeNull();
    expect(getTimelogApprovalAssigneeName(
      timelog({ status: 'pending_ch' }),
      eventWithSeparateApprover,
      contractors,
    )).toBe('Sona Samostatna');
  });

  it('treats missing legacy route metadata as contact approval for compatibility', () => {
    const legacyEvent = {
      contactProfileId: 'profile-contact',
      timelogApproverProfileId: 'profile-separate',
      contactPerson: 'Karel Kontakt',
    } as Event;

    expect(getTimelogApprovalAssigneeName(
      timelog({ status: 'pending_ch' }),
      legacyEvent,
      contractors,
    )).toBe('Karel Kontakt');
  });

  it('uses current event routing for pending CH instead of a stale returned approval', () => {
    const event = {
      contactApprovesHours: false,
      contactProfileId: 'profile-contact',
      timelogApproverProfileId: 'profile-separate',
    } as Event;
    const resubmitted = timelog({
      status: 'pending_ch',
      approvals: [activeApproval('profile-coo', { status: 'returned' })],
    });

    expect(getTimelogApprovalAssigneeName(resubmitted, event, contractors)).toBe('Sona Samostatna');
  });

  it('keeps the frozen pending COO approver when event routing changes', () => {
    const changedEvent = {
      contactApprovesHours: false,
      contactProfileId: 'profile-contact',
      timelogApproverProfileId: 'profile-separate',
    } as Event;

    expect(getTimelogApprovalAssigneeName(
      timelog({ approvals: [activeApproval('profile-coo')] }),
      changedEvent,
      contractors,
    )).toBe('Jana Schvalovatelka');
  });

  it('does not label a resolved report with a current approver', () => {
    expect(getTimelogApprovalAssigneeName(
      timelog({ status: 'rejected', approvals: [activeApproval('profile-coo', { status: 'returned' })] }),
      { contactApprovesHours: true, contactProfileId: 'profile-contact' } as Event,
      contractors,
    )).toBeNull();
  });
});
