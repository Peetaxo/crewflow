import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setEditingTimelog = vi.fn();
const setSelectedEventId = vi.fn();
const updateTimelogStatus = vi.fn();

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
    vi.doMock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
      useInvoiceApprovalsQuery: () => ({ data: [] }),
    }));
    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      updateTimelogStatus,
    }));
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

    fireEvent.click(within(screen.getByRole('table')).getByText('Petr Heitzer'));

    expect(setEditingTimelog).toHaveBeenCalledWith(timelog);
  });

  it('shows imported Grason people as assigned crew without a separate Grason section', async () => {
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
        event: { ...event, filled: 2 },
        timelogs: [],
        contractors: [contractor],
        receipts: [],
        grasonConfirmations: [
          {
            id: 'confirmation-1',
            source: 'grason',
            sourceMonth: '2026-05',
            sourceKey: '2026-05-16|TEST / JTI001',
            eventId: 'event-uuid-1',
            profileId: 'profile-1',
            shiftDate: '2026-05-16',
            sourceTitle: 'TEST / JTI001',
            eventName: 'TEST',
            jobNumber: 'JTI001',
            phase: 'provoz',
            confirmedName: 'Petr Heitzer',
            sourceOccurrenceCount: 1,
            rawPayload: null,
            importedAt: '2026-05-16T00:00:00Z',
            updatedAt: '2026-05-16T00:00:00Z',
          },
          {
            id: 'confirmation-2',
            source: 'grason',
            sourceMonth: '2026-05',
            sourceKey: '2026-05-16|TEST / JTI001',
            eventId: 'event-uuid-1',
            profileId: null,
            shiftDate: '2026-05-16',
            sourceTitle: 'TEST / JTI001',
            eventName: 'TEST',
            jobNumber: 'JTI001',
            phase: 'provoz',
            confirmedName: 'Klara Novakova',
            sourceOccurrenceCount: 1,
            rawPayload: null,
            importedAt: '2026-05-16T00:00:00Z',
            updatedAt: '2026-05-16T00:00:00Z',
          },
        ],
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

    expect(screen.queryByText('Potvrzeni z Grasonu (2)')).not.toBeInTheDocument();
    expect(screen.queryByText('Potvrzeni z Grasonu')).not.toBeInTheDocument();
    expect(screen.getByText('Petr Heitzer')).toBeInTheDocument();
    expect(screen.queryByText('Klara Novakova')).not.toBeInTheDocument();
    expect(screen.getByText('Prirazena Crew (1)')).toBeInTheDocument();
  });

  it('shows approval dots and the approval table in the event detail', async () => {
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
        grasonConfirmations: [],
      }),
      removeContractorFromEvent: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
    }));

    vi.doMock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
      useInvoiceApprovalsQuery: () => ({
        data: [
          {
            id: 'approval-doc-1',
            source: 'powerapps_document_approval',
            externalId: 'sharepoint-1',
            documentName: 'Heitzer - 2026-04.pdf',
            company: 'NL',
            jobNumber: 'JTI001',
            invoiceNumber: '2026-04',
            supplierName: '',
            approvalStatus: 'approved',
            approvalStatusLabel: 'schváleno',
            comment: [
              'TEST',
              '',
              'Petr Heitzer',
              '17.4 05:00 - 17:00',
              'Celkem 12h',
            ].join('\n'),
            approvers: ['Ales Burger'],
            requester: 'Petr Heitzer',
            rawPayload: null,
            matchedInvoiceId: null,
            lastSyncedAt: '2026-05-25T12:00:00Z',
          },
        ],
      }),
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventDetailView } = await import('./EventDetailView');

    render(<EventDetailView />);

    expect(screen.getByLabelText('Stav schvalovani: Uzavřeno v approval systému')).toBeInTheDocument();
    expect(screen.getByText('Schvalovani faktur')).toBeInTheDocument();
    expect(screen.getByText('Heitzer - 2026-04.pdf')).toBeInTheDocument();
    expect(screen.getByText('Schváleno')).toBeInTheDocument();
  });

  it('shows timelog approvals in the event detail and lets COO approve them', async () => {
    const pendingCooTimelog = {
      ...timelog,
      id: 8,
      status: 'pending_coo' as const,
    };
    updateTimelogStatus.mockResolvedValue(pendingCooTimelog);

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
        timelogs: [pendingCooTimelog],
        contractors: [contractor],
        receipts: [],
        grasonConfirmations: [],
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

    fireEvent.click(screen.getByRole('button', { name: 'Schvalovani timelogu (1)' }));

    expect(screen.getByText('Čeká COO')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Schvalit' }));

    await waitFor(() => {
      expect(updateTimelogStatus).toHaveBeenCalledWith(8, 'coo');
    });
  });
});
