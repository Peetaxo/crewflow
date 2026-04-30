import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setEditingTimelog = vi.fn();
const setSelectedEventId = vi.fn();

const event = {
  id: 1,
  supabaseId: 'event-uuid-1',
  name: 'TEST',
  job: 'JTI001',
  startDate: '2026-04-16',
  endDate: '2026-04-17',
  city: '',
  needed: 1,
  filled: 1,
  status: 'past' as const,
  client: 'NextLevel s.r.o.',
  showDayTypes: false,
};

const timelog = {
  id: 7,
  eid: 1,
  contractorProfileId: 'profile-1',
  days: [{ d: '2026-04-17', f: '05:00', t: '17:00', type: 'provoz' as const }],
  km: 0,
  note: '',
  status: 'draft' as const,
};

const contractor = {
  id: 1,
  profileId: 'profile-1',
  name: 'Petr Heitzer',
  ii: 'PH',
  bg: '#dbeafe',
  fg: '#1d4ed8',
  tags: [],
  events: 1,
  rate: 99,
  phone: '',
  email: '',
  ico: '',
  dic: '',
  bank: '',
  city: '',
  reliable: true,
  note: '',
};

describe('EventDetailView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('opens timelog detail when clicking an assigned crew row', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        role: 'coo',
        selectedEventId: 'event-uuid-1',
        setSelectedEventId,
        eventTab: 'overview',
        setEventTab: vi.fn(),
        setEditingReceipt: vi.fn(),
        setDeleteConfirm: vi.fn(),
        setEditingTimelog,
      }),
    }));

    vi.doMock('../features/events/services/events.service', () => ({
      getEventCrew: () => [contractor],
      getEventDetailData: () => ({
        event,
        timelogs: [timelog],
        contractors: [contractor],
        receipts: [],
      }),
      removeContractorFromEvent: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventDetailView } = await import('./EventDetailView');

    render(<EventDetailView />);

    fireEvent.click(screen.getByText('Petr Heitzer'));

    expect(setEditingTimelog).toHaveBeenCalledWith(timelog);
  });
});
