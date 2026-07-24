import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'profile-current' }),
}));

vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({
  useTimelogsQuery: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
  useInvoiceApprovalsQuery: () => ({ data: [], isLoading: false, error: null }),
}));

const mockAppContext = {
  role: 'crewhead',
  setCurrentTab: vi.fn(),
  selectedEventId: null,
  setSelectedEventId: vi.fn(),
  setSelectedContractorProfileId: vi.fn(),
  searchQuery: '',
  setDeleteConfirm: vi.fn(),
  setEventTab: vi.fn(),
  eventsViewMode: 'list',
  setEventsViewMode: vi.fn(),
  eventsCalendarMode: 'month',
  setEventsCalendarMode: vi.fn(),
  eventsFilter: 'all',
  setEventsFilter: vi.fn(),
  eventsCalendarDate: '2026-04-20',
  setEventsCalendarDate: vi.fn(),
};

const events = [
  {
    id: 1,
    supabaseId: 'event-uuid-1',
    name: 'Akce 1',
    job: 'AK001',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
    city: 'Praha',
    needed: 2,
    filled: 2,
    status: 'upcoming' as const,
    client: 'Klient A',
  },
];

const multiDayEvents = [
  {
    id: 2,
    name: 'Dvoudenni akce',
    job: 'AK002',
    startDate: '2026-04-16',
    endDate: '2026-04-17',
    startTime: '09:00',
    endTime: '17:00',
    city: 'Praha',
    needed: 1,
    filled: 0,
    status: 'upcoming' as const,
    client: 'Klient B',
  },
];

const longMultiDayEvents = [
  {
    id: 3,
    name: 'Pětidenní akce',
    job: 'AK003',
    startDate: '2026-04-16',
    endDate: '2026-04-20',
    startTime: '08:00',
    endTime: '18:00',
    city: 'Brno',
    needed: 4,
    filled: 3,
    status: 'upcoming' as const,
    client: 'Klient C',
  },
];

const monthlyEvents = [
  {
    ...events[0],
    id: 10,
    supabaseId: 'event-uuid-april',
    name: 'Dubnova akce',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
  },
  {
    ...events[0],
    id: 11,
    supabaseId: 'event-uuid-may',
    name: 'Kvetnova akce',
    startDate: '2026-05-02',
    endDate: '2026-05-02',
  },
];

const eventDetail = {
  timelogs: [
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
      eid: 1,
      contractorProfileId: 'profile-2',
      days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
      km: 0,
      note: '',
      status: 'draft' as const,
    },
  ],
  contractors: [
    { id: 1, profileId: 'profile-1', name: 'Marek Rebroš', ii: 'MR', bg: '#fff', fg: '#000', tags: [], events: 1, rate: 250, phone: '', email: '', ico: '', dic: '', bank: '', city: '', reliable: true, note: '' },
    { id: 2, profileId: 'profile-2', name: 'Jaroslav Macháč', ii: 'JM', bg: '#fff', fg: '#000', tags: [], events: 1, rate: 250, phone: '', email: '', ico: '', dic: '', bank: '', city: '', reliable: true, note: '' },
  ],
  receipts: [],
  event: events[0],
  applications: [],
  crewAssignments: [
    { eventId: 1, eventSupabaseId: 'event-uuid-1', contractorProfileId: 'profile-1', name: 'Marek Rebroš' },
    { eventId: 1, eventSupabaseId: 'event-uuid-1', contractorProfileId: 'profile-2', name: 'Jaroslav Macháč' },
  ],
};

describe('EventsView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('renders event list without crashing when events query is active', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Akce 1')).toBeInTheDocument();
    expect(screen.getByText('AK001')).toBeInTheDocument();
  });

  it('filters the list by selected month and can request the next month', async () => {
    const setEventsCalendarDate = vi.fn();

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsCalendarDate: '2026-04-20',
        setEventsCalendarDate,
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: monthlyEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn(),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof monthlyEvents) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof monthlyEvents) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: (eventId: number | string) => ({
        ...eventDetail,
        event: monthlyEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? monthlyEvents[0],
        timelogs: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('duben 2026')).toBeInTheDocument();
    expect(screen.getByText('Dubnova akce')).toBeInTheDocument();
    expect(screen.queryByText('Kvetnova akce')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dalsi mesic' }));

    expect(setEventsCalendarDate).toHaveBeenCalledWith('2026-05-01');
  });

  it('switches to all events when browsing months from the upcoming filter', async () => {
    const setEventsCalendarDate = vi.fn();
    const setEventsFilter = vi.fn();
    const monthNavigationEvents = [
      {
        ...events[0],
        id: 20,
        supabaseId: 'event-uuid-may-past',
        name: 'Kvetnova minula akce',
        startDate: '2026-05-12',
        endDate: '2026-05-12',
      },
      {
        ...events[0],
        id: 21,
        supabaseId: 'event-uuid-june-upcoming',
        name: 'Cervnova budouci akce',
        startDate: '2026-06-20',
        endDate: '2026-06-20',
      },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsFilter: 'upcoming',
        eventsCalendarDate: '2026-06-15',
        setEventsCalendarDate,
        setEventsFilter,
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: monthNavigationEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: Array<typeof monthNavigationEvents[number] & { derivedStatus: string }>, filter: string) => (
        filter === 'upcoming' ? items.filter((item) => item.derivedStatus !== 'past') : items
      ),
      getEventsWithDerivedStatus: (items: typeof monthNavigationEvents) => items.map((item) => ({
        ...item,
        derivedStatus: item.id === 20 ? 'past' as const : 'upcoming' as const,
      })),
      getReferenceDate: () => new Date('2026-06-15'),
      getEventDetailData: (eventId: number | string) => ({
        ...eventDetail,
        event: monthNavigationEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? monthNavigationEvents[0],
        timelogs: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Cervnova budouci akce')).toBeInTheDocument();
    expect(screen.queryByText('Kvetnova minula akce')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Predchozi mesic' }));

    expect(setEventsFilter).toHaveBeenCalledWith('all');
    expect(setEventsCalendarDate).toHaveBeenCalledWith('2026-05-01');
  });

  it('shows the empty state when the selected list month has no matching events', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsCalendarDate: '2026-06-01',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: monthlyEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof monthlyEvents) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof monthlyEvents) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-06-01'),
      getEventDetailData: (eventId: number | string) => ({
        ...eventDetail,
        event: monthlyEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? monthlyEvents[0],
        timelogs: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Pro tento mesic a filtr tu zatim nejsou zadne akce.')).toBeInTheDocument();
  });

  it('shows assigned crew names and opens detail by clicking the event card', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Marek Rebroš')).toBeInTheDocument();
    expect(screen.getByText('Jaroslav Macháč')).toBeInTheDocument();
    expect(screen.queryByText('Crew hodiny celkem')).not.toBeInTheDocument();
    expect(screen.queryByText('2 timelogy · 10.0 h')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detail' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Akce 1'));

    expect(mockAppContext.setSelectedEventId).toHaveBeenCalledWith('event-uuid-1');
  });

  it('opens a copied event draft from the event list copy button', async () => {
    const copiedEvent = {
      ...events[0],
      id: 99,
      supabaseId: undefined,
      startDate: '2026-04-21',
      endDate: '2026-04-21',
      filled: 0,
    };

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn(() => copiedEvent),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: ({ editingEvent }: { editingEvent: typeof copiedEvent | null }) => (
        editingEvent ? <div>Kopie akce {editingEvent.id} {editingEvent.startDate}</div> : null
      ),
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Kopirovat akci na jiny den' }));

    expect(screen.getByText('Kopie akce 99 2026-04-21')).toBeInTheDocument();
    expect(mockAppContext.setSelectedEventId).not.toHaveBeenCalled();
  });

  it('shows when event timelogs are approved', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => ({
        ...eventDetail,
        timelogs: eventDetail.timelogs.map((timelog) => ({ ...timelog, status: 'approved' as const })),
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Casy schvalene')).toBeInTheDocument();
  });

  it('shows timelog approval status on assigned crew names', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => ({
        ...eventDetail,
        timelogs: [
          { ...eventDetail.timelogs[0], status: 'pending_coo' as const },
          { ...eventDetail.timelogs[1], status: 'approved' as const },
        ],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    const marekChip = screen.getAllByRole('button', { name: /Marek Rebroš/ })
      .find((button) => button.getAttribute('title')?.includes('Ceka COO'));
    const jaroslavChip = screen.getAllByRole('button', { name: /Jaroslav Macháč/ })
      .find((button) => button.getAttribute('title')?.includes('Casy schvalene'));

    expect(marekChip).toHaveAttribute('title', 'Casy: Ceka COO');
    expect(jaroslavChip).toHaveAttribute('title', 'Casy: Casy schvalene');
    expect(screen.queryAllByLabelText(/Stav schvalovani:/)).toHaveLength(0);
  });

  it('opens crew detail when clicking an assigned crew name', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => eventDetail,
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    const marekChip = screen.getAllByRole('button', { name: /Marek Rebroš/ })
      .find((button) => button.getAttribute('title')?.startsWith('Casy:'));
    expect(marekChip).toBeDefined();

    fireEvent.click(marekChip as HTMLElement);

    expect(mockAppContext.setSelectedContractorProfileId).toHaveBeenCalledWith('profile-1');
    expect(mockAppContext.setCurrentTab).toHaveBeenCalledWith('crew');
    expect(mockAppContext.setSelectedEventId).not.toHaveBeenCalled();
  });

  it('shows multi-day events under each day for managers with event time instead of place', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsCalendarDate: '2026-04-16',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: multiDayEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof multiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof multiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({
        timelogs: [
          {
            id: 3,
            eid: 2,
            contractorProfileId: 'profile-3',
            days: [{ d: '2026-04-17', f: '10:00', t: '15:00', type: 'provoz' as const }],
            km: 0,
            note: '',
            status: 'draft' as const,
          },
        ],
        contractors: [],
        receipts: [],
        event: multiDayEvents[0],
        applications: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Dvoudenni akce')).toHaveLength(2);
    expect(screen.getByText(/16\..*dubna/i)).toBeInTheDocument();
    expect(screen.getByText(/17\..*dubna/i)).toBeInTheDocument();
    expect(screen.getAllByText('Od')).toHaveLength(2);
    expect(screen.getAllByText('16. 4. 2026 · 09:00')).toHaveLength(2);
    expect(screen.getAllByText('Do')).toHaveLength(2);
    expect(screen.getAllByText('17. 4. 2026 · 17:00')).toHaveLength(2);
    expect(screen.getAllByText('Klient B')).toHaveLength(2);
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*09:00.*17:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*10:00.*15:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.getByText('Začíná dnes')).toBeInTheDocument();
    expect(screen.getByText('Končí dnes')).toBeInTheDocument();
    expect(screen.queryByText(/Praha/)).not.toBeInTheDocument();
  });

  it('shows multi-day events only on the start day for Crew users', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsCalendarDate: '2026-04-16',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: multiDayEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof multiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof multiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({
        timelogs: [],
        contractors: [],
        receipts: [],
        event: multiDayEvents[0],
        applications: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Dvoudenni akce')).toHaveLength(1);
    expect(screen.getByText('Od')).toBeInTheDocument();
    expect(screen.getByText('16. 4. 2026 · 09:00')).toBeInTheDocument();
    expect(screen.getByText('Do')).toBeInTheDocument();
    expect(screen.getByText('17. 4. 2026 · 17:00')).toBeInTheDocument();
    expect(screen.getByText('Klient B')).toBeInTheDocument();
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*09:00.*17:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.getByText('Začíná dnes')).toBeInTheDocument();
    expect(screen.getByText('2 dny')).toBeInTheDocument();
    expect(screen.queryByText(/17\..*dubna/i)).not.toBeInTheDocument();
  });

  it('marks continuation days differently for CH and COO users', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'coo',
        eventsCalendarDate: '2026-04-16',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: longMultiDayEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof longMultiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof longMultiDayEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({
        timelogs: [],
        contractors: [],
        receipts: [],
        event: longMultiDayEvents[0],
        applications: [],
        crewAssignments: [],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('Pětidenní akce')).toHaveLength(5);
    expect(screen.getByText('Začíná dnes')).toBeInTheDocument();
    expect(screen.getAllByText('Probíhá od 16. 4.')).toHaveLength(3);
    expect(screen.getByText('Končí dnes')).toBeInTheDocument();
    expect(screen.getAllByText('5 dní')).toHaveLength(5);
    expect(screen.getAllByText('Od')).toHaveLength(5);
    expect(screen.getAllByText('16. 4. 2026 · 08:00')).toHaveLength(5);
    expect(screen.getAllByText('Do')).toHaveLength(5);
    expect(screen.getAllByText('20. 4. 2026 · 18:00')).toHaveLength(5);
  });

  it('shows multiple unique timelog shifts for the event day', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => ({
        ...eventDetail,
        timelogs: [
          {
            id: 1,
            eid: 1,
            contractorProfileId: 'profile-1',
            days: [{ d: '2026-04-20', f: '22:00', t: '03:00', type: 'provoz' as const }],
            km: 0,
            note: '',
            status: 'draft' as const,
          },
          {
            id: 2,
            eid: 1,
            contractorProfileId: 'profile-2',
            days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
            km: 0,
            note: '',
            status: 'draft' as const,
          },
        ],
      }),
    }));

    vi.doMock('./EventDetailView', () => ({
      default: () => <div>detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/09:00.*14:00, 22:00.*03:00/)).toBeInTheDocument();
  });
});
