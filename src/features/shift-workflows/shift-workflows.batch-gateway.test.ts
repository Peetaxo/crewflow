import { describe, expect, it, vi } from 'vitest';
import { createShiftBatchWriter } from './shift-workflows.batch-gateway';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftDraftCommand, ShiftTransitionCommand } from './shift-workflows.batch-commands';
import { runLifecycleDataMutation } from '../event-lifecycle-generation';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const next = '2026-09-23T11:00:01Z';
const scope: ShiftWorkflowScope = { source: 'supabase', role: 'crew', profileId: id(3), userId: id(4) };
const command = (): ShiftDraftCommand => ({ kind: 'save', requestId: id(50), roundId: null, workflowId: id(10),
  contractorProfileId: id(3), anchorEventId: id(31), timelogs: [21, 22].map((n) => ({ id: id(n), event_id: id(n + 10),
    expected_updated_at: time, expected_status: 'draft', km: 2, note: '', days: [] })) });
const result = () => ({ request_id: id(50), workflow_id: id(10), round: null,
  timelogs: command().timelogs.map((t) => ({ id: t.id, event_id: t.event_id, contractor_id: id(3), status: 'draft',
    updated_at: next, km: t.km, note: t.note, review_note: null, crew_confirmation_snapshot: null,
    submitted_at: null, approved_at: null, days: [], approval: null })) });
const harness = () => {
  const rpc = vi.fn(async () => ({ data: result(), error: null }));
  const localWrite = vi.fn(() => result());
  const write = createShiftBatchWriter({ client: { rpc }, localWrite });
  return { rpc, localWrite, write };
};

describe('atomic shift batch writer', () => {
  it('uses one exact draft RPC and no per-report writes or local fallback', async () => {
    const h = harness(); const cmd = command();
    expect((await h.write(scope, cmd, () => {})).timelogs).toHaveLength(2);
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('save_shift_workflow_drafts_atomic', {
      p_request_id: id(50), p_round_id: null, p_workflow_id: id(10), p_contractor_id: id(3), p_anchor_event_id: id(31), p_timelogs: cmd.timelogs,
    });
    expect(h.localWrite).not.toHaveBeenCalled();
  });
  it('isolates the explicit local adapter, including when remote client is absent', async () => {
    const h = harness(); const local = { ...scope, source: 'local' as const };
    await h.write(local, command(), () => {}); expect(h.rpc).not.toHaveBeenCalled(); expect(h.localWrite).toHaveBeenCalledOnce();
    const write = createShiftBatchWriter({ client: null, localWrite: h.localWrite });
    await expect(write(scope, command(), () => {})).rejects.toMatchObject({ kind: 'denied' });
    expect(h.localWrite).toHaveBeenCalledOnce();
  });
  it('rejects malformed commands and role/owner mismatches before dispatch', async () => {
    const h = harness(); const cmd = command(); cmd.timelogs.pop(); cmd.timelogs[0].id = 'temporary';
    await expect(h.write(scope, cmd, () => {})).rejects.toMatchObject({ kind: 'invalid' });
    await expect(h.write({ ...scope, role: 'coo' }, command(), () => {})).rejects.toMatchObject({ kind: 'denied' });
    await expect(h.write({ ...scope, profileId: id(99) }, command(), () => {})).rejects.toMatchObject({ kind: 'denied' });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('maps conflicts and known validation errors without exposing server text', async () => {
    const h = harness();
    h.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'secret' } } as never);
    await expect(h.write(scope, command(), () => {})).rejects.toMatchObject({ kind: 'conflict' });
    h.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'shift_workflow_approver_mismatch' } } as never);
    await expect(h.write(scope, command(), () => {})).rejects.toThrow(/schvalovatele/);
    h.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'secret' } } as never);
    await expect(h.write(scope, command(), () => {})).rejects.toMatchObject({ kind: 'ambiguous' });
  });
  it('preserves immutable command identities across ambiguous retries', async () => {
    const h = harness(); const cmd = command(); h.rpc.mockRejectedValueOnce(new Error('network'));
    await expect(h.write(scope, cmd, () => {})).rejects.toMatchObject({ kind: 'ambiguous' });
    await h.write(scope, cmd, () => {});
    expect(h.rpc.mock.calls[0]).toEqual(h.rpc.mock.calls[1]); expect(h.localWrite).not.toHaveBeenCalled();
  });
  it('captures payload before waiting and rejects a retired queued scope before RPC', async () => {
    const h = harness(); let release!: () => void;
    const blocker = runLifecycleDataMutation([], () => new Promise<void>((resolve) => { release = resolve; }));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    let current = true;
    const retired = h.write(scope, command(), () => { if (!current) throw new Error('retired'); });
    const observed = expect(retired).rejects.toThrow('retired'); current = false; release(); await blocker; await observed;
    expect(h.rpc).not.toHaveBeenCalled();
    let releaseAgain!: () => void;
    const nextBlocker = runLifecycleDataMutation([], () => new Promise<void>((r) => { releaseAgain = r; }));
    await vi.waitFor(() => expect(releaseAgain).toBeTypeOf('function'));
    const cmd = command(); const captured = h.write(scope, cmd, () => {}); cmd.timelogs[0].note = 'changed while queued';
    releaseAgain(); await nextBlocker; await captured;
    expect(h.rpc).toHaveBeenCalledWith('save_shift_workflow_drafts_atomic', expect.objectContaining({
      p_timelogs: expect.arrayContaining([expect.objectContaining({ id: id(21), note: '' })]),
    }));
  });
  it('rejects late results for a retired activation and does not retry automatically', async () => {
    const h = harness(); let done!: (value: unknown) => void; let current = true;
    h.rpc.mockImplementationOnce(() => new Promise((resolve) => { done = resolve; }) as never);
    const pending = h.write(scope, command(), () => { if (!current) throw new Error('retired'); });
    const observed = expect(pending).rejects.toThrow('retired');
    await vi.waitFor(() => expect(done).toBeTypeOf('function')); current = false; done({ data: result(), error: null }); await observed;
    expect(h.rpc).toHaveBeenCalledOnce(); expect(h.localWrite).not.toHaveBeenCalled();
  });
  it('sends transitions through their single RPC and prevents COO hour correction', async () => {
    const h = harness(); const cmd: ShiftTransitionCommand = { kind: 'transition', requestId: id(50), roundId: id(40), workflowId: id(10),
      contractorProfileId: id(3), expectedRoundUpdatedAt: time, action: 'handoff', note: '', affectedEventId: null, corrections: null,
      targets: command().timelogs.map((t) => ({ id: t.id, expected_updated_at: time, expected_status: 'pending_ch' })) };
    await expect(h.write({ ...scope, role: 'coo' }, cmd, () => {})).rejects.toMatchObject({ kind: 'denied' });
    await expect(h.write({ ...scope, role: 'crewhead' }, cmd, () => {})).rejects.toMatchObject({ kind: 'ambiguous' }); // fixture is deliberately a draft receipt
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('transition_shift_workflow_round_atomic', {
      p_request_id: id(50), p_round_id: id(40), p_expected_round_updated_at: time, p_targets: cmd.targets,
      p_action: 'handoff', p_note: '', p_affected_event_id: null, p_corrections: null,
    });
  });
});
