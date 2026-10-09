import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Role } from '../types';
import type { ShiftWorkflowManagementData } from '../features/shift-workflows/shift-workflows.management';

const state = vi.hoisted(() => ({ role: 'crewhead' as Role, mobile: false, selected: '', user: 'manager', load: vi.fn(), save: vi.fn(), reload: vi.fn(), snapshot: {} as ShiftWorkflowManagementData['snapshot'] }));
vi.mock('../context/useAppContext', () => ({ useAppContext: () => ({ role: state.role, selectedEventId: state.selected, setSelectedEventId: vi.fn(), eventTab: 'overview', setEventTab: vi.fn(), setEditingReceipt: vi.fn(), setEditingTimelog: vi.fn(), setDeleteConfirm: vi.fn(), setNavigationGuardMessage: vi.fn() }) }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentProfileId: 'manager' }) }));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
vi.mock('../features/shift-workflows/useShiftWorkflows', () => ({ useShiftWorkflows: () => ({ scope: { source: 'supabase', role: state.role, userId: state.user, profileId: 'manager' }, scopeKey: `${state.user}:${state.role}`, ready: true, save: state.save, reload: state.reload, query: { data: state.snapshot } }) }));
vi.mock('../features/shift-workflows/shift-workflows.management-loader', () => ({ loadEventShiftWorkflowManagementData: state.load }));
vi.mock('../features/shift-workflows/useSharedApprovals', () => ({ useSharedApprovals: () => ({ cards: () => null, legacyOnly: (reports: unknown[]) => reports, reviewSelection: () => false, groupsFor: () => ({ rounds: [], legacy: [] }) }) }));
vi.mock('../features/events/services/events.service', () => ({
  getEventDetailData: (selected: string) => ({ event: events.find((e) => e.supabaseId === selected) ?? null, timelogs: [], contractors: [], receipts: [], applications: [], crewAssignments: [] }),
  getEventCrew: () => [], subscribeToEventChanges: () => () => undefined,
  applyForEvent: vi.fn(), approveEventApplication: vi.fn(), approveEventWithdrawal: vi.fn(), createEventCopy: vi.fn(), removeContractorFromEvent: vi.fn(), requestEventWithdrawal: vi.fn(), updateEventApplicationStatus: vi.fn(), withdrawEventApplication: vi.fn(),
}));
vi.mock('../features/timelogs/services/timelogs.service', () => ({ subscribeToTimelogChanges: () => () => undefined }));
vi.mock('../features/crew/services/crew-ratings.service', () => ({ getCrewRatingsForEvent: () => [] }));
vi.mock('../features/invoices/queries/useInvoiceApprovalsQuery', () => ({ useInvoiceApprovalsQuery: () => ({ data: [] }) }));
vi.mock('../features/invoices/services/invoice-approval-sync.service', () => ({ getEventApprovalDocuments: () => [] }));
vi.mock('../components/modals/EventEditModal', () => ({ default: () => null }));
vi.mock('../components/modals/AssignCrewModal', () => ({ default: () => null }));
vi.mock('../features/crew/components/EventCrewRatingPanel', () => ({ default: () => null }));
vi.mock('../features/events/components/EventMapPreview', () => ({ default: () => null }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> } }));
import EventDetailView from './EventDetailView';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const events = ['Přípravy', 'Instalace', 'Bez propojení'].map((name, i) => ({ id: i + 21, supabaseId: id(i + 21), name, job: 'JOB', startDate: '2026-10-09', endDate: '2026-10-09', updatedAt: '2026-10-09T11:00:00Z', city: 'Praha', needed: 2, filled: 0, status: 'upcoming', client: 'Klient', showDayTypes: false } as Event));
const makeData = (): ShiftWorkflowManagementData => ({ snapshot: { revision: 1, workflows: [{ id: id(10), eventIds: [id(21), id(22)], updatedAt: '2026-10-09T11:00:00Z' }], rounds: [], assignedEventIds: [] }, events, timelogs: [], invoices: [], eventCrewAssignments: [] });
describe('shared workflow route in event detail', () => {
  beforeEach(() => { vi.clearAllMocks(); state.role = 'crewhead'; state.mobile = false; state.user = 'manager'; state.selected = id(21); state.snapshot = makeData().snapshot; state.load.mockResolvedValue(makeData()); state.save.mockResolvedValue(undefined); });
  it.each([false, true])('renders the actual linked overview and full-membership editor (mobile=%s)', async (mobile) => {
    state.mobile = mobile; render(<EventDetailView />); const overview = await screen.findByRole('region', { name: 'Propojené směny' });
    expect(overview).toHaveTextContent('Instalace · JOB'); expect(overview).toHaveTextContent('2026-10-09');
    fireEvent.click(within(overview).getByRole('button', { name: 'Upravit propojení' })); await screen.findByRole('dialog');
    expect(screen.getByRole('checkbox', { name: /Instalace · JOB/ })).toBeChecked(); fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledOnce()); expect(state.save.mock.calls[0][0].eventIds).toEqual([id(21), id(22)]);
  });
  it('does not add a create route to an unlinked event', () => { state.selected = id(23); render(<EventDetailView />); expect(screen.queryByRole('button', { name: /propojení|Propojit směny/ })).not.toBeInTheDocument(); expect(state.load).not.toHaveBeenCalled(); });
  it.each([false, true])('retires old event dialogs during navigation, including late save completions (mobile=%s)', async (mobile) => {
    state.mobile = mobile; let resolve!: (value: unknown) => void; state.save.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { rerender } = render(<EventDetailView />); fireEvent.click(await screen.findByRole('button', { name: 'Upravit propojení' })); await screen.findByRole('dialog'); fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    state.selected = id(22); rerender(<EventDetailView />); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Upravit propojení' })); await screen.findByRole('dialog'); await act(async () => { resolve(undefined); });
    expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(state.load.mock.calls[0][2].aborted).toBe(true);
  });
});
