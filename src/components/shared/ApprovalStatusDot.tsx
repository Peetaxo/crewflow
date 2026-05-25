import React from 'react';
import type { EventPersonApprovalStatus } from '../../features/invoices/services/invoice-approval-sync.service';

type ApprovalStatusDotProps = {
  status: EventPersonApprovalStatus;
  label: string;
};

const statusClassName: Record<EventPersonApprovalStatus, string> = {
  not_found: 'bg-[color:rgb(var(--nodu-text-rgb)/0.28)] ring-[color:rgb(var(--nodu-text-rgb)/0.12)]',
  pending: 'bg-[color:var(--nodu-info-text)] ring-[color:var(--nodu-info-border)]',
  approved: 'bg-[color:var(--nodu-success-text)] ring-[color:var(--nodu-success-border)]',
  rejected: 'bg-[color:var(--nodu-error-text)] ring-[color:var(--nodu-error-border)]',
  needs_review: 'bg-[color:rgb(var(--nodu-text-rgb)/0.34)] ring-[color:rgb(var(--nodu-text-rgb)/0.12)]',
};

const ApprovalStatusDot = ({ status, label }: ApprovalStatusDotProps) => (
  <span
    role="img"
    aria-label={`Stav schvalovani: ${label}`}
    title={label}
    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-white ${statusClassName[status]}`}
  />
);

export default ApprovalStatusDot;
