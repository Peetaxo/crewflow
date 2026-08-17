import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timelog } from '../../../types';

const createSnapshot = (timelogs: Timelog[]) => ({
  events: [],
  contractors: [],
  timelogs,
  invoices: [],
  receipts: [],
  candidates: [],
  projects: [],
  clients: [],
});

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const setupStableUuidWriteHarness = async ({
  timelogs = [],
  snapshotEventSupabaseId,
  insertedTimelogSupabaseId = 'created-timelog-uuid',
}: {
  timelogs?: Timelog[];
  snapshotEventSupabaseId?: string;
  insertedTimelogSupabaseId?: string;
}) => {
  let snapshot = {
    ...createSnapshot(timelogs),
    events: [{ id: 1, supabaseId: snapshotEventSupabaseId }],
  };
  const setQueryData = vi.fn();
  const invalidateQueries = vi.fn();

  const timelogInsertSingle = vi.fn().mockResolvedValue({
    data: { id: insertedTimelogSupabaseId },
    error: null,
  });
  const timelogInsertSelect = vi.fn(() => ({ single: timelogInsertSingle }));
  const timelogInsert = vi.fn(() => ({ select: timelogInsertSelect }));
  const timelogUpdateEq = vi.fn((_field: string, value: string) => {
    const result = Promise.resolve({ data: null, error: null });
    return {
      select: vi.fn().mockResolvedValue({ data: [{ id: value }], error: null }),
      then: result.then.bind(result),
    };
  });
  const timelogUpdate = vi.fn(() => ({ eq: timelogUpdateEq }));
  const timelogDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const timelogDelete = vi.fn(() => ({ eq: timelogDeleteEq }));
  const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
  const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));

  const legacyTimelogResult = Promise.resolve({
    data: [{ id: 'positionally-wrong-timelog-uuid' }],
    error: null,
  });
  const legacyTimelogOrder = vi.fn();
  const legacyTimelogQuery = {
    order: legacyTimelogOrder,
    then: legacyTimelogResult.then.bind(legacyTimelogResult),
  };
  legacyTimelogOrder.mockReturnValue(legacyTimelogQuery);
  const timelogsSelect = vi.fn(() => legacyTimelogQuery);

  const legacyEventResult = Promise.resolve({
    data: [{ id: 'positionally-wrong-event-uuid' }],
    error: null,
  });
  const legacyEventOrder = vi.fn();
  const legacyEventQuery = {
    order: legacyEventOrder,
    then: legacyEventResult.then.bind(legacyEventResult),
  };
  legacyEventOrder.mockReturnValue(legacyEventQuery);
  const eventsSelect = vi.fn(() => legacyEventQuery);

  vi.doMock('../../../lib/app-config', () => ({
    appDataSource: 'supabase',
  }));

  vi.doMock('../../../lib/supabase', () => ({
    isSupabaseConfigured: true,
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'timelogs') {
          return {
            insert: timelogInsert,
            update: timelogUpdate,
            delete: timelogDelete,
            select: timelogsSelect,
          };
        }

        if (table === 'timelog_days') {
          return {
            insert: timelogDaysInsert,
            delete: timelogDaysDelete,
          };
        }

        if (table === 'events') {
          return { select: eventsSelect };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    },
  }));

  vi.doMock('../../../lib/supabase-mappers', () => ({
    mapTimelog: vi.fn(),
  }));

  vi.doMock('../../../lib/app-data', () => ({
    getLocalAppState: () => structuredClone(snapshot),
    updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
      snapshot = structuredClone(updater(structuredClone(snapshot)));
      return structuredClone(snapshot);
    },
    subscribeToLocalAppState: vi.fn(() => () => undefined),
  }));

  vi.doMock('../../../lib/query-client', () => ({
    queryClient: {
      setQueryData,
      invalidateQueries,
    },
  }));

  vi.doMock('../../../lib/query-keys', () => ({
    queryKeys: {
      timelogs: {
        all: ['timelogs'],
      },
    },
  }));

  const service = await import('./timelogs.service');
  return {
    service,
    getSnapshot: () => structuredClone(snapshot),
    setQueryData,
    timelogInsert,
    timelogUpdate,
    timelogUpdateEq,
    timelogDeleteEq,
    timelogsSelect,
    eventsSelect,
  };
};

describe('timelogs.service write flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('loads stable Supabase timelog identity without mutating state and orders event mappings deterministically', async () => {
    const updateLocalAppState = vi.fn();
    const createOrderedQuery = <T,>(data: T[]) => {
      const result = Promise.resolve({ data, error: null });
      const order = vi.fn();
      const query = {
        order,
        then: result.then.bind(result),
      };
      order.mockReturnValue(query);
      return query;
    };
    const timelogsQuery = createOrderedQuery([{
      id: 'timelog-row-1',
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      km: 0,
      note: '',
      status: 'draft',
    }]);
    const timelogDaysQuery = createOrderedQuery([{
      id: 'timelog-day-row-1',
      timelog_id: 'timelog-row-1',
      date: '2026-04-20',
      time_from: '08:00',
      time_to: '17:00',
      day_type: 'instal',
      note: null,
    }]);
    const profilesQuery = createOrderedQuery([{ id: 'profile-uuid-1' }]);
    const eventsQuery = createOrderedQuery([{ id: 'event-row-1' }]);

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => {
            if (table === 'timelogs') return timelogsQuery;
            if (table === 'timelog_days') return timelogDaysQuery;
            if (table === 'profiles') return profilesQuery;
            if (table === 'events') return eventsQuery;
            throw new Error(`Unexpected table ${table}`);
          }),
        })),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: () => ({
        id: Number.NaN,
        eid: Number.NaN,
        days: [{ d: '2026-04-20', f: '08:00', t: '17:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'draft',
      }),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => createSnapshot([]),
      updateLocalAppState,
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { loadTimelogsSnapshot } = await import('./timelogs.service');

    await expect(loadTimelogsSnapshot()).resolves.toEqual([expect.objectContaining({
      id: 1,
      eid: 1,
      supabaseId: 'timelog-row-1',
      eventSupabaseId: 'event-row-1',
      contractorProfileId: 'profile-uuid-1',
    })]);
    expect(eventsQuery.order.mock.calls).toEqual([
      ['date_from'],
      ['name'],
      ['id'],
    ]);
    expect(updateLocalAppState).not.toHaveBeenCalled();
  });

  it('does not let an older public timelog fetch overwrite a newer lifecycle generation', async () => {
    const currentTimelog: Timelog = {
      id: 2,
      eid: 1,
      supabaseId: 'current-timelog-row',
      eventSupabaseId: 'event-row-1',
      contractorProfileId: 'profile-uuid-1',
      days: [],
      km: 0,
      note: 'Current',
      status: 'draft',
    };
    let snapshot = createSnapshot([]);
    const updateLocalAppState = vi.fn((updater: (state: typeof snapshot) => typeof snapshot) => {
      snapshot = structuredClone(updater(structuredClone(snapshot)));
      return structuredClone(snapshot);
    });
    const deferredTimelogs = createDeferred<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>();
    const createOrderedQuery = <T,>(result: Promise<{ data: T[]; error: null }>) => {
      const order = vi.fn();
      const query = { order, then: result.then.bind(result) };
      order.mockReturnValue(query);
      return query;
    };

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => {
            if (table === 'timelogs') return createOrderedQuery(deferredTimelogs.promise);
            if (table === 'timelog_days') return createOrderedQuery(Promise.resolve({ data: [], error: null }));
            if (table === 'profiles') return createOrderedQuery(Promise.resolve({ data: [{ id: 'profile-uuid-1' }], error: null }));
            if (table === 'events') return createOrderedQuery(Promise.resolve({ data: [{ id: 'event-row-1' }], error: null }));
            throw new Error(`Unexpected table ${table}`);
          }),
        })),
      },
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: () => ({
        id: Number.NaN,
        eid: Number.NaN,
        days: [],
        km: 0,
        note: 'Stale',
        status: 'draft',
      }),
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState,
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { fetchTimelogsSnapshot } = await import('./timelogs.service');
    const { advanceLifecycleSnapshotGeneration } = await import('../../event-lifecycle-generation');
    const oldFetch = fetchTimelogsSnapshot();

    advanceLifecycleSnapshotGeneration();
    updateLocalAppState((current) => ({
      ...current,
      timelogs: [currentTimelog],
    }));
    deferredTimelogs.resolve({
      data: [{
        id: 'stale-timelog-row',
        event_id: 'event-row-1',
        contractor_id: 'profile-uuid-1',
        status: 'draft',
      }],
      error: null,
    });

    await expect(oldFetch).resolves.toEqual([currentTimelog]);
    expect(snapshot.timelogs).toEqual([currentTimelog]);
    expect(updateLocalAppState).toHaveBeenCalledOnce();
  });

  it('updates timelog status in Supabase using the mapped row id', async () => {
    let snapshot = createSnapshot([
      { id: 1, eid: 1, contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'draft' },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    const updateSelect = vi.fn().mockResolvedValue({ data: [{ id: 'timelog-uuid-1' }], error: null });
    const updateEq = vi.fn(() => ({ select: updateSelect }));
    const updateMock = vi.fn(() => ({ eq: updateEq }));
    const selectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-uuid-1' }],
        error: null,
      })),
    }));

    const fromMock = vi.fn((table: string) => {
      if (table !== 'timelogs') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: selectMock,
        update: updateMock,
      };
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: fromMock,
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: {
        timelogs: {
          all: ['timelogs'],
        },
      },
    }));

    const { updateTimelogStatus } = await import('./timelogs.service');

    const result = await updateTimelogStatus(1, 'sub');

    expect(selectMock).toHaveBeenCalledWith('id');
    expect(updateMock).toHaveBeenCalledWith({ status: 'pending_ch' });
    expect(updateEq).toHaveBeenCalledWith('id', 'timelog-uuid-1');
    expect(updateSelect).toHaveBeenCalledWith('id');
    expect(result.status).toBe('pending_ch');
    expect(snapshot.timelogs[0].contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.timelogs[0].status).toBe('pending_ch');
    expect(setQueryData).toHaveBeenCalledWith(['timelogs'], snapshot.timelogs);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['timelogs'] });
  });

  it('does not update local state when Supabase status update affects no rows', async () => {
    let snapshot = createSnapshot([
      { id: 1, eid: 1, contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'draft' },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    const updateSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const updateEq = vi.fn(() => ({ select: updateSelect }));
    const updateMock = vi.fn(() => ({ eq: updateEq }));
    const selectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-uuid-1' }],
        error: null,
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table !== 'timelogs') {
            throw new Error(`Unexpected table ${table}`);
          }

          return {
            select: selectMock,
            update: updateMock,
          };
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: {
        timelogs: {
          all: ['timelogs'],
        },
      },
    }));

    const { updateTimelogStatus } = await import('./timelogs.service');

    await expect(updateTimelogStatus(1, 'sub')).rejects.toThrow('Nepodarilo se aktualizovat vykaz v databazi.');

    expect(updateSelect).toHaveBeenCalledWith('id');
    expect(snapshot.timelogs[0].status).toBe('draft');
    expect(setQueryData).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('approves all matching event timelogs in Supabase and updates local state', async () => {
    let snapshot = createSnapshot([
      { id: 1, eid: 7, supabaseId: 'stable-timelog-uuid-1', contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'pending_coo' },
      { id: 2, eid: 7, contractorProfileId: 'profile-uuid-2', days: [], km: 0, note: '', status: 'pending_coo' },
      { id: 3, eid: 8, contractorProfileId: 'profile-uuid-3', days: [], km: 0, note: '', status: 'pending_coo' },
    ]);

    const eqCalls: Array<[string, string]> = [];
    const updateMock = vi.fn(() => ({
      eq: vi.fn((field: string, value: string) => {
        eqCalls.push([field, value]);
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id: value }], error: null }),
        };
      }),
    }));
    const rowsResult = Promise.resolve({
        data: [
          { id: 'timelog-uuid-1' },
          { id: 'timelog-uuid-2' },
          { id: 'timelog-uuid-3' },
        ],
        error: null,
    });
    const rowsOrder = vi.fn();
    const rowsQuery = { order: rowsOrder, then: rowsResult.then.bind(rowsResult) };
    rowsOrder.mockReturnValue(rowsQuery);
    const selectMock = vi.fn(() => rowsQuery);

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn(() => ({
          select: selectMock,
          update: updateMock,
        })),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { approveAllTimelogsForEvent } = await import('./timelogs.service');

    const approved = await approveAllTimelogsForEvent(7);

    expect(updateMock).toHaveBeenCalledWith({ status: 'approved' });
    expect(eqCalls).toEqual([
      ['id', 'stable-timelog-uuid-1'],
      ['id', 'timelog-uuid-2'],
    ]);
    expect(rowsOrder.mock.calls).toEqual([
      ['created_at'],
      ['id'],
    ]);
    expect(approved).toHaveLength(2);
    expect(snapshot.timelogs[0].contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.timelogs[0].status).toBe('approved');
    expect(snapshot.timelogs[1].status).toBe('approved');
    expect(snapshot.timelogs[2].status).toBe('pending_coo');
  });

  it('preserves contractor profile UUIDs during Supabase hydration', async () => {
    let snapshot = createSnapshot([]);
    const updateLocalAppState = vi.fn((updater: (state: typeof snapshot) => typeof snapshot) => {
      snapshot = structuredClone(updater(structuredClone(snapshot)));
      return structuredClone(snapshot);
    });
    const createDoubleOrderMock = <T,>(data: T[]) => {
      const result = Promise.resolve({ data, error: null });
      const order = vi.fn();
      const query = {
        order,
        then: result.then.bind(result),
      };
      order.mockReturnValue(query);
      return query;
    };

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'timelog-row-1',
                      event_id: 'event-row-1',
                      contractor_id: 'profile-uuid-1',
                      km: 12,
                      note: 'Hydrated timelog',
                      status: 'approved',
                    },
                  ],
                  error: null,
                }),
              })),
            };
          }

          if (table === 'timelog_days') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'day-row-1',
                      timelog_id: 'timelog-row-1',
                      date: '2026-04-10',
                      time_from: '08:00',
                      time_to: '16:00',
                      day_type: 'instal',
                    },
                  ],
                  error: null,
                }),
              })),
            };
          }

          if (table === 'profiles') {
            return {
              select: vi.fn(() => createDoubleOrderMock([
                { id: 'profile-uuid-1' },
              ])),
            };
          }

          if (table === 'events') {
            return {
              select: vi.fn(() => createDoubleOrderMock([
                { id: 'event-row-1' },
              ])),
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(() => ({
        id: Number.NaN,
        eid: Number.NaN,
        contractorProfileId: 'profile-uuid-1',
        days: [],
        km: 0,
        note: '',
        status: 'draft',
      })),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState,
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { getTimelogs } = await import('./timelogs.service');

    getTimelogs();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const timelogs = getTimelogs();

    expect(timelogs[0].contractorProfileId).toBe('profile-uuid-1');
    expect(timelogs[0].eid).toBe(1);
    expect(timelogs[0].supabaseId).toBe('timelog-row-1');
    expect(timelogs[0].eventSupabaseId).toBe('event-row-1');
    expect(updateLocalAppState).toHaveBeenCalledOnce();
  });

  it('creates with an explicit event UUID and retains stable IDs for immediate later writes', async () => {
    const harness = await setupStableUuidWriteHarness({
      snapshotEventSupabaseId: 'snapshot-wrong-event-uuid',
    });

    const created = await harness.service.createTimelog({
      eid: 1,
      eventSupabaseId: 'explicit-event-uuid',
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
      km: 0,
      note: '',
      status: 'draft',
    });

    expect(harness.timelogInsert).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'explicit-event-uuid',
    }));
    expect(created).toMatchObject({
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'explicit-event-uuid',
    });
    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'explicit-event-uuid',
    });
    expect(harness.setQueryData).toHaveBeenNthCalledWith(1, ['timelogs'], [expect.objectContaining({
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'explicit-event-uuid',
    })]);

    const saved = await harness.service.saveTimelog({ ...created, note: 'Immediate save' });
    expect(saved).toMatchObject({
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'explicit-event-uuid',
    });
    expect(harness.timelogUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      event_id: 'explicit-event-uuid',
    }));
    expect(harness.timelogUpdateEq).toHaveBeenCalledWith('id', 'created-timelog-uuid');

    await harness.service.updateTimelogStatus(created.id, 'sub');
    await harness.service.deleteTimelog(created.id);

    expect(harness.timelogsSelect).not.toHaveBeenCalled();
    expect(harness.eventsSelect).not.toHaveBeenCalled();
    expect(harness.timelogDeleteEq).toHaveBeenCalledWith('id', 'created-timelog-uuid');
  });

  it('creates with the snapshot event UUID before considering the positional mapping', async () => {
    const harness = await setupStableUuidWriteHarness({
      snapshotEventSupabaseId: 'snapshot-event-uuid',
    });

    const created = await harness.service.createTimelog({
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
      km: 0,
      note: '',
      status: 'draft',
    });

    expect(harness.timelogInsert).toHaveBeenCalledWith(expect.objectContaining({
      event_id: 'snapshot-event-uuid',
    }));
    expect(created).toMatchObject({
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'snapshot-event-uuid',
    });
    expect(harness.eventsSelect).not.toHaveBeenCalled();
  });

  it('repairs missing save identities from the snapshot before later status and delete writes', async () => {
    const harness = await setupStableUuidWriteHarness({
      snapshotEventSupabaseId: 'snapshot-event-uuid',
      timelogs: [{
        id: 1,
        eid: 1,
        supabaseId: 'stable-timelog-uuid',
        eventSupabaseId: 'stale-timelog-event-uuid',
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'draft',
      }],
    });

    const saved = await harness.service.saveTimelog({
      id: 1,
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '17:00', type: 'instal' }],
      km: 12,
      note: 'Repair identities',
      status: 'draft',
    });

    expect(harness.timelogUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      event_id: 'snapshot-event-uuid',
    }));
    expect(harness.timelogUpdateEq).toHaveBeenCalledWith('id', 'stable-timelog-uuid');
    expect(saved).toMatchObject({
      supabaseId: 'stable-timelog-uuid',
      eventSupabaseId: 'snapshot-event-uuid',
    });
    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      supabaseId: 'stable-timelog-uuid',
      eventSupabaseId: 'snapshot-event-uuid',
    });
    expect(harness.setQueryData).toHaveBeenNthCalledWith(1, ['timelogs'], [expect.objectContaining({
      supabaseId: 'stable-timelog-uuid',
      eventSupabaseId: 'snapshot-event-uuid',
    })]);

    await harness.service.updateTimelogStatus(1, 'sub');
    await harness.service.deleteTimelog(1);

    expect(harness.timelogsSelect).not.toHaveBeenCalled();
    expect(harness.eventsSelect).not.toHaveBeenCalled();
    expect(harness.timelogDeleteEq).toHaveBeenCalledWith('id', 'stable-timelog-uuid');
  });

  it('persists timelog edits to Supabase and rewrites timelog days for the mapped row id', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
        km: 10,
        note: 'Puvodni',
        status: 'draft',
      },
    ]);

    const timelogUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const timelogUpdate = vi.fn(() => ({ eq: timelogUpdateEq }));
    const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));
    const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
    const timelogsSelectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-row-1' }],
        error: null,
      })),
    }));
    const profilesSelectMock = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'profile-uuid-1' }],
          error: null,
        })),
      })),
    }));
    const eventsResult = Promise.resolve({
      data: [{ id: 'event-row-1' }],
      error: null,
    });
    const eventsOrder = vi.fn();
    const eventsQuery = {
      order: eventsOrder,
      then: eventsResult.then.bind(eventsResult),
    };
    eventsOrder.mockReturnValue(eventsQuery);
    const eventsSelectMock = vi.fn(() => eventsQuery);

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return {
              select: timelogsSelectMock,
              update: timelogUpdate,
            };
          }

          if (table === 'timelog_days') {
            return {
              delete: timelogDaysDelete,
              insert: timelogDaysInsert,
            };
          }

          if (table === 'profiles') {
            return {
              select: profilesSelectMock,
            };
          }

          if (table === 'events') {
            return {
              select: eventsSelectMock,
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { saveTimelog } = await import('./timelogs.service');

    const updated = await saveTimelog({
      ...snapshot.timelogs[0],
      km: 25,
      note: 'Aktualizovano',
      days: [
        { d: '2026-04-11', f: '09:00', t: '15:00', type: 'provoz' },
        { d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal', note: 'Ranni priprava' },
      ],
    });

    expect(timelogsSelectMock).toHaveBeenCalledWith('id');
    expect(timelogUpdate).toHaveBeenCalledWith({
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      km: 25,
      note: 'Aktualizovano',
      status: 'draft',
    });
    expect(timelogUpdateEq).toHaveBeenCalledWith('id', 'timelog-row-1');
    expect(timelogDaysDeleteEq).toHaveBeenCalledWith('timelog_id', 'timelog-row-1');
    expect(timelogDaysInsert).toHaveBeenCalledWith([
      {
        timelog_id: 'timelog-row-1',
        date: '2026-04-10',
        time_from: '08:00',
        time_to: '18:00',
        day_type: 'instal',
        note: 'Ranni priprava',
      },
      {
        timelog_id: 'timelog-row-1',
        date: '2026-04-11',
        time_from: '09:00',
        time_to: '15:00',
        day_type: 'provoz',
        note: null,
      },
    ]);
    expect(updated.days).toEqual([
      { d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal', note: 'Ranni priprava' },
      { d: '2026-04-11', f: '09:00', t: '15:00', type: 'provoz' },
    ]);
    expect(snapshot.timelogs[0].days).toEqual(updated.days);
    expect(snapshot.timelogs[0].note).toBe('Aktualizovano');
    expect(snapshot.timelogs[0].km).toBe(25);
  });

  it('creates a new timelog when saving an unsaved draft', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'approved',
      },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    const { saveTimelog } = await import('./timelogs.service');

    const created = await saveTimelog({
      id: -1,
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-11', f: '14:00', t: '17:00', type: 'provoz' }],
      km: 0,
      note: 'Novy koncept',
      status: 'draft',
    });

    expect(created.id).toBe(2);
    expect(snapshot.timelogs).toHaveLength(2);
    expect(snapshot.timelogs[1]).toEqual(created);
    expect(snapshot.timelogs[1].days).toEqual([
      { d: '2026-04-11', f: '14:00', t: '17:00', type: 'provoz' },
    ]);
  });

  it('prefers the stable timelog UUID when deleting a saved timelog', async () => {
    let snapshot = {
      ...createSnapshot([
        {
          id: 1,
          eid: 1,
          supabaseId: 'stable-timelog-row',
          contractorProfileId: 'profile-uuid-1',
          days: [{ d: '2026-04-10', f: '23:00', t: '01:00', type: 'provoz' as const }],
          km: 0,
          note: '',
          status: 'draft' as const,
        },
      ]),
      events: [{ id: 1 }],
      contractors: [{ id: 1, profileId: 'profile-uuid-1', name: 'Crew member' }],
    };

    const timelogDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDelete = vi.fn(() => ({ eq: timelogDeleteEq }));
    const timelogUpdate = vi.fn();
    const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));
    const timelogDaysInsert = vi.fn();
    const timelogsSelectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'positionally-wrong-timelog-row' }],
        error: null,
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return {
              select: timelogsSelectMock,
              update: timelogUpdate,
              delete: timelogDelete,
            };
          }

          if (table === 'timelog_days') {
            return {
              delete: timelogDaysDelete,
              insert: timelogDaysInsert,
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { saveTimelog } = await import('./timelogs.service');

    const result = await saveTimelog({
      ...snapshot.timelogs[0],
      days: [],
    });

    expect(timelogsSelectMock).not.toHaveBeenCalled();
    expect(timelogDaysDeleteEq).toHaveBeenCalledWith('timelog_id', 'stable-timelog-row');
    expect(timelogDeleteEq).toHaveBeenCalledWith('id', 'stable-timelog-row');
    expect(timelogUpdate).not.toHaveBeenCalled();
    expect(timelogDaysInsert).not.toHaveBeenCalled();
    expect(result.days).toEqual([]);
    expect(snapshot.timelogs).toEqual([]);
  });

  it('throws when saving a timelog without contractorProfileId', async () => {
    let snapshot = {
      events: [{ id: 1 }],
      contractors: [{ id: 1, profileId: 'profile-uuid-1', name: 'Crew member' }],
      timelogs: [{
        id: 1,
        eid: 1,
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' as const }],
        km: 0,
        note: '',
        status: 'draft' as const,
      }],
      invoices: [],
      receipts: [],
      candidates: [],
      projects: [],
      clients: [],
    };

    const timelogUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const timelogUpdate = vi.fn(() => ({ eq: timelogUpdateEq }));
    const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));
    const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
    const timelogsSelectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-row-1' }],
        error: null,
      })),
    }));
    const eventsSelectMock = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'event-row-1' }],
          error: null,
        })),
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return {
              select: timelogsSelectMock,
              update: timelogUpdate,
            };
          }

          if (table === 'timelog_days') {
            return {
              delete: timelogDaysDelete,
              insert: timelogDaysInsert,
            };
          }

          if (table === 'events') {
            return {
              select: eventsSelectMock,
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { saveTimelog } = await import('./timelogs.service');

    await expect(saveTimelog({
      ...snapshot.timelogs[0],
      note: 'Legacy cid only',
    })).rejects.toThrow('Nepodarilo se dohledat UUID identitu clena crew.');
    expect(timelogUpdate).not.toHaveBeenCalled();
  });
});

describe('timelog Supabase policies', () => {
  it('allows CrewHead to submit draft timelogs to CH review', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/crewhead-timelog-approval-policy.sql'), 'utf8');

    expect(sql).toContain("status in ('draft'::timelog_status, 'pending_ch'::timelog_status)");
  });
});
