import { describe, expect, it } from 'vitest';
import type { Timelog, TimelogApproval } from '../../../types';
import { getActiveTimelogApproval, isTimelogWaitingForProfile } from './timelog-approval-state';

const approval = (overrides: Partial<TimelogApproval> = {}): TimelogApproval => ({
  id: '11111111-1111-4111-8111-111111111111',
  approvalRoundId: '22222222-2222-4222-8222-222222222222',
  timelogId: '33333333-3333-4333-8333-333333333333',
  approverProfileId: '44444444-4444-4444-8444-444444444444',
  approverUserId: '55555555-5555-4555-8555-555555555555',
  status: 'pending',
  requestedByProfileId: '66666666-6666-4666-8666-666666666666',
  requestedByUserId: '77777777-7777-4777-8777-777777777777',
  requestedAt: '2026-09-20T08:00:00Z',
  resolvedAt: null,
  supersededAt: null,
  note: '',
  updatedAt: '2026-09-20T08:00:00Z',
  ...overrides,
});

const timelog = (overrides: Partial<Timelog> = {}): Timelog => ({
  id: 4,
  supabaseId: '33333333-3333-4333-8333-333333333333',
  eid: 9,
  days: [],
  km: 0,
  note: '',
  status: 'pending_coo',
  ...overrides,
});

describe('targeted timelog approval state', () => {
  it('returns the one non-superseded approval', () => {
    const active = approval();
    expect(getActiveTimelogApproval(timelog({
      approvals: [approval({ supersededAt: '2026-09-20T09:00:00Z' }), active],
    }))).toBe(active);
  });

  it('fails closed when corrupt history contains multiple active approvals', () => {
    const value = timelog({ approvals: [approval(), approval({ id: '88888888-8888-4888-8888-888888888888' })] });
    expect(getActiveTimelogApproval(value)).toBeNull();
    expect(isTimelogWaitingForProfile(value, approval().approverProfileId)).toBe(false);
  });

  it('matches only the pending active approval profile while pending COO', () => {
    const value = timelog({ approvals: [approval()] });
    expect(isTimelogWaitingForProfile(value, '44444444-4444-4444-8444-444444444444')).toBe(true);
    expect(isTimelogWaitingForProfile(value, '99999999-9999-4999-8999-999999999999')).toBe(false);
    expect(isTimelogWaitingForProfile(value)).toBe(false);
  });

  it('keeps no-history pending COO rows as legacy approvals', () => {
    expect(isTimelogWaitingForProfile(timelog())).toBe(true);
    expect(isTimelogWaitingForProfile(timelog({ approvals: [] }), 'any-profile')).toBe(true);
  });

  it('fails closed for history without an active approval and for other timelog statuses', () => {
    const historical = approval({ status: 'approved', supersededAt: '2026-09-20T10:00:00Z' });
    expect(isTimelogWaitingForProfile(timelog({ approvals: [historical] }), historical.approverProfileId)).toBe(false);
    expect(isTimelogWaitingForProfile(timelog({ status: 'approved', approvals: [] }), historical.approverProfileId)).toBe(false);
  });

  it('never treats local numeric ids as stable profile or timelog UUIDs', () => {
    const value = timelog({ id: 4, approvals: [approval({
      approverProfileId: '44444444-4444-4444-8444-444444444444',
      timelogId: '33333333-3333-4333-8333-333333333333',
    })] });
    expect(isTimelogWaitingForProfile(value, String(value.id))).toBe(false);
  });
});
