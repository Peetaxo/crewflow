import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceApprovalDocument } from '../types';

let invoiceApprovalDocuments: InvoiceApprovalDocument[] = [];

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
    invoiceApprovalDocuments = [];
    vi.doMock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
      useInvoiceApprovalsQuery: () => ({ data: invoiceApprovalDocuments }),
    }));
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

  it('keeps selected event id while events are still loading', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockAppContext,
        selectedEventId: 1,
      }),
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: undefined, isLoading: true, isFetching: true, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items,
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

    expect(mockAppContext.setSelectedEventId).not.toHaveBeenCalledWith(null);
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

    fireEvent.click(screen.getByText('Marek Rebroš'));

    expect(mockAppContext.setSelectedContractorProfileId).toHaveBeenCalledWith('profile-1');
    expect(mockAppContext.setCurrentTab).toHaveBeenCalledWith('crew');
    expect(mockAppContext.setSelectedEventId).not.toHaveBeenCalled();
  });

  it('shows confirmed Grason people on event cards when timelogs are not created yet', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockAppContext,
    }));

    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: [{ ...events[0], filled: 2 }], isLoading: false, error: null }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(),
      filterEventsByStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getEventsWithDerivedStatus: (items: typeof events) => items.map((item) => ({ ...item, derivedStatus: 'full' as const })),
      getReferenceDate: () => new Date('2026-04-20'),
      getEventDetailData: () => ({
        event: { ...events[0], filled: 2 },
        timelogs: [],
        contractors: eventDetail.contractors,
        receipts: [],
        grasonConfirmations: [
          {
            id: 'confirmation-1',
            source: 'grason',
            sourceMonth: '2026-05',
            sourceKey: '2026-05-20|Akce 1 / AK001',
            eventId: 'event-uuid-1',
            profileId: 'profile-1',
            shiftDate: '2026-05-20',
            sourceTitle: 'Akce 1 / AK001',
            eventName: 'Akce 1',
            jobNumber: 'AK001',
            phase: 'provoz',
            confirmedName: 'Marek Rebroš',
            sourceOccurrenceCount: 1,
            rawPayload: null,
            importedAt: '2026-05-20T00:00:00Z',
            updatedAt: '2026-05-20T00:00:00Z',
          },
          {
            id: 'confirmation-2',
            source: 'grason',
            sourceMonth: '2026-05',
            sourceKey: '2026-05-20|Akce 1 / AK001',
            eventId: 'event-uuid-1',
            profileId: 'profile-2',
            shiftDate: '2026-05-20',
            sourceTitle: 'Akce 1 / AK001',
            eventName: 'Akce 1',
            jobNumber: 'AK001',
            phase: 'provoz',
            confirmedName: 'Jaroslav Macháč',
            sourceOccurrenceCount: 1,
            rawPayload: null,
            importedAt: '2026-05-20T00:00:00Z',
            updatedAt: '2026-05-20T00:00:00Z',
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

    expect(screen.getByText('Grason')).toBeInTheDocument();
    expect(screen.getByText('Marek Rebroš')).toBeInTheDocument();
    expect(screen.getByText('Jaroslav Macháč')).toBeInTheDocument();
    expect(screen.getByText('0 timelogy · 0.0 h')).toBeInTheDocument();
  });

  it('shows approval status dots next to people on event cards', async () => {
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

    invoiceApprovalDocuments = [
      {
        id: 'approval-doc-1',
        source: 'powerapps_document_approval',
        externalId: 'sharepoint-1',
        documentName: 'Rebros - 2026-04.pdf',
        company: 'NL',
        jobNumber: 'AK001',
        invoiceNumber: '2026-04',
        supplierName: '',
        approvalStatus: 'pending',
        approvalStatusLabel: 've schvalování',
        comment: [
          'Akce 1',
          '',
          'Marek Rebroš',
          '20.4 09:00 - 14:00',
          'Celkem 5h',
        ].join('\n'),
        approvers: ['Ales Burger'],
        requester: 'Petr Heitzer',
        rawPayload: null,
        matchedInvoiceId: null,
        lastSyncedAt: '2026-05-25T12:00:00Z',
      },
    ];

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

    expect(screen.getByLabelText('Stav schvalovani: Ve schvalování')).toBeInTheDocument();
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
