import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockContext = {
  setEditingTimelog: vi.fn(),
  role: 'crewhead',
  searchQuery: '',
  timelogFilter: 'all',
  setTimelogFilter: vi.fn(),
};

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
const noTimelogs: typeof timelogs = [];

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

const mockEmptyPowerAppsPreview = () => {
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
  });

  it('groups all timelogs by event instead of job number', async () => {
    mockEmptyPowerAppsPreview();

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
    mockEmptyPowerAppsPreview();

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

  it('labels the mine scope as Schvalovani for crew', async () => {
    mockEmptyPowerAppsPreview();

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

  it('lets crew edit draft and rejected timelogs in Schvalovani', async () => {
    mockEmptyPowerAppsPreview();

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

  it('lets CrewHead edit pending CH timelogs without exposing that edit action to COO', async () => {
    mockEmptyPowerAppsPreview();

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
    mockEmptyPowerAppsPreview();

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
    mockEmptyPowerAppsPreview();

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
    mockEmptyPowerAppsPreview();

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

  it('shows PowerApps timelog preview on the real Schvalovani page', async () => {
    const refetch = vi.fn();
    const applyApprovalTimelogPreview = vi.fn().mockResolvedValue({ ...timelogs[0], status: 'approved' });
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
      useTimelogsQuery: () => ({ data: timelogs, refetch }),
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
      buildApprovalTimelogPreview: vi.fn(() => [previewRow]),
      applyApprovalTimelogPreview,
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    expect(screen.getByText('PowerApps timelogy')).toBeInTheDocument();
    expect(screen.getByText('Safarik - 20260015.pdf')).toBeInTheDocument();
    expect(screen.getByText('Ondrej Safarik')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Aplikovat$/i }));

    await waitFor(() => {
      expect(applyApprovalTimelogPreview).toHaveBeenCalledWith(previewRow, { timelogs });
    });
    expect(refetch).toHaveBeenCalled();
  });

  it('builds PowerApps preview from hydrated events and crew when timelog dependencies are still empty', async () => {
    const buildApprovalTimelogPreview = vi.fn(() => []);
    const approvalDocument = {
      id: 'approval-doc-2',
      source: 'powerapps_document_approval' as const,
      externalId: 'sharepoint-2',
      documentName: 'Rebros-2026-014.pdf',
      company: 'NL',
      jobNumber: 'JTI001',
      invoiceNumber: '2026-014',
      supplierName: 'Marek Re',
      approvalStatus: 'approved' as const,
      approvalStatusLabel: 'schvaleno',
      comment: 'Mladí ladí Jazz / JTI001 Marek Rebroš - instal/deinstal (10h) Jaroslav Macháč - instal/deinstal (10h)',
      approvers: [],
      requester: 'Petr Heitzer',
      rawPayload: null,
      matchedInvoiceId: null,
      lastSyncedAt: '2026-05-26T09:00:00Z',
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
      useTimelogsQuery: () => ({ data: noTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors: [], events: [] }),
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
        timelogs: [],
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

    await waitFor(() => {
      expect(buildApprovalTimelogPreview).toHaveBeenCalledWith(expect.objectContaining({
        approvalDocuments: [approvalDocument],
        events,
        contractors,
      }));
    });
  });
});
