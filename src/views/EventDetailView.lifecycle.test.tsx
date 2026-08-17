import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventApplication, Timelog, TimelogStatus } from '../types';

const mocks = vi.hoisted(() => ({
  approveEventApplication: vi.fn(),
  approveEventWithdrawal: vi.fn(),
  getEventDetailData: vi.fn(),
  removeContractorFromEvent: vi.fn(),
  toastError: vi.fn(),
}));

const state = vi.hoisted(() => ({
  detail: {} as {
    event: Record<string, unknown>;
    timelogs: Timelog[];
    contractors: Array<Record<string, unknown>>;
    receipts: never[];
    applications: EventApplication[];
    crewAssignments: Array<Record<string, unknown>>;
  },
  eventCrew: [] as Array<Record<string, unknown>>,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: mocks.toastError,
  },
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    role: 'coo',
    selectedEventId: 'event-uuid-1',
    setSelectedEventId: vi.fn(),
    eventTab: 'overview',
    setEventTab: vi.fn(),
    setEditingReceipt: vi.fn(),
    setDeleteConfirm: vi.fn(),
    setEditingTimelog: vi.fn(),
  }),
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'manager-profile' }),
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../features/events/services/events.service', () => ({
  getEventCrew: () => state.eventCrew,
  getEventDetailData: (...args: unknown[]) => mocks.getEventDetailData(...args),
  applyForEvent: vi.fn(),
  approveEventApplication: (...args: unknown[]) => mocks.approveEventApplication(...args),
  approveEventWithdrawal: (...args: unknown[]) => mocks.approveEventWithdrawal(...args),
  createEventCopy: vi.fn((event) => event),
  removeContractorFromEvent: (...args: unknown[]) => mocks.removeContractorFromEvent(...args),
  requestEventWithdrawal: vi.fn(),
  subscribeToEventChanges: vi.fn(() => () => undefined),
  updateEventApplicationStatus: vi.fn().mockResolvedValue(undefined),
  withdrawEventApplication: vi.fn(),
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  updateTimelogStatus: vi.fn(),
}));

vi.mock('../features/crew/services/crew-ratings.service', () => ({
  getCrewRatingsForEvent: () => [],
}));

vi.mock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({
  useInvoiceApprovalsQuery: () => ({ data: [] }),
}));

vi.mock('../features/invoices/services/invoice-approval-sync.service', () => ({
  getEventApprovalDocuments: () => [],
}));

vi.mock('../components/modals/EventEditModal', () => ({ default: () => null }));
vi.mock('../components/modals/AssignCrewModal', () => ({ default: () => null }));
vi.mock('../features/crew/components/EventCrewRatingPanel', () => ({ default: () => null }));

import EventDetailView from './EventDetailView';

const managerEvent = {
  id: 1,
  supabaseId: 'event-uuid-1',
  name: 'Lifecycle test',
  job: 'LIFE-1',
  startDate: '2026-12-01',
  endDate: '2026-12-01',
  city: 'Praha',
  needed: 3,
  filled: 1,
  status: 'upcoming' as const,
  client: 'Client',
  showDayTypes: false,
};

const assignedContractor = {
  id: 1,
  profileId: 'profile-petr',
  name: 'Petr Heitzer',
  ii: 'PH',
  bg: '#dbeafe',
  fg: '#1d4ed8',
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
};

const applicant = {
  ...assignedContractor,
  id: 2,
  profileId: 'profile-jana',
  name: 'Jana Nova',
  ii: 'JN',
};

const withdrawingContractor = {
  ...assignedContractor,
  id: 3,
  profileId: 'profile-eva',
  name: 'Eva Mala',
  ii: 'EM',
};

const makeTimelog = (status: TimelogStatus, id = 1): Timelog => ({
  id,
  eid: managerEvent.id,
  contractorProfileId: assignedContractor.profileId,
  days: [{ d: managerEvent.startDate, f: '08:00', t: '17:00', type: 'provoz' }],
  km: 0,
  note: '',
  status,
});

const renderManagerDetail = ({
  timelogStatus = 'draft',
  timelogs,
  pendingApplication = false,
  pendingWithdrawal = false,
}: {
  timelogStatus?: TimelogStatus;
  timelogs?: Timelog[];
  pendingApplication?: boolean;
  pendingWithdrawal?: boolean;
} = {}) => {
  const applications: EventApplication[] = [];
  if (pendingApplication) {
    applications.push({
      id: 11,
      eventId: managerEvent.id,
      eventSupabaseId: managerEvent.supabaseId,
      contractorProfileId: applicant.profileId,
      status: 'pending',
      plannedFrom: '08:00',
      plannedTo: '17:00',
    });
  }
  if (pendingWithdrawal) {
    applications.push({
      id: 12,
      eventId: managerEvent.id,
      eventSupabaseId: managerEvent.supabaseId,
      contractorProfileId: withdrawingContractor.profileId,
      status: 'withdrawal_requested',
    });
  }

  state.eventCrew = [assignedContractor];
  state.detail = {
    event: managerEvent,
    timelogs: timelogs ?? [makeTimelog(timelogStatus)],
    contractors: [assignedContractor, applicant, withdrawingContractor],
    receipts: [],
    applications,
    crewAssignments: [{
      eventId: managerEvent.id,
      eventSupabaseId: managerEvent.supabaseId,
      contractorProfileId: assignedContractor.profileId,
      name: assignedContractor.name,
    }],
  };

  return render(<EventDetailView />);
};

describe('EventDetailView Crew lifecycle guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.approveEventApplication.mockResolvedValue(undefined);
    mocks.approveEventWithdrawal.mockResolvedValue(undefined);
    mocks.removeContractorFromEvent.mockResolvedValue(undefined);
    mocks.getEventDetailData.mockImplementation(() => state.detail);
  });

  it('disables removal when any Crew timelog is already submitted', () => {
    renderManagerDetail({ timelogStatus: 'pending_ch' });

    const remove = screen.getByRole('button', { name: 'Crew nelze odebrat – výkaz byl odeslán' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute(
      'title',
      'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.',
    );
  });

  it.each(['pending_crew_confirmation', 'approved'] satisfies TimelogStatus[])(
    'blocks removal for a %s timelog',
    (timelogStatus) => {
      renderManagerDetail({ timelogStatus });

      expect(screen.getByRole('button', { name: 'Crew nelze odebrat – výkaz byl odeslán' })).toBeDisabled();
    },
  );

  it('allows removal for a rejected timelog', () => {
    renderManagerDetail({ timelogStatus: 'rejected' });

    expect(screen.getByRole('button', { name: 'Odebrat Petr Heitzer z akce' })).toBeEnabled();
  });

  it('blocks removal when any matching timelog is non-disposable', () => {
    renderManagerDetail({ timelogs: [makeTimelog('draft', 1), makeTimelog('approved', 2)] });

    expect(screen.getByRole('button', { name: 'Crew nelze odebrat – výkaz byl odeslán' })).toBeDisabled();
  });

  it('does not call removal from a status-blocked button', () => {
    renderManagerDetail({ timelogStatus: 'approved' });

    fireEvent.click(screen.getByRole('button', { name: 'Crew nelze odebrat – výkaz byl odeslán' }));

    expect(mocks.removeContractorFromEvent).not.toHaveBeenCalled();
  });

  it('calls removal only once while the first request is pending and reloads after success', async () => {
    let resolveRemoval!: () => void;
    mocks.removeContractorFromEvent.mockReturnValue(new Promise<void>((resolve) => { resolveRemoval = resolve; }));
    renderManagerDetail({ timelogStatus: 'draft', pendingApplication: true, pendingWithdrawal: true });
    const detailCallsBeforeAction = mocks.getEventDetailData.mock.calls.length;
    const remove = screen.getByRole('button', { name: 'Odebrat Petr Heitzer z akce' });

    fireEvent.click(remove);
    fireEvent.click(remove);

    expect(mocks.removeContractorFromEvent).toHaveBeenCalledTimes(1);
    expect(mocks.getEventDetailData).toHaveBeenCalledTimes(detailCallsBeforeAction);
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Schvalit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Schvalit odhlaseni' })).toBeDisabled();

    resolveRemoval();

    await waitFor(() => expect(remove).not.toBeDisabled());
    expect(mocks.getEventDetailData).toHaveBeenCalledTimes(detailCallsBeforeAction + 1);
  });

  it('clears the removal lock and reports a stable service error so removal can be retried', async () => {
    mocks.removeContractorFromEvent.mockRejectedValueOnce(new Error('Crew lifecycle failed')).mockResolvedValueOnce(undefined);
    renderManagerDetail({ timelogStatus: 'draft' });
    const remove = screen.getByRole('button', { name: 'Odebrat Petr Heitzer z akce' });

    fireEvent.click(remove);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Crew lifecycle failed'));
    expect(remove).toBeEnabled();

    fireEvent.click(remove);
    await waitFor(() => expect(mocks.removeContractorFromEvent).toHaveBeenCalledTimes(2));
  });

  it('calls application approval only once while pending', async () => {
    let resolveApproval!: () => void;
    mocks.approveEventApplication.mockReturnValue(new Promise<void>((resolve) => { resolveApproval = resolve; }));
    renderManagerDetail({ pendingApplication: true });
    const approve = screen.getByRole('button', { name: 'Schvalit' });

    fireEvent.click(approve);
    fireEvent.click(approve);

    expect(mocks.approveEventApplication).toHaveBeenCalledTimes(1);
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Odebrat Petr Heitzer z akce' })).toBeDisabled();

    resolveApproval();

    await waitFor(() => expect(approve).not.toBeDisabled());
  });

  it('clears the application approval lock after rejection and permits retry', async () => {
    mocks.approveEventApplication.mockRejectedValueOnce(new Error('Approval failed')).mockResolvedValueOnce(undefined);
    renderManagerDetail({ pendingApplication: true });
    const approve = screen.getByRole('button', { name: 'Schvalit' });

    fireEvent.click(approve);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Approval failed'));
    expect(approve).toBeEnabled();

    fireEvent.click(approve);
    await waitFor(() => expect(mocks.approveEventApplication).toHaveBeenCalledTimes(2));
  });

  it('calls withdrawal approval only once while pending', async () => {
    let resolveApproval!: () => void;
    mocks.approveEventWithdrawal.mockReturnValue(new Promise<void>((resolve) => { resolveApproval = resolve; }));
    renderManagerDetail({ pendingWithdrawal: true });
    const approve = screen.getByRole('button', { name: 'Schvalit odhlaseni' });

    fireEvent.click(approve);
    fireEvent.click(approve);

    expect(mocks.approveEventWithdrawal).toHaveBeenCalledTimes(1);
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute('aria-busy', 'true');

    resolveApproval();

    await waitFor(() => expect(approve).not.toBeDisabled());
  });

  it('clears the Crew action lock even when detail reload fails', async () => {
    let resolveRemoval!: () => void;
    mocks.removeContractorFromEvent.mockReturnValue(new Promise<void>((resolve) => { resolveRemoval = resolve; }));
    renderManagerDetail({ timelogStatus: 'draft' });
    const remove = screen.getByRole('button', { name: 'Odebrat Petr Heitzer z akce' });
    mocks.getEventDetailData.mockImplementationOnce(() => {
      throw new Error('Detail reload failed');
    });

    fireEvent.click(remove);
    resolveRemoval();

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Detail reload failed'));
    expect(remove).toBeEnabled();
  });
});
