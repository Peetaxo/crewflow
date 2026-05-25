import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, Invoice, InvoiceApprovalDocument } from '../types';
import InvoicesView from './InvoicesView';

const setNavigationGuardMessage = vi.fn();
const refetchInvoices = vi.fn();
let mockInvoices: Invoice[] = [];
let mockInvoiceApprovals: InvoiceApprovalDocument[] = [];

const contractors: Contractor[] = [
  {
    id: 1,
    profileId: 'profile-uuid-1',
    userId: 'user-uuid-1',
    name: 'Test Contractor',
    ii: 'TC',
    bg: '#000',
    fg: '#fff',
    tags: [],
    events: 0,
    rate: 200,
    phone: '',
    email: 'test@example.com',
    ico: '',
    dic: '',
    bank: '',
    city: 'Praha',
    reliable: true,
    note: '',
  },
];

const events: Event[] = [
  {
    id: 1,
    name: 'Test Event',
    job: 'JOB-1',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
    city: 'Praha',
    needed: 1,
    filled: 0,
    status: 'upcoming',
    client: 'Test Client',
  },
];

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'profile-uuid-1' }),
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    role: 'coo',
    searchQuery: '',
    setNavigationGuardMessage,
  }),
}));

vi.mock('../components/shared/StatusBadge', () => ({
  default: ({ label, status }: { label?: string; status?: string }) => <span>{label ?? status}</span>,
}));

vi.mock('../components/modals/InvoiceCreateModal', () => ({
  default: function MockInvoiceCreateModal({
    onDirtyChange,
    onSubmitSuccess,
  }: {
    onDirtyChange?: (isDirty: boolean) => void;
    onSubmitSuccess?: () => void;
  }) {
    React.useEffect(() => {
      onDirtyChange?.(true);
    }, [onDirtyChange]);

    return (
      <div>
        <div>Invoice create modal</div>
        <button type="button" onClick={onSubmitSuccess}>submit-success</button>
      </div>
    );
  },
}));

vi.mock('../components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    open ? <div role="dialog">{children}</div> : null
  ),
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../features/invoices/services/invoices.service', () => ({
  approveInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  getInvoiceDependencies: () => ({ contractors, events, timelogs: [] }),
  getPendingInvoiceBatchCount: () => 1,
  sendInvoice: vi.fn(),
}));

vi.mock('../features/invoices/queries/useInvoicesQuery', () => ({
  useInvoicesQuery: () => ({ data: mockInvoices, isLoading: false, error: null, refetch: refetchInvoices }),
}));

vi.mock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
  useInvoiceApprovalsQuery: () => ({ data: mockInvoiceApprovals, isLoading: false, error: null }),
}));

vi.mock('../features/invoices/services/invoice-pdf.service', () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue({ pdfPath: 'invoices/invoice-uuid-1/SF-2026-NOVAK-T-0001.pdf' }),
  getInvoicePdfDownloadUrl: vi.fn().mockResolvedValue('https://signed.example/invoice.pdf'),
}));

describe('InvoicesView', () => {
  beforeEach(() => {
    mockInvoices = [];
    mockInvoiceApprovals = [];
    refetchInvoices.mockReset();
  });

  it('closes invoice creation after submit success without showing discard warning', () => {
    render(<InvoicesView />);

    fireEvent.click(screen.getByRole('button', { name: /Vytvorit fakturu/i }));
    expect(screen.getByText('Invoice create modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'submit-success' }));

    expect(screen.queryByText('Rozpracovany vyber se neulozi')).not.toBeInTheDocument();
    expect(screen.queryByText('Invoice create modal')).not.toBeInTheDocument();
    expect(screen.getByText('Faktury')).toBeInTheDocument();
  });

  it('shows generate PDF button when invoice has no pdfPath', () => {
    mockInvoices = [createInvoiceForPdfTest(null)];

    render(<InvoicesView />);

    expect(screen.getByRole('button', { name: /Vygenerovat PDF/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stahnout PDF/i })).not.toBeInTheDocument();
  });

  it('shows download PDF button when invoice has pdfPath', () => {
    mockInvoices = [createInvoiceForPdfTest('invoices/invoice-uuid-1/SF-2026-NOVAK-T-0001.pdf')];

    render(<InvoicesView />);

    expect(screen.getByRole('button', { name: /Stahnout PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pregenerovat PDF/i })).toBeInTheDocument();
  });

  it('shows PowerApps approval state separately from paid invoice state', () => {
    mockInvoices = [createInvoiceForPdfTest(null)];
    mockInvoiceApprovals = [
      {
        id: 'approval-doc-1',
        source: 'powerapps_document_approval',
        externalId: 'powerapps-doc-1',
        documentName: 'Test Contractor - SF-2026-NOVAK-T-0001.pdf',
        company: 'NL',
        jobNumber: 'JOB-1',
        invoiceNumber: 'SF-2026-NOVAK-T-0001',
        supplierName: 'Test Contractor',
        approvalStatus: 'pending',
        approvalStatusLabel: 've schvalování',
        comment: 'Test Event\n\nTest Contractor\n20.4 9:00 - 16:00\nCelkem 7h',
        approvers: ['Ales Burger'],
        requester: 'Petr Heitzer',
        rawPayload: null,
        matchedInvoiceId: null,
        lastSyncedAt: '2026-05-22T09:00:00Z',
      },
    ];

    render(<InvoicesView />);

    expect(screen.getAllByText('Ve schvalování').length).toBeGreaterThan(0);
    expect(screen.queryByText('Zaplaceno')).not.toBeInTheDocument();
  });

  it('shows imported SharePoint approval documents even before Nodu invoices exist', () => {
    mockInvoices = [];
    mockInvoiceApprovals = [
      {
        id: 'approval-doc-1',
        source: 'powerapps_document_approval',
        externalId: 'sharepoint-doc-1',
        documentName: 'Tyl - 2026-10.pdf',
        company: 'NL',
        jobNumber: 'JTI001',
        invoiceNumber: '2026-10',
        supplierName: 'Milan Tyl',
        approvalStatus: 'pending',
        approvalStatusLabel: 've schvalování',
        comment: 'Koncert Rene Dang\n\nMilan Tyl\n16. 5. 15:00-22:00\nCelkem 12h',
        approvers: ['Ales Burger', 'Marcela Siglova'],
        requester: 'Petr Heitzer',
        rawPayload: null,
        matchedInvoiceId: null,
        lastSyncedAt: '2026-05-22T09:00:00Z',
      },
    ];

    render(<InvoicesView />);

    expect(screen.getByText('SharePoint schvalovani (1)')).toBeInTheDocument();
    expect(screen.getByText('Tyl - 2026-10.pdf')).toBeInTheDocument();
    expect(screen.getByText('Ve schvalování')).toBeInTheDocument();
    expect(screen.getByText('Milan Tyl')).toBeInTheDocument();
    expect(screen.getByText('Zatim zadne faktury')).toBeInTheDocument();
  });

});

const createInvoiceForPdfTest = (pdfPath: string | null = null): Invoice => ({
  id: 'invoice-uuid-1',
  contractorProfileId: 'profile-uuid-1',
  eid: 1,
  hours: 7,
  hAmt: 1400,
  km: 0,
  kAmt: 0,
  receiptAmt: 0,
  total: 1400,
  job: 'JOB-1',
  status: 'draft',
  sentAt: null,
  invoiceNumber: 'SF-2026-NOVAK-T-0001',
  pdfPath,
  pdfGeneratedAt: pdfPath ? '2026-04-27T10:00:00Z' : null,
});
