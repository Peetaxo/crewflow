import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Role } from '../types';
import type { ShiftWorkflowManagementData } from '../features/shift-workflows/shift-workflows.management';

const state = vi.hoisted(() => ({ role: 'crewhead' as Role, scopeRole: 'crewhead' as Role, mobile: false, selected: null as string | null, load: vi.fn(), save: vi.fn(), reload: vi.fn(), snapshot: {} as ShiftWorkflowManagementData['snapshot'] }));
vi.mock('../context/useAppContext', () => ({ useAppContext: () => ({
  role: state.role, selectedEventId: state.selected, setSelectedEventId: vi.fn(), searchQuery: 'Přípravy',
  setCurrentTab: vi.fn(), setSelectedContractorProfileId: vi.fn(), setDeleteConfirm: vi.fn(), setEventTab: vi.fn(),
  eventTab: 'overview', setEditingReceipt: vi.fn(), setEditingTimelog: vi.fn(), setNavigationGuardMessage: vi.fn(),
  eventsViewMode: 'list', setEventsViewMode: vi.fn(), eventsCalendarMode: 'month', setEventsCalendarMode: vi.fn(),
  eventsFilter: 'all', setEventsFilter: vi.fn(), eventsCalendarDate: '2026-10-09', setEventsCalendarDate: vi.fn(),
}) }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentProfileId: 'manager' }) }));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
vi.mock('../features/shift-workflows/useShiftWorkflows', () => ({ useShiftWorkflows: () => ({
  scope: { source: 'supabase', role: state.scopeRole, userId: 'user', profileId: 'manager' }, scopeKey: state.scopeRole,
  ready: true, save: state.save, reload: state.reload, query: { data: state.snapshot },
}) }));
vi.mock('../features/shift-workflows/shift-workflows.management-loader', () => ({ loadEventShiftWorkflowManagementData: state.load }));
vi.mock('../features/shift-workflows/useSharedApprovals', () => ({ useSharedApprovals: () => ({ cards: () => null, legacyOnly: (reports: unknown[]) => reports, reviewSelection: () => false, groupsFor: () => ({ rounds: [], legacy: [] }) }) }));
vi.mock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => ({ data: events, isLoading: false, error: null }) }));
vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({ useTimelogsQuery: () => ({ data: [], isLoading: false, error: null }) }));
vi.mock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({ useInvoiceApprovalsQuery: () => ({ data: [] }) }));
vi.mock('../features/invoices/services/invoice-approval-sync.service', () => ({ getEventApprovalDocuments: () => [] }));
vi.mock('../features/timelogs/services/timelogs.service', () => ({ subscribeToTimelogChanges: () => () => undefined }));
vi.mock('../features/crew/services/crew-ratings.service', () => ({ getCrewRatingsForEvent: () => [] }));
vi.mock('../features/events/services/events.service', () => ({
  getReferenceDate: () => new Date('2026-10-09T12:00:00Z'),
  getEventsWithDerivedStatus: (input: Event[]) => input.map((event) => ({ ...event, derivedStatus: 'upcoming' })),
  filterEventsByStatus: (input: Event[]) => input,
  getEventDetailData: (selected: string) => ({ event: events.find((e) => e.supabaseId === selected) ?? null, timelogs: [], contractors: [], receipts: [], applications: [], crewAssignments: [] }),
  getEventCrew: () => [], subscribeToEventChanges: () => () => undefined,
  createEmptyEvent: vi.fn(), createEventCopy: vi.fn(), applyForEvent: vi.fn(), requestEventWithdrawal: vi.fn(), withdrawEventApplication: vi.fn(),
  approveEventApplication: vi.fn(), approveEventWithdrawal: vi.fn(), removeContractorFromEvent: vi.fn(), updateEventApplicationStatus: vi.fn(),
}));
vi.mock('../components/modals/EventEditModal', () => ({ default: () => null }));
vi.mock('../components/modals/AssignCrewModal', () => ({ default: () => null }));
vi.mock('../features/crew/components/EventCrewRatingPanel', () => ({ default: () => null }));
vi.mock('../features/events/components/EventMapPreview', () => ({ default: () => null }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> } }));

import EventsView from './EventsView';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const events = ['Přípravy', 'Instalace', 'Bez přiřazení'].map((name, i) => ({ id: i + 21, supabaseId: id(i + 21), name, job: 'JOB', startDate: '2026-10-09', endDate: '2026-10-09', updatedAt: '2026-10-09T11:00:00Z', city: 'Praha', needed: 2, filled: 0, status: 'upcoming', client: 'Klient', showDayTypes: false } as Event));
const makeData = (): ShiftWorkflowManagementData => ({ snapshot: { revision: 1, workflows: [], rounds: [], assignedEventIds: [] }, events, timelogs: [], invoices: [], eventCrewAssignments: [] });

describe('shared workflow route in Akce', () => {
  beforeEach(() => { vi.clearAllMocks(); state.role = 'crewhead'; state.scopeRole = 'crewhead'; state.mobile = false; state.selected = null; state.snapshot = makeData().snapshot; state.load.mockResolvedValue(makeData()); state.save.mockResolvedValue(undefined); });
  it.each([{ role: 'crewhead' as const, mobile: false }, { role: 'coo' as const, mobile: true }])('places the main create action in the $role toolbar (mobile=$mobile) and ignores page search filters', async ({ role, mobile }) => {
    state.role = role; state.scopeRole = role; state.mobile = mobile; render(<EventsView />);
    const button = screen.getByRole('button', { name: 'Propojit směny' }); expect(button).not.toHaveClass('nodu-event-mobile-create-fab');
    fireEvent.click(button); await screen.findByRole('dialog');
    expect(screen.getByRole('checkbox', { name: /Bez přiřazení · JOB/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Bez přiřazení · JOB/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' })); await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    expect(state.save.mock.calls[0][0].eventIds).toEqual([id(21), id(23)]);
  });
  it('uses the authoritative role even if the page still displays a manager role', () => { state.scopeRole = 'crew'; render(<EventsView />); expect(screen.queryByRole('button', { name: 'Propojit směny' })).not.toBeInTheDocument(); });
  it.each([false, true])('retires the list dialog and its callbacks when detail opens (mobile=%s)', async (mobile) => {
    state.mobile = mobile; let resolve!: (value: unknown) => void; state.save.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender } = render(<EventsView />); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Instalace · JOB/ })); fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    state.selected = id(21); rerender(<EventsView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Propojit směny' })).not.toBeInTheDocument();
    await act(async () => { resolve(undefined); }); expect(screen.getByRole('heading', { name: 'Přípravy', level: 1 })).toBeInTheDocument();
  });
});
