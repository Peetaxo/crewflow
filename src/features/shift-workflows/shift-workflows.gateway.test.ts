import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShiftWorkflowScope, SaveShiftWorkflow } from './shift-workflows.contract';
import { parseShiftWorkflowSnapshot } from './shift-workflows.contract';
import { readShiftWorkflowSnapshot, saveShiftWorkflow } from './shift-workflows.gateway';

const boundary = vi.hoisted(() => ({ rpc: vi.fn(), readLocal: vi.fn(), saveLocal: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: boundary.rpc } }));
vi.mock('./shift-workflows.local', () => ({
  readLocalShiftWorkflows: (...args: unknown[]) => boundary.readLocal(...args),
  saveLocalShiftWorkflow: (...args: unknown[]) => boundary.saveLocal(...args),
}));

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T10:00:00+00:00';
const manager: ShiftWorkflowScope = { source: 'supabase', userId: uid(1), profileId: uid(2), role: 'coo' };
const crew: ShiftWorkflowScope = { ...manager, role: 'crew' };
const wire = () => ({
  revision: 0 as number | null,
  workflows: [{ id: uid(3), event_ids: [uid(4), uid(5)], updated_at: time }],
  rounds: [{ id: uid(6), workflow_id: uid(3), contractor_id: uid(2), status: 'pending_ch',
    event_ids: [uid(4), uid(5)], timelog_ids: [uid(7), uid(8)], note: '', updated_at: time }],
  assigned_event_ids: [uid(4), uid(5)],
});
const command = (): SaveShiftWorkflow => ({
  requestId: uid(9), workflowId: uid(3), eventIds: [uid(4), uid(5)], expectedRevision: 0,
  eventVersions: { [uid(4)]: time, [uid(5)]: time },
  confirmCrossProject: false, confirmMoves: false, deleteWorkflow: false,
});

beforeEach(() => vi.clearAllMocks());

describe('shared shift snapshot boundary', () => {
  it('maps canonical IDs and frozen event membership without numeric IDs', () => {
    expect(parseShiftWorkflowSnapshot(wire(), manager)).toEqual({
      revision: 0,
      workflows: [{ id: uid(3), eventIds: [uid(4), uid(5)], updatedAt: time }],
      rounds: [{ id: uid(6), workflowId: uid(3), contractorProfileId: uid(2), status: 'pending_ch',
        eventIds: [uid(4), uid(5)], timelogIds: [uid(7), uid(8)], note: '', updatedAt: time }],
      assignedEventIds: [uid(4), uid(5)],
    });
  });

  it.each([
    ['unknown top-level data', (v: ReturnType<typeof wire>) => ({ ...v, hidden_count: 5 })],
    ['unknown nested data', (v: ReturnType<typeof wire>) => ({ ...v, workflows: [{ ...v.workflows[0], hidden_count: 1 }] })],
    ['duplicate workflow', (v: ReturnType<typeof wire>) => ({ ...v, workflows: [v.workflows[0], v.workflows[0]] })],
    ['ambiguous event membership', (v: ReturnType<typeof wire>) => ({ ...v, workflows: [...v.workflows, { ...v.workflows[0], id: uid(20) }] })],
    ['duplicate event', (v: ReturnType<typeof wire>) => ({ ...v, workflows: [{ ...v.workflows[0], event_ids: [uid(4), uid(4)] }] })],
    ['duplicate assignment', (v: ReturnType<typeof wire>) => ({ ...v, assigned_event_ids: [uid(4), uid(4)] })],
    ['duplicate round', (v: ReturnType<typeof wire>) => ({ ...v, rounds: [v.rounds[0], v.rounds[0]] })],
    ['missing frozen event', (v: ReturnType<typeof wire>) => ({ ...v, rounds: [{ ...v.rounds[0], event_ids: [uid(4)] }] })],
    ['empty frozen set', (v: ReturnType<typeof wire>) => ({ ...v, rounds: [{ ...v.rounds[0], event_ids: [], timelog_ids: [] }] })],
    ['duplicate frozen timelog', (v: ReturnType<typeof wire>) => ({ ...v, rounds: [{ ...v.rounds[0], timelog_ids: [uid(7), uid(7)] }] })],
    ['numeric identity', (v: ReturnType<typeof wire>) => ({ ...v, assigned_event_ids: [4] })],
    ['invalid timestamp', (v: ReturnType<typeof wire>) => ({ ...v, workflows: [{ ...v.workflows[0], updated_at: 'yesterday' }] })],
    ['missing manager revision', (v: ReturnType<typeof wire>) => ({ ...v, revision: null })],
  ])('rejects %s', (_name, mutate) => {
    expect(() => parseShiftWorkflowSnapshot(mutate(wire()), manager))
      .toThrow('Propojené směny se nepodařilo bezpečně načíst.');
  });

  it('rejects another crew member’s round or an unassigned workflow event', () => {
    const value = { ...wire(), revision: null };
    expect(() => parseShiftWorkflowSnapshot({ ...value, assigned_event_ids: [uid(4)] }, crew)).toThrow();
    expect(() => parseShiftWorkflowSnapshot({ ...value, rounds: [{ ...value.rounds[0], contractor_id: uid(30) }] }, crew)).toThrow();
    expect(() => parseShiftWorkflowSnapshot(wire(), crew)).toThrow();
  });

  it('retains owned frozen history when a historical assignment no longer exists', () => {
    expect(parseShiftWorkflowSnapshot({ ...wire(), revision: null, workflows: [], assigned_event_ids: [] }, crew)
      .rounds[0].eventIds).toEqual([uid(4), uid(5)]);
  });

  it('reads only through the RPC and carries cancellation', async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: wire(), error: null });
    boundary.rpc.mockReturnValue({ abortSignal });
    const signal = new AbortController().signal;
    await expect(readShiftWorkflowSnapshot(manager, signal)).resolves.toHaveProperty('revision', 0);
    expect(boundary.rpc).toHaveBeenCalledWith('read_shift_workflows');
    expect(abortSignal).toHaveBeenCalledWith(signal);
  });

  it('does not dispatch cancelled or unauthenticated reads', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readShiftWorkflowSnapshot(manager, controller.signal)).rejects.toThrow();
    await expect(readShiftWorkflowSnapshot({ ...manager, profileId: null })).rejects.toMatchObject({ kind: 'denied' });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it('discards a late response after cancellation', async () => {
    const controller = new AbortController();
    boundary.rpc.mockReturnValue({ abortSignal: async () => {
      controller.abort();
      return { data: wire(), error: null };
    } });
    await expect(readShiftWorkflowSnapshot(manager, controller.signal)).rejects.toThrow();
  });
});

describe('shared membership write boundary', () => {
  it('sends the exact versioned command and validates its acknowledgement', async () => {
    boundary.rpc.mockResolvedValue({ data: { request_id: uid(9), workflow_id: uid(3), revision: 1 }, error: null });
    await expect(saveShiftWorkflow(manager, command())).resolves.toEqual({ requestId: uid(9), workflowId: uid(3), revision: 1 });
    expect(boundary.rpc).toHaveBeenCalledWith('save_shift_workflow_atomic', {
      p_request_id: uid(9), p_workflow_id: uid(3), p_event_ids: [uid(4), uid(5)],
      p_expected_revision: 0, p_event_versions: command().eventVersions,
      p_confirm_cross_project: false, p_confirm_moves: false, p_delete: false,
    });
  });

  it('accepts a server-generated identity only for a new workflow', async () => {
    boundary.rpc.mockResolvedValue({ data: { request_id: uid(9), workflow_id: uid(40), revision: 1 }, error: null });
    await expect(saveShiftWorkflow(manager, { ...command(), workflowId: null })).resolves.toHaveProperty('workflowId', uid(40));
    await expect(saveShiftWorkflow(manager, command())).rejects.toMatchObject({ kind: 'ambiguous' });
  });

  it.each([
    { request_id: uid(20), workflow_id: uid(3), revision: 1 },
    { request_id: uid(9), workflow_id: uid(3), revision: 0 },
    { request_id: uid(9), workflow_id: uid(3) },
    { request_id: uid(9), workflow_id: uid(3), revision: 1, extra: 'data' },
  ])('does not claim a malformed or unrelated acknowledgement succeeded', async (data) => {
    boundary.rpc.mockResolvedValue({ data, error: null });
    await expect(saveShiftWorkflow(manager, command())).rejects.toMatchObject({ kind: 'ambiguous' });
  });

  it('blocks crew and numeric remote identities before dispatch', async () => {
    await expect(saveShiftWorkflow(crew, command())).rejects.toMatchObject({ kind: 'denied' });
    await expect(saveShiftWorkflow(manager, { ...command(), eventIds: ['1'] })).rejects.toMatchObject({ kind: 'invalid' });
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['40001', 'shift_workflow_event_conflict', 'conflict'],
    ['42501', 'private detail', 'denied'],
    ['55000', 'shift_workflow_membership_locked', 'blocked'],
    ['22023', 'shift_workflow_move_confirmation_required', 'invalid'],
    ['22023', 'shift_workflow_cross_project_confirmation_required', 'invalid'],
    ['XX000', 'private detail', 'ambiguous'],
  ])('maps known errors and hides raw details (%s)', async (code, message, kind) => {
    boundary.rpc.mockResolvedValue({ data: null, error: { code, message } });
    await expect(saveShiftWorkflow(manager, command())).rejects.toMatchObject({ kind });
    await expect(saveShiftWorkflow(manager, command())).rejects.not.toThrow('private detail');
  });

  it('keeps a lost network response ambiguous without generating a new request', async () => {
    boundary.rpc.mockRejectedValue(new Error('offline'));
    await expect(saveShiftWorkflow(manager, command())).rejects.toMatchObject({ kind: 'ambiguous' });
    expect(boundary.rpc).toHaveBeenCalledOnce();
  });

  it('routes local operations explicitly, never to the server', async () => {
    const scope = { ...manager, source: 'local' as const };
    boundary.readLocal.mockReturnValue({ revision: 0, workflows: [], rounds: [], assignedEventIds: [] });
    boundary.saveLocal.mockReturnValue({ requestId: uid(9), workflowId: uid(3), revision: 1 });
    await readShiftWorkflowSnapshot(scope);
    await saveShiftWorkflow(scope, command());
    expect(boundary.readLocal).toHaveBeenCalledWith(scope);
    expect(boundary.saveLocal).toHaveBeenCalledWith(scope, command());
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});
