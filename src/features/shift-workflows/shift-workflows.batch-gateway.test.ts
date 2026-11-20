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
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: result(), error: null }));
  const invoke = vi.fn(async (_name: string, _options: { body: FormData }) => ({ data: { attachment_id: id(80) }, error: null }));
  const localWrite = vi.fn(() => result());
  const write = createShiftBatchWriter({ client: { rpc, functions: { invoke } }, localWrite });
  return { rpc, invoke, localWrite, write };
};

const submission = (): ShiftDraftCommand => {
  const cmd = { ...command(), kind: 'submit' as const, roundId: id(40) };
  cmd.timelogs.forEach((row, index) => row.days.push({ id: id(121 + index), date: '2026-09-23', time_from: '10:00',
    time_to: '14:00', day_type: 'pripravy', note: '', meal: null, meals: [] }));
  return cmd;
};
const submissionResult = (cmd: ShiftDraftCommand) => ({ request_id: cmd.requestId, workflow_id: cmd.workflowId,
  round: { id: cmd.roundId, workflow_id: cmd.workflowId, contractor_id: cmd.contractorProfileId, status: 'pending_ch',
    event_ids: cmd.timelogs.map((t) => t.event_id), timelog_ids: cmd.timelogs.map((t) => t.id), updated_at: next, note: '' },
  timelogs: result().timelogs.map((t, index) => ({ ...t, days: cmd.timelogs[index].days, status: 'pending_ch', submitted_at: next })) });
const invoice = () => ({ kind: 'replace' as const, requestId: id(80), customerId: id(81), invoiceNumber: '2026-01',
  issueDate: '2026-09-23', dueDate: '2026-10-01', totalAmount: '1500.00',
  file: new File(['%PDF-1.7'], 'faktura.pdf', { type: 'application/pdf' }) });

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
  it('binds final approval to the exact reviewed billing quote across retries', async () => {
    const h = harness(); const cmd = { kind: 'transition', requestId: id(50), roundId: id(40), workflowId: id(10),
      contractorProfileId: id(3), expectedRoundUpdatedAt: time, action: 'approve', note: '', affectedEventId: null, corrections: null,
      billingQuoteId: id(90), targets: command().timelogs.map((t) => ({ id: t.id, expected_updated_at: time, expected_status: 'pending_coo' })) } as ShiftTransitionCommand;
    h.rpc.mockRejectedValueOnce(new Error('network'));
    await expect(h.write({ ...scope, role: 'coo' }, cmd, () => {})).rejects.toMatchObject({ kind: 'ambiguous' });
    expect(h.rpc.mock.calls[0][1]).toMatchObject({ p_billing_quote: id(90) });
    await expect(h.write({ ...scope, role: 'coo' }, cmd, () => {})).rejects.toMatchObject({ kind: 'ambiguous' });
    expect(h.rpc.mock.calls[0]).toEqual(h.rpc.mock.calls[1]);
  });

  it('stages the selected PDF on submit and uses the same request, exact reports and binding when replayed', async () => {
    const h = harness(); const cmd = submission(); const attachment = invoice();
    h.rpc.mockRejectedValueOnce(new Error('network'));
    await expect(h.write(scope, cmd, () => {}, attachment)).rejects.toMatchObject({ kind: 'ambiguous' });
    h.rpc.mockResolvedValueOnce({ data: submissionResult(cmd), error: null });
    await expect(h.write(scope, cmd, () => {}, attachment)).resolves.toMatchObject({ requestId: cmd.requestId, round: { status: 'pending_ch' } });
    expect(h.invoke).toHaveBeenCalledTimes(2);
    for (const [endpoint, { body }] of h.invoke.mock.calls) {
      expect(endpoint).toBe('upload-shift-invoice');
      expect(Object.fromEntries(body)).toEqual({ ...Object.fromEntries(Object.entries(attachment).filter(([name]) => name !== 'kind')),
        timelogIds: JSON.stringify([id(21), id(22)]) });
    }
    expect(h.rpc.mock.calls).toEqual(Array(2).fill(['submit_shift_workflow_invoice_atomic', {
      p_request_id: id(50), p_round_id: id(40), p_workflow_id: id(10), p_contractor_id: id(3), p_anchor_event_id: id(31),
      p_timelogs: cmd.timelogs, p_attachment_id: id(80),
    }]));
  });

  it.each(['remove', 'replace'] as const)('sends an explicit %s on confirm using only the frozen round', async (kind) => {
    const h = harness();
    const cmd: ShiftTransitionCommand = { kind: 'transition', requestId: id(50), roundId: id(40), workflowId: id(10),
      contractorProfileId: id(3), expectedRoundUpdatedAt: time, action: 'confirm', note: '', affectedEventId: null, corrections: null,
      targets: command().timelogs.slice(0, 1).map((t) => ({ id: t.id, expected_updated_at: time, expected_status: 'pending_crew_confirmation' })) };
    const submitted = submissionResult(submission());
    h.rpc.mockResolvedValueOnce({ data: { ...submitted, round: { ...submitted.round, timelog_ids: [id(21)], event_ids: [id(31)] },
      timelogs: [submitted.timelogs[0]] }, error: null });
    await expect(h.write(scope, cmd, () => {}, kind === 'remove' ? { kind } : invoice())).resolves.toMatchObject({ round: { status: 'pending_ch' } });
    if (kind === 'remove') expect(h.invoke).not.toHaveBeenCalled();
    else expect(h.invoke.mock.calls[0][1].body.get('timelogIds')).toBe(JSON.stringify([id(21)]));
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('transition_shift_workflow_invoice_atomic', {
      p_request_id: id(50), p_round_id: id(40), p_expected_round_updated_at: time, p_targets: cmd.targets,
      p_action: 'confirm', p_note: '', p_affected_event_id: null, p_corrections: null, p_attachment_id: kind === 'remove' ? null : id(80),
    });
  });

  it('does not send the hours write when a staged upload completes for a retired owner', async () => {
    const h = harness(); let complete!: () => void; let current = true;
    h.invoke.mockImplementationOnce(() => new Promise((resolve) => { complete = () => resolve({ data: { attachment_id: id(80) }, error: null }); }));
    const attempt = h.write(scope, submission(), () => { if (!current) throw new Error('retired'); }, invoice());
    const observed = expect(attempt).rejects.toThrow('retired');
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    current = false; complete(); await observed;
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it.each([{ code: 'PGRST202' }, { code: '42501', message: 'shift_invoice_attachment_not_eligible' }])(
    'keeps the plain hours path available after a definite attachment failure ($code)', async (error) => {
      const h = harness(); const cmd = submission();
      h.rpc.mockResolvedValueOnce({ data: null, error } as never);
      await expect(h.write(scope, cmd, () => {}, invoice())).rejects.toMatchObject({ kind: 'invalid', message: expect.stringContaining('příloh') });
      h.rpc.mockResolvedValueOnce({ data: submissionResult(cmd), error: null });
      await expect(h.write(scope, cmd, () => {})).resolves.toMatchObject({ round: { status: 'pending_ch' } });
      expect(h.rpc.mock.calls[1][0]).toBe('submit_shift_workflow_round_atomic');
    });

});
