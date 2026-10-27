import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDataSnapshot } from '../../lib/app-data';

const deferred = () => {
  let resolve!: (value: { data?: { id: string }; error: { message: string } | null }) => void;
  const promise = new Promise<{ data?: { id: string }; error: { message: string } | null }>((finish) => { resolve = finish; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
const snapshotFor = (owner: string) => ({
  clients: [{ id: 1, supabaseId: `client-${owner}`, name: `Client ${owner}` }],
  projects: [{ id: 'JOB1', supabaseId: `project-${owner}`, name: `Project ${owner}`, client: '', createdAt: '' }],
  contractors: [{ id: 1, profileId: `profile-${owner}`, name: `Crew ${owner}` }],
  timelogs: owner === 'B' ? [{ id: 1, contractorProfileId: 'profile-B' }] : [],
  receipts: owner === 'B' ? [{ id: 1, contractorProfileId: 'profile-B' }] : [],
  invoices: [],
}) as unknown as AppDataSnapshot;

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
const setup = (from: (table: string) => unknown) => {
  let snapshot = snapshotFor('A');
  vi.doMock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
  vi.doMock('../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from } }));
  vi.doMock('../../lib/app-data', () => ({
    getLocalAppState: () => snapshot,
    updateLocalAppState: (updater: (state: AppDataSnapshot) => AppDataSnapshot) => { snapshot = updater(snapshot); return snapshot; },
    subscribeToLocalAppState: () => () => undefined,
  }));
  return { snapshot: () => snapshot, replace: (next: AppDataSnapshot) => { snapshot = next; } };
};

const deletions = [
  { name: 'client', path: '../../features/clients/services/clients.service', call: 'deleteClient', reset: 'resetSupabaseClientsHydration', table: 'clients', id: 1 },
  { name: 'project', path: '../../features/projects/services/projects.service', call: 'deleteProject', reset: 'resetSupabaseProjectsHydration', table: 'projects', id: 'JOB1' },
  { name: 'crew', path: '../../features/crew/services/crew.service', call: 'deleteCrew', reset: 'resetSupabaseCrewHydration', table: 'profiles', id: 1 },
] as const;

describe.each(deletions)('$name deletion retirement', (service) => {
  it('cannot remove B records with reused local IDs after A request completes', async () => {
    const pending = deferred();
    const request = vi.fn((table: string) => table === service.table ? pending.promise : Promise.resolve({ error: null }));
    const test = setup((table) => ({ delete: () => ({ eq: () => request(table) }) }));
    const api = await import(service.path) as Record<string, (id?: number | string) => unknown>;
    const outcome = (api[service.call](service.id) as Promise<unknown>).catch((error: unknown) => error);
    await flush();
    expect(request).toHaveBeenCalledWith(service.table);
    api[service.reset]();
    const next = snapshotFor('B'); test.replace(next);
    pending.resolve({ error: null });
    const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
    expect(test.snapshot()).toEqual(next);
  });
});

it('does not delete the profile after A assignment deletion completes under B', async () => {
  const pending = deferred();
  const request = vi.fn((table: string) => table === 'event_assignments' ? pending.promise : Promise.resolve({ error: null }));
  const test = setup((table) => ({ delete: () => ({ eq: () => request(table) }) }));
  const { deleteCrew, resetSupabaseCrewHydration } = await import('../../features/crew/services/crew.service');
  const outcome = deleteCrew(1).catch((error: unknown) => error);
  resetSupabaseCrewHydration(); test.replace(snapshotFor('B'));
  pending.resolve({ error: null });
  const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
  expect(request).toHaveBeenCalledTimes(1);
});

it.each(['delete', 'save'] as const)('does not issue a client %s after an A lookup completes under B', async (operation) => {
  const pending = deferred();
  const mutation = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  const test = setup(() => ({
    select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: () => pending.promise }) }) }),
    delete: mutation, update: mutation,
  }));
  test.replace({ ...test.snapshot(), clients: [{ id: 1, name: 'Client A' }] });
  const { deleteClient, saveClient, resetSupabaseClientsHydration } = await import('../../features/clients/services/clients.service');
  const promise = operation === 'delete' ? deleteClient(1) : saveClient({ id: 1, name: 'Client A' });
  const outcome = promise.catch((error: unknown) => error);
  resetSupabaseClientsHydration(); test.replace(snapshotFor('B'));
  pending.resolve({ data: { id: 'client-A' }, error: null });
  const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
  expect(mutation).not.toHaveBeenCalled();
});

it.each(['insert', 'update'] as const)('cannot publish an A client %s over B after retirement', async (operation) => {
  const pending = deferred();
  const update = vi.fn(() => ({ eq: () => pending.promise }));
  const insert = vi.fn(() => pending.promise);
  const test = setup(() => ({ update, insert }));
  if (operation === 'insert') test.replace({ ...test.snapshot(), clients: [] });
  const { saveClient, resetSupabaseClientsHydration } = await import('../../features/clients/services/clients.service');
  const outcome = saveClient({ id: 1, supabaseId: 'client-A', name: 'Private A' }).catch((error: unknown) => error);
  await flush();
  expect(operation === 'insert' ? insert : update).toHaveBeenCalled();
  resetSupabaseClientsHydration();
  const next = snapshotFor('B'); test.replace(next);
  pending.resolve({ error: null });
  const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
  expect(test.snapshot()).toEqual(next);
});

it('cannot publish an A project save over B after retirement', async () => {
  const pending = deferred();
  const update = vi.fn(() => ({ eq: () => pending.promise }));
  const test = setup(() => ({ update }));
  const { saveProject, resetSupabaseProjectsHydration } = await import('../../features/projects/services/projects.service');
  const outcome = saveProject({ id: 'JOB1', name: 'Private A', client: '', createdAt: '' }).catch((error: unknown) => error);
  await flush();
  expect(update).toHaveBeenCalled();
  resetSupabaseProjectsHydration();
  const next = snapshotFor('B'); test.replace(next);
  pending.resolve({ error: null });
  expect(test.snapshot()).toEqual(next);
  const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
  expect(test.snapshot()).toEqual(next);
});

it('cannot publish a newly created A crew member into B after retirement', async () => {
  const pending = deferred();
  const test = setup(() => ({ insert: () => ({ select: () => ({ single: () => pending.promise }) }) }));
  const { createCrew, resetSupabaseCrewHydration } = await import('../../features/crew/services/crew.service');
  const outcome = createCrew({
    ...test.snapshot().contractors[0], id: 2, name: 'Private A', city: 'Praha', phone: '123', tags: [], rate: 1,
  }).catch((error: unknown) => error);
  resetSupabaseCrewHydration();
  const next = snapshotFor('B'); test.replace(next);
  pending.resolve({ data: { id: 'profile-A' }, error: null });
  const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
  expect(test.snapshot()).toEqual(next);
});

it.each(['lookup', 'write'] as const)('retires A crew rating during %s before follow-up writes or publication', async (pauseAt) => {
  const pending = deferred();
  const write = vi.fn(() => ({ eq: () => ({ select: () => ({ single: () => pending.promise }) }) }));
  const test = setup(() => ({
    select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: () => pauseAt === 'lookup' ? pending.promise : Promise.resolve({ data: { id: 'rating-A' }, error: null }) }) }) }) }),
    update: write,
  }));
  const { upsertCrewRating, resetSupabaseCrewRatingsHydration } = await import('../../features/crew/services/crew-ratings.service');
  const outcome = upsertCrewRating({ profileId: 'profile-A', rating: 5 }).catch((error: unknown) => error);
  await flush();
  if (pauseAt === 'write') expect(write).toHaveBeenCalled();
  resetSupabaseCrewRatingsHydration();
  const next = { ...snapshotFor('B'), crewRatings: [] }; test.replace(next);
  pending.resolve({ data: { id: 'rating-A' }, error: null });
  const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
  expect(test.snapshot()).toEqual(next);
  if (pauseAt === 'lookup') expect(write).not.toHaveBeenCalled();
});

it.each(['insert', 'update'] as const)('cannot publish an A fleet reservation %s into B after retirement', async (operation) => {
  const pending = deferred();
  const write = vi.fn(() => ({ eq: () => pending.promise, select: () => ({ single: () => pending.promise }) }));
  const test = setup(() => ({
    select: () => ({ order: () => new Promise(() => {}) }),
    update: write, insert: write,
  }));
  test.replace({ ...test.snapshot(),
    events: [], fleetVehicles: [{ id: 'vehicle', supabaseId: 'vehicle-A' }] as AppDataSnapshot['fleetVehicles'], fleetReservations: [],
  });
  const { saveFleetReservation, resetSupabaseFleetHydration } = await import('../../features/fleet/services/fleet.service');
  const outcome = saveFleetReservation({
    id: 1, ...(operation === 'update' ? { supabaseId: 'reservation-A' } : {}),
    vehicleId: 'vehicle', projectId: 'JOB1', eventId: null, responsibleProfileId: 'profile-A',
    startsAt: '2026-10-28T09:00', endsAt: '2026-10-28T12:00', note: 'Private A',
  }).catch((error: unknown) => error);
  await flush(); expect(write).toHaveBeenCalled();
  resetSupabaseFleetHydration();
  const next = { ...snapshotFor('B'), fleetReservations: [] }; test.replace(next);
  pending.resolve({ data: { id: 'reservation-A' }, error: null });
  const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
  expect(test.snapshot()).toEqual(next);
});

it.each(['header', 'items', 'cleanup'] as const)('retires A warehouse reservation during %s without B writes or publication', async (pauseAt) => {
  const pending = deferred();
  const header = vi.fn(() => pauseAt === 'header' ? pending.promise : Promise.resolve({ error: null }));
  const items = vi.fn(() => pending.promise);
  const cleanup = vi.fn(() => Promise.resolve({ error: null }));
  const test = setup((table) => ({
    select: () => ({ order: () => new Promise(() => {}) }),
    insert: table === 'warehouse_reservations' ? header : items,
    delete: () => ({ eq: cleanup }),
  }));
  test.replace({ ...test.snapshot(), warehouseReservations: [], warehouseItems: [{
    id: 'warehouse-item-A', name: 'Private A', status: 'active', quantityTotal: 5, priceCents: 100,
  }] as AppDataSnapshot['warehouseItems'] });
  const { createWarehouseReservation, resetSupabaseWarehouseHydration } = await import('../../features/warehouse/services/warehouse.service');
  const outcome = createWarehouseReservation({
    projectJobNumber: 'JOB1', startsAt: '2026-10-28T09:00', endsAt: '2026-10-28T12:00', note: '',
    items: [{ warehouseItemId: 'warehouse-item-A', quantity: 1 }],
  }).catch((error: unknown) => error);
  await flush(); expect(pauseAt === 'header' ? header : items).toHaveBeenCalled();
  resetSupabaseWarehouseHydration();
  const next = { ...snapshotFor('B'), warehouseReservations: [] }; test.replace(next);
  pending.resolve(pauseAt === 'cleanup' ? { error: { message: 'A item failed' } } : { error: null });
  const result = await outcome;
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toContain('změnil');
  expect(test.snapshot()).toEqual(next);
  expect(cleanup).not.toHaveBeenCalled();
  if (pauseAt === 'header') expect(items).not.toHaveBeenCalled();
});
