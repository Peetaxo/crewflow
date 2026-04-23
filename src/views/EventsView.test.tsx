import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAppContext = {
  role: 'crewhead',
  selectedEventId: null,
  setSelectedEventId: vi.fn(),
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
    name: 'Akce 1',
    job: 'AK001',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
    city: 'Praha',
    needed: 2,
    filled: 1,
    status: 'upcoming' as const,
    client: 'Klient A',
  },
];

describe('EventsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders event list without crashing when events query is active', async () => {
    vi.doMock('../context/AppContext', () => ({
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
      getEventDetailData: () => ({ timelogs: [], contractors: [], receipts: [], event: events[0] }),
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
});
