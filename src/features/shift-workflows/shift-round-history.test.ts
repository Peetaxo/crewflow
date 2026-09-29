import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), response: { data: [] as unknown[], error: null as unknown } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }));
import { readShiftRoundHistory } from './shift-round-history';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { source: 'supabase' as const, userId: id(1), profileId: id(2), role: 'coo' as const };
describe('round history RLS reader', () => {
  const query = (read: (start: number, end: number) => unknown) => {
    const builder = { order: vi.fn(() => builder), range: vi.fn((start: number, end: number) => ({ abortSignal: async () => read(start, end) })) };
    return builder;
  };
  it('queries only the requested rounds and maps actual return section and reason', async () => {
    const inFilter = vi.fn(() => query(() => ({ ...mocks.response, count: mocks.response.data.length })));
    mocks.from.mockReturnValue({ select: () => ({ in: inFilter }) });
    mocks.response = { data: [{ id: id(3), round_id: id(4), action: 'return', note: 'Opravit km', event_id: id(5), created_at: '2026-09-20T00:00:00Z' }], error: null };
    const actions = await readShiftRoundHistory(scope, [id(4)], new AbortController().signal);
    expect(mocks.from).toHaveBeenCalledWith('shift_workflow_round_actions');
    expect(inFilter).toHaveBeenCalledWith('round_id', [id(4)]);
    expect(actions[0]).toMatchObject({ label: 'Vráceno', note: 'Opravit km', eventId: id(5) });
  });
  it('rejects stale/aborted and malformed results without any fallback', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(readShiftRoundHistory(scope, [id(4)], abort.signal)).rejects.toThrow(/přerušeno/);
    mocks.from.mockReturnValue({ select: () => ({ in: () => query(() => ({ data: [{}], error: null, count: 1 })) }) });
    await expect(readShiftRoundHistory(scope, [id(4)], new AbortController().signal)).rejects.toThrow(/Historii/);
  });
  it('loads all pages in deterministic order so the latest return is never truncated', async () => {
    const rows = Array.from({ length: 205 }, (_, i) => ({ id: id(100 + i), round_id: id(4), action: i === 204 ? 'return' : 'submitted',
      note: i === 204 ? 'Latest reason' : '', event_id: null, created_at: '2026-09-20T00:00:00Z' }));
    const builder = query((start, end) => ({ data: rows.slice(start, end + 1), count: rows.length, error: null }));
    mocks.from.mockReturnValue({ select: () => ({ in: () => builder }) });
    const actions = await readShiftRoundHistory(scope, [id(4)], new AbortController().signal);
    expect(actions).toHaveLength(205);
    expect(actions.at(-1)?.note).toBe('Latest reason');
    expect(actions[0].label).toBe('Odesláno');
    expect(builder.order.mock.calls).toEqual(expect.arrayContaining([['created_at'], ['id']]));
    expect(builder.range).toHaveBeenCalledTimes(3);
  });
  it('bounds round filters without dropping history when there are many rounds', async () => {
    const inFilter = vi.fn((_: string, ids: string[]) => query(() => ({ count: ids.length, error: null,
      data: ids.map((roundId) => ({ id: roundId, round_id: roundId, action: 'submitted', note: '', event_id: null, created_at: '2026-09-20T00:00:00Z' })) })));
    mocks.from.mockReturnValue({ select: () => ({ in: inFilter }) });
    const ids = Array.from({ length: 51 }, (_, index) => id(100 + index));
    const result = await readShiftRoundHistory(scope, ids, new AbortController().signal);
    expect(result).toHaveLength(51);
    expect(inFilter).toHaveBeenCalledTimes(2);
    expect(inFilter.mock.calls.every((call) => call[1].length <= 50)).toBe(true);
  });
  it('preserves database microseconds before applying the id tie-break', async () => {
    const rows = [
      { id: id(9), round_id: id(4), action: 'submitted', note: '', event_id: null, created_at: '2026-09-20T00:00:00.000001Z' },
      { id: id(8), round_id: id(4), action: 'return', note: 'Latest', event_id: null, created_at: '2026-09-20T02:00:00.000002+02:00' },
    ];
    mocks.from.mockReturnValue({ select: () => ({ in: () => query(() => ({ data: rows, count: 2, error: null })) }) });
    const result = await readShiftRoundHistory(scope, [id(4)], new AbortController().signal);
    expect(result.map((action) => action.id)).toEqual([id(9), id(8)]);
  });
});
