import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockContext = {
  setEditingTimelog: vi.fn(),
  role: 'crewhead',
  searchQuery: '',
  timelogFilter: 'all',
  setTimelogFilter: vi.fn(),
};

const mobileMockState = {
  isMobile: false,
};

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => mobileMockState.isMobile,
}));

const events = [
  {
    id: 1,
    name: 'Ploom Chodov',
    job: 'JTI001',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
    city: 'Praha',
    needed: 1,
    filled: 1,
    status: 'upcoming' as const,
    client: 'JTI',
  },
  {
    id: 2,
    name: 'Ploom Zlicin',
    job: 'JTI001',
    startDate: '2026-04-21',
    endDate: '2026-04-21',
    city: 'Praha',
    needed: 1,
    filled: 1,
    status: 'upcoming' as const,
    client: 'JTI',
  },
];

const timelogs = [
  {
    id: 1,
    eid: 1,
    contractorProfileId: 'profile-1',
    days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
    km: 0,
    note: '',
    status: 'draft' as const,
  },
  {
    id: 2,
    eid: 2,
    contractorProfileId: 'profile-2',
    days: [{ d: '2026-04-21', f: '09:00', t: '14:00', type: 'provoz' as const }],
    km: 0,
    note: '',
    status: 'draft' as const,
  },
];

const pendingCrewheadTimelogs = [
  {
    ...timelogs[0],
    status: 'pending_ch' as const,
  },
];
const pendingCrewConfirmationTimelogs = [
  {
    ...timelogs[0],
    days: [{ d: '2026-04-20', f: '09:00', t: '15:00', type: 'provoz' as const }],
    status: 'pending_crew_confirmation' as const,
    note: 'Upraveno po telefonu',
    crewConfirmationSnapshot: {
      changedAt: '2026-04-20T12:00:00.000Z',
      before: {
        days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
        km: 0,
        note: '',
      },
    },
  },
];
const crewConfirmedAfterCorrectionTimelogs = [
  {
    ...pendingCrewConfirmationTimelogs[0],
    status: 'pending_ch' as const,
  },
];
const sameEventTimelogs = [
  {
    ...timelogs[0],
    eid: 1,
    contractorProfileId: 'profile-1',
    days: [{ d: '2026-04-20', f: '20:00', t: '01:00', type: 'provoz' as const }],
    status: 'approved' as const,
  },
  {
    ...timelogs[1],
    eid: 1,
    contractorProfileId: 'profile-2',
    days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
    status: 'approved' as const,
  },
];
const mixedMineTimelogs = [
  timelogs[0],
  {
    ...timelogs[1],
    id: 3,
    contractorProfileId: 'profile-1',
    note: 'Upraveno po telefonu',
    status: 'rejected' as const,
  },
  {
    ...timelogs[1],
    contractorProfileId: 'profile-1',
    status: 'pending_ch' as const,
  },
];
const contractors = [
  {
    id: 1,
    profileId: 'profile-1',
    name: 'Crew One',
    ii: 'CO',
    bg: '#000',
    fg: '#fff',
    tags: [],
    events: 1,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: 'Praha',
    reliable: true,
    note: '',
  },
  {
    id: 2,
    profileId: 'profile-2',
    name: 'Crew Two',
    ii: 'CT',
    bg: '#000',
    fg: '#fff',
    tags: [],
    events: 1,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: 'Praha',
    reliable: true,
    note: '',
  },
];

const mockExternalApprovalModules = () => {
  vi.doMock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
    useInvoiceApprovalsQuery: () => ({ data: [] }),
  }));

  vi.doMock('../features/events/queries/useEventsQuery', () => ({
    useEventsQuery: () => ({ data: events }),
  }));

  vi.doMock('../features/crew/services/crew.service', () => ({
    getContractors: () => contractors,
    subscribeToCrewChanges: () => vi.fn(),
  }));

  vi.doMock('../lib/app-data', () => ({
    getLocalAppState: () => ({
      timelogs,
      eventCrewAssignments: [],
      grasonEventConfirmations: [],
    }),
  }));

  vi.doMock('../features/invoices/services/approval-timelog-sync.service', () => ({
    buildApprovalTimelogPreview: vi.fn(() => []),
    applyApprovalTimelogPreview: vi.fn(),
  }));
};

describe('TimelogsView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mobileMockState.isMobile = false;
  });

  it('groups all timelogs by event instead of job number', async () => {
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockContext,
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: timelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    expect(screen.getByRole('button', { name: 'Po akci' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Po Job Number' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Ploom Chodov').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ploom Zlicin').length).toBeGreaterThan(0);
  });

  it('does not expose CrewHead handoff controls to COO', async () => {
    const updateTimelogStatus = vi.fn().mockResolvedValue({ ...pendingCrewheadTimelogs[0], status: 'pending_coo' });
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'coo',
        timelogFilter: 'pending_ch',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: pendingCrewheadTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus,
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    expect(screen.queryByRole('button', { name: 'Schválit za CH' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zamítnout' })).not.toBeInTheDocument();
    expect(updateTimelogStatus).not.toHaveBeenCalled();
  });

  it('lets CH choose concrete final approvers and defaults to the eligible event contact', async () => {
    const fetchEligibleTimelogFinalApprovers = vi.fn().mockResolvedValue([
      { profileId: 'profile-2', name: 'Crew Two', roles: ['coo'] },
      { profileId: 'profile-3', name: 'Crew Three', roles: ['crewhead'] },
    ]);
    const sendTimelogToApprovers = vi.fn().mockResolvedValue({ ...pendingCrewheadTimelogs[0], status: 'pending_coo' });
    const eventsWithContact = [{ ...events[0], contactProfileId: 'profile-2' }];
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crewhead',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-manager' }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: eventsWithContact }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: pendingCrewheadTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events: eventsWithContact }),
      fetchEligibleTimelogFinalApprovers,
      sendTimelogToApprovers,
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Schválit a vybrat schvalovatele' }));

    const dialog = await screen.findByRole('dialog', { name: 'Finální schválení výkazu' });
    expect(within(dialog).getByRole('checkbox', { name: 'Crew Two' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Crew Three' })).not.toBeChecked();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Odeslat ke schválení' }));

    await waitFor(() => expect(sendTimelogToApprovers).toHaveBeenCalledWith(1, ['profile-2'], ''));
  });

  it('opens a return note dialog before CH returns a timelog to Crew correction', async () => {
    const returnTimelogToCrewCorrection = vi.fn().mockResolvedValue({ ...pendingCrewheadTimelogs[0], status: 'rejected', reviewNote: 'Chybí odchod.' });
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crewhead',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-manager' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: pendingCrewheadTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      fetchEligibleTimelogFinalApprovers: vi.fn(),
      returnTimelogToCrewCorrection,
      sendTimelogToApprovers: vi.fn(),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Vrátit' }));

    const dialog = screen.getByRole('dialog', { name: 'Vrátit výkaz k opravě' });
    expect(returnTimelogToCrewCorrection).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Poznámka pro Crew'), {
      target: { value: 'Chybí odchod.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vrátit k opravě' }));

    await waitFor(() => expect(returnTimelogToCrewCorrection).toHaveBeenCalledWith(1, 'Chybí odchod.'));
  });

  it('labels the mine scope as Schvalovani for crew', async () => {
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crew',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-1' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: mixedMineTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView scope="mine" />);

    expect(screen.getByRole('heading', { name: 'Schvalování' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Moje timelogy' })).not.toBeInTheDocument();
  });

  it('uses a compact month and status filter in mobile Crew Schvalovani', async () => {
    mobileMockState.isMobile = true;
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crew',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-1' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: mixedMineTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView scope="mine" />);

    expect(screen.getByText('duben 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filtr výkazů: Vše, 3/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Koncepty 1/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Filtr výkazů: Vše, 3/ }));

    expect(screen.getByRole('button', { name: 'Koncepty 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Čeká na kontrolu 1' })).toBeInTheDocument();
  });

  it('uses the compact status filter for mobile management Schvalovani', async () => {
    mobileMockState.isMobile = true;
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'coo',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: timelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    expect(screen.getByRole('button', { name: /Filtr výkazů: Vše, 2/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Koncepty 2' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Filtr výkazů: Vše, 2/ }));

    expect(screen.getByRole('button', { name: 'Koncepty 2' })).toBeInTheDocument();
  });

  it('keeps mobile event-group timelog cards focused on the crew report details', async () => {
    mobileMockState.isMobile = true;
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'coo',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: sameEventTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    expect(screen.getAllByText('Ploom Chodov')).toHaveLength(1);
    expect(screen.getByText('2 výkazy')).toBeInTheDocument();
    expect(screen.queryByText(/Praha ·/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Provoz')).toHaveLength(2);
  });

  it('leads mobile Crew Schvalovani cards with event information instead of the crew member name', async () => {
    mobileMockState.isMobile = true;
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crew',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-1' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: [mixedMineTimelogs[0]] }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView scope="mine" />);

    expect(screen.queryByText('Crew One')).not.toBeInTheDocument();
    expect(screen.getByText('Ploom Chodov')).toBeInTheDocument();
    expect(screen.getByText('JTI001')).toBeInTheDocument();
  });

  it('shows Crew which CH changes are waiting for confirmation on mobile cards', async () => {
    mobileMockState.isMobile = true;
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crew',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-1' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: pendingCrewConfirmationTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView scope="mine" />);

    expect(screen.getByText('Upraveno CH')).toBeInTheDocument();
    expect(screen.getAllByText('Čeká na tvoje potvrzení').length).toBeGreaterThan(0);
    expect(screen.getByText('20. 4. čas 09:00-14:00 -> 09:00-15:00')).toBeInTheDocument();
  });

  it('shows CrewHead that Crew confirmed a previous correction without exposing it to COO', async () => {
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crewhead',
        timelogFilter: 'pending_ch',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: crewConfirmedAfterCorrectionTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');
    const { unmount } = render(<TimelogsView />);

    expect(screen.getByText('Potvrzeno Crew po úpravě')).toBeInTheDocument();
    expect(screen.getByText('Historie úpravy')).toBeInTheDocument();
    expect(screen.getByText('20. 4. čas 09:00-14:00 -> 09:00-15:00')).toBeInTheDocument();

    unmount();
    vi.resetModules();
    vi.clearAllMocks();
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'coo',
        timelogFilter: 'pending_ch',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: crewConfirmedAfterCorrectionTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsViewForCoo } = await import('./TimelogsView');
    render(<TimelogsViewForCoo />);

    expect(screen.queryByText('Potvrzeno Crew po úpravě')).not.toBeInTheDocument();
    expect(screen.queryByText('Historie úpravy')).not.toBeInTheDocument();
  });

  it('lets crew edit draft and rejected timelogs in Schvalovani', async () => {
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crew',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-1' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: mixedMineTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView scope="mine" />);

    expect(screen.getAllByRole('button', { name: 'Upravit' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Upravit' })[0]);

    expect(mockContext.setEditingTimelog).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      status: 'draft',
    }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Upravit' })[1]);

    expect(mockContext.setEditingTimelog).toHaveBeenCalledWith(expect.objectContaining({
      id: 3,
      status: 'rejected',
    }));
    expect(mockContext.setEditingTimelog).not.toHaveBeenCalledWith(expect.objectContaining({
      id: 2,
      status: 'pending_ch',
    }));
  });

  it('lets Crew confirm a CrewHead correction from Schvalovani', async () => {
    const updateTimelogStatus = vi.fn().mockResolvedValue({
      ...pendingCrewConfirmationTimelogs[0],
      status: 'pending_ch',
    });
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crew',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-1' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: pendingCrewConfirmationTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus,
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView scope="mine" />);

    expect(screen.getAllByText('Čeká na tvoje potvrzení').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Upravit' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit a odeslat' }));

    await waitFor(() => expect(updateTimelogStatus).toHaveBeenCalledWith(1, 'sub'));
  });

  it('labels rejected Crew timelogs as returned for correction in mine scope', async () => {
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crew',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-1' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: mixedMineTimelogs }),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView scope="mine" />);

    expect(screen.getByText('Vráceno k opravě')).toBeInTheDocument();
    expect(screen.getByText('Uprav výkaz a odešli ho znovu ke kontrole.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Odeslat znovu' })).toBeInTheDocument();
    expect(screen.queryByText('Zamítnuto')).not.toBeInTheDocument();
  });

  it('lets CrewHead edit pending CH timelogs without exposing that edit action to COO', async () => {
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crewhead',
        timelogFilter: 'pending_ch',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: pendingCrewheadTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');
    const { unmount } = render(<TimelogsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Upravit' }));

    expect(mockContext.setEditingTimelog).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      status: 'pending_ch',
    }));

    unmount();
    vi.resetModules();
    vi.clearAllMocks();
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'coo',
        timelogFilter: 'pending_ch',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: pendingCrewheadTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsViewForCoo } = await import('./TimelogsView');
    render(<TimelogsViewForCoo />);

    expect(screen.queryByRole('button', { name: 'Upravit' })).not.toBeInTheDocument();
  });

  it('shows timelog notes to Crew but hides them from COO', async () => {
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'crew',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: 'profile-1' }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: mixedMineTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');
    const { unmount } = render(<TimelogsView scope="mine" />);

    expect(screen.getByText('"Upraveno po telefonu"')).toBeInTheDocument();

    unmount();
    vi.resetModules();
    vi.clearAllMocks();
    mockExternalApprovalModules();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'coo',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: mixedMineTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsViewForCoo } = await import('./TimelogsView');
    render(<TimelogsViewForCoo />);

    expect(screen.queryByText('"Upraveno po telefonu"')).not.toBeInTheDocument();
  });

  it('does not show imported document timelog preview on the Schvalovani page', async () => {
    const buildApprovalTimelogPreview = vi.fn(() => [{
      id: 'approval-doc-1:0',
      status: 'ready' as const,
      reason: 'Pripraveno k aplikovani.',
      documentId: 'approval-doc-1',
      documentName: 'Safarik - 20260015.pdf',
      approvalStatusLabel: 'schvaleno',
      jobNumber: 'BTL003',
      invoiceNumber: '20260015',
      eventName: 'RunCzech',
      personName: 'Ondrej Safarik',
      matchedEvent: { ...events[0], job: 'BTL003', name: 'RunCzech' },
      matchedContractor: contractors[0],
      proposedDays: [{ d: '2026-05-16', f: '05:00', t: '13:00', type: 'instal' as const }],
      existingTimelogId: 1,
    }]);
    const approvalDocument = {
      id: 'approval-doc-1',
      source: 'powerapps_document_approval' as const,
      externalId: 'sharepoint-1',
      documentName: 'Safarik - 20260015.pdf',
      company: 'JCHP',
      jobNumber: 'BTL003',
      invoiceNumber: '20260015',
      supplierName: 'Nekdo jiny',
      approvalStatus: 'approved' as const,
      approvalStatusLabel: 'schvaleno',
      comment: 'RunCzech\nOndrej Safarik\n16.5 5:00-13:00 (8h)',
      approvers: [],
      requester: 'Petr Heitzer',
      rawPayload: null,
      matchedInvoiceId: null,
      lastSyncedAt: '2026-05-26T09:00:00Z',
    };
    const previewRow = {
      id: 'approval-doc-1:0',
      status: 'ready' as const,
      reason: 'Pripraveno k aplikovani.',
      documentId: approvalDocument.id,
      documentName: approvalDocument.documentName,
      document: approvalDocument,
      approvalStatusLabel: approvalDocument.approvalStatusLabel,
      jobNumber: approvalDocument.jobNumber,
      invoiceNumber: approvalDocument.invoiceNumber,
      eventName: 'RunCzech',
      personName: 'Ondrej Safarik',
      matchedEvent: { ...events[0], job: 'BTL003', name: 'RunCzech' },
      matchedContractor: contractors[0],
      proposedDays: [{ d: '2026-05-16', f: '05:00', t: '13:00', type: 'instal' as const }],
      existingTimelogId: 1,
    };

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'coo',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: timelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events }),
    }));

    vi.doMock('../features/crew/services/crew.service', () => ({
      getContractors: () => contractors,
      subscribeToCrewChanges: () => vi.fn(),
    }));

    vi.doMock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
      useInvoiceApprovalsQuery: () => ({ data: [approvalDocument] }),
    }));

    vi.doMock('../lib/app-data', () => ({
      getLocalAppState: () => ({
        timelogs,
        eventCrewAssignments: [],
        grasonEventConfirmations: [],
      }),
    }));

    vi.doMock('../features/invoices/services/approval-timelog-sync.service', () => ({
      buildApprovalTimelogPreview,
      applyApprovalTimelogPreview: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    expect(screen.queryByText('PowerApps timelogy')).not.toBeInTheDocument();
    expect(screen.queryByText('Safarik - 20260015.pdf')).not.toBeInTheDocument();
    expect(buildApprovalTimelogPreview).not.toHaveBeenCalled();
  });
});
