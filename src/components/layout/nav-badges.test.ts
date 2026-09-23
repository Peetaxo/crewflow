import { describe, expect, it } from 'vitest';
import type { Candidate, Invoice, Receipt, Timelog } from '../../types';
import { buildNavBadgeCounts } from './nav-badges';

describe('buildNavBadgeCounts', () => {
  it('builds shared desktop and mobile nav badges for the active profile', () => {
    const timelogs = [
      { id: 1, contractorProfileId: 'profile-1', status: 'draft' },
      { id: 2, contractorProfileId: 'profile-1', status: 'pending_ch' },
      { id: 3, contractorProfileId: 'profile-1', status: 'pending_coo' },
      { id: 4, contractorProfileId: 'profile-2', status: 'pending_ch' },
      { id: 5, contractorProfileId: 'profile-1', status: 'rejected' },
      { id: 6, contractorProfileId: 'profile-1', status: 'approved' },
    ] as Timelog[];
    const invoices = [
      { id: 'invoice-1', contractorProfileId: 'profile-1', status: 'sent' },
      { id: 'invoice-2', contractorProfileId: 'profile-1', status: 'paid' },
      { id: 'invoice-3', contractorProfileId: 'profile-2', status: 'sent' },
    ] as Invoice[];
    const receipts = [
      { id: 'receipt-1', contractorProfileId: 'profile-1', status: 'submitted' },
      { id: 'receipt-2', contractorProfileId: 'profile-1', status: 'approved' },
      { id: 'receipt-3', contractorProfileId: 'profile-1', status: 'reimbursed' },
      { id: 'receipt-4', contractorProfileId: 'profile-2', status: 'approved' },
    ] as Receipt[];
    const candidates = [
      { id: 1, stage: 'new' },
      { id: 2, stage: 'screening' },
    ] as Candidate[];

    expect(buildNavBadgeCounts({
      currentProfileId: 'profile-1',
      role: 'crewhead',
      timelogs,
      invoices,
      receipts,
      candidates,
    })).toEqual({
      timelogs: 2,
      'my-timelogs': 4,
      invoices: 2,
      'my-invoices': 1,
      receipts: 3,
      'my-receipts': 2,
      recruitment: 1,
    });
  });

  it('returns crew scoped badges as zero when no current profile is selected', () => {
    expect(buildNavBadgeCounts({
      currentProfileId: null,
      role: 'crew',
      timelogs: [{ id: 1, contractorProfileId: 'profile-1', status: 'draft' } as Timelog],
      invoices: [{ id: 'invoice-1', contractorProfileId: 'profile-1', status: 'sent' } as Invoice],
      receipts: [{ id: 'receipt-1', contractorProfileId: 'profile-1', status: 'submitted' } as Receipt],
      candidates: [],
    })).toMatchObject({
      'my-timelogs': 0,
      'my-invoices': 0,
      'my-receipts': 0,
    });
  });

  it('counts only the current COO assignee plus legacy reports in the approval badge', () => {
    const approval = (approverProfileId: string) => ({
      id: `approval-${approverProfileId}`,
      approvalRoundId: `round-${approverProfileId}`,
      timelogId: `timelog-${approverProfileId}`,
      approverProfileId,
      status: 'pending' as const,
      supersededAt: null,
    });
    const timelogs = [
      { id: 1, status: 'pending_coo', approvals: [approval('profile-me')] },
      { id: 2, status: 'pending_coo', approvals: [approval('profile-other')] },
      { id: 3, status: 'pending_coo', approvals: [] },
      { id: 4, status: 'pending_ch' },
    ] as Timelog[];

    expect(buildNavBadgeCounts({
      currentProfileId: 'profile-me',
      role: 'coo',
      timelogs,
      invoices: [],
      receipts: [],
      candidates: [],
    }).timelogs).toBe(2);

    expect(buildNavBadgeCounts({
      currentProfileId: null,
      role: 'coo',
      timelogs,
      invoices: [],
      receipts: [],
      candidates: [],
    }).timelogs).toBe(1);
  });
});
