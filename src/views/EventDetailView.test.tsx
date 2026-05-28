import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'profile-1' }),
}));

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

const pendingApprovalTimelog = {
  id: 8,
  eid: 1,
  contractorProfileId: 'profile-2',
  days: [{ d: '2026-04-17', f: '09:00', t: '15:00', type: 'provoz' as const }],
  km: 0,
  note: '',
  status: 'pending_coo' as const,
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

const applicant = {
  ...contractor,
  id: 2,
  profileId: 'profile-2',
  name: 'Jana Nova',
  ii: 'JN',
};

describe('EventDetailView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
      useInvoiceApprovalsQuery: () => ({ data: [] }),
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
        applications: [],
        crewAssignments: [{ eventId: event.id, eventSupabaseId: event.supabaseId, contractorProfileId: contractor.profileId, name: contractor.name }],
      }),
      applyForEvent: vi.fn(),
      approveEventApplication: vi.fn(),
      approveEventWithdrawal: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      removeContractorFromEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
      updateEventApplicationStatus: vi.fn(),
      withdrawEventApplication: vi.fn(),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      updateTimelogStatus,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventDetailView } = await import('./EventDetailView');

    render(<EventDetailView />);

    fireEvent.click(screen.getAllByText('Petr Heitzer')[0]);

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
        applications: [],
        crewAssignments: [{ eventId: event.id, eventSupabaseId: event.supabaseId, contractorProfileId: contractor.profileId, name: contractor.name }],
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
      applyForEvent: vi.fn(),
      approveEventApplication: vi.fn(),
      approveEventWithdrawal: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      removeContractorFromEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
      updateEventApplicationStatus: vi.fn(),
      withdrawEventApplication: vi.fn(),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      updateTimelogStatus,
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
    expect(screen.getAllByText('Petr Heitzer').length).toBeGreaterThan(0);
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
        applications: [],
        crewAssignments: [{ eventId: event.id, eventSupabaseId: event.supabaseId, contractorProfileId: contractor.profileId, name: contractor.name }],
        grasonConfirmations: [],
      }),
      applyForEvent: vi.fn(),
      approveEventApplication: vi.fn(),
      approveEventWithdrawal: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      removeContractorFromEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
      updateEventApplicationStatus: vi.fn(),
      withdrawEventApplication: vi.fn(),
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

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      updateTimelogStatus,
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

  it('shows pending applicants and hides applicants that are already assigned', async () => {
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
        contractors: [contractor, applicant],
        receipts: [],
        applications: [
          {
            id: 1,
            eventId: event.id,
            eventSupabaseId: event.supabaseId,
            contractorProfileId: contractor.profileId,
            status: 'pending',
            plannedFrom: '08:00',
            plannedTo: '14:00',
          },
          {
            id: 2,
            eventId: event.id,
            eventSupabaseId: event.supabaseId,
            contractorProfileId: applicant.profileId,
            status: 'pending',
            plannedFrom: '09:00',
            plannedTo: '15:00',
          },
        ],
        crewAssignments: [{ eventId: event.id, eventSupabaseId: event.supabaseId, contractorProfileId: contractor.profileId, name: contractor.name }],
      }),
      applyForEvent: vi.fn(),
      approveEventApplication: vi.fn(),
      approveEventWithdrawal: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      removeContractorFromEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
      updateEventApplicationStatus: vi.fn(),
      withdrawEventApplication: vi.fn(),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      updateTimelogStatus,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventDetailView } = await import('./EventDetailView');

    render(<EventDetailView />);

    expect(screen.getByText('Prihlaseni na akci (1)')).toBeInTheDocument();
    expect(screen.getByText('Jana Nova')).toBeInTheDocument();
    expect(screen.getByText('09:00 - 15:00')).toBeInTheDocument();
  });

  it('shows event-scoped approvals and approves a pending timelog from the event detail', async () => {
    updateTimelogStatus.mockResolvedValue({ ...pendingApprovalTimelog, status: 'approved' });

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
      getEventCrew: () => [contractor, applicant],
      getEventDetailData: () => ({
        event,
        timelogs: [timelog, pendingApprovalTimelog],
        contractors: [contractor, applicant],
        receipts: [],
        applications: [],
        crewAssignments: [
          { eventId: event.id, eventSupabaseId: event.supabaseId, contractorProfileId: contractor.profileId, name: contractor.name },
          { eventId: event.id, eventSupabaseId: event.supabaseId, contractorProfileId: applicant.profileId, name: applicant.name },
        ],
      }),
      applyForEvent: vi.fn(),
      approveEventApplication: vi.fn(),
      approveEventWithdrawal: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      removeContractorFromEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
      updateEventApplicationStatus: vi.fn(),
      withdrawEventApplication: vi.fn(),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      updateTimelogStatus,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventDetailView } = await import('./EventDetailView');

    render(<EventDetailView />);

    fireEvent.click(screen.getByRole('button', { name: /Schvalovani timelogu \(2\)/ }));
    expect(screen.getAllByText('Petr Heitzer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jana Nova').length).toBeGreaterThan(0);
    expect(screen.getByText('09:00 - 15:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Schvalit' }));

    expect(updateTimelogStatus).toHaveBeenCalledWith(8, 'coo');
  });

  it('lets managers rate assigned crew after a past event', async () => {
    const upsertCrewRating = vi.fn().mockResolvedValue({
      id: 'rating-1',
      profileId: 'profile-1',
      eventId: 1,
      eventSupabaseId: 'event-uuid-1',
      source: 'event',
      rating: 9,
      note: '',
      ratedByProfileId: 'profile-1',
      createdAt: '2026-05-20T00:00:00Z',
      updatedAt: '2026-05-20T00:00:00Z',
    });

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
        applications: [],
        crewAssignments: [{ eventId: event.id, eventSupabaseId: event.supabaseId, contractorProfileId: contractor.profileId, name: contractor.name }],
      }),
      applyForEvent: vi.fn(),
      approveEventApplication: vi.fn(),
      approveEventWithdrawal: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      removeContractorFromEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
      updateEventApplicationStatus: vi.fn(),
      withdrawEventApplication: vi.fn(),
    }));

    vi.doMock('../features/crew/services/crew-ratings.service', () => ({
      getCrewRatingsForEvent: () => [],
      upsertCrewRating,
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      updateTimelogStatus,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventDetailView } = await import('./EventDetailView');

    render(<EventDetailView />);

    expect(screen.getByText('Hodnoceni crew')).toBeInTheDocument();
    expect(screen.queryByLabelText('Hodnoceni Petr Heitzer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hodnoceni crew/ }));

    expect(screen.getByText('Chybi hodnoceni')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Hodnoceni Petr Heitzer'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit hodnoceni pro Petr Heitzer' }));

    await waitFor(() => {
      expect(upsertCrewRating).toHaveBeenCalledWith({
        profileId: 'profile-1',
        eventId: 1,
        eventSupabaseId: 'event-uuid-1',
        source: 'event',
        rating: 9,
        note: '',
        ratedByProfileId: 'profile-1',
      });
    });
  });

  it('hides post-event ratings from crew users', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        role: 'crew',
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
        applications: [],
        crewAssignments: [{ eventId: event.id, eventSupabaseId: event.supabaseId, contractorProfileId: contractor.profileId, name: contractor.name }],
      }),
      applyForEvent: vi.fn(),
      approveEventApplication: vi.fn(),
      approveEventWithdrawal: vi.fn(),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      removeContractorFromEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      subscribeToEventChanges: vi.fn(() => () => undefined),
      updateEventApplicationStatus: vi.fn(),
      withdrawEventApplication: vi.fn(),
    }));

    vi.doMock('../features/crew/services/crew-ratings.service', () => ({
      getCrewRatingsForEvent: () => [],
      upsertCrewRating: vi.fn(),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      updateTimelogStatus,
    }));

    vi.doMock('../components/modals/EventEditModal', () => ({
      default: () => null,
    }));

    vi.doMock('../components/modals/AssignCrewModal', () => ({
      default: () => null,
    }));

    const { default: EventDetailView } = await import('./EventDetailView');

    render(<EventDetailView />);

    expect(screen.queryByText('Hodnoceni crew')).not.toBeInTheDocument();
  });
});
