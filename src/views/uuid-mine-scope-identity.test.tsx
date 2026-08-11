import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, Invoice, ReceiptItem, Timelog } from '../types';

let mockAuth = {
  isAuthRequired: true,
  isAuthenticated: true,
  isLoading: false,
  hasKnownSession: true,
  isDevSession: false,
  session: null,
  user: null,
  role: 'crew' as const,
  isRoleSwitching: false,
  profile: { firstName: 'Test', lastName: 'User', email: 'test@example.com' },
  currentProfileId: 'profile-uuid-2',
  currentUserId: 'user-uuid-2',
  currentContractorId: 2,
  devLoginOptions: [],
  signIn: vi.fn(),
  signInAsDevUser: vi.fn(),
  switchRole: vi.fn(),
  signOut: vi.fn(),
};

const setEditingReceipt = vi.fn();
const setEditingTimelog = vi.fn();
const setDeleteConfirm = vi.fn();
const setNavigationGuardMessage = vi.fn();
const setSidebarCollapsed = vi.fn();
const setRole = vi.fn();
const setCurrentTab = vi.fn();
const setSettingsSection = vi.fn();
const setSearchQuery = vi.fn();
const setSelectedContractorProfileId = vi.fn();
const setSelectedEventId = vi.fn();
const setSelectedProjectIdForStats = vi.fn();
const setSelectedClientIdForStats = vi.fn();

let mockAppContext = {
  darkMode: false,
  searchQuery: '',
  role: 'crew' as const,
  timelogFilter: 'all',
  setTimelogFilter: vi.fn(),
  setEditingReceipt,
  setEditingTimelog,
  setDeleteConfirm,
  setNavigationGuardMessage,
  sidebarCollapsed: false,
  setSidebarCollapsed,
  setRole,
  currentTab: 'dashboard',
  setCurrentTab,
  settingsSection: 'menu' as const,
  setSettingsSection,
  setSearchQuery,
  setSelectedContractorProfileId,
  setSelectedEventId,
  setSelectedProjectIdForStats,
  setSelectedClientIdForStats,
};

const contractors: Contractor[] = [
  {
    id: 1,
    profileId: 'profile-uuid-1',
    userId: 'user-uuid-1',
    name: 'Prvni Contractor',
    ii: 'PC',
    bg: '#000',
    fg: '#fff',
    tags: [],
    events: 1,
    rate: 200,
    phone: '',
    email: 'prvni@example.com',
    ico: '',
    dic: '',
    bank: '',
    city: 'Praha',
    reliable: true,
    note: '',
  },
  {
    id: 2,
    profileId: 'profile-uuid-2',
    userId: 'user-uuid-2',
    name: 'Prihlaseny Contractor',
    ii: 'KC',
    bg: '#111',
    fg: '#fff',
    tags: [],
    events: 1,
    rate: 250,
    phone: '',
    email: 'prihlaseny@example.com',
    ico: '',
    dic: '',
    bank: '',
    city: 'Brno',
    reliable: true,
    note: '',
  },
];

const events: Event[] = [
  {
    id: 1,
    name: 'Akce prvni',
    job: 'JOB-1',
    startDate: '2999-04-20',
    endDate: '2999-04-20',
    city: 'Praha',
    needed: 1,
    filled: 1,
    status: 'upcoming',
    client: 'Klient 1',
  },
  {
    id: 2,
    name: 'Akce moje',
    job: 'JOB-2',
    startDate: '2999-04-21',
    endDate: '2999-04-21',
    city: 'Brno',
    needed: 1,
    filled: 1,
    status: 'upcoming',
    client: 'Klient 2',
  },
];

const baseTimelogs: Timelog[] = [
  { id: 1, eid: 1, contractorProfileId: 'profile-uuid-1', days: [{ d: '2999-04-20', f: '08:00', t: '12:00', type: 'provoz' }], km: 0, note: '', status: 'draft' },
  { id: 2, eid: 2, contractorProfileId: 'profile-uuid-2', days: [{ d: '2999-04-21', f: '09:00', t: '15:00', type: 'provoz' }], km: 12, note: '', status: 'draft' },
];

let timelogs: Timelog[] = [...baseTimelogs];

const receipts: ReceiptItem[] = [
  { id: 1, contractorProfileId: 'profile-uuid-1', eid: 1, job: 'JOB-1', title: 'Prvni receipt', vendor: 'Vendor 1', amount: 100, paidAt: '2026-04-20', note: '', status: 'approved' },
  { id: 2, contractorProfileId: 'profile-uuid-2', eid: 2, job: 'JOB-2', title: 'Moje receipt', vendor: 'Vendor 2', amount: 250, paidAt: '2026-04-21', note: '', status: 'draft' },
];

const invoices: Invoice[] = [
  { id: 'INV-1', contractorProfileId: 'profile-uuid-1', eid: 1, hours: 4, hAmt: 800, km: 0, kAmt: 0, total: 800, job: 'JOB-1', status: 'sent', sentAt: '2026-04-20' },
  { id: 'INV-2', contractorProfileId: 'profile-uuid-2', eid: 2, hours: 6, hAmt: 1500, km: 12, kAmt: 60, total: 1560, job: 'JOB-2', status: 'draft', sentAt: null },
];

const projects = [
  { id: 'JOB-1', name: 'Projekt 1', client: 'Klient 1', createdAt: '2026-04-01' },
  { id: 'JOB-2', name: 'Projekt 2', client: 'Klient 2', createdAt: '2026-04-01' },
];

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: React.ReactNode; data?: Array<{ name: string; total: number }> }) => (
    <div data-testid="earnings-chart" data-chart={JSON.stringify(data ?? [])}>{children}</div>
  ),
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => mockAppContext,
}));

vi.mock('../components/shared/StatusBadge', () => ({
  default: ({ label, status }: { label?: string; status?: string }) => <span>{label ?? status}</span>,
}));

vi.mock('../components/shared/ShiftCard', () => ({
  default: ({ event }: { event: Event }) => <div>{event.name}</div>,
}));

vi.mock('../components/modals/InvoiceCreateModal', () => ({
  default: () => <div>Invoice modal</div>,
}));

vi.mock('../components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../constants', () => ({
  getNavItemsForRole: () => [
    { id: 'my-timelogs', label: 'Schvalování', icon: () => <span>T</span> },
    { id: 'my-invoices', label: 'Moje faktury', icon: () => <span>I</span> },
    { id: 'my-receipts', label: 'Moje účtenky', icon: () => <span>R</span> },
  ],
  MEAL_CONFIG: [
    { type: 'obed', label: 'Oběd' },
    { type: 'vecere', label: 'Večeře' },
  ],
  ROLE_LABELS: { crew: 'Crew', crewhead: 'CrewHead', coo: 'COO' },
  ROLE_SHORT_LABELS: { crew: 'CR', crewhead: 'CH', coo: 'CO' },
}));

const createEmptyReceipt = vi.fn((contractorProfileId?: string) => ({
  id: 999,
  contractorProfileId,
  title: '',
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  getTimelogs: () => timelogs,
  subscribeToTimelogChanges: () => () => undefined,
  getTimelogDependencies: () => ({ contractors, events }),
  updateTimelogStatus: vi.fn(),
}));

vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({
  useTimelogsQuery: () => ({ data: timelogs, isLoading: false, error: null }),
}));

vi.mock('../features/receipts/services/receipts.service', () => ({
  getReceipts: () => receipts,
  subscribeToReceiptChanges: () => () => undefined,
  getReceiptDependencies: () => ({ contractors, events }),
  updateReceiptStatus: vi.fn(),
  createEmptyReceipt,
}));

vi.mock('../features/receipts/queries/useReceiptsQuery', () => ({
  useReceiptsQuery: () => ({ data: receipts, isLoading: false, error: null }),
}));

vi.mock('../features/invoices/services/invoices.service', () => ({
  getInvoices: () => invoices,
  subscribeToInvoiceChanges: () => () => undefined,
  getInvoiceDependencies: () => ({ contractors, events }),
  getPendingInvoiceBatchCount: () => 0,
  approveInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  sendInvoice: vi.fn(),
}));

vi.mock('../features/invoices/queries/useInvoicesQuery', () => ({
  useInvoicesQuery: () => ({ data: invoices, isLoading: false, error: null }),
}));

vi.mock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
  useInvoiceApprovalsQuery: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('../features/projects/services/projects.service', () => ({
  getProjects: () => projects,
  subscribeToProjectChanges: () => () => undefined,
}));

vi.mock('../features/crew/services/crew.service', () => ({
  getContractors: () => contractors,
  subscribeToCrewChanges: () => () => undefined,
  updateContractor: vi.fn(),
}));

vi.mock('../features/events/services/events.service', () => ({
  getEvents: () => events,
  fetchEventsSnapshot: async () => events,
  subscribeToEventChanges: () => () => undefined,
}));

vi.mock('../features/events/queries/useEventsQuery', () => ({
  useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
}));

vi.mock('../features/recruitment/services/candidates.service', () => ({
  getCandidates: () => [],
  subscribeToCandidateChanges: () => () => undefined,
}));

describe('UUID mine-scope identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      ...mockAuth,
      currentProfileId: 'profile-uuid-2',
      currentUserId: 'user-uuid-2',
      currentContractorId: 2,
      role: 'crew',
      isRoleSwitching: false,
      switchRole: vi.fn(),
    };
    mockAppContext = {
      ...mockAppContext,
      role: 'crew',
      searchQuery: '',
      currentTab: 'dashboard',
      settingsSection: 'menu',
      timelogFilter: 'all',
      setTimelogFilter: vi.fn(),
    };
    timelogs = [...baseTimelogs];
  });

  it('uses currentProfileId in MyShiftsView instead of first contractor', async () => {
    const { default: MyShiftsView } = await import('./MyShiftsView');

    render(<MyShiftsView />);

    expect(screen.getByRole('heading', { name: 'Přehled' })).toBeInTheDocument();
    expect(screen.getByText(/Vítejte zpět, Prihlaseny Contractor/i)).toBeInTheDocument();
    expect(screen.queryByText(/Vítejte zpět, Prvni Contractor/i)).not.toBeInTheDocument();
    expect(screen.getByText('Nejbližší směna')).toBeInTheDocument();
    expect(screen.queryByText('Rychlý vstup')).not.toBeInTheDocument();
    expect(screen.queryByText('Účtenky')).not.toBeInTheDocument();
    expect(screen.getAllByText('Akce moje').length).toBeGreaterThan(0);
    expect(screen.queryByText('Akce prvni')).not.toBeInTheDocument();
  });

  it('surfaces returned and CH-edited timelogs on the Crew overview', async () => {
    timelogs = [
      ...baseTimelogs,
      {
        id: 3,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-21', f: '09:00', t: '17:00', type: 'provoz' }],
        km: 0,
        note: 'Crew původní poznámka.',
        reviewNote: 'Chybí pauza po obědě.',
        status: 'rejected',
      },
      {
        id: 4,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-21', f: '09:00', t: '18:00', type: 'provoz' }],
        km: 0,
        note: 'Upraveno po telefonu.',
        status: 'pending_crew_confirmation',
        crewConfirmationSnapshot: {
          changedAt: '2999-04-21T12:00:00.000Z',
          before: {
            days: [{ d: '2999-04-21', f: '09:00', t: '15:00', type: 'provoz' }],
            km: 0,
            note: '',
          },
        },
      },
      {
        id: 5,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-22', f: '10:00', t: '12:00', type: 'provoz' }],
        km: 0,
        note: 'Doplň prosím typ směny.',
        status: 'rejected',
      },
    ];
    const { default: MyShiftsView } = await import('./MyShiftsView');

    render(<MyShiftsView />);

    expect(screen.getByRole('heading', { name: 'Výkazy k dořešení' })).toBeInTheDocument();
    expect(screen.getByText('3 výkazy čekají na tebe')).toBeInTheDocument();
    expect(screen.getAllByText('Vráceno k opravě').length).toBeGreaterThan(0);
    expect(screen.getByText('Čeká na tvoje potvrzení')).toBeInTheDocument();
    expect(screen.getAllByText('21. 4. 2999').length).toBeGreaterThan(0);
    expect(screen.getByText('Klient 2 · 9.0 h')).toBeInTheDocument();
    expect(screen.getByText('Chybí pauza po obědě.')).toBeInTheDocument();
    expect(screen.queryByText('Crew původní poznámka.')).not.toBeInTheDocument();
    expect(screen.queryByText('Doplň prosím typ směny.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Otevřít výkaz k potvrzení/i }));

    expect(mockAppContext.setTimelogFilter).toHaveBeenCalledWith('pending_crew_confirmation');
    expect(setEditingTimelog).toHaveBeenCalledWith(expect.objectContaining({
      id: 4,
      status: 'pending_crew_confirmation',
    }));
    expect(setCurrentTab).not.toHaveBeenCalledWith('my-timelogs');
  });

  it('shows only earned and approval money cards on the Crew overview', async () => {
    timelogs = [
      {
        id: 5,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-21', f: '09:00', t: '15:00', type: 'provoz' }],
        km: 12,
        note: '',
        status: 'approved',
      },
      {
        id: 7,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-23', f: '08:00', t: '10:00', type: 'provoz' }],
        km: 0,
        note: '',
        status: 'paid',
      },
      {
        id: 6,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-22', f: '10:00', t: '14:00', type: 'provoz' }],
        km: 0,
        note: '',
        status: 'pending_ch',
      },
    ];
    const { default: MyShiftsView } = await import('./MyShiftsView');

    render(<MyShiftsView />);

    expect(screen.queryByText('Vyplaceno')).not.toBeInTheDocument();
    expect(screen.queryByText('K vyplacení')).not.toBeInTheDocument();
    expect(screen.queryByText('Odpracováno')).not.toBeInTheDocument();

    const earnedCard = screen.getByText('Vyděláno').closest('.nodu-my-shifts-stat-card');
    const approvalCard = screen.getByText('Ke schválení').closest('.nodu-my-shifts-stat-card');

    expect(earnedCard).not.toBeNull();
    expect(approvalCard).not.toBeNull();
    expect(within(earnedCard as HTMLElement).getByText('2 067 Kc')).toBeInTheDocument();
    expect(within(earnedCard as HTMLElement).getByText('Finálně schváleno')).toBeInTheDocument();
    expect(within(approvalCard as HTMLElement).getByText('1 000 Kc')).toBeInTheDocument();
    expect(within(approvalCard as HTMLElement).getByText('Čeká na kontrolu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Vyděláno/i }));
    expect(screen.getByRole('button', { name: /Vyúčtované/i }).className).toContain('nodu-my-shifts-tab--active');

    fireEvent.click(screen.getByRole('button', { name: /Ke schválení/i }));
    expect(screen.getByRole('button', { name: /Ke kontrole/i }).className).toContain('nodu-my-shifts-tab--active');
  });

  it('charts earned timelogs instead of invoices on the Crew overview', async () => {
    timelogs = [
      {
        id: 5,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-21', f: '09:00', t: '15:00', type: 'provoz' }],
        km: 12,
        note: '',
        status: 'approved',
      },
      {
        id: 7,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-23', f: '08:00', t: '10:00', type: 'provoz' }],
        km: 0,
        note: '',
        status: 'paid',
      },
      {
        id: 6,
        eid: 2,
        contractorProfileId: 'profile-uuid-2',
        days: [{ d: '2999-04-22', f: '10:00', t: '14:00', type: 'provoz' }],
        km: 0,
        note: '',
        status: 'pending_ch',
      },
    ];
    const { default: MyShiftsView } = await import('./MyShiftsView');

    render(<MyShiftsView />);

    expect(screen.getByRole('heading', { name: 'Příjmy za období' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fakturace za dané období' })).not.toBeInTheDocument();

    const chart = screen.getByTestId('earnings-chart');
    const chartData = JSON.parse(chart.dataset.chart ?? '[]') as Array<{ name: string; total: number }>;

    expect(chartData).toHaveLength(1);
    expect(chartData[0]?.total).toBe(2067);
  });

  it('filters mine timelogs by currentProfileId', async () => {
    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView scope="mine" />);

    expect(screen.getByText('Akce moje')).toBeInTheDocument();
    expect(screen.queryByText('Akce prvni')).not.toBeInTheDocument();
  });

  it('filters mine receipts by currentProfileId and creates new receipt for currentContractorId', async () => {
    const { default: ReceiptsView } = await import('./ReceiptsView');

    render(<ReceiptsView scope="mine" />);

    expect(screen.getByText('Moje receipt')).toBeInTheDocument();
    expect(screen.queryByText('Prvni receipt')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Nová účtenka/i }));

    expect(createEmptyReceipt).toHaveBeenCalledWith('profile-uuid-2');
    expect(setEditingReceipt).toHaveBeenCalledWith(expect.objectContaining({ contractorProfileId: 'profile-uuid-2' }));
  });

  it('filters mine invoices by currentProfileId', async () => {
    const { default: InvoicesView } = await import('./InvoicesView');

    render(<InvoicesView scope="mine" />);

    expect(screen.getByText('INV-2')).toBeInTheDocument();
    expect(screen.queryByText('INV-1')).not.toBeInTheDocument();
  });

  it('uses currentProfileId in SettingsView instead of first contractor', async () => {
    const { default: SettingsView } = await import('./SettingsView');
    mockAppContext = {
      ...mockAppContext,
      settingsSection: 'profile',
    };

    render(<SettingsView />);

    expect(screen.getAllByText('Prihlaseny Contractor').length).toBeGreaterThan(0);
    expect(screen.queryByText('Prvni Contractor')).not.toBeInTheDocument();
  });

  it('computes sidebar my badges from currentProfileId', async () => {
    const { default: Sidebar } = await import('../components/layout/Sidebar');
    mockAppContext = {
      ...mockAppContext,
      currentTab: 'my-timelogs',
    };

    render(<Sidebar />);

    expect(screen.getByAltText('Nodu')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Hledat akci, job nebo jmeno/i)).toHaveClass('nodu-sidebar-search');
    expect(screen.getByRole('button', { name: 'Crew' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTitle('Profil')).toHaveClass('nodu-sidebar-hover-surface');
    expect(screen.getByRole('button', { name: /Schvalování/i })).toHaveClass('nodu-nav-active');
    expect(screen.getByRole('button', { name: /Schvalování/i })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Moje faktury/i })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Moje účtenky/i })).toHaveTextContent('1');
  });

  it('persists authenticated role switches from the sidebar', async () => {
    const switchRole = vi.fn(async () => undefined);
    const { default: Sidebar } = await import('../components/layout/Sidebar');
    mockAuth = {
      ...mockAuth,
      role: 'coo',
      switchRole,
    };
    mockAppContext = {
      ...mockAppContext,
      role: 'coo',
    };

    render(<Sidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'CrewHead' }));

    await waitFor(() => {
      expect(switchRole).toHaveBeenCalledWith('crewhead');
    });
    expect(setRole).not.toHaveBeenCalled();
  });
});
