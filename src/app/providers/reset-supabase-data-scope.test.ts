import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  cancelQueries: vi.fn(async () => { mocks.order.push('cancel'); }),
  invalidateQueries: vi.fn(async () => { mocks.order.push('invalidate'); }),
  resets: Array.from({ length: 10 }, (_, index) => vi.fn(() => {
    mocks.order.push(`reset-${index + 1}`);
  })),
}));

vi.mock('../../lib/query-client', () => ({
  queryClient: {
    cancelQueries: mocks.cancelQueries,
    invalidateQueries: mocks.invalidateQueries,
  },
}));

vi.mock('../../features/clients/services/clients.service', () => ({ resetSupabaseClientsHydration: mocks.resets[0] }));
vi.mock('../../features/projects/services/projects.service', () => ({ resetSupabaseProjectsHydration: mocks.resets[1] }));
vi.mock('../../features/events/services/events.service', () => ({ resetSupabaseEventsHydration: mocks.resets[2] }));
vi.mock('../../features/crew/services/crew.service', () => ({ resetSupabaseCrewHydration: mocks.resets[3] }));
vi.mock('../../features/receipts/services/receipts.service', () => ({ resetSupabaseReceiptsHydration: mocks.resets[4] }));
vi.mock('../../features/timelogs/services/timelogs.service', () => ({ resetSupabaseTimelogsHydration: mocks.resets[5] }));
vi.mock('../../features/invoices/services/invoices.service', () => ({ resetSupabaseInvoicesHydration: mocks.resets[6] }));
vi.mock('../../features/recruitment/services/candidates.service', () => ({ resetSupabaseCandidatesHydration: mocks.resets[7] }));
vi.mock('../../features/fleet/services/fleet.service', () => ({ resetSupabaseFleetHydration: mocks.resets[8] }));
vi.mock('../../features/warehouse/services/warehouse.service', () => ({ resetSupabaseWarehouseHydration: mocks.resets[9] }));

describe('resetSupabaseDataScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.order.length = 0;
  });

  it('cancels stale reads, resets every hydration guard, and then invalidates queries', async () => {
    const { resetSupabaseDataScope } = await import('./reset-supabase-data-scope');

    await resetSupabaseDataScope();

    expect(mocks.resets.every((reset) => reset.mock.calls.length === 1)).toBe(true);
    expect(mocks.order).toEqual([
      'cancel',
      ...mocks.resets.map((_, index) => `reset-${index + 1}`),
      'invalidate',
    ]);
  });
});
