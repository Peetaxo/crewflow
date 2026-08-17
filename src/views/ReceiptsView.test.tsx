import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReceiptItem, Role } from '../types';
import ReceiptsView from './ReceiptsView';

let role: Role = 'crewhead';
const { updateReceiptStatusMock, toastErrorMock } = vi.hoisted(() => ({
  updateReceiptStatusMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

const receipts: ReceiptItem[] = [
  { id: 1, eid: 1, job: 'JOB-1', title: 'Draft receipt', vendor: '', amount: 100, paidAt: '2026-04-20', note: '', status: 'draft' },
  { id: 2, eid: 1, job: 'JOB-1', title: 'Rejected receipt', vendor: '', amount: 100, paidAt: '2026-04-20', note: '', status: 'rejected' },
  { id: 3, eid: 1, job: 'JOB-1', title: 'Submitted receipt', vendor: '', amount: 100, paidAt: '2026-04-20', note: '', status: 'submitted' },
  { id: 4, eid: 1, job: 'JOB-1', title: 'Approved receipt', vendor: '', amount: 100, paidAt: '2026-04-20', note: '', status: 'approved' },
  { id: 5, eid: 1, job: 'JOB-1', title: 'Attached receipt', vendor: '', amount: 100, paidAt: '2026-04-20', note: '', status: 'attached' },
  { id: 6, eid: 1, job: 'JOB-1', title: 'Reimbursed receipt', vendor: '', amount: 100, paidAt: '2026-04-20', note: '', status: 'reimbursed' },
];

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn(), info: vi.fn() },
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'profile-uuid-1' }),
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    role,
    searchQuery: '',
    setEditingReceipt: vi.fn(),
    setDeleteConfirm: vi.fn(),
  }),
}));

vi.mock('../features/receipts/queries/useReceiptsQuery', () => ({
  useReceiptsQuery: () => ({ data: receipts, isLoading: false, error: null }),
}));

vi.mock('../features/receipts/services/receipts.service', () => ({
  createEmptyReceipt: vi.fn(() => ({ id: 99, status: 'draft' })),
  getReceiptDependencies: () => ({
    events: [{
      id: 1,
      name: 'Test event',
      job: 'JOB-1',
      startDate: '2026-04-20',
      endDate: '2026-04-20',
      city: 'Praha',
      needed: 1,
      filled: 1,
      status: 'upcoming',
      client: 'Client',
    }],
    contractors: [],
  }),
  updateReceiptStatus: updateReceiptStatusMock,
}));

vi.mock('../components/shared/StatusBadge', () => ({
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));

describe('ReceiptsView receipt integrity actions', () => {
  beforeEach(() => {
    role = 'crewhead';
    vi.clearAllMocks();
    updateReceiptStatusMock.mockResolvedValue(undefined);
  });

  it('offers delete only for draft and rejected receipts', () => {
    render(<ReceiptsView />);

    for (const title of ['Draft receipt', 'Rejected receipt']) {
      const row = screen.getByText(title).closest('tr');
      expect(row).not.toBeNull();
      expect(within(row!).getByRole('button', { name: /Smazat účtenku/i })).toBeInTheDocument();
    }

    for (const title of ['Submitted receipt', 'Approved receipt', 'Attached receipt', 'Reimbursed receipt']) {
      const row = screen.getByText(title).closest('tr');
      expect(row).not.toBeNull();
      expect(within(row!).queryByRole('button', { name: /Smazat účtenku/i })).not.toBeInTheDocument();
    }
  });

  it('keeps reimbursement COO-only while CrewHead can still approve submitted receipts', () => {
    const { rerender } = render(<ReceiptsView />);

    expect(screen.getByRole('button', { name: 'Schválit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zamítnout' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proplatit' })).not.toBeInTheDocument();

    role = 'coo';
    rerender(<ReceiptsView />);

    expect(screen.getByRole('button', { name: 'Proplatit' })).toBeInTheDocument();
  });

  it('shows only the stable receipt domain error from a rejected status mutation', async () => {
    role = 'crew';
    updateReceiptStatusMock.mockRejectedValue(new Error(
      'Účtenky se mezitím změnily. Obnovte data a zkuste to znovu.',
    ));
    render(<ReceiptsView />);
    const draftRow = screen.getByText('Draft receipt').closest('tr');
    expect(draftRow).not.toBeNull();

    within(draftRow!).getByRole('button', { name: 'Odeslat' }).click();

    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(
      'Účtenky se mezitím změnily. Obnovte data a zkuste to znovu.',
    ));
    expect(toastErrorMock).not.toHaveBeenCalledWith(expect.stringContaining('sensitive database'));
  });
});
