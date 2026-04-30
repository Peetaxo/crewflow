import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('shows assigned crew names and opens detail by clicking the event card', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: events, isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
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
    expect(screen.getByText('Crew hodiny celkem')).toBeInTheDocument();
    expect(screen.getByText('2 timelogy · 10.0 h')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Detail' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Akce 1'));

    expect(mockAppContext.setSelectedEventId).toHaveBeenCalledWith('event-uuid-1');
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

    fireEvent.click(screen.getByRole('button', { name: 'Marek Rebroš' }));

    expect(mockAppContext.setSelectedContractorProfileId).toHaveBeenCalledWith('profile-1');
    expect(mockAppContext.setCurrentTab).toHaveBeenCalledWith('crew');
    expect(mockAppContext.setSelectedEventId).not.toHaveBeenCalled();
  });

  it('shows multi-day events under each day with event time instead of place', async () => {
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
    expect(screen.getByText(/16\. 4\. 2026.*09:00.*17:00.*Klient B/)).toBeInTheDocument();
    expect(screen.getByText(/17\. 4\. 2026.*10:00.*15:00.*Klient B/)).toBeInTheDocument();
    expect(screen.queryByText(/Praha/)).not.toBeInTheDocument();
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
