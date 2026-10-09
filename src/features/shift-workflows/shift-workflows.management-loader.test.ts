import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEventShiftWorkflowManagementData, loadShiftWorkflowManagementData } from './shift-workflows.management-loader';
import type { ShiftWorkflowScope } from './shift-workflows.contract';

const mocks = vi.hoisted(() => ({ events: vi.fn(), reports: vi.fn(), invoices: vi.fn(), state: vi.fn(), assignments: vi.fn(), table: vi.fn(), filter: vi.fn(), page: vi.fn() }));
vi.mock('../events/services/events.service', () => ({ fetchEventsSnapshot: mocks.events }));
vi.mock('../timelogs/services/timelogs.service', () => ({ fetchTimelogsSnapshot: mocks.reports }));
vi.mock('../invoices/services/invoices.service', () => ({ fetchInvoicesSnapshot: mocks.invoices }));
vi.mock('../../lib/app-data', () => ({ getLocalAppState: mocks.state }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: (table: string) => {
  mocks.table(table);
  return { select: () => ({ eq: (column: string, value: string) => {
    mocks.filter(column, value);
    return { order: () => ({ range: (start: number, end: number) => {
      mocks.page(start, end); return { abortSignal: mocks.assignments };
    } }) };
  } }) };
} } }));
const scope: ShiftWorkflowScope = { source: 'supabase', userId: 'user', profileId: 'manager', role: 'crewhead' };
const snapshot = { revision: 0, assignedEventIds: [], workflows: [], rounds: [] };
const profile = '00000000-0000-4000-8000-000000000003';
const eventId = '00000000-0000-4000-8000-000000000021';

describe('workflow management read boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.events.mockResolvedValue([]); mocks.reports.mockResolvedValue([]); mocks.invoices.mockResolvedValue([]);
    mocks.state.mockReturnValue({ eventCrewAssignments: [] });
    mocks.assignments.mockResolvedValue({ data: [], error: null });
  });
  it('loads global management without a person or any assignment read', async () => {
    const read = vi.fn().mockResolvedValue(snapshot);
    const event = { id: 21, supabaseId: eventId };
    mocks.events.mockResolvedValue([event]);
    expect(await loadEventShiftWorkflowManagementData(scope, read, new AbortController().signal)).toEqual({ snapshot, events: [event], timelogs: [], invoices: [], eventCrewAssignments: [] });
    expect(mocks.table).not.toHaveBeenCalled(); expect(mocks.state).not.toHaveBeenCalled();
  });
  it.each(['crew', 'admin', 'invalid'])('denies global management to %s before reading', async (role) => {
    const read = vi.fn();
    await expect(loadEventShiftWorkflowManagementData({ ...scope, role: role as ShiftWorkflowScope['role'] }, read, new AbortController().signal)).rejects.toMatchObject({ kind: 'denied' });
    expect(read).not.toHaveBeenCalled(); expect(mocks.events).not.toHaveBeenCalled();
  });
  it('denies global management after retirement or a role change during the read', async () => {
    let resolve!: (value: unknown[]) => void;
    mocks.events.mockReturnValue(new Promise((done) => { resolve = done; }));
    const mutableScope = { ...scope }; const controller = new AbortController();
    const result = loadEventShiftWorkflowManagementData(mutableScope, vi.fn().mockResolvedValue(snapshot), controller.signal);
    mutableScope.role = 'crew'; resolve([]);
    await expect(result).rejects.toMatchObject({ kind: 'denied' });
    controller.abort();
    await expect(loadEventShiftWorkflowManagementData(scope, vi.fn(), controller.signal)).rejects.toMatchObject({ kind: 'denied' });
  });
  it('collects all manager-visible report and invoice evidence, not just this person’s rows', async () => {
    mocks.reports.mockResolvedValue([{ contractorProfileId: 'other' }]);
    const read = vi.fn().mockResolvedValue(snapshot);
    expect(await loadShiftWorkflowManagementData(scope, read, new AbortController().signal, profile)).toMatchObject({ snapshot, timelogs: [{ contractorProfileId: 'other' }] });
    expect(read).toHaveBeenCalledOnce(); expect(mocks.invoices).toHaveBeenCalledOnce();
  });
  it('never starts manager reads for crew or an already retired scope', async () => {
    const read = vi.fn(); const retired = new AbortController(); retired.abort();
    await expect(loadShiftWorkflowManagementData({ ...scope, role: 'crew' }, read, new AbortController().signal, profile)).rejects.toThrow();
    await expect(loadShiftWorkflowManagementData(scope, read, retired.signal, profile)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled(); expect(mocks.events).not.toHaveBeenCalled();
  });
  it('does not read the new global state or expose results after the old scope is retired', async () => {
    const controller = new AbortController();
    let resolve!: (value: unknown[]) => void;
    mocks.events.mockReturnValue(new Promise((done) => { resolve = done; }));
    const result = loadShiftWorkflowManagementData(scope, vi.fn().mockResolvedValue(snapshot), controller.signal, profile);
    controller.abort(); resolve([]);
    await expect(result).rejects.toThrow(); expect(mocks.state).not.toHaveBeenCalled();
  });
  it('does not create or convert workflow data from legacy billing groups', async () => {
    mocks.state.mockReturnValue({ eventCrewAssignments: [], billingGroups: [{ id: 'old', eventIds: ['a', 'b'] }] });
    const result = await loadShiftWorkflowManagementData(scope, vi.fn().mockResolvedValue(snapshot), new AbortController().signal, profile);
    expect(result.snapshot.workflows).toEqual([]);
  });
  it('does not infer current assignment from the legacy timelog-derived global projection', async () => {
    mocks.state.mockReturnValue({ eventCrewAssignments: [{ eventId: 21, eventSupabaseId: 'old-event', contractorProfileId: 'person', name: 'Petr' }] });
    mocks.reports.mockResolvedValue([{ eventSupabaseId: 'old-event', contractorProfileId: 'person', status: 'draft' }]);
    const result = await loadShiftWorkflowManagementData(scope, vi.fn().mockResolvedValue(snapshot), new AbortController().signal, profile);
    expect(result.eventCrewAssignments).toEqual([]);
  });
  it('reads only the selected person’s authoritative current assignments and maps canonical events', async () => {
    mocks.events.mockResolvedValue([{ id: 21, supabaseId: eventId }]);
    mocks.assignments.mockResolvedValue({ data: [{ event_id: eventId, profile_id: profile }], error: null });
    const result = await loadShiftWorkflowManagementData(scope, vi.fn().mockResolvedValue(snapshot), new AbortController().signal, profile);
    expect(result.eventCrewAssignments).toEqual([{ eventId: 21, eventSupabaseId: eventId, contractorProfileId: profile, name: '' }]);
    expect(mocks.table).toHaveBeenCalledWith('event_assignments');
    expect(mocks.filter).toHaveBeenCalledWith('profile_id', profile);
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it.each([
    ['read failure', { data: null, error: { message: 'failure' } }],
    ['wrong person', { data: [{ event_id: eventId, profile_id: 'other' }], error: null }],
    ['noncanonical event', { data: [{ event_id: '21', profile_id: profile }], error: null }],
    ['duplicate assignment', { data: [{ event_id: eventId, profile_id: profile }, { event_id: eventId, profile_id: profile }], error: null }],
    ['missing event', { data: [{ event_id: eventId, profile_id: profile }], error: null }],
  ])('fails closed for %s without a global fallback', async (_name, response) => {
    mocks.assignments.mockResolvedValue(response);
    await expect(loadShiftWorkflowManagementData(scope, vi.fn().mockResolvedValue(snapshot), new AbortController().signal, profile)).rejects.toThrow();
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it('paginates instead of silently truncating a long assignment history', async () => {
    const events = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, supabaseId: `00000000-0000-4000-8000-${String(i + 1000).padStart(12, '0')}` }));
    const rows = events.map((e) => ({ event_id: e.supabaseId, profile_id: profile }));
    mocks.events.mockResolvedValue(events);
    mocks.assignments.mockResolvedValueOnce({ data: rows.slice(0, 500), error: null }).mockResolvedValueOnce({ data: rows.slice(500), error: null });
    const result = await loadShiftWorkflowManagementData(scope, vi.fn().mockResolvedValue(snapshot), new AbortController().signal, profile);
    expect(result.eventCrewAssignments).toHaveLength(501);
    expect(mocks.page.mock.calls).toEqual([[0, 499], [500, 999]]);
  });
  it('keeps explicit local assignments local and never calls Supabase', async () => {
    const assignment = { eventId: 21, contractorProfileId: 'local-person', name: 'Petr' };
    mocks.state.mockReturnValue({ eventCrewAssignments: [assignment, { ...assignment, contractorProfileId: 'other' }] });
    const result = await loadShiftWorkflowManagementData({ ...scope, source: 'local' }, vi.fn().mockResolvedValue(snapshot), new AbortController().signal, 'local-person');
    expect(result.eventCrewAssignments).toEqual([assignment]); expect(mocks.table).not.toHaveBeenCalled();
  });
});
