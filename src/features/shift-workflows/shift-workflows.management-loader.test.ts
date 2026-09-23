import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadShiftWorkflowManagementData } from './shift-workflows.management-loader';
import type { ShiftWorkflowScope } from './shift-workflows.contract';

const mocks = vi.hoisted(() => ({ events: vi.fn(), reports: vi.fn(), invoices: vi.fn(), state: vi.fn() }));
vi.mock('../events/services/events.service', () => ({ fetchEventsSnapshot: mocks.events }));
vi.mock('../timelogs/services/timelogs.service', () => ({ fetchTimelogsSnapshot: mocks.reports }));
vi.mock('../invoices/services/invoices.service', () => ({ fetchInvoicesSnapshot: mocks.invoices }));
vi.mock('../../lib/app-data', () => ({ getLocalAppState: mocks.state }));
const scope: ShiftWorkflowScope = { source: 'supabase', userId: 'user', profileId: 'manager', role: 'crewhead' };
const snapshot = { revision: 0, assignedEventIds: [], workflows: [], rounds: [] };

describe('workflow management read boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.events.mockResolvedValue([]); mocks.reports.mockResolvedValue([]); mocks.invoices.mockResolvedValue([]);
    mocks.state.mockReturnValue({ eventCrewAssignments: [] });
  });
  it('collects all manager-visible report and invoice evidence, not just this person’s rows', async () => {
    mocks.reports.mockResolvedValue([{ contractorProfileId: 'other' }]);
    const read = vi.fn().mockResolvedValue(snapshot);
    expect(await loadShiftWorkflowManagementData(scope, read, new AbortController().signal)).toMatchObject({ snapshot, timelogs: [{ contractorProfileId: 'other' }] });
    expect(read).toHaveBeenCalledOnce(); expect(mocks.invoices).toHaveBeenCalledOnce();
  });
  it('never starts manager reads for crew or an already retired scope', async () => {
    const read = vi.fn(); const retired = new AbortController(); retired.abort();
    await expect(loadShiftWorkflowManagementData({ ...scope, role: 'crew' }, read, new AbortController().signal)).rejects.toThrow();
    await expect(loadShiftWorkflowManagementData(scope, read, retired.signal)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled(); expect(mocks.events).not.toHaveBeenCalled();
  });
  it('does not read the new global state or expose results after the old scope is retired', async () => {
    const controller = new AbortController();
    let resolve!: (value: unknown[]) => void;
    mocks.events.mockReturnValue(new Promise((done) => { resolve = done; }));
    const result = loadShiftWorkflowManagementData(scope, vi.fn().mockResolvedValue(snapshot), controller.signal);
    controller.abort(); resolve([]);
    await expect(result).rejects.toThrow(); expect(mocks.state).not.toHaveBeenCalled();
  });
  it('does not create or convert workflow data from legacy billing groups', async () => {
    mocks.state.mockReturnValue({ eventCrewAssignments: [], billingGroups: [{ id: 'old', eventIds: ['a', 'b'] }] });
    const result = await loadShiftWorkflowManagementData(scope, vi.fn().mockResolvedValue(snapshot), new AbortController().signal);
    expect(result.snapshot.workflows).toEqual([]);
  });
});
