import { describe, expect, it, vi } from 'vitest';
import { createShiftEvidenceSession } from './shift-evidence-session';
import type { ShiftWorkflowContext } from './shift-workflows.model';
import type { ShiftBatchCommand } from './shift-workflows.batch-commands';
import type { ShiftBatchResult } from './shift-workflows.batch-contract';
import { ShiftWorkflowError } from './shift-workflows.contract';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-29T10:00:00Z';
const next = '2026-09-29T10:00:01Z';
const context = (): ShiftWorkflowContext => ({ workflowId: id(10), contractorProfileId: id(3), anchorEventId: id(31), eventIds: [id(31), id(32)], activeRound: null,
  timelogs: [21, 22].map((n) => ({ id: n, supabaseId: id(n), eid: n + 10, eventSupabaseId: id(n + 10), contractorProfileId: id(3),
    updatedAt: time, status: 'draft', note: '', km: 0, days: [{ id: id(n + 100), d: '2026-09-29', f: '08:00', t: '10:00', type: 'pripravy' }] })) });
const receipt = (command: ShiftBatchCommand): ShiftBatchResult => {
  if (command.kind === 'transition') throw new Error('Fixture only accepts draft commands');
  const status = command.kind === 'submit' ? 'pending_ch' : 'draft';
  return { requestId: command.requestId, workflowId: command.workflowId,
    round: command.kind === 'submit' ? { id: command.roundId!, workflowId: command.workflowId, contractorProfileId: id(3), status: 'pending_ch',
      eventIds: command.timelogs.map((t) => t.event_id), timelogIds: command.timelogs.map((t) => t.id), updatedAt: next, note: '' } : null,
    timelogs: command.timelogs.map((t) => ({ id: t.id, event_id: t.event_id, contractor_id: id(3), status, updated_at: next, km: t.km, note: t.note,
      days: t.days, review_note: null, crew_confirmation_snapshot: null, approval: null, submitted_at: status === 'pending_ch' ? next : null, approved_at: null })) };
};
const setup = (ctx = context(), role: 'crew' | 'crewhead' | 'coo' = 'crew') => {
  const write = vi.fn(async (cmd: ShiftBatchCommand, assertCurrent: () => void) => { assertCurrent(); return receipt(cmd); });
  const onSaved = vi.fn();
  const session = createShiftEvidenceSession({ context: ctx, role, write, assertCurrent: () => {}, onSaved });
  return { session, write, onSaved };
};

describe('shared evidence editor session', () => {
  it('unlocks editable data when an ambiguous retry receives a definitive validation error', async () => {
    const { session, write } = setup();
    write.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'unknown')).mockRejectedValueOnce(new ShiftWorkflowError('invalid', 'fix inputs'));
    await expect(session.save()).rejects.toThrow('unknown'); await expect(session.retry()).rejects.toThrow('fix inputs');
    expect(session.getSnapshot()).toMatchObject({ canRetry: false, needsReload: false });
    expect(() => session.edit({ ...session.getSnapshot().context.timelogs[0], note: 'corrected' })).not.toThrow();
    await session.save(); expect(write).toHaveBeenCalledTimes(3);
  });
  it('serializes every queued save, including two callers waiting on the same predecessor', async () => {
    const { session, write } = setup(); const finishes: Array<() => void> = [];
    write.mockImplementation((cmd) => new Promise((resolve) => { finishes.push(() => resolve(receipt(cmd))); }));
    const first = session.save(); const second = session.save(); const third = session.save();
    expect(write).toHaveBeenCalledOnce(); finishes[0](); await first;
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    finishes[1](); await second; await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(3));
    finishes[2](); await third;
  });
  it('does not turn a confirmed write into an ambiguous retry when refresh fails', async () => {
    const { session, write, onSaved } = setup(); onSaved.mockImplementationOnce(() => { throw new Error('refresh failed'); });
    await expect(session.save()).resolves.toMatchObject({ workflowId: id(10) });
    expect(session.getSnapshot()).toMatchObject({ canRetry: false, dirty: false, refreshError: expect.any(Error) });
    expect(write).toHaveBeenCalledOnce();
  });
  it('normalizes legacy day ids only once and preserves separate report identity', () => {
    const ctx = context(); ctx.timelogs[0].days[0].id = undefined;
    const { session } = setup(ctx); const first = session.getSnapshot();
    expect(first.context.timelogs[0].days[0].id).toMatch(/^[0-9a-f-]{36}$/);
    session.edit({ ...first.context.timelogs[0], note: 'nová' });
    expect(session.getSnapshot().context.timelogs[0].days[0].id).toBe(first.context.timelogs[0].days[0].id);
    expect(ctx.timelogs[0].days[0].id).toBeUndefined();
  });
  it('accepts only editable values for included reports, never identity/status injection', () => {
    const { session } = setup(); const original = session.getSnapshot().context.timelogs[0];
    session.edit({ ...original, note: 'ok', status: 'approved', eid: 999, contractorProfileId: id(99) });
    expect(session.getSnapshot().context.timelogs[0]).toMatchObject({ note: 'ok', status: 'draft', eid: 31, contractorProfileId: id(3) });
    expect(() => session.edit({ ...original, supabaseId: id(99) })).toThrow();
  });
  it('merges server versions without losing edits made during an in-flight save', async () => {
    const { session, write } = setup(); let resolve!: (r: ShiftBatchResult) => void;
    write.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    session.edit({ ...session.getSnapshot().context.timelogs[0], note: 'first' });
    const pending = session.save(); const sent = write.mock.calls[0][0];
    session.edit({ ...session.getSnapshot().context.timelogs[0], note: 'newer', km: 7 });
    resolve(receipt(sent)); await pending;
    expect(session.getSnapshot().context.timelogs[0]).toMatchObject({ note: 'newer', km: 7, updatedAt: next });
    expect(session.getSnapshot().dirty).toBe(true);
    await session.save(); expect(session.getSnapshot().dirty).toBe(false);
    expect(write.mock.calls[1][0]).toMatchObject({ timelogs: [expect.objectContaining({ note: 'newer', km: 7, expected_updated_at: next }), expect.anything()] });
  });
  it('waits for saving and submits the latest values with refreshed versions', async () => {
    const { session, write } = setup(); let resolve!: (r: ShiftBatchResult) => void;
    write.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const saving = session.save(); const sent = write.mock.calls[0][0];
    session.edit({ ...session.getSnapshot().context.timelogs[1], note: 'latest' });
    const submission = session.submit(); expect(write).toHaveBeenCalledOnce();
    resolve(receipt(sent)); await saving; await submission;
    expect(write.mock.calls[1][0]).toMatchObject({ kind: 'submit', timelogs: [expect.anything(), expect.objectContaining({ note: 'latest', expected_updated_at: next })] });
    expect(session.getSnapshot().context.activeRound?.status).toBe('pending_ch');
    expect(session.getSnapshot().dirty).toBe(false);
    expect(() => session.edit({ ...session.getSnapshot().context.timelogs[0], note: 'too late' })).toThrow();
  });
  it('freezes an ambiguous command and retries that identical payload, not the newer draft', async () => {
    const { session, write } = setup(); write.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'retry'));
    await expect(session.save()).rejects.toThrow('retry');
    expect(session.getSnapshot().canRetry).toBe(true);
    expect(() => session.edit({ ...session.getSnapshot().context.timelogs[0], note: 'blocked' })).toThrow();
    await expect(session.submit()).rejects.toThrow();
    await session.retry(); expect(write.mock.calls[0][0]).toEqual(write.mock.calls[1][0]);
    expect(session.getSnapshot().canRetry).toBe(false);
  });
  it('requires reload after a conflict instead of sending a new stale command', async () => {
    const { session, write } = setup(); write.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'changed'));
    await expect(session.save()).rejects.toThrow('changed');
    expect(session.getSnapshot()).toMatchObject({ needsReload: true, canRetry: false });
    await expect(session.save()).rejects.toThrow(); expect(write).toHaveBeenCalledOnce();
  });
  it('retires late results and callbacks after close without reopening or publishing', async () => {
    const { session, write, onSaved } = setup(); let resolve!: (r: ShiftBatchResult) => void;
    write.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const pending = session.save(); const observed = expect(pending).rejects.toThrow(/uzavřena/);
    const before = session.getSnapshot(); session.dispose(); resolve(receipt(write.mock.calls[0][0])); await observed;
    expect(session.getSnapshot()).toBe(before); expect(onSaved).not.toHaveBeenCalled();
    await expect(session.save()).rejects.toThrow();
  });
  it('keeps COO read-only and prevents handoff of unsaved CH corrections', async () => {
    const ctx = context(); ctx.timelogs.forEach((t) => { t.status = 'pending_ch'; });
    ctx.activeRound = { id: id(40), workflowId: id(10), contractorProfileId: id(3), status: 'pending_ch',
      eventIds: ctx.eventIds, timelogIds: ctx.timelogs.map((t) => t.supabaseId!), note: '', updatedAt: time };
    const coo = setup(ctx, 'coo'); expect(() => coo.session.edit({ ...ctx.timelogs[0], km: 9 })).toThrow();
    const ch = setup(ctx, 'crewhead'); ch.session.edit({ ...ctx.timelogs[0], km: 9 });
    await expect(ch.session.transition('handoff')).rejects.toThrow(/úpravy/);
    expect(ch.write).not.toHaveBeenCalled();
  });
});
