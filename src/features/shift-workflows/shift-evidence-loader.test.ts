import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadShiftEvidenceData } from './shift-evidence-loader';
import type { ShiftWorkflowSnapshot, ShiftWorkflowScope } from './shift-workflows.contract';

const mocks = vi.hoisted(() => ({ events: vi.fn(), reports: vi.fn(), state: vi.fn(), assignments: vi.fn(), generation: vi.fn() }));
vi.mock('../events/services/events.service', () => ({ fetchEventsSnapshot: mocks.events }));
vi.mock('../timelogs/services/timelogs.service', () => ({ loadTimelogsSnapshot: mocks.reports }));
vi.mock('../../lib/app-data', () => ({ getLocalAppState: mocks.state }));
vi.mock('./shift-workflows.management-loader', () => ({ readShiftWorkflowManagerAssignments: mocks.assignments }));
vi.mock('../event-lifecycle-generation', () => ({ getLifecycleSnapshotGeneration: mocks.generation }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope: ShiftWorkflowScope = { source: 'supabase', role: 'crew', profileId: id(3), userId: id(4) };
const events = [31, 32, 33].map((n) => ({ id: n, supabaseId: id(n), name: String(n), startDate: `2026-09-${n - 10}`, job: 'J' }));
const reports = [21, 22, 23].map((n) => ({ id: n, supabaseId: id(n), eid: n + 10, eventSupabaseId: id(n + 10),
  contractorProfileId: id(3), status: 'draft', updatedAt: '2026-09-29T10:00:00Z', days: [], note: '', km: 0 }));
const snapshot = (): ShiftWorkflowSnapshot => ({ revision: null, workflows: [{ id: id(10), eventIds: [id(31), id(32), id(33)], updatedAt: '2026-09-29T10:00:00Z' }],
  rounds: [], assignedEventIds: [id(31), id(32)] });
const opened = () => structuredClone(reports[0]) as Parameters<typeof loadShiftEvidenceData>[1];

describe('shared evidence loader', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.events.mockResolvedValue(events); mocks.reports.mockResolvedValue(reports);
    mocks.state.mockReturnValue({ contractors: [{ profileId: id(3), name: 'Crew' }], eventCrewAssignments: [] });
    mocks.assignments.mockResolvedValue([{ event_id: id(31), profile_id: id(3) }, { event_id: id(32), profile_id: id(3) }]);
    mocks.generation.mockReturnValue(1);
  });
  it('opens the same context from either assigned part and hides the unassigned third part', async () => {
    const read = vi.fn(async () => snapshot()); const signal = new AbortController().signal;
    const first = await loadShiftEvidenceData(scope, opened(), read, signal);
    const second = await loadShiftEvidenceData(scope, { ...opened(), ...reports[1] } as ReturnType<typeof opened>, read, signal);
    expect(first.context).toEqual(second.context); expect(first.context.eventIds).toEqual([id(31), id(32)]);
    expect(first.events.map((e) => e.supabaseId)).toEqual([id(31), id(32)]);
    expect(mocks.assignments).not.toHaveBeenCalled();
  });
  it('uses authoritative per-person assignments for management, not report-derived projection', async () => {
    const value = await loadShiftEvidenceData({ ...scope, role: 'crewhead', profileId: id(5) }, opened(), async () => ({ ...snapshot(), revision: 1 }), new AbortController().signal);
    expect(mocks.assignments).toHaveBeenCalledOnce(); expect(value.context.timelogs).toHaveLength(2);
  });
  it('rejects foreign crew evidence before reads and stale scope after awaiting', async () => {
    const read = vi.fn(async () => snapshot());
    await expect(loadShiftEvidenceData({ ...scope, profileId: id(99) }, opened(), read, new AbortController().signal)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    let resolve!: (v: unknown) => void; mocks.events.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const controller = new AbortController(); const pending = loadShiftEvidenceData(scope, opened(), read, controller.signal);
    controller.abort(); resolve(events); await expect(pending).rejects.toThrow(); expect(mocks.state).not.toHaveBeenCalled();
  });
  it('rejects missing frozen rows and a lifecycle generation changed during loading', async () => {
    const snap = snapshot(); snap.rounds = [{ id: id(40), workflowId: id(10), contractorProfileId: id(3), status: 'pending_ch',
      timelogIds: [id(21), id(22)], eventIds: [id(31), id(32)], note: '', updatedAt: '2026-09-29T10:00:00Z' }];
    mocks.reports.mockResolvedValueOnce([reports[0]]);
    await expect(loadShiftEvidenceData(scope, opened(), async () => snap, new AbortController().signal)).rejects.toThrow();
    mocks.generation.mockReturnValueOnce(1).mockReturnValue(2);
    await expect(loadShiftEvidenceData(scope, opened(), async () => snapshot(), new AbortController().signal)).rejects.toThrow();
  });
  it('marks only genuinely old unlinked pending evidence for legacy compatibility', async () => {
    mocks.reports.mockResolvedValue([{ ...reports[0], status: 'pending_ch' }]);
    const snap = { ...snapshot(), workflows: [], assignedEventIds: [id(31)] };
    const old = await loadShiftEvidenceData(scope, opened(), async () => snap, new AbortController().signal);
    expect(old.legacy).toBe(true);
    const linked = await loadShiftEvidenceData(scope, opened(), async () => snapshot(), new AbortController().signal);
    expect(linked.legacy).toBe(false);
  });
});
