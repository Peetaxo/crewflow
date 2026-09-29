import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timelog } from '../../../types';
const mocks = vi.hoisted(() => ({ source: 'supabase', from: vi.fn(), localRead: vi.fn() }));
vi.mock('../../../lib/app-config', () => ({ get appDataSource() { return mocks.source; } }));
vi.mock('../../../lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('../../shift-workflows/shift-workflows.local', () => ({
  localShiftWorkflowId: (_kind: string, value: string | number) => String(value), readLocalShiftWorkflows: mocks.localRead,
}));
import { assertLegacyTimelogWrite } from './timelog-shared-write-guard';
const report = { id: 1, eid: 2, supabaseId: '00000000-0000-4000-8000-000000000001', eventSupabaseId: '00000000-0000-4000-8000-000000000002', status: 'pending_ch' } as Timelog;
describe('legacy service shared-write guard', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.source = 'supabase'; });
  it('rejects a frozen single-event round and any linked part without a write', async () => {
    mocks.from.mockImplementation((table: string) => ({ select: () => ({ in: async () => ({ data: table === 'shift_workflow_round_items' ? [{}] : [], error: null }) }) }));
    await expect(assertLegacyTimelogWrite([report])).rejects.toThrow(/společný výkaz/);
  });
  it('permits genuine legacy records but fails closed if membership cannot be read', async () => {
    mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: [], error: null }) }) });
    await expect(assertLegacyTimelogWrite([report])).resolves.toBeUndefined();
    mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: null, error: {} }) }) });
    await expect(assertLegacyTimelogWrite([report])).rejects.toThrow(/načíst/);
  });
  it('fails closed when the legacy caller has not resolved the report and event identities', async () => {
    await expect(assertLegacyTimelogWrite([{ ...report, supabaseId: undefined, eventSupabaseId: undefined }])).rejects.toThrow(/identitu/);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('protects local drafts and frozen rounds, including when callers omit remote identities', async () => {
    mocks.source = 'local';
    mocks.localRead.mockReturnValue({ workflows: [{ eventIds: ['2'] }], rounds: [] });
    await expect(assertLegacyTimelogWrite([report])).rejects.toThrow(/společný výkaz/);
    mocks.localRead.mockReturnValue({ workflows: [], rounds: [{ timelogIds: ['1'] }] });
    await expect(assertLegacyTimelogWrite([report])).rejects.toThrow(/společný výkaz/);
  });
});
