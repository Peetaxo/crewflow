import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectStatsView from './ProjectStatsView';

const mocks = vi.hoisted(() => ({
  setSelectedProjectIdForStats: vi.fn(),
  timelogs: [] as Array<{
    id: number;
    eid: number;
    contractorProfileId: string;
    days: Array<{ d: string; f: string; t: string; type: 'provoz' }>;
    km: number;
    note: string;
    status: 'draft';
  }>,
  contractors: [] as Array<{
    id: number;
    profileId: string;
    name: string;
    ii: string;
    bg: string;
    fg: string;
    tags: string[];
    events: number;
    rate: number;
    phone: string;
    email: string;
    ico: string;
    dic: string;
    bank: string;
    city: string;
    reliable: boolean;
    note: string;
  }>,
  invoices: [] as Array<{
    id: string;
    eid: number;
    hours: number;
    hAmt: number;
    km: number;
    kAmt: number;
    total: number;
    job: string;
    status: 'sent';
    sentAt: null;
  }>,
}));

const project = {
  id: 'JTI001',
  name: 'JTI 2026',
  client: 'JTI',
  note: '',
  createdAt: '2026-04-28',
};

const events = [
  { id: 1, name: 'Majales priprava', job: 'JTI001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
  { id: 2, name: 'Majales rozvozy', job: 'JTI001', startDate: '2026-05-02', endDate: '2026-05-02', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
];

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('recharts', () => ({
  Cell: () => null,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    selectedProjectIdForStats: 'JTI001',
    setSelectedProjectIdForStats: mocks.setSelectedProjectIdForStats,
  }),
}));

vi.mock('../features/projects/services/projects.service', () => ({
  getProjectById: () => project,
  getProjectDependencies: () => ({
    projects: [project],
    events,
    invoices: mocks.invoices,
    clients: [],
  }),
  subscribeToProjectChanges: () => vi.fn(),
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => ({ contractors: mocks.contractors }),
  getTimelogs: () => mocks.timelogs,
  subscribeToTimelogChanges: () => vi.fn(),
}));

vi.mock('../features/receipts/services/receipts.service', () => ({
  getReceipts: () => [
    { id: 1, eid: 2, job: 'JTI001', title: 'Parking', vendor: 'Garage', amount: 500, paidAt: '2026-05-02', note: '', status: 'approved' },
  ],
  subscribeToReceiptChanges: () => vi.fn(),
}));

describe('ProjectStatsView project statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.timelogs = [];
    mocks.contractors = [];
    mocks.invoices = [
      { id: 'inv-1', eid: 1, hours: 0, hAmt: 0, km: 0, kAmt: 0, total: 3000, job: 'JTI001', status: 'sent', sentAt: null },
    ];
  });

  it('does not render a budget section or budget editing controls', () => {
    render(<ProjectStatsView />);

    expect(screen.getByRole('heading', { name: 'JTI 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /rozpo[cč]et/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Planovany rozpocet')).not.toBeInTheDocument();
    expect(screen.queryByText('Variance')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nazev baliku')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pridat balik' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pridat polozku' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('budget-package-1')).not.toBeInTheDocument();
  });

  it('preserves project statistics, receipts, and approved invoices', () => {
    render(<ProjectStatsView />);

    expect(screen.getByText('Naklady Crew')).toBeInTheDocument();
    expect(screen.getByText('Hodiny')).toBeInTheDocument();
    expect(screen.getByText('Kilometry')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rozdeleni nakladu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Proplacene hodiny' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timelogy projektu' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Uctenky projektu' }));
    const receiptRow = screen.getByText('Parking').closest('tr');
    expect(receiptRow).not.toBeNull();
    expect(within(receiptRow!).getByText('500 Kc')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Schvalene faktury' }));
    const invoiceRow = screen.getByText('inv-1').closest('tr');
    expect(invoiceRow).not.toBeNull();
    expect(within(invoiceRow!).getByText('3 000 Kc')).toBeInTheDocument();
  });

  it('returns to the project list', () => {
    render(<ProjectStatsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Zpet na Projekty' }));

    expect(mocks.setSelectedProjectIdForStats).toHaveBeenCalledWith(null);
  });

  it('calculates project hours and crew costs across midnight', () => {
    mocks.invoices = [];
    mocks.contractors = [
      {
        id: 1,
        profileId: 'profile-1',
        name: 'Marek Rebros',
        ii: 'MR',
        bg: '#fff',
        fg: '#111',
        tags: [],
        events: 1,
        rate: 250,
        phone: '',
        email: '',
        ico: '',
        dic: '',
        bank: '',
        city: '',
        reliable: true,
        note: '',
      },
    ];
    mocks.timelogs = [
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-1',
        days: [{ d: '2026-05-01', f: '20:00', t: '01:00', type: 'provoz' }],
        km: 0,
        note: '',
        status: 'draft',
      },
    ];

    render(<ProjectStatsView />);

    expect(screen.getAllByText('5.0h').length).toBeGreaterThan(0);
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('1 250 Kc')).toBeInTheDocument();
    expect(screen.queryByText('-19h')).not.toBeInTheDocument();
  });
});
