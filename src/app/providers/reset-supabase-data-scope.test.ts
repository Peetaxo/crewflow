import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  cancelQueries: vi.fn(async () => { mocks.order.push('cancel'); }),
  removeQueries: vi.fn(() => { mocks.order.push('remove-workflows'); }),
  invalidateQueries: vi.fn(async () => { mocks.order.push('invalidate'); }),
  resetSnapshot: vi.fn(() => { mocks.order.push('snapshot'); }),
  resets: Array.from({ length: 11 }, (_, index) => vi.fn(() => {
    mocks.order.push(`reset-${index + 1}`);
  })),
}));

vi.mock('../../lib/query-client', () => ({
  queryClient: {
    cancelQueries: mocks.cancelQueries,
    removeQueries: mocks.removeQueries,
    invalidateQueries: mocks.invalidateQueries,
  },
}));

vi.mock('../../lib/app-data', () => ({ resetSupabaseAppData: mocks.resetSnapshot }));
vi.mock('../../features/crew/services/crew-ratings.service', () => ({ resetSupabaseCrewRatingsHydration: mocks.resets[10] }));

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

  it('evicts every account query and leaves B caches intact when A cancellation completes', async () => {
    const cache = new QueryClient();
    for (const key of ['events', 'timelogs', 'receipts', 'clients', 'unknown-private-query']) {
      cache.setQueryData([key], [{ id: 'private-A' }]);
    }
    let finish!: () => void;
    mocks.cancelQueries.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    mocks.removeQueries.mockImplementationOnce(() => cache.removeQueries());
    const { resetSupabaseDataScope, getSupabaseDataScopeVersion } = await import('./reset-supabase-data-scope');
    const version = getSupabaseDataScopeVersion();
    const reset = resetSupabaseDataScope();
    expect(getSupabaseDataScopeVersion()).toBe(version + 1);
    expect(cache.getQueryCache().getAll()).toEqual([]);
    cache.setQueryData(['receipts'], [{ id: 'private-B' }]);
    finish(); await reset;
    expect(cache.getQueryData(['receipts'])).toEqual([{ id: 'private-B' }]);
    cache.clear();
  });

  it('retires all private state before cancellation settles without invalidating old observers', async () => {
    let finish!: () => void;
    mocks.cancelQueries.mockImplementationOnce(() => {
      mocks.order.push('cancel');
      return new Promise<void>((resolve) => { finish = resolve; });
    });
    const { resetSupabaseDataScope } = await import('./reset-supabase-data-scope');
    const reset = resetSupabaseDataScope();
    expect(mocks.resets.every((entry) => entry.mock.calls.length === 1)).toBe(true);
    expect(mocks.resetSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.removeQueries).toHaveBeenCalledWith();
    expect(mocks.order.indexOf('reset-11')).toBeLessThan(mocks.order.indexOf('cancel'));
    mocks.removeQueries.mockClear();
    finish(); await reset;
    expect(mocks.removeQueries).not.toHaveBeenCalled();
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });
});
