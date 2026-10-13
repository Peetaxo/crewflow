import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event } from '../../types';
import { ShiftWorkflowError, type ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import { useShiftWorkflowDraft } from './useShiftWorkflowDraft';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope: ShiftWorkflowScope = { source: 'supabase', role: 'crewhead', userId: id(1), profileId: id(2) };
const time = '2026-10-12T11:00:00Z';
const makeData = (): ShiftWorkflowManagementData => ({ snapshot: { revision: 4, assignedEventIds: [], rounds: [], workflows: [] },
  events: [21, 22, 23].map((n) => ({ id: n, supabaseId: id(n), name: `Směna ${n}`, job: 'JOB', startDate: '2026-10-12', endDate: '2026-10-12', updatedAt: time } as Event)),
  timelogs: [], invoices: [], eventCrewAssignments: [] });
function setup(data = makeData()) {
  const props = { scope, workflowId: null as string | null, data, onSave: vi.fn().mockResolvedValue(undefined), onReload: vi.fn().mockResolvedValue(makeData()), onClose: vi.fn() };
  const view = renderHook((input) => useShiftWorkflowDraft(input), { initialProps: props });
  return { ...view, props };
}
describe('useShiftWorkflowDraft', () => {
  it('returns complete evidence and impact on the first synchronous-owner render', () => {
    const props = { scope, workflowId: null, data: makeData(), onSave: vi.fn(), onReload: vi.fn(), onClose: vi.fn() };
    const renders: { data: ShiftWorkflowManagementData; impact: ReturnType<typeof useShiftWorkflowDraft>['impact'] }[] = [];
    renderHook(() => { const draft = useShiftWorkflowDraft(props); renders.push({ data: draft.data, impact: draft.impact }); return draft; });
    expect(renders[0].data.snapshot.revision).toBe(4); expect(renders[0].impact.affectedEventIds).toEqual([]);
  });
  it('captures display-only metadata separately and replaces it atomically with evidence only on successful refresh', async () => {
    const data = makeData(); const openingDisplay = { [id(21)]: [{ profileId: id(99), name: 'Petr' }] };
    const captureCrewDisplay = vi.fn().mockReturnValue(openingDisplay);
    const props = { scope, workflowId: null, data, captureCrewDisplay, onSave: vi.fn(), onReload: vi.fn().mockResolvedValue(makeData()), onClose: vi.fn() };
    const { result, rerender } = renderHook((input) => useShiftWorkflowDraft(input), { initialProps: props });
    openingDisplay[id(21)][0].name = 'Mutace'; rerender({ ...props, data: makeData() });
    expect(result.current.crewDisplay).toEqual({ [id(21)]: [{ profileId: id(99), name: 'Petr' }] }); expect(captureCrewDisplay).toHaveBeenCalledOnce();
    expect(result.current.data.eventCrewAssignments).toEqual([]);
    const fresh = makeData(); fresh.snapshot.revision = 8; props.onReload.mockResolvedValue(fresh); captureCrewDisplay.mockImplementationOnce(() => { throw new Error('display unavailable'); });
    await act(async () => result.current.reload());
    expect(result.current.data.snapshot.revision).toBe(4); expect(result.current.crewDisplay).toEqual({ [id(21)]: [{ profileId: id(99), name: 'Petr' }] });
    captureCrewDisplay.mockReturnValue({ [id(21)]: [{ profileId: id(98), name: 'Jana' }] }); await act(async () => result.current.reload());
    expect(result.current.data.snapshot.revision).toBe(8); expect(result.current.crewDisplay).toEqual({ [id(21)]: [{ profileId: id(98), name: 'Jana' }] });
    expect(result.current.data.eventCrewAssignments).toEqual([]);
  });
  it('does not recapture display metadata when an old refresh resolves after owner retirement', async () => {
    let resolve!: (value: ShiftWorkflowManagementData) => void; const captureCrewDisplay = vi.fn().mockReturnValue({});
    const props = { scope, workflowId: null, data: makeData(), captureCrewDisplay, onSave: vi.fn(), onReload: vi.fn().mockReturnValue(new Promise((done) => { resolve = done; })), onClose: vi.fn() };
    const { result, unmount } = renderHook((input) => useShiftWorkflowDraft(input), { initialProps: props });
    let refresh!: Promise<void>; act(() => { refresh = result.current.reload(); }); unmount();
    await act(async () => { resolve(makeData()); await refresh; }); expect(captureCrewDisplay).toHaveBeenCalledOnce(); expect(props.onClose).not.toHaveBeenCalled();
  });
  it('captures a clone and ignores live publication while preserving a full stored group', () => {
    const data = makeData(); data.snapshot.workflows = [{ id: id(10), eventIds: [id(21), id(23)], updatedAt: time }];
    const props = { scope, workflowId: id(10), data, onSave: vi.fn(), onReload: vi.fn(), onClose: vi.fn() };
    const { result, rerender } = renderHook((input) => useShiftWorkflowDraft(input), { initialProps: props });
    data.events[0].name = 'Mutation'; const fresh = makeData(); fresh.snapshot.revision = 99; rerender({ ...props, data: fresh });
    expect(result.current.data.events[0].name).toBe('Směna 21'); expect(result.current.data.snapshot.revision).toBe(4);
    expect(result.current.eventIds).toEqual([id(21), id(23)]);
  });
  it('keeps the exact command on an ambiguous retry and protects selection while pending', async () => {
    const { result, props } = setup(); props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Neověřeno'));
    act(() => result.current.changeSelection([id(21), id(22)]));
    await act(async () => result.current.save()); const pending = result.current.pending;
    expect(pending).toBe(props.onSave.mock.calls[0][0]); expect(result.current.locked).toBe(true);
    act(() => result.current.changeSelection([id(23)])); expect(result.current.eventIds).toEqual([id(21), id(22)]);
    await act(async () => result.current.send(pending!)); expect(props.onSave.mock.calls[1][0]).toBe(pending);
  });
  it('retains identities and resets confirmations only after a successful explicit refresh', async () => {
    const { result, props } = setup(); props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Změna'));
    act(() => { result.current.changeSelection([id(21), id(22)]); result.current.setCross(true); result.current.setMoves(true); });
    await act(async () => result.current.save());
    props.onReload.mockRejectedValueOnce(new Error('offline')); await act(async () => result.current.reload());
    expect(result.current.conflict).toBe(true); expect(result.current.data.snapshot.revision).toBe(4);
    const fresh = makeData(); fresh.snapshot.revision = 8; props.onReload.mockResolvedValue(fresh);
    await act(async () => result.current.reload());
    expect(result.current.eventIds).toEqual([id(21), id(22)]); expect(result.current.data.snapshot.revision).toBe(8);
    expect(result.current.cross).toBe(false); expect(result.current.moves).toBe(false); expect(result.current.reviewRequired).toBe(true); expect(result.current.reviewed).toBe(false);
  });
  it('prevents duplicate saves and retires old completion callbacks', async () => {
    let resolve!: (value: unknown) => void; const { result, props, unmount } = setup();
    props.onSave.mockReturnValue(new Promise((done) => { resolve = done; }));
    act(() => { result.current.changeSelection([id(21), id(22)]); });
    act(() => { result.current.save(); result.current.save(); result.current.close(); }); expect(props.onSave).toHaveBeenCalledOnce(); expect(props.onClose).not.toHaveBeenCalled();
    unmount(); await act(async () => resolve(undefined)); expect(props.onClose).not.toHaveBeenCalled();
  });
});
