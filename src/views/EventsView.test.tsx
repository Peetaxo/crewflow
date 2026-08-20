import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mobileMockState = vi.hoisted(() => ({ isMobile: false }));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'profile-current' }),
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => mobileMockState.isMobile,
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
    mobileMockState.isMobile = false;
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('renders a compact mobile Crew events header while keeping list and calendar controls for management', async () => {
    mobileMockState.isMobile = true;

    const setupMocks = (role: 'crew' | 'crewhead') => {
      vi.doMock('../context/useAppContext', () => ({
        useAppContext: () => ({
          ...mockAppContext,
          role,
        }),
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
    };

    setupMocks('crew');
    const { default: CrewEventsView } = await import('./EventsView');

    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CrewEventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Akce' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vybrat datum akci' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtrovat akce' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Seznam' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kalendar' })).not.toBeInTheDocument();

    unmount();
    vi.resetModules();

    setupMocks('crewhead');
    const { default: ManagementEventsView } = await import('./EventsView');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <ManagementEventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Seznam' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kalendar' })).toBeInTheDocument();
  });

  it('keeps the event list under the mobile detail so swipe back reveals the previous page', async () => {
    mobileMockState.isMobile = true;

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        selectedEventId: 'event-uuid-1',
      }),
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
      default: () => <div className="nodu-mobile-event-detail" data-testid="mobile-event-detail-overlay">detail</div>,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventsView } = await import('./EventsView');

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('mobile-event-detail-overlay')).toBeInTheDocument();
    expect(screen.getByText('Akce 1')).toBeInTheDocument();
    expect(screen.getByText('AK001')).toBeInTheDocument();
  });

  it('keeps occupied mobile Crew events visible by default and filters by participation', async () => {
    mobileMockState.isMobile = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00'));

    const mobileCrewEvents = [
      {
        id: 101,
        supabaseId: 'event-open',
        name: 'Volna akce',
        job: 'OPEN001',
        startDate: '2026-08-15',
        endDate: '2026-08-15',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 2,
        filled: 1,
        status: 'upcoming' as const,
        client: 'Klient A',
      },
      {
        id: 102,
        supabaseId: 'event-full',
        name: 'Obsazena akce',
        job: 'FULL001',
        startDate: '2026-08-16',
        endDate: '2026-08-16',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 1,
        status: 'full' as const,
        client: 'Klient B',
      },
      {
        id: 103,
        supabaseId: 'event-assigned',
        name: 'Moje potvrzena akce',
        job: 'MINE001',
        startDate: '2026-08-17',
        endDate: '2026-08-17',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 2,
        filled: 1,
        status: 'upcoming' as const,
        client: 'Klient C',
      },
      {
        id: 104,
        supabaseId: 'event-pending',
        name: 'Cekam na schvaleni',
        job: 'WAIT001',
        startDate: '2026-08-18',
        endDate: '2026-08-18',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'upcoming' as const,
        client: 'Klient D',
      },
      {
        id: 105,
        supabaseId: 'event-old',
        name: 'Stara akce',
        job: 'OLD001',
        startDate: '2026-08-01',
        endDate: '2026-08-01',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'past' as const,
        client: 'Klient E',
      },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsCalendarDate: '2026-08-11',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: mobileCrewEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({ ...item, derivedStatus: item.status === 'past' ? 'past' as const : item.status === 'full' ? 'full' as const : 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({ ...item, derivedStatus: item.status === 'past' ? 'past' as const : item.status === 'full' ? 'full' as const : 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-08-11'),
      getEventDetailData: (eventId: string | number) => ({
        ...eventDetail,
        event: mobileCrewEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? mobileCrewEvents[0],
        timelogs: [],
        applications: eventId === 'event-pending'
          ? [{ id: 201, eventId: 104, eventSupabaseId: 'event-pending', contractorProfileId: 'profile-current', status: 'pending' as const }]
          : [],
        crewAssignments: eventId === 'event-assigned'
          ? [{ eventId: 103, eventSupabaseId: 'event-assigned', contractorProfileId: 'profile-current', name: 'Petr Heitzer' }]
          : [],
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

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Volna akce')).toBeInTheDocument();
    expect(screen.getByText('Obsazena akce')).toBeInTheDocument();
    expect(screen.getByText('Stara akce')).toBeInTheDocument();

    const openCard = screen.getByText('Volna akce').closest('.relative.cursor-pointer');
    expect(openCard).not.toBeNull();
    expect(within(openCard as HTMLElement).getByRole('button', { name: 'Prihlasit na akci' })).toBeInTheDocument();

    const occupiedCard = screen.getByText('Obsazena akce').closest('.relative.cursor-pointer');
    expect(occupiedCard).not.toBeNull();
    expect(within(occupiedCard as HTMLElement).getByRole('button', { name: 'Obsazeno' })).toBeDisabled();

    const pastCard = screen.getByText('Stara akce').closest('.relative.cursor-pointer');
    expect(pastCard).not.toBeNull();
    expect(within(pastCard as HTMLElement).queryByRole('button', { name: 'Prihlasit na akci' })).not.toBeInTheDocument();
    expect(within(pastCard as HTMLElement).queryByRole('button', { name: 'Obsazeno' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filtrovat akce' }));
    const filterPanel = document.querySelector('.nodu-mobile-events-filter-panel');
    expect(filterPanel).not.toBeNull();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Vse' })).toBeInTheDocument();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Volne' })).toBeInTheDocument();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Moje akce' })).toBeInTheDocument();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Cekam' })).toBeInTheDocument();
    expect(within(filterPanel as HTMLElement).getByRole('button', { name: 'Obsazeno' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Moje akce' }));

    expect(screen.getByText('Moje potvrzena akce')).toBeInTheDocument();
    expect(screen.queryByText('Volna akce')).not.toBeInTheDocument();
    expect(screen.queryByText('Obsazena akce')).not.toBeInTheDocument();
  });

  it('opens an in-app date picker for mobile Crew events and filters from the selected date', async () => {
    mobileMockState.isMobile = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00'));

    const setEventsCalendarDate = vi.fn();
    const mobileCrewEvents = [
      {
        id: 201,
        supabaseId: 'event-before-date',
        name: 'Akce pred vyberem',
        job: 'BEF001',
        startDate: '2026-08-15',
        endDate: '2026-08-15',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'upcoming' as const,
        client: 'Klient A',
      },
      {
        id: 202,
        supabaseId: 'event-after-date',
        name: 'Akce po vyberu',
        job: 'AFT001',
        startDate: '2026-08-20',
        endDate: '2026-08-20',
        startTime: '08:00',
        endTime: '17:00',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'upcoming' as const,
        client: 'Klient B',
      },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsCalendarDate: '2026-08-11',
        setEventsCalendarDate,
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: mobileCrewEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-08-11'),
      getEventDetailData: (eventId: string | number) => ({
        ...eventDetail,
        event: mobileCrewEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? mobileCrewEvents[0],
        timelogs: [],
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

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Akce pred vyberem')).toBeInTheDocument();
    expect(screen.getByText('Akce po vyberu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' }));

    expect(screen.getByText('srpen 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit akce od 20. srpna 2026' }));

    expect(screen.queryByText('Akce pred vyberem')).not.toBeInTheDocument();
    expect(screen.getByText('Akce po vyberu')).toBeInTheDocument();
    expect(setEventsCalendarDate).toHaveBeenCalledWith('2026-08-20');

    fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' }));
    fireEvent.click(screen.getByRole('button', { name: 'Všechny akce' }));

    expect(screen.getByText('Akce pred vyberem')).toBeInTheDocument();
    expect(screen.getByText('Akce po vyberu')).toBeInTheDocument();
  });

  it('renders single-day event meta without dangling separators when client is missing', async () => {
    const singleDayEvent = {
      id: 28,
      name: 'Ploom TEST',
      job: 'JTI001',
      startDate: '2026-07-28',
      endDate: '2026-07-28',
      startTime: '08:00',
      endTime: '17:00',
      city: 'Roudnice nad Labem',
      needed: 1,
      filled: 0,
      status: 'upcoming' as const,
      client: '',
    };

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsCalendarDate: '2026-07-28',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: [singleDayEvent], isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof singleDayEvent[]) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof singleDayEvent[]) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-07-28'),
      getEventDetailData: () => ({
        ...eventDetail,
        event: singleDayEvent,
        timelogs: [],
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

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.getByText('28. 7. 2026 · 08:00 - 17:00')).toBeInTheDocument();
    expect(screen.queryByText(/28\. 7\. 2026 - 08:00 - 17:00 -/)).not.toBeInTheDocument();
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

  it('renders a compact floating mobile create-event button for managers', async () => {
    const createEmptyEventMock = vi.fn(() => events[0]);

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: createEmptyEventMock,
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

    expect(screen.getByRole('button', { name: '+ Nova akce' })).toHaveClass('hidden', 'md:inline-flex');

    const mobileCreateButton = screen.getByRole('button', { name: 'Nova akce' });
    expect(mobileCreateButton).toHaveTextContent('+');
    expect(mobileCreateButton).toHaveClass('nodu-event-mobile-create-fab', 'h-10', 'w-10', 'md:hidden');
    expect(mobileCreateButton).not.toHaveClass('bottom-6');
    expect(mobileCreateButton).not.toHaveClass('bottom-[calc(env(safe-area-inset-bottom)+6rem)]');
    expect(mobileCreateButton).not.toHaveClass('left-4');

    fireEvent.click(mobileCreateButton);

    expect(createEmptyEventMock).toHaveBeenCalledOnce();
  });

  it('hides the floating mobile create-event button while the event detail is open', async () => {
    mobileMockState.isMobile = true;

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        selectedEventId: 'event-uuid-1',
      }),
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

    expect(screen.getByText('detail')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova akce' })).not.toBeInTheDocument();
  });

  it('keeps event list management actions focused on copy without crew assignment shortcut', async () => {
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

    expect(screen.getByRole('button', { name: 'Kopirovat akci na jiny den' })).toBeInTheDocument();
    expect(screen.queryByText(/Obsadit crew/)).not.toBeInTheDocument();
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
    const multiDayCards = screen.getAllByTestId('event-list-card');
    expect(multiDayCards).toHaveLength(2);
    multiDayCards.forEach((card) => {
      expect(card).toHaveAttribute('data-event-multiday', 'true');
      expect(card.querySelector('[data-testid="event-list-accent"]')).toBeInTheDocument();
    });
    expect(new Set(multiDayCards.map((card) => card.style.getPropertyValue('--event-list-accent'))).size).toBe(1);
    expect(screen.getByText(/16\..*dubna/i)).toBeInTheDocument();
    expect(screen.getByText(/17\..*dubna/i)).toBeInTheDocument();
    expect(screen.getAllByText('Od')).toHaveLength(2);
    expect(screen.getAllByText('16. 4. 2026 · 09:00')).toHaveLength(2);
    expect(screen.getAllByText('Do')).toHaveLength(2);
    expect(screen.getAllByText('17. 4. 2026 · 17:00')).toHaveLength(2);
    expect(screen.getAllByText('Klient B')).toHaveLength(2);
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*09:00.*17:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*10:00.*15:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.queryByText('Začíná dnes')).not.toBeInTheDocument();
    expect(screen.queryByText('Končí dnes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Probíhá od/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Praha/)).not.toBeInTheDocument();
  });

  it('keeps a multi-day event accent stable when another event changes the local order', async () => {
    const opicakEvent = {
      id: 21,
      name: 'Opičák Fest',
      job: 'PIC001',
      startDate: '2026-04-16',
      endDate: '2026-04-17',
      startTime: '09:00',
      endTime: '17:00',
      city: 'Praha',
      needed: 3,
      filled: 1,
      status: 'upcoming' as const,
      client: 'NextLevel s.r.o.',
    };
    let currentEvents = [opicakEvent];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        eventsCalendarDate: '2026-04-16',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: currentEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof currentEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof currentEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-04-16'),
      getEventDetailData: () => ({
        ...eventDetail,
        event: opicakEvent,
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
    const getOpicakAccent = () => {
      const card = screen.getAllByTestId('event-list-card')
        .find((item) => item.textContent?.includes('Opičák Fest'));
      expect(card).toBeDefined();
      return (card as HTMLElement).style.getPropertyValue('--event-list-accent');
    };
    const mutedAccentColors = new Set(['#c98ca2', '#88a79c', '#7f9eb8', '#a391bd', '#c79a70', '#76aaa5']);

    const firstRender = render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );
    const firstAccent = getOpicakAccent();

    firstRender.unmount();
    currentEvents = [
      {
        ...events[0],
        id: 22,
        supabaseId: undefined,
        name: 'Nová akce',
        job: 'NEW001',
        startDate: '2026-04-15',
        endDate: '2026-04-15',
      },
      {
        ...opicakEvent,
        id: 99,
      },
    ];

    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );
    const secondAccent = getOpicakAccent();

    expect(secondAccent).toBe(firstAccent);
    expect(mutedAccentColors.has(secondAccent)).toBe(true);
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
    const multiDayCards = screen.getAllByTestId('event-list-card');
    expect(multiDayCards).toHaveLength(1);
    expect(multiDayCards[0]).toHaveAttribute('data-event-multiday', 'true');
    expect(multiDayCards[0].querySelector('[data-testid="event-list-accent"]')).not.toBeInTheDocument();
    expect(screen.getByText('Od')).toBeInTheDocument();
    expect(screen.getByText('16. 4. 2026 · 09:00')).toBeInTheDocument();
    expect(screen.getByText('Do')).toBeInTheDocument();
    expect(screen.getByText('17. 4. 2026 · 17:00')).toBeInTheDocument();
    expect(screen.getByText('Klient B')).toBeInTheDocument();
    expect(screen.queryByText(/16\. 4\. - 17\. 4\. 2026.*09:00.*17:00.*Klient B/)).not.toBeInTheDocument();
    expect(screen.queryByText('Začíná dnes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Probíhá od/)).not.toBeInTheDocument();
    expect(screen.queryByText('Končí dnes')).not.toBeInTheDocument();
    expect(screen.getByText('2 dny')).toBeInTheDocument();
    expect(screen.queryByText(/17\..*dubna/i)).not.toBeInTheDocument();
  });

  it('shows all mobile Crew event history by default instead of hiding past events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T10:00:00+02:00'));
    mobileMockState.isMobile = true;

    const mobileCrewEvents = [
      {
        ...events[0],
        id: 30,
        supabaseId: 'event-past',
        name: 'Stara cervencova akce',
        startDate: '2026-07-13',
        endDate: '2026-07-15',
      },
      {
        ...events[0],
        id: 31,
        supabaseId: 'event-today',
        name: 'Dnesni akce',
        startDate: '2026-08-10',
        endDate: '2026-08-10',
      },
      {
        ...events[0],
        id: 32,
        supabaseId: 'event-future',
        name: 'Zarijova akce',
        startDate: '2026-09-02',
        endDate: '2026-09-02',
      },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        role: 'crew',
        eventsFilter: 'all',
        eventsCalendarDate: '2026-07-01',
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: mobileCrewEvents, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof mobileCrewEvents, filter: string) => (
        filter === 'upcoming' ? items.filter((item) => item.derivedStatus !== 'past') : items
      ),
      getEventsWithDerivedStatus: (items: typeof mobileCrewEvents) => items.map((item) => ({
        ...item,
        derivedStatus: item.endDate < '2026-08-10' ? 'past' as const : 'upcoming' as const,
      })),
      getReferenceDate: () => new Date('2026-08-10T10:00:00+02:00'),
      getEventDetailData: (eventId: number | string) => ({
        ...eventDetail,
        event: mobileCrewEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? mobileCrewEvents[0],
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

    expect(screen.getByText('Dnesni akce')).toBeInTheDocument();
    expect(screen.getByText('Zarijova akce')).toBeInTheDocument();
    expect(screen.getByText('Stara cervencova akce')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nadchazejici' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uplynule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vse' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Predchozi mesic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dalsi mesic' })).not.toBeInTheDocument();
    expect(screen.queryByText('cervenec 2026')).not.toBeInTheDocument();
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
    const multiDayCards = screen.getAllByTestId('event-list-card');
    expect(multiDayCards).toHaveLength(5);
    multiDayCards.forEach((card) => {
      expect(card).toHaveAttribute('data-event-multiday', 'true');
      expect(card.querySelector('[data-testid="event-list-accent"]')).toBeInTheDocument();
    });
    expect(new Set(multiDayCards.map((card) => card.style.getPropertyValue('--event-list-accent'))).size).toBe(1);
    expect(screen.queryByText('Začíná dnes')).not.toBeInTheDocument();
    expect(screen.queryByText(/Probíhá od/)).not.toBeInTheDocument();
    expect(screen.queryByText('Končí dnes')).not.toBeInTheDocument();
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
