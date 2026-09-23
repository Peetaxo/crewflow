import type { Candidate, Invoice, Receipt, Role, Timelog } from '../../types';
import { isTimelogWaitingForProfile } from '../../features/timelogs/services/timelog-approval-state';

interface NavBadgeInput {
  currentProfileId: string | null | undefined;
  role: Role;
  timelogs: Timelog[];
  invoices: Invoice[];
  receipts: Receipt[];
  candidates: Candidate[];
}

export const buildNavBadgeCounts = ({
  currentProfileId,
  role,
  timelogs,
  invoices,
  receipts,
  candidates,
}: NavBadgeInput): Record<string, number> => ({
  timelogs: timelogs.filter((timelog) => {
    if (role === 'crewhead') return timelog.status === 'pending_ch';
    if (role === 'coo') return isTimelogWaitingForProfile(timelog, currentProfileId ?? undefined);
    return false;
  }).length,
  'my-timelogs': currentProfileId
    ? timelogs.filter((timelog) => (
      timelog.contractorProfileId === currentProfileId
      && (
        timelog.status === 'draft'
        || timelog.status === 'pending_ch'
        || timelog.status === 'pending_coo'
        || timelog.status === 'rejected'
      )
    )).length
    : 0,
  invoices: invoices.filter((invoice) => invoice.status === 'sent').length,
  'my-invoices': currentProfileId
    ? invoices.filter((invoice) => (
      invoice.contractorProfileId === currentProfileId && invoice.status !== 'paid'
    )).length
    : 0,
  receipts: receipts.filter((receipt) => (
    receipt.status === 'submitted' || receipt.status === 'approved'
  )).length,
  'my-receipts': currentProfileId
    ? receipts.filter((receipt) => (
      receipt.contractorProfileId === currentProfileId && receipt.status !== 'reimbursed'
    )).length
    : 0,
  recruitment: candidates.filter((candidate) => candidate.stage === 'new').length,
});
