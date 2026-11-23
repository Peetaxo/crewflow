import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Timelog } from '../../types';
import type { ShiftWorkflowScope, ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { prepareLegacyEventBatch } from './event-legacy-batch';
import { localShiftWorkflowId } from './shift-workflows.local';
import { getTimelogReviewKey } from '../timelogs/services/timelog-approval-state';

const io = vi.hoisted(() => ({ quote: vi.fn(), read: vi.fn(), write: vi.fn(), price: vi.fn() }));
vi.mock('../timelogs/services/timelogs.service', () => ({ loadTimelogsSnapshot: io.read, updateTimelogStatuses: io.write }));
vi.mock('../invoice-billing/service', () => ({ billingService: { quote: io.quote } }));
vi.mock('./event-round-batch', () => ({ localAmount: io.price }));
const uuid = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const event = { id: 12, supabaseId: uuid(12), contactProfileId: uuid(20) } as Event;
const scope: ShiftWorkflowScope = { source: 'supabase', role: 'coo', profileId: uuid(20), userId: uuid(21) };
const report = (id: number): Timelog => ({ id, eid: 12, eventSupabaseId: event.supabaseId, supabaseId: uuid(id),
  contractorProfileId: uuid(100 + id), updatedAt: '2026-11-23T08:00:00.012345Z', status: 'pending_coo', km: 0, note: '',
  days: [{ d: '2026-11-23', f: '08:00', t: '10:00', type: 'instal' }] });
const reports = [report(1), report(2)];
const entries = reports.map((r, index) => ({ report: r, name: ['Eva', 'Adam'][index] }));
const snapshot: ShiftWorkflowSnapshot = { revision: 1, workflows: [], rounds: [], assignedEventIds: [] };
const reload = vi.fn(async () => snapshot);
const quote = { id: uuid(55), timelogIds: reports.map(r => r.supabaseId), preview: { totalAmount: 850, reports: reports.map(r => ({
  timelogId: r.supabaseId, eventId: event.supabaseId, contractorId: r.contractorProfileId, reportUpdatedAt: r.updatedAt, status: r.status,
})) } };
const current = vi.fn();

describe('mixed event approval – legacy reports', () => {
  beforeEach(() => {
    vi.resetAllMocks(); reload.mockResolvedValue(snapshot);
    io.read.mockResolvedValue(structuredClone(reports)); io.quote.mockResolvedValue(quote);
  });
  it('prepares one exact server quote, writes only on confirmation and replays its frozen targets', async () => {
    const [item] = await prepareLegacyEventBatch(event, entries, scope, current, reload);
    expect(io.quote).toHaveBeenCalledExactlyOnceWith(reports.map(r => r.supabaseId));
    expect(item).toMatchObject({ count: 2, hours: 4, amount: 850, quote });
    expect(io.write).not.toHaveBeenCalled();
    io.write.mockRejectedValueOnce(new Error('Lost response'));
    await expect(item.write(current)).rejects.toThrow('Lost response');
    io.read.mockResolvedValue(reports.map(r => ({ ...r, status: 'approved' })));
    await item.write(current);
    const [ids, action, options] = io.write.mock.calls[0];
    expect([ids, action, options.billingApproval]).toEqual([[1, 2], 'coo', { quoteId: quote.id, targets: reports.map(r => ({
      id: r.supabaseId, expectedUpdatedAt: r.updatedAt, approvalId: null, approvalUpdatedAt: null,
    })) }]);
    expect(io.write.mock.calls[1][2].billingApproval).toEqual(options.billingApproval);
    expect(io.quote).toHaveBeenCalledTimes(1);
  });
  it('checks round membership and reviewed evidence again at confirmation', async () => {
    const [item] = await prepareLegacyEventBatch(event, entries, scope, current, reload);
    reload.mockResolvedValueOnce({ ...snapshot, rounds: [{ timelogIds: [reports[0].supabaseId] }] } as ShiftWorkflowSnapshot);
    await expect(item.write(current)).rejects.toThrow();
    io.read.mockResolvedValueOnce([{ ...reports[0], km: 9 }, reports[1]]);
    await expect(item.write(current)).rejects.toThrow();
    expect(io.write).not.toHaveBeenCalled();
  });
  it('rejects a quote with a different version or event before exposing its totals', async () => {
    io.quote.mockResolvedValue({ ...quote, preview: { ...quote.preview, reports: quote.preview.reports.map(r => ({ ...r, eventId: uuid(99) })) } });
    await expect(prepareLegacyEventBatch(event, entries, scope, current, reload)).rejects.toThrow();
    expect(io.write).not.toHaveBeenCalled();
  });
  it('passes local review keys and the current actor, and rejects changed local prices', async () => {
    io.price.mockReturnValue(400);
    const [item] = await prepareLegacyEventBatch(event, entries, { ...scope, source: 'local' }, current, reload);
    expect(item.amount).toBe(800);
    io.price.mockReturnValueOnce(399);
    await expect(item.write(current)).rejects.toThrow();
    expect(io.write).not.toHaveBeenCalled();
    await item.write(current);
    expect(io.write).toHaveBeenCalledWith([1, 2], 'coo', expect.objectContaining({
      currentProfileId: scope.profileId, expectedReviewKeys: reports.map(getTimelogReviewKey), assertCurrent: expect.any(Function),
    }));
    expect(io.quote).not.toHaveBeenCalled();
  });
  it('detects canonically identified local rounds and a retired credential', async () => {
    reload.mockResolvedValueOnce({ ...snapshot, rounds: [{ timelogIds: [localShiftWorkflowId('timelog', 1)] }] } as ShiftWorkflowSnapshot);
    await expect(prepareLegacyEventBatch(event, entries, { ...scope, source: 'local' }, current, reload)).rejects.toThrow();
    const [item] = await prepareLegacyEventBatch(event, entries, scope, current, reload);
    await expect(item.write(() => { throw new Error('Retired actor'); })).rejects.toThrow('Retired actor');
    expect(io.write).not.toHaveBeenCalled();
  });
  it('freezes CH handoff token pairs for the exact remote reports when an acknowledgement is lost', async () => {
    const handoff = entries.map(entry => ({ ...entry, report: { ...entry.report, status: 'pending_ch' as const } }));
    io.read.mockResolvedValue(handoff.map(entry => entry.report));
    const [item] = await prepareLegacyEventBatch(event, handoff, { ...scope, role: 'crewhead' }, current, reload);
    io.write.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(item.write(current)).rejects.toThrow();
    await item.write(current);
    const targets = io.write.mock.calls[0][2].handoffTargets;
    expect(targets).toEqual(handoff.map(({ report }) => ({
      id: report.supabaseId, expectedUpdatedAt: report.updatedAt, approvalId: expect.any(String), approvalRoundId: expect.any(String),
    })));
    expect(new Set(targets.flatMap((target: { approvalId: string; approvalRoundId: string }) => [target.approvalId, target.approvalRoundId])).size).toBe(4);
    expect(io.write.mock.calls[1][2].handoffTargets).toEqual(targets);
    expect(io.quote).not.toHaveBeenCalled();
  });
});
