import { describe, expect, it } from 'vitest';
import type { Timelog } from '../../types';
import type { ShiftWorkflowRound } from './shift-workflows.model';
import { selectShiftApprovalGroups, selectShiftReviewTarget } from './shift-approval-groups';

const report = (id: number): Timelog => ({ id, supabaseId: `t${id}`, eid: id,
  eventSupabaseId: `e${id}`, contractorProfileId: 'person', status: 'pending_ch',
  days: [{ d: '2026-09-20', f: '08:00', t: '10:00', type: 'provoz' }], km: 0, note: '' });
const round: ShiftWorkflowRound = { id: 'round', workflowId: 'workflow', contractorProfileId: 'person',
  status: 'pending_ch', eventIds: ['e1', 'e2'], timelogIds: ['t1', 't2'], note: '', updatedAt: '2026-09-20T00:00:00Z' };

describe('frozen approval group selection', () => {
  it('shows one exact round from any filtered part and excludes later drafts', () => {
    const reports = [report(1), report(2), { ...report(3), status: 'draft' as const }];
    const result = selectShiftApprovalGroups([reports[1]], reports, [round]);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].timelogs.map((t) => t.id)).toEqual([1, 2]);
    expect(result.legacy).toEqual([]);
  });
  it('never infers rounds from a person, job or dates and preserves single-event rounds', () => {
    expect(selectShiftApprovalGroups([report(1), report(2)], [report(1), report(2)], []).legacy).toHaveLength(2);
    expect(selectShiftApprovalGroups([report(1)], [report(1)], [{ ...round, eventIds: ['e1'], timelogIds: ['t1'] }]).rounds).toHaveLength(1);
  });
  it('keeps incomplete rounds visible but prevents a decision', () => {
    const group = selectShiftApprovalGroups([report(1)], [report(1)], [round]).rounds[0];
    expect(group.complete).toBe(false);
  });
  it('resolves either part to the same representative and rejects independent rounds before mutation', () => {
    const reports = [report(1), report(2), report(3)];
    const snapshot = { revision: 1, assignedEventIds: [], workflows: [], rounds: [round] };
    expect(selectShiftReviewTarget([2], reports, snapshot)?.id).toBe(1);
    expect(() => selectShiftReviewTarget([1, 3], reports, snapshot)).toThrow(/samostatně/);
    expect(selectShiftReviewTarget([3], reports, snapshot)).toBeNull();
  });
  it('routes a new unlinked submission through the one-part shared editor and refuses independent bulk submissions', () => {
    const reports = [{ ...report(1), status: 'draft' as const }, { ...report(2), status: 'rejected' as const }];
    const snapshot = { revision: 1, assignedEventIds: [], workflows: [], rounds: [] };
    expect(selectShiftReviewTarget([1], reports, snapshot)?.id).toBe(1);
    expect(() => selectShiftReviewTarget([1, 2], reports, snapshot)).toThrow(/samostatně/);
  });
});
