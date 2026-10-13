import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Role } from '../types';
import type { ShiftWorkflowManagementData } from '../features/shift-workflows/shift-workflows.management';
import { ShiftWorkflowError } from '../features/shift-workflows/shift-workflows.contract';

const state = vi.hoisted(() => ({ role: 'crewhead' as Role, scopeRole: 'crewhead' as Role, user: 'user', source: 'supabase' as 'supabase' | 'local', viewMode: 'list' as 'list' | 'calendar', eventsData: null as Event[] | null, mobile: false, selected: null as string | null, load: vi.fn(), save: vi.fn(), reload: vi.fn(), setSelected: vi.fn(), setFilter: vi.fn(), setDate: vi.fn(), setMode: vi.fn(), setProfile: vi.fn(), setDelete: vi.fn(), snapshot: {} as ShiftWorkflowManagementData['snapshot'] }));
vi.mock('../context/useAppContext', () => ({ useAppContext: () => ({
  role: state.role, selectedEventId: state.selected, setSelectedEventId: state.setSelected, searchQuery: 'Přípravy',
  setCurrentTab: vi.fn(), setSelectedContractorProfileId: state.setProfile, setDeleteConfirm: state.setDelete, setEventTab: vi.fn(),
  eventTab: 'overview', setEditingReceipt: vi.fn(), setEditingTimelog: vi.fn(), setNavigationGuardMessage: vi.fn(),
  eventsViewMode: state.viewMode, setEventsViewMode: state.setMode, eventsCalendarMode: 'month', setEventsCalendarMode: vi.fn(),
  eventsFilter: 'all', setEventsFilter: state.setFilter, eventsCalendarDate: '2026-10-09', setEventsCalendarDate: state.setDate,
}) }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentProfileId: 'manager' }) }));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
vi.mock('../features/shift-workflows/useShiftWorkflows', () => ({ useShiftWorkflows: () => ({
  scope: { source: state.source, role: state.scopeRole, userId: state.user, profileId: 'manager' }, scopeKey: `${state.source}:${state.user}:${state.scopeRole}`,
  ready: true, save: state.save, reload: state.reload, query: { data: state.snapshot },
}) }));
vi.mock('../features/shift-workflows/shift-workflows.management-loader', () => ({ loadEventShiftWorkflowManagementData: state.load }));
vi.mock('../features/shift-workflows/useSharedApprovals', () => ({ useSharedApprovals: () => ({ cards: () => null, legacyOnly: (reports: unknown[]) => reports, reviewSelection: () => false, groupsFor: () => ({ rounds: [], legacy: [] }) }) }));
vi.mock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => ({ data: state.eventsData ?? events, isLoading: false, error: null }) }));
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
const events = ['Přípravy', 'Instalace', 'Bez přiřazení', 'Včera', 'Starší', 'Vícedenní'].map((name, i) => ({ id: i + 21, supabaseId: id(i + 21), name, job: 'JOB', startDate: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-11', '2026-09-20', '2026-10-11'][i], endDate: i === 5 ? '2026-10-13' : ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-11', '2026-09-20'][i], updatedAt: '2026-10-09T11:00:00Z', city: 'Praha', needed: 2, filled: 0, status: 'upcoming', client: 'Klient', showDayTypes: false } as Event));
const makeData = (): ShiftWorkflowManagementData => ({ snapshot: { revision: 1, workflows: [], rounds: [], assignedEventIds: [] }, events, timelogs: [], invoices: [], eventCrewAssignments: [] });

describe('shared workflow route in Akce', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-12T12:00:00')); vi.clearAllMocks(); state.role = 'crewhead'; state.scopeRole = 'crewhead'; state.user = 'user'; state.source = 'supabase'; state.viewMode = 'list'; state.eventsData = null; state.mobile = false; state.selected = null; state.snapshot = makeData().snapshot; state.load.mockResolvedValue(makeData()); state.save.mockResolvedValue(undefined); });
  afterEach(() => vi.useRealTimers());
  it.each([{ role: 'crewhead' as const, mobile: false }, { role: 'coo' as const, mobile: true }])('places the main create action in the $role toolbar (mobile=$mobile) and ignores page search filters', async ({ role, mobile }) => {
    state.role = role; state.scopeRole = role; state.mobile = mobile; render(<EventsView />);
    const button = screen.getByRole('button', { name: 'Propojit směny' }); expect(button).not.toHaveClass('nodu-event-mobile-create-fab');
    fireEvent.click(button); await screen.findByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' });
    if (mobile) {
      expect(screen.getByRole('searchbox')).toHaveValue('Přípravy');
      expect(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })).not.toBeChecked();
      expect(screen.queryByRole('checkbox', { name: /Bez přiřazení · JOB/ })).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Vybráno: 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Bez přiřazení · JOB/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Bez přiřazení · JOB/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));
    expect(state.save).not.toHaveBeenCalled();
    const summary = screen.getByRole('dialog');
    expect(within(summary).getByText('Přípravy · JOB')).toBeInTheDocument();
    expect(within(summary).getByText('Bez přiřazení · JOB')).toBeInTheDocument();
    expect(within(summary).queryByRole('searchbox')).not.toBeInTheDocument();
    fireEvent.click(within(summary).getByRole('button', { name: 'Propojit směny' })); await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    expect(state.save.mock.calls[0][0].eventIds).toEqual([id(21), id(23)]);
  });
  it.each(['crew', 'admin'] as const)('uses the authoritative %s role even if the page still displays a manager role', (role) => { state.scopeRole = role as Role; render(<EventsView />); expect(screen.queryByRole('button', { name: 'Propojit směny' })).not.toBeInTheDocument(); });
  it.each([false, true])('retires the list dialog and its callbacks when detail opens (mobile=%s)', async (mobile) => {
    state.mobile = mobile; let resolve!: (value: unknown) => void; state.save.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender } = render(<EventsView />); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); await screen.findByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' });
    if (mobile) {
      expect(screen.getByRole('searchbox')).toHaveValue('Přípravy');
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    }
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Instalace · JOB/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' })); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    state.selected = id(21); rerender(<EventsView />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Propojit směny' })).not.toBeInTheDocument();
    await act(async () => { resolve(undefined); }); expect(screen.getByRole('heading', { name: 'Přípravy', level: 1 })).toBeInTheDocument();
  });
  it('toggles actual cards by header and keyboard, checks all multiday copies and counts distinct identities', async () => {
    render(<EventsView />); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    await screen.findByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' });
    const copies = screen.getAllByRole('checkbox', { name: /Vícedenní · JOB/ }); expect(copies).toHaveLength(3);
    fireEvent.click(within(copies[1]).getByRole('heading', { name: 'Vícedenní' }));
    expect(copies.every((copy) => copy.getAttribute('aria-checked') === 'true')).toBe(true);
    expect(screen.getByText('Vybráno: 1')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('checkbox', { name: /Přípravy · JOB/ }), { key: 'Enter' });
    expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('checkbox', { name: /Přípravy · JOB/ }), { key: ' ' });
    expect(screen.getByText('Vybráno: 1')).toBeInTheDocument();
    expect(screen.queryByTitle('Smazat akci')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Kopirovat/ })).not.toBeInTheDocument();
    expect(state.setSelected).not.toHaveBeenCalled(); expect(state.setDelete).not.toHaveBeenCalled(); expect(state.setProfile).not.toHaveBeenCalled();
  });
  it('retains hidden selection through global search, date jump and summary back without changing ordinary filters', async () => {
    render(<EventsView />); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    const search = await screen.findByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ }));
    fireEvent.change(search, { target: { value: 'Starší' } });
    expect(screen.getByRole('checkbox', { name: /Starší · JOB/ })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Přípravy · JOB/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Starší · JOB/ }));
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Přejít na datum'), { target: { value: '2026-11-02' } });
    expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));
    const summary = screen.getByRole('dialog'); expect(within(summary).getByText('Starší · JOB')).toBeInTheDocument(); expect(within(summary).getByText('Přípravy · JOB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zpět k výběru' }));
    expect(screen.getByLabelText('Přejít na datum')).toHaveValue('2026-11-02'); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled(); expect(state.setDate).not.toHaveBeenCalled(); expect(state.setFilter).not.toHaveBeenCalled(); expect(state.setMode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));
    expect(screen.queryByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propojit směny' })).toBeInTheDocument();
  });
  it('retains the captured gallery and versions when live event and workflow queries delete their data', async () => {
    const { rerender } = render(<EventsView />); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); await screen.findByRole('searchbox');
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Instalace · JOB/ }));
    state.eventsData = []; state.snapshot = { ...makeData().snapshot, revision: 99 }; rerender(<EventsView />);
    expect(screen.getByText('Vybráno: 2')).toBeInTheDocument(); expect(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' })); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce()); expect(state.save.mock.calls[0][0].expectedRevision).toBe(1);
  });
  it.each(['identity', 'role', 'source', 'detail', 'tab'] as const)('retires an old full read on %s navigation before it can reopen card selection', async (change) => {
    let resolve!: (value: ShiftWorkflowManagementData) => void; state.load.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = render(<EventsView />); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    if (change === 'identity') state.user = 'other'; if (change === 'role') state.scopeRole = 'crew'; if (change === 'source') state.source = 'local'; if (change === 'detail') state.selected = id(21);
    if (change === 'tab') view.unmount(); else view.rerender(<EventsView />);
    await act(async () => resolve(makeData())); expect(screen.queryByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' })).not.toBeInTheDocument(); expect(state.load.mock.calls[0][2].aborted).toBe(true);
  });
  it.each(['identity', 'tab'] as const)('does not close a new gallery after an old %s save completes', async (change) => {
    let resolve!: (value: unknown) => void; state.save.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const view = render(<EventsView />); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); await screen.findByRole('searchbox');
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Instalace · JOB/ })); fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' })); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    if (change === 'identity') { state.user = 'other'; view.rerender(<EventsView />); } else { view.unmount(); render(<EventsView />); }
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); await screen.findByRole('searchbox');
    await act(async () => resolve(undefined)); expect(screen.getByText('Vybráno: 0')).toBeInTheDocument();
  });
  it('retires a conflict refresh when detail opens and ignores its late event data', async () => {
    state.save.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Změna')); const { rerender } = render(<EventsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); await screen.findByRole('searchbox');
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Instalace · JOB/ })); fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' })); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    let resolve!: (value: ShiftWorkflowManagementData) => void; state.load.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    fireEvent.click(await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' })); state.selected = id(21); rerender(<EventsView />);
    const obsolete = makeData(); obsolete.events = obsolete.events.map((event) => ({ ...event, name: 'Obsolete' })); await act(async () => resolve(obsolete));
    expect(screen.getByRole('heading', { name: 'Přípravy', level: 1 })).toBeInTheDocument(); expect(screen.queryByText(/Obsolete/)).not.toBeInTheDocument(); expect(state.load.mock.calls[1][2].aborted).toBe(true);
  });
  it.each([{ mode: 'calendar' as const, exit: 'cancel' }, { mode: 'list' as const, exit: 'save' }])('restores the normal $mode view and page-frame offset after $exit', async ({ mode, exit }) => {
    state.viewMode = mode; render(<main className="nodu-page-frame" data-testid="page-frame"><EventsView /></main>);
    const root = screen.getByTestId('page-frame'); root.scrollTop = 456;
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); await screen.findByRole('searchbox');
    if (exit === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Zrušit' })); else {
      fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })); fireEvent.click(screen.getByRole('checkbox', { name: /Instalace · JOB/ })); fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' })); fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
      await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
    }
    await waitFor(() => expect(screen.getByRole('button', { name: 'Propojit směny' })).toBeInTheDocument()); expect(root.scrollTop).toBe(456);
    expect(state.setDate).not.toHaveBeenCalled(); expect(state.setFilter).not.toHaveBeenCalled(); expect(state.setMode).not.toHaveBeenCalled();
    if (mode === 'calendar') expect(screen.getByText('Mesic')).toBeInTheDocument(); else expect(screen.getByTestId('event-list-card')).toBeInTheDocument();
  });
});
