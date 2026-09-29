import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn(), response: { data: [] as unknown[], error: null as unknown } }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: mocks.from } }));
import { readShiftRoundHistory } from './shift-round-history';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { source: 'supabase' as const, userId: id(1), profileId: id(2), role: 'coo' as const };
describe('round history RLS reader', () => {
  it('queries only the requested rounds and maps actual return section and reason', async () => {
    const inFilter = vi.fn(() => ({ order: () => ({ abortSignal: async () => mocks.response }) }));
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
    mocks.from.mockReturnValue({ select: () => ({ in: () => ({ order: () => ({ abortSignal: async () => ({ data: [{}], error: null }) }) }) }) });
    await expect(readShiftRoundHistory(scope, [id(4)], new AbortController().signal)).rejects.toThrow(/Historii/);
  });
});
