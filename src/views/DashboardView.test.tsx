import React from 'react';
const backend = vi.hoisted(() => ({ source: 'local', quote: vi.fn() }));
vi.mock('../lib/app-config', () => ({ get appDataSource() { return backend.source; } }));
vi.mock('../features/invoice-billing/service', () => ({ billingService: { quote: backend.quote } }));
const updateTimelogStatuses = vi.hoisted(() => vi.fn());
const sharedMockState = vi.hoisted(() => ({ group: null as { canAct: boolean } | null }));
vi.mock('../features/shift-workflows/useSharedApprovals', () => ({ useSharedApprovals: () => ({
  cards: () => null, ready: true, identityKey: authMockState.currentProfileId, reviewSelection: () => false,
  inboxFor: (reports: Timelog[]) => {
    if (sharedMockState.group) {
      const rounds = sharedMockState.group.canAct ? [sharedMockState.group] : [];
      return { rounds, legacy: [], count: rounds.length };
    }
    return getApprovalInbox(reports, reports, [], {
      role: mockAppContext.role as Role, profileId: authMockState.currentProfileId, userId: 'user', source: 'supabase',
    });
  },
}) }));
import DashboardView from './DashboardView';
import { getApprovalInbox } from '../features/shift-workflows/approval-inbox';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventApplication, Role, Timelog, TimelogApproval } from '../types';

const mockAppContext = {
  role: 'crewhead',
  searchQuery: '',
  setCurrentTab: vi.fn(),
  setTimelogFilter: vi.fn(),
  setSelectedEventId: vi.fn(),
  setEventTab: vi.fn(),
  setEditingTimelog: vi.fn(),
};

const mobileMockState = vi.hoisted(() => ({ isMobile: false }));
const eventApplicationMockState = vi.hoisted(() => ({ applications: [] as EventApplication[] }));
const authMockState = vi.hoisted(() => ({ currentProfileId: 'profile-current' as string | null }));

const mockEvents = [
  {
    id: 101,
    name: 'Nodu pilot Prague',
    job: 'JOB-101',
    startDate: '2026-12-28',
    endDate: '2026-12-29',
    city: 'Praha',
    needed: 8,
    filled: 6,
  },
  {
    id: 102,
    name: 'Old understaffed event',
    job: 'JOB-102',
    startDate: '2026-01-10',
    endDate: '2026-01-10',
    city: 'Praha',
    needed: 35,
    filled: 0,
  },
];

const defaultMockTimelogs = [
  {
    id: 1,
    note: 'Kontrola kabeláže',
    km: 12,
    eid: 101,
    cid: 1,
    contractorProfileId: 'profile-1',
    status: 'pending_ch',
    days: [{ d: '2026-12-28', f: '08:00', t: '16:00' }],
  },
];
const mockTimelogsState: { timelogs: (typeof defaultMockTimelogs[number] & {
  supabaseId?: string; updatedAt?: string;
  approvals?: Pick<TimelogApproval, 'status' | 'supersededAt' | 'approverProfileId'>[];
})[] } = { timelogs: [...defaultMockTimelogs] };

const mockReceipts = [
  {
    id: 'receipt-1',
    eid: 101,
    cid: 1,
    contractorProfileId: 'profile-1',
    title: 'Taxi',
    vendor: 'Liftago',
    job: 'JOB-101',
    status: 'submitted',
  },
];

const mockInvoices = [
  {
    id: 'inv-1',
    eid: 101,
    cid: 1,
    contractorProfileId: 'profile-1',
    job: 'JOB-101',
    status: 'sent',
  },
];

const mockDependencies = {
  contractors: [
    {
      id: 1,
      profileId: 'profile-1',
      name: 'Alex Novak',
      ii: 'AN',
      bg: '#F1E1D2',
      fg: '#7A4A20',
      rate: 350,
    },
    {
      id: 2,
      profileId: 'profile-2',
      name: 'Jana Svobodova',
      ii: 'JS',
      bg: '#E4F4EE',
      fg: '#23644D',
      rate: 320,
      phone: '+420 777 111 222',
      email: 'jana@example.test',
      bank: '123-456789/0100',
    },
  ],
};

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => mockAppContext,
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => authMockState,
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => mobileMockState.isMobile,
}));

vi.mock('../features/events/queries/useEventsQuery', () => ({
  useEventsQuery: () => ({ data: mockEvents, isLoading: false, error: null }),
}));

vi.mock('../features/events/services/events.service', () => ({
  getPendingEventApplications: () => eventApplicationMockState.applications,
}));

vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({
  useTimelogsQuery: () => ({ data: mockTimelogsState.timelogs, isLoading: false, error: null }),
}));

vi.mock('../features/receipts/queries/useReceiptsQuery', () => ({
  useReceiptsQuery: () => ({ data: mockReceipts, isLoading: false, error: null }),
}));

vi.mock('../features/invoices/queries/useInvoicesQuery', () => ({
  useInvoicesQuery: () => ({ data: mockInvoices, isLoading: false, error: null }),
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => mockDependencies,
  updateTimelogStatuses,
}));

describe('DashboardView', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    updateTimelogStatuses.mockResolvedValue([]);
    backend.source = 'local';
    mockAppContext.role = 'crewhead';
    mockAppContext.searchQuery = '';
    mobileMockState.isMobile = false;
    eventApplicationMockState.applications = [];
    authMockState.currentProfileId = 'profile-current';
    mockTimelogsState.timelogs = [...defaultMockTimelogs];
    sharedMockState.group = null;
  });

  const monthlyCases = [
    { date: new Date(2026, 11, 15, 12), label: 'prosinec 2026', hours: '3h' },
    { date: new Date(2027, 0, 15, 12), label: 'leden 2027', hours: '11h' },
    { date: new Date(2027, 1, 15, 12), label: 'únor 2027', hours: '0h' },
  ].flatMap(period => ['crew', 'crewhead', 'coo'].flatMap(role => [false, true].map(mobile => ({ ...period, role, mobile }))));

  it.each(monthlyCases)('allocates $label approved days for $role (mobile=$mobile) without hiding old approvals', async ({ date, label, hours, role, mobile }) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(date);
    mockAppContext.role = role;
    mobileMockState.isMobile = mobile;
    mockTimelogsState.timelogs = [
      { ...defaultMockTimelogs[0], id: 10, status: 'approved', days: [
        { d: '2026-12-31', f: '08:00', t: '11:00' },
        { d: '2027-01-01', f: '08:00', t: '12:00' },
      ] },
      { ...defaultMockTimelogs[0], id: 11, status: 'invoiced', days: [{ d: '2027-01-02', f: '08:00', t: '13:00' }] },
      { ...defaultMockTimelogs[0], id: 12, status: 'paid', days: [{ d: '2027-01-03', f: '08:00', t: '10:00' }] },
      { ...defaultMockTimelogs[0], id: 13, status: 'draft', days: [{ d: '2027-01-04', f: '08:00', t: '18:00' }] },
      { ...defaultMockTimelogs[0], id: 14, status: role === 'crewhead' ? 'pending_ch' : 'pending_coo',
        days: [{ d: '2026-06-01', f: '08:00', t: '16:00' }] },
    ];
    render(<DashboardView />);
    expect(screen.getByText(label)).toBeInTheDocument();
    const hourCard = mobile && role !== 'crew'
      ? screen.getByText('Hodiny').parentElement!
      : screen.getByText('Schvalene hodiny').parentElement!;
    expect(within(hourCard).getByText(hours)).toBeInTheDocument();
    if (role === 'crew') return;
    if (mobile) {
      expect(within(screen.getByRole('region', { name: 'Rychlý stav' })).getByText('1 výkaz')).toBeInTheDocument();
    } else {
      expect(within(screen.getByText('Vykazy cekaji na me').parentElement!).getByText('1')).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /Alex Novak.*Nodu pilot Prague/ })).toBeInTheDocument();
  });

  it.each([false, true])('counts a shared COO round only when personally actionable: %s', async (canAct) => {
    mockAppContext.role = 'coo'; mobileMockState.isMobile = true;
    sharedMockState.group = { canAct };
    mockTimelogsState.timelogs = [1, 2].map((id) => ({ ...defaultMockTimelogs[0], id, status: 'pending_coo',
      approvals: [{ status: 'pending', supersededAt: null, approverProfileId: canAct ? 'profile-current' : 'profile-other' }] }));
    render(<DashboardView />);
    expect(within(screen.getByRole('region', { name: 'Rychlý stav' })).getByText(canAct ? '1 výkaz' : '0 výkazů')).toBeInTheDocument();
  });

  it('shows a COO only reports assigned to the current profile plus legacy reports', async () => {
    mockAppContext.role = 'coo';
    mobileMockState.isMobile = true;
    mockTimelogsState.timelogs = [
      {
        ...defaultMockTimelogs[0],
        id: 15,
        status: 'pending_coo',
        approvals: [{ status: 'pending', supersededAt: null, approverProfileId: 'profile-current' }],
      },
      {
        ...defaultMockTimelogs[0],
        id: 16,
        status: 'pending_coo',
        approvals: [{ status: 'pending', supersededAt: null, approverProfileId: 'profile-other' }],
      },
      {
        ...defaultMockTimelogs[0],
        id: 17,
        status: 'pending_coo',
        approvals: [],
      },
    ];

    render(<DashboardView />);

    expect(screen.getByText('2 výkazy')).toBeInTheDocument();
    const approvalSection = screen.getByRole('heading', { name: 'Schvalování' }).closest('section');
    expect(within(approvalSection as HTMLElement).getAllByRole('button')).toHaveLength(3);
  });

  it('renders the dashboard with semantic nodu helpers instead of light-only surface utilities', async () => {
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toHaveClass('nodu-dashboard-heading');
    expect(container.querySelector('.nodu-stat-chip')).not.toBeNull();
    expect(container.querySelector('[data-testid="stat-accent-dot"]')).toBeNull();

    const timelogsHeading = screen.getByRole('heading', { name: 'Ke schválení' });
    const timelogPanel = timelogsHeading.closest('.nodu-dashboard-panel');
    const eventsHeading = screen.getByRole('heading', { name: 'Nadchazejici akce' });
    const eventsPanel = eventsHeading.closest('.nodu-dashboard-panel');
    const timelogRow = within(timelogPanel as HTMLElement).getByRole('button', { name: /Alex Novak/i });
    const upcomingEventRow = within(eventsPanel as HTMLElement).getByRole('button', { name: /Nodu pilot Prague/i });

    expect(timelogPanel).not.toBeNull();
    expect(within(timelogPanel as HTMLElement).getByText('JOB-101')).toHaveClass('nodu-job-badge');
    expect(timelogRow).toHaveClass('nodu-dashboard-row', 'border-b');
    expect(upcomingEventRow).toHaveClass('nodu-dashboard-row', 'border');
    expect(within(timelogRow).getByText('Alex Novak')).toHaveClass('nodu-dashboard-row-title');
    expect(within(timelogRow).getByText('Nodu pilot Prague').closest('.nodu-dashboard-row-meta')).not.toBeNull();
    expect(within(timelogRow).getByText('8.0h')).toHaveClass('nodu-dashboard-row-value');
    expect(timelogRow.querySelector('.nodu-dashboard-action')).not.toBeNull();
    expect(timelogRow.querySelector('.nodu-dashboard-action')?.className).not.toContain('bg-white');
    expect(within(upcomingEventRow).getByText('Nodu pilot Prague')).toHaveClass('nodu-dashboard-row-title');
    expect(upcomingEventRow.querySelector('.nodu-dashboard-progress-track')).not.toBeNull();
    expect(timelogRow.className).not.toContain('border-[#f1e4d6]');
    expect(upcomingEventRow.className).not.toContain('border-[#f1e4d6]');
  });

  const reviewCases = ['crewhead', 'coo'].flatMap(role => [false, true].map(mobile => ({ role, mobile })));

  const openSecondReport = async (role: string, mobile: boolean) => {
    mockAppContext.role = role;
    mobileMockState.isMobile = mobile;
    const status = role === 'crewhead' ? 'pending_ch' : 'pending_coo';
    const identity = { supabaseId: '20000000-0000-4000-8000-000000000002', updatedAt: '2026-01-11T08:00:00Z' };
    const approvals = [{ status: 'pending' as const, supersededAt: null, approverProfileId: 'profile-current' }];
    mockTimelogsState.timelogs = [
      { ...defaultMockTimelogs[0], status, approvals },
      { ...defaultMockTimelogs[0], ...identity, id: 2, eid: 102, status, approvals, days: [{ d: '2026-01-10', f: '09:00', t: '13:00' }] },
    ];
    const view = render(<DashboardView />);
    fireEvent.click(screen.getByRole('button', { name: /Alex Novak.*Old understaffed event/ }));
    expect(mockAppContext.setEditingTimelog).not.toHaveBeenCalled();
    expect(updateTimelogStatuses).not.toHaveBeenCalled();
    return { ...view, review: within(screen.getByRole('dialog', { name: 'Kontrola výkazu' })) };
  };

  it.each(reviewCases)('reviews and approves the selected report as $role (mobile=$mobile)', async ({ role, mobile }) => {
    const { review } = await openSecondReport(role, mobile);
    expect(review.getByText(/Alex Novak/)).toBeVisible();
    expect(review.getByText(/Old understaffed event/)).toBeVisible();
    expect(review.getByText('09:00 - 13:00')).toBeVisible();
    expect(review.queryByText('08:00 - 16:00')).not.toBeInTheDocument();
    expect(review.queryByRole('textbox')).not.toBeInTheDocument();
    if (role === 'coo') {
      expect(review.queryByText('Kontrola kabeláže')).not.toBeInTheDocument();
      expect(review.queryByRole('button', { name: 'Upravit výkaz' })).not.toBeInTheDocument();
    }
    fireEvent.click(review.getByRole('button', { name: role === 'crewhead' ? 'Schválit a poslat COO' : 'Schválit výkaz' }));
    await waitFor(() => expect(updateTimelogStatuses).toHaveBeenCalledExactlyOnceWith([2],
      role === 'crewhead' ? 'ch' : 'coo', expect.objectContaining({ currentProfileId: 'profile-current' })));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(reviewCases)('returns only the reviewed report as $role (mobile=$mobile)', async ({ role, mobile }) => {
    const { review } = await openSecondReport(role, mobile);
    fireEvent.click(review.getByRole('button', { name: 'Vrátit k opravě' }));
    if (role === 'coo') {
      expect(updateTimelogStatuses).not.toHaveBeenCalled();
      const confirm = within(screen.getByRole('dialog', { name: 'Vrátit výkaz k opravě' }));
      fireEvent.change(confirm.getByLabelText('Důvod vrácení'), { target: { value: 'Opravte počet hodin' } });
      fireEvent.click(confirm.getByRole('button', { name: 'Vrátit výkaz' }));
    }
    await waitFor(() => expect(updateTimelogStatuses).toHaveBeenCalledExactlyOnceWith([2], 'rej',
      expect.objectContaining(role === 'coo' ? { note: 'Opravte počet hodin' } : { currentProfileId: 'profile-current' })));
  });

  it('requests the selected report’s billing preview before a remote COO decision', async () => {
    backend.source = 'supabase';
    backend.quote.mockResolvedValue({ id: 'quote-2', preview: { totalAmount: 1400, reports: [] } });
    const { review } = await openSecondReport('coo', true);
    fireEvent.click(review.getByRole('button', { name: 'Schválit výkaz' }));
    const quote = within(screen.getByRole('dialog', { name: 'Schválení výkazů a fakturačního podkladu' }));
    const confirm = await quote.findByRole('button', { name: 'Potvrdit schválení s touto částkou' });
    const { supabaseId, updatedAt } = mockTimelogsState.timelogs[1];
    expect(backend.quote).toHaveBeenCalledExactlyOnceWith([supabaseId]);
    expect(updateTimelogStatuses).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(updateTimelogStatuses).toHaveBeenCalledExactlyOnceWith([2], 'coo', expect.objectContaining({
      currentProfileId: 'profile-current',
      billingApproval: { quoteId: 'quote-2', targets: [expect.objectContaining({ id: supabaseId, expectedUpdatedAt: updatedAt })] },
    })));
  });

  it('opens the CH editor only through the explicit edit button', async () => {
    const { review } = await openSecondReport('crewhead', true);
    fireEvent.click(review.getByRole('button', { name: 'Upravit výkaz' }));
    expect(mockAppContext.setEditingTimelog).toHaveBeenCalledExactlyOnceWith(mockTimelogsState.timelogs[1]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateTimelogStatuses).not.toHaveBeenCalled();
  });

  it('pins the report as displayed when the review opens, even before a cache change is rendered', async () => {
    const { review } = await openSecondReport('crewhead', true);
    const displayed = mockTimelogsState.timelogs[1].updatedAt!;
    mockTimelogsState.timelogs[1].updatedAt = 'a-newer-unseen-revision';
    fireEvent.click(review.getByRole('button', { name: 'Schválit a poslat COO' }));
    await waitFor(() => expect(updateTimelogStatuses).toHaveBeenCalledExactlyOnceWith([2], 'ch', expect.objectContaining({
      expectedReviewKeys: [expect.stringContaining(displayed)],
    })));
  });

  it('requires opening a refreshed report again after its recorded hours change', async () => {
    const { rerender } = await openSecondReport('crewhead', true);
    mockTimelogsState.timelogs = mockTimelogsState.timelogs.map(report => report.id === 2 ? {
      ...report, updatedAt: '2026-01-11T08:05:00Z', days: [{ ...report.days[0], t: '15:00' }],
    } : report);
    rerender(<DashboardView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alex Novak.*Old understaffed event/ }));
    expect(within(screen.getByRole('dialog')).getByText('09:00 - 15:00')).toBeVisible();
    expect(updateTimelogStatuses).not.toHaveBeenCalled();
  });

  it('dismisses an open COO return if the report is reassigned during review', async () => {
    const { review, rerender } = await openSecondReport('coo', true);
    fireEvent.click(review.getByRole('button', { name: 'Vrátit k opravě' }));
    expect(screen.getByLabelText('Důvod vrácení')).toBeVisible();
    mockTimelogsState.timelogs = mockTimelogsState.timelogs.map(report => report.id === 2 ? {
      ...report, approvals: [{ status: 'pending', supersededAt: null, approverProfileId: 'another-coo' }],
    } : report);
    rerender(<DashboardView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateTimelogStatuses).not.toHaveBeenCalled();
  });

  it.each([false, true])('opens the management timelogs inbox from the approval shortcut (mobile=%s)', async (mobile) => {
    mobileMockState.isMobile = mobile;
    render(<DashboardView />);
    fireEvent.click(screen.getByRole('button', { name: 'Otevřít schvalování' }));
    expect(mockAppContext.setCurrentTab).toHaveBeenCalledWith('timelogs');
  });

  it('renders a mobile management overview focused on CH and COO actions', async () => {
    mobileMockState.isMobile = true;
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );

    expect(container.querySelector('.nodu-management-overview-mobile')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Přehled' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.getByText('1 výkaz')).toBeInTheDocument();
    expect(screen.getByText('2 volná místa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Otevřít schvalování/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Otevřít akce/i })).toBeInTheDocument();
    const upcomingSection = screen.getByRole('heading', { name: 'Nejbližší akce' }).closest('section');
    expect(within(upcomingSection as HTMLElement).getByRole('button', { name: /Nodu pilot Prague/i })).toBeInTheDocument();
  });

  it('surfaces pending crew applications in the mobile management overview', async () => {
    mobileMockState.isMobile = true;
    eventApplicationMockState.applications = [
      {
        id: 1,
        supabaseId: 'application-1',
        eventId: 101,
        contractorProfileId: 'profile-2',
        status: 'pending',
        plannedFrom: '09:00',
        plannedTo: '18:00',
      },
    ];
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );

    const applicationsSection = screen.getByRole('heading', { name: 'Přihlášky crew' }).closest('section');
    const applicationRow = within(applicationsSection as HTMLElement).getByRole('button', { name: /Jana Svobodova/i });

    expect(applicationsSection).not.toBeNull();
    expect(within(applicationsSection as HTMLElement).getByText('1 přihláška čeká')).toBeInTheDocument();
    expect(applicationRow).toBeInTheDocument();
    expect(applicationRow).toHaveTextContent('Nodu pilot Prague');
    expect(applicationRow).toHaveTextContent('09:00-18:00');

    fireEvent.click(applicationRow);

    expect(mockAppContext.setCurrentTab).toHaveBeenCalledWith('events');
    expect(mockAppContext.setSelectedEventId).toHaveBeenCalledWith(101);
    expect(mockAppContext.setEventTab).toHaveBeenCalledWith('overview');
  });

  it('opens reports waiting for crew when following the incomplete-work shortcut', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 0, 15, 12));
    mobileMockState.isMobile = true;
    mockTimelogsState.timelogs = [{ ...defaultMockTimelogs[0], status: 'pending_crew_confirmation' }];
    render(<DashboardView />);
    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit' }));
    expect(mockAppContext.setCurrentTab).toHaveBeenCalledExactlyOnceWith('timelogs');
    expect(mockAppContext.setTimelogFilter).toHaveBeenCalledExactlyOnceWith('pending_crew_confirmation');
    expect(mockAppContext.setEditingTimelog).not.toHaveBeenCalled();
  });

  it('keeps incomplete management work compact on mobile', async () => {
    mobileMockState.isMobile = true;
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );

    const incompleteSection = screen.getByRole('heading', { name: 'Rozpracované' }).closest('section');

    expect(incompleteSection).not.toBeNull();
    expect(within(incompleteSection as HTMLElement).getByText('2 položky vyžadují doplnění')).toBeInTheDocument();
    expect(within(incompleteSection as HTMLElement).getByText('1 akce')).toBeInTheDocument();
    expect(within(incompleteSection as HTMLElement).getByText('1 crew profil')).toBeInTheDocument();
    expect(within(incompleteSection as HTMLElement).getByText('0 výkazů')).toBeInTheDocument();
    expect(within(incompleteSection as HTMLElement).getByRole('button', { name: 'Zobrazit' })).toBeInTheDocument();
  });

  it('keeps dashboard helper styles wired to nodu tokens and preserves row borders for dark mode', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const headingRule = css.match(/\.nodu-dashboard-heading\s*\{[\s\S]*?\}/)?.[0];
    const panelRule = css.match(/\.nodu-dashboard-panel\s*\{[\s\S]*?\}/)?.[0];
    const rowRule = css.match(/\.nodu-dashboard-row\s*\{[\s\S]*?\}/)?.[0];
    const rowHoverRule = css.match(/\.nodu-dashboard-row:hover\s*\{[\s\S]*?\}/)?.[0];
    const actionRule = css.match(/\.nodu-dashboard-action\s*\{[\s\S]*?\}/)?.[0];
    const badgeRule = css.match(/\.nodu-event-meta-badge\s*\{[\s\S]*?\}/)?.[0];
    const progressRule = css.match(/\.nodu-dashboard-progress-track\s*\{[\s\S]*?\}/)?.[0];

    expect(headingRule).toContain('color: var(--nodu-text);');
    expect(panelRule).toContain('var(--nodu-surface-rgb)');
    expect(panelRule).toContain('var(--nodu-surface-muted-rgb)');
    expect(rowRule).toContain('border-color: var(--nodu-border);');
    expect(rowRule).toContain('box-shadow: inset 0 0 0 1px transparent;');
    expect(rowRule).not.toContain('border: 1px solid transparent;');
    expect(rowHoverRule).toContain('var(--nodu-accent-rgb)');
    expect(actionRule).toContain('var(--nodu-surface-rgb)');
    expect(actionRule).toContain('var(--nodu-accent)');
    expect(badgeRule).toContain('var(--nodu-surface-muted-rgb)');
    expect(badgeRule).toContain('var(--nodu-text-soft)');
    expect(progressRule).toContain('var(--nodu-surface-muted-rgb)');
  });
});
