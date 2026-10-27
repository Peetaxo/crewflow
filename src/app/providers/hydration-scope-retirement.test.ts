import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDataSnapshot } from '../../lib/app-data';

const deferred = () => {
  let resolve!: (value: { data: never[]; error: { message: string } | null }) => void;
  const promise = new Promise<{ data: never[]; error: { message: string } | null }>((finish) => { resolve = finish; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const services = [
  { name: 'clients', path: '../../features/clients/services/clients.service', start: 'getClients', reset: 'resetSupabaseClientsHydration', slice: 'clients', tables: 1 },
  { name: 'candidates', path: '../../features/recruitment/services/candidates.service', start: 'getCandidates', reset: 'resetSupabaseCandidatesHydration', slice: 'candidates', tables: 1 },
  { name: 'fleet', path: '../../features/fleet/services/fleet.service', start: 'getFleetDependencies', reset: 'resetSupabaseFleetHydration', slice: 'fleetVehicles', tables: 4 },
  { name: 'warehouse', path: '../../features/warehouse/services/warehouse.service', start: 'getWarehouseDependencies', reset: 'resetSupabaseWarehouseHydration', slice: 'warehouseItems', tables: 3 },
  { name: 'crew ratings', path: '../../features/crew/services/crew-ratings.service', start: 'ensureSupabaseCrewRatingsLoaded', reset: 'resetSupabaseCrewRatingsHydration', slice: 'crewRatings', tables: 1 },
] as const;

describe.each(services)('$name hydration retirement', (service) => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  const setup = async () => {
    const old = deferred();
    const current = deferred();
    let snapshot = {
      clients: [], candidates: [], fleetVehicles: [], fleetReservations: [], warehouseItems: [],
      warehouseReservations: [], crewRatings: [], projects: [], events: [], contractors: [],
    } as unknown as AppDataSnapshot;
    let requests = 0;
    const order = vi.fn(() => {
      const batch = Math.floor(requests++ / service.tables);
      return batch === 0 ? old.promise : batch === 1 ? current.promise : Promise.resolve({ data: [], error: null });
    });
    vi.doMock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: () => ({ select: () => ({ order }) }) } }));
    vi.doMock('../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: AppDataSnapshot) => AppDataSnapshot) => { snapshot = updater(snapshot); return snapshot; },
      subscribeToLocalAppState: () => () => undefined,
    }));
    const api = await import(service.path) as Record<string, () => unknown>;
    api[service.start]();
    api[service.reset]();
    api[service.start]();
    snapshot = { ...snapshot, [service.slice]: [{ id: 'private-B' }] };
    return { api, old, current, order, snapshot: () => snapshot };
  };

  it('cannot publish A or clear B pending hydration after an identity switch', async () => {
    const test = await setup();
    test.old.resolve({ data: [], error: null });
    await flush();
    expect(test.snapshot()[service.slice]).toEqual([{ id: 'private-B' }]);
    test.api[service.start]();
    expect(test.order).toHaveBeenCalledTimes(service.tables * 2);
    test.current.resolve({ data: [], error: null });
    await flush();
    expect(test.snapshot()[service.slice]).toEqual([]);
  });

  it('cannot mark B loaded when A finishes and B fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const test = await setup();
      test.old.resolve({ data: [], error: null });
      await flush();
      test.current.resolve({ data: [], error: { message: 'B offline' } });
      await flush();
      test.api[service.start]();
      expect(test.order).toHaveBeenCalledTimes(service.tables * 3);
      await flush();
    } finally { warning.mockRestore(); }
  });
});
