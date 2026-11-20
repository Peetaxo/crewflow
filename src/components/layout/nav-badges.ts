import type { Candidate, Invoice, ReceiptItem, Role } from '../../types';

interface NavBadgeInput {
  currentProfileId: string | null | undefined;
  role: Role;
  approvalCount: number;
  invoices: Invoice[];
  receipts: ReceiptItem[];
  candidates: Candidate[];
}

export const buildNavBadgeCounts = ({
  currentProfileId,
  role,
  approvalCount,
  invoices,
  receipts,
  candidates,
}: NavBadgeInput): Record<string, number> => ({
  timelogs: role === 'crew' ? 0 : approvalCount,
  'my-timelogs': role === 'crew' ? approvalCount : 0,
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
