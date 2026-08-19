import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, ReceiptItem } from '../types';

const mocks = vi.hoisted(() => ({
  createEmptyReceipt: vi.fn(),
  setEditingReceipt: vi.fn(),
}));

const state = vi.hoisted(() => ({
  appDataSource: 'supabase' as 'local' | 'supabase',
  event: {} as Event,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../lib/app-config', () => ({
  get appDataSource() {
    return state.appDataSource;
  },
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    role: 'crew',
    selectedEventId: state.event.supabaseId ?? state.event.id,
    setNavigationGuardMessage: vi.fn(),
    setSelectedEventId: vi.fn(),
    eventTab: 'overview',
    setEventTab: vi.fn(),
    setEditingReceipt: mocks.setEditingReceipt,
    setDeleteConfirm: vi.fn(),
    setEditingTimelog: vi.fn(),
  }),
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'profile-1' }),
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../features/receipts/services/receipts.service', () => ({
  createEmptyReceipt: (...args: unknown[]) => mocks.createEmptyReceipt(...args),
}));

vi.mock('../features/events/services/events.service', () => ({
  getEventCrew: () => [{ id: 1, profileId: 'profile-1', name: 'Crew Member' }],
  getEventDetailData: () => ({
    event: state.event,
    timelogs: [],
    contractors: [{
      id: 1,
      profileId: 'profile-1',
      name: 'Crew Member',
      rate: 250,
    }],
    receipts: [],
    applications: [],
    crewAssignments: [{
      eventId: state.event.id,
      eventSupabaseId: state.event.supabaseId,
      contractorProfileId: 'profile-1',
      name: 'Crew Member',
    }],
  }),
  applyForEvent: vi.fn(),
  approveEventApplication: vi.fn(),
  approveEventWithdrawal: vi.fn(),
  createEventCopy: vi.fn((event: Event) => event),
  removeContractorFromEvent: vi.fn(),
  requestEventWithdrawal: vi.fn(),
  subscribeToEventChanges: vi.fn(() => () => undefined),
  updateEventApplicationStatus: vi.fn(),
  withdrawEventApplication: vi.fn(),
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  subscribeToTimelogChanges: vi.fn(() => () => undefined),
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

const receiptDraft: ReceiptItem = {
  id: 77,
  supabaseId: 'receipt-client-uuid',
  contractorProfileId: 'profile-1',
  eid: 0,
  job: '',
  title: '',
  vendor: '',
  amount: 0,
  paidAt: '2026-08-18',
  note: '',
  status: 'draft',
};

const event: Event = {
  id: 12,
  supabaseId: 'event-uuid-12',
  name: 'Receipt event',
  job: 'JOB-12',
  startDate: '2026-09-01',
  endDate: '2026-09-01',
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'upcoming',
  client: 'Client',
};

describe('EventDetailView receipt draft identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.appDataSource = 'supabase';
    state.event = event;
    mocks.createEmptyReceipt.mockImplementation(() => ({
      ...receiptDraft,
      supabaseId: state.appDataSource === 'supabase' ? receiptDraft.supabaseId : undefined,
    }));
  });

  it('opens a factory-created UUID draft with the selected stable event foreign key', () => {
    render(<EventDetailView />);

    fireEvent.click(screen.getByRole('button', { name: 'Pridat uctenku' }));

    expect(mocks.createEmptyReceipt).toHaveBeenCalledWith('profile-1');
    expect(mocks.setEditingReceipt).toHaveBeenCalledWith({
      ...receiptDraft,
      eid: event.id,
      eventSupabaseId: event.supabaseId,
      job: event.job,
      paidAt: event.startDate,
      contractorProfileId: 'profile-1',
    });
  });

  it('does not open a Supabase receipt draft when the selected event has no stable UUID', () => {
    state.event = { ...event, supabaseId: undefined };

    render(<EventDetailView />);
    fireEvent.click(screen.getByRole('button', { name: 'Pridat uctenku' }));

    expect(mocks.createEmptyReceipt).not.toHaveBeenCalled();
    expect(mocks.setEditingReceipt).not.toHaveBeenCalled();
  });

  it('keeps opening factory-created local drafts for local-only events', () => {
    state.appDataSource = 'local';
    state.event = { ...event, supabaseId: undefined };

    render(<EventDetailView />);
    fireEvent.click(screen.getByRole('button', { name: 'Pridat uctenku' }));

    expect(mocks.createEmptyReceipt).toHaveBeenCalledWith('profile-1');
    expect(mocks.setEditingReceipt).toHaveBeenCalledWith({
      ...receiptDraft,
      supabaseId: undefined,
      eid: event.id,
      eventSupabaseId: undefined,
      job: event.job,
      paidAt: event.startDate,
      contractorProfileId: 'profile-1',
    });
  });
});
