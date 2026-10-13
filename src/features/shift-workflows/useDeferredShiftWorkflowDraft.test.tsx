import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event } from '../../types';
import { ShiftWorkflowError, type SaveShiftWorkflow, type ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import { useDeferredShiftWorkflowDraft, type DeferredShiftWorkflowDraftInput } from './useDeferredShiftWorkflowDraft';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope: ShiftWorkflowScope = { source: 'supabase', role: 'crewhead', userId: id(1), profileId: id(2) };
const time = '2026-10-12T11:00:00Z';
const makeData = (): ShiftWorkflowManagementData => ({
  snapshot: { revision: 4, assignedEventIds: [], rounds: [], workflows: [] },
  events: [21, 22, 23].map((n) => ({ id: n, supabaseId: id(n), name: `Směna ${n}`, job: 'JOB', startDate: '2026-10-12', endDate: '2026-10-12', updatedAt: time } as Event)),
  timelogs: [], invoices: [], eventCrewAssignments: [],
});
function setup(data: ShiftWorkflowManagementData | null = null) {
  const props = { scope, workflowId: null as string | null, data, onSave: vi.fn().mockResolvedValue(undefined), onReload: vi.fn().mockResolvedValue(makeData()), onClose: vi.fn() };
  const view = renderHook((input) => useDeferredShiftWorkflowDraft(input), { initialProps: props });
  return { ...view, props };
}
const command: SaveShiftWorkflow = {
  requestId: id(90), workflowId: null, eventIds: [id(21), id(22)], expectedRevision: 4,
  eventVersions: { [id(21)]: time, [id(22)]: time }, confirmCrossProject: false, confirmMoves: false, deleteWorkflow: false,
};

describe('useDeferredShiftWorkflowDraft', () => {
  it('allows provisional selection without evidence and guards both mutation entry points', async () => {
    const { result, props } = setup();
    expect(result.current.data).toBeNull(); expect(result.current.impact).toBeNull(); expect(result.current.ready).toBe(false);
    expect(result.current.eventIds).toEqual([]); expect(result.current.locked).toBe(false);
    act(() => result.current.changeSelection([id(21), id(22)]));
    await act(async () => { result.current.save(); await result.current.send(command); });
    expect(result.current.eventIds).toEqual([id(21), id(22)]);
    expect(props.onSave).not.toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled(); expect(result.current.busy).toBe(false);
  });

  it('captures the first complete read and freezes later publication while retaining provisional IDs', () => {
    const { result, props, rerender } = setup();
    act(() => result.current.changeSelection([id(21), id(22)]));
    const fresh = makeData(); rerender({ ...props, data: fresh });
    expect(result.current.ready).toBe(true); expect(result.current.data?.snapshot.revision).toBe(4);
    expect(result.current.eventIds).toEqual([id(21), id(22)]);
    const publication = makeData(); publication.snapshot.revision = 99; rerender({ ...props, data: publication });
    expect(result.current.data?.snapshot.revision).toBe(4); expect(result.current.eventIds).toEqual([id(21), id(22)]);
  });

  it('retains unavailable selected identities and blocks saving after evidence arrives', async () => {
    const { result, props, rerender } = setup();
    act(() => result.current.changeSelection([id(21), id(22)]));
    const fresh = makeData(); fresh.events = fresh.events.filter((event) => event.supabaseId !== id(22));
    rerender({ ...props, data: fresh });
    expect(result.current.ready).toBe(true); expect(result.current.eventIds).toEqual([id(21), id(22)]);
    expect(result.current.impact?.blockedReason).toMatch(/už není dostupná/);
    await act(async () => result.current.save()); expect(props.onSave).not.toHaveBeenCalled();
  });

  it('clones first-read evidence and display metadata together without inventing assignments', () => {
    const openingDisplay = { [id(21)]: [{ profileId: id(99), name: 'Petr' }] };
    const captureCrewDisplay = vi.fn().mockReturnValue(openingDisplay);
    const props = { scope, workflowId: null, data: null as ShiftWorkflowManagementData | null, captureCrewDisplay, onSave: vi.fn(), onReload: vi.fn(), onClose: vi.fn() };
    const { result, rerender } = renderHook((input) => useDeferredShiftWorkflowDraft(input), { initialProps: props });
    expect(captureCrewDisplay).not.toHaveBeenCalled(); expect(result.current.crewDisplay).toBeNull();
    const fresh = makeData(); rerender({ ...props, data: fresh });
    fresh.snapshot.revision = 99; fresh.events[0].name = 'Mutace'; openingDisplay[id(21)][0].name = 'Mutace';
    rerender({ ...props, data: fresh });
    expect(result.current.data?.snapshot.revision).toBe(4); expect(result.current.data?.events[0].name).toBe('Směna 21');
    expect(result.current.data?.eventCrewAssignments).toEqual([]);
    expect(result.current.crewDisplay).toEqual({ [id(21)]: [{ profileId: id(99), name: 'Petr' }] }); expect(captureCrewDisplay).toHaveBeenCalledOnce();
  });

  it('keeps failed first capture empty and retries atomically only with a fresh read', async () => {
    const captureCrewDisplay = vi.fn().mockImplementationOnce(() => { throw new Error('display unavailable'); }).mockReturnValue({ [id(21)]: [{ profileId: id(99), name: 'Petr' }] });
    const props: DeferredShiftWorkflowDraftInput = { scope, workflowId: null, data: null, captureCrewDisplay, onSave: vi.fn(), onReload: vi.fn(), onClose: vi.fn() };
    const { result, rerender } = renderHook((input) => useDeferredShiftWorkflowDraft(input), { initialProps: props });
    act(() => result.current.changeSelection([id(21), id(22)]));
    const failed = makeData(); expect(() => rerender({ ...props, data: failed })).not.toThrow();
    expect(result.current.data).toBeNull(); expect(result.current.impact).toBeNull(); expect(result.current.crewDisplay).toBeNull(); expect(result.current.ready).toBe(false);
    expect(result.current.error).toMatch(/nepodařilo bezpečně ověřit/); expect(result.current.eventIds).toEqual([id(21), id(22)]);
    await act(async () => result.current.save()); expect(props.onSave).not.toHaveBeenCalled();
    rerender({ ...props, data: failed, captureCrewDisplay: (data) => captureCrewDisplay(data) }); expect(captureCrewDisplay).toHaveBeenCalledOnce();
    const fresh = makeData(); fresh.snapshot.revision = 8; rerender({ ...props, data: fresh });
    expect(result.current.data?.snapshot.revision).toBe(8); expect(result.current.ready).toBe(true); expect(result.current.error).toBeNull();
    expect(result.current.eventIds).toEqual([id(21), id(22)]); expect(result.current.crewDisplay).toEqual({ [id(21)]: [{ profileId: id(99), name: 'Petr' }] });
  });

  it('resets a pending opening and starts empty before accepting a fresh complete read', () => {
    const { result, props, rerender } = setup();
    act(() => { result.current.changeSelection([id(21), id(22)]); result.current.setCross(true); result.current.setMoves(true); result.current.setDissolveConfirmed(true); result.current.setReviewed(true); });
    act(() => result.current.reset());
    expect(result.current.data).toBeNull(); expect(result.current.impact).toBeNull(); expect(result.current.eventIds).toEqual([]);
    expect(result.current.cross).toBe(false); expect(result.current.moves).toBe(false); expect(result.current.dissolveConfirmed).toBe(false); expect(result.current.reviewed).toBe(false);
    expect(result.current.reviewRequired).toBe(false); expect(result.current.pending).toBeNull(); expect(result.current.error).toBeNull(); expect(result.current.conflict).toBe(false);
    act(() => result.current.changeSelection([id(22), id(23)]));
    const fresh = makeData(); fresh.snapshot.revision = 8; rerender({ ...props, data: fresh });
    expect(result.current.data?.snapshot.revision).toBe(8); expect(result.current.eventIds).toEqual([id(22), id(23)]);
  });

  it('does not recapture still-published evidence after reset before a new opening read', () => {
    const { result, props, rerender } = setup(makeData());
    act(() => result.current.changeSelection([id(21), id(22)])); act(() => result.current.reset());
    expect(result.current.data).toBeNull(); expect(result.current.ready).toBe(false); expect(result.current.eventIds).toEqual([]);
    rerender({ ...props }); expect(result.current.data).toBeNull();
    const publication = makeData(); publication.snapshot.revision = 99; rerender({ ...props, data: publication });
    expect(result.current.data).toBeNull(); expect(result.current.ready).toBe(false);
    rerender({ ...props, data: null });
    const fresh = makeData(); fresh.snapshot.revision = 8; rerender({ ...props, data: fresh });
    expect(result.current.data?.snapshot.revision).toBe(8); expect(result.current.eventIds).toEqual([]);
  });

  it('clears an ambiguous command and error on reset so a fresh opening can edit', async () => {
    const { result, props, rerender } = setup(makeData());
    props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Neověřeno'));
    act(() => result.current.changeSelection([id(21), id(22)])); await act(async () => result.current.save());
    expect(result.current.pending).not.toBeNull(); expect(result.current.error).toBe('Neověřeno');
    act(() => result.current.reset()); rerender({ ...props, data: null });
    expect(result.current.pending).toBeNull(); expect(result.current.error).toBeNull(); expect(result.current.busy).toBe(false); expect(result.current.locked).toBe(false);
    act(() => result.current.changeSelection([id(22), id(23)])); expect(result.current.eventIds).toEqual([id(22), id(23)]);
  });

  it('isolates an old successful send and its finally from the new activation', async () => {
    let resolveOld!: (value: unknown) => void; let resolveNew!: (value: unknown) => void;
    const { result, props, rerender } = setup(makeData());
    props.onSave.mockReturnValueOnce(new Promise((done) => { resolveOld = done; })).mockReturnValueOnce(new Promise((done) => { resolveNew = done; }));
    let oldSend!: Promise<void>; act(() => { oldSend = result.current.send(command); });
    act(() => result.current.reset()); rerender({ ...props, data: null }); rerender({ ...props, data: makeData() });
    let newSend!: Promise<void>; act(() => { newSend = result.current.send({ ...command, requestId: id(91) }); });
    await act(async () => { resolveOld(undefined); await oldSend; });
    expect(props.onClose).not.toHaveBeenCalled(); expect(result.current.busy).toBe(true);
    await act(async () => result.current.send(command)); expect(props.onSave).toHaveBeenCalledTimes(2);
    await act(async () => { resolveNew(undefined); await newSend; });
    expect(props.onClose).toHaveBeenCalledOnce(); expect(result.current.busy).toBe(false);
  });

  it('ignores an old rejected send after reset without locking the new activation', async () => {
    let reject!: (cause: unknown) => void; const { result, props, rerender } = setup(makeData());
    props.onSave.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    let oldSend!: Promise<void>; act(() => { oldSend = result.current.send(command); });
    act(() => result.current.reset()); rerender({ ...props, data: null });
    await act(async () => { reject(new ShiftWorkflowError('ambiguous', 'Starý výsledek')); await oldSend; });
    expect(result.current.pending).toBeNull(); expect(result.current.error).toBeNull(); expect(result.current.locked).toBe(false);
    act(() => result.current.changeSelection([id(22), id(23)])); expect(result.current.eventIds).toEqual([id(22), id(23)]);
  });

  it('isolates an old reload and its finally from a fresh activation reload', async () => {
    let resolveOld!: (value: ShiftWorkflowManagementData) => void; let resolveNew!: (value: ShiftWorkflowManagementData) => void;
    const captureCrewDisplay = vi.fn().mockReturnValue({});
    const props = { scope, workflowId: null, data: makeData() as ShiftWorkflowManagementData | null, captureCrewDisplay,
      onSave: vi.fn(), onReload: vi.fn().mockReturnValueOnce(new Promise((done) => { resolveOld = done; })).mockReturnValueOnce(new Promise((done) => { resolveNew = done; })), onClose: vi.fn() };
    const { result, rerender } = renderHook((input) => useDeferredShiftWorkflowDraft(input), { initialProps: props });
    let oldReload!: Promise<void>; act(() => { oldReload = result.current.reload(); });
    act(() => result.current.reset()); rerender({ ...props, data: null });
    act(() => result.current.changeSelection([id(22), id(23)]));
    let newReload!: Promise<void>; act(() => { newReload = result.current.reload(); });
    const oldData = makeData(); oldData.snapshot.revision = 99; await act(async () => { resolveOld(oldData); await oldReload; });
    expect(result.current.data).toBeNull(); expect(result.current.busy).toBe(true); expect(captureCrewDisplay).toHaveBeenCalledOnce();
    await act(async () => result.current.reload()); expect(props.onReload).toHaveBeenCalledTimes(2);
    const fresh = makeData(); fresh.snapshot.revision = 8; await act(async () => { resolveNew(fresh); await newReload; });
    expect(result.current.data?.snapshot.revision).toBe(8); expect(result.current.eventIds).toEqual([id(22), id(23)]);
    expect(result.current.busy).toBe(false); expect(result.current.reviewRequired).toBe(true); expect(captureCrewDisplay).toHaveBeenCalledTimes(2);
  });

  it('retires send completion when the owner unmounts after reset', async () => {
    let resolve!: (value: unknown) => void; const { result, props, rerender, unmount } = setup(makeData());
    act(() => result.current.reset()); rerender({ ...props, data: null }); rerender({ ...props, data: makeData() });
    props.onSave.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    let send!: Promise<void>; act(() => { send = result.current.send(command); }); unmount();
    await act(async () => { resolve(undefined); await send; }); expect(props.onClose).not.toHaveBeenCalled();
  });

  it('retries the exact ambiguous command after provisional selection captures evidence', async () => {
    const { result, props, rerender } = setup(); props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Neověřeno'));
    act(() => result.current.changeSelection([id(21), id(22)])); rerender({ ...props, data: makeData() });
    await act(async () => result.current.save()); const pending = result.current.pending;
    expect(pending).toBe(props.onSave.mock.calls[0][0]); expect(pending?.eventIds).toEqual([id(21), id(22)]); expect(pending?.expectedRevision).toBe(4);
    const publication = makeData(); publication.snapshot.revision = 99; publication.events[0].updatedAt = '2026-10-13T11:00:00Z';
    rerender({ ...props, data: publication }); act(() => result.current.changeSelection([id(23)]));
    expect(result.current.eventIds).toEqual([id(21), id(22)]);
    await act(async () => result.current.send(pending!)); expect(props.onSave.mock.calls[1][0]).toBe(pending);
    expect(props.onSave.mock.calls[1][0].eventVersions).toEqual({ [id(21)]: time, [id(22)]: time });
    expect(props.onSave.mock.calls[1][0].requestId).toBe(pending?.requestId);
  });
});
