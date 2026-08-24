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
  events,
  insertedTimelogSupabaseId = 'created-timelog-uuid',
  timelogInsertResult,
  timelogUpdateResult,
  timelogDaysDeleteResult,
  rpcImplementation,
  authoritativeTimelogs,
}: {
  timelogs?: Timelog[];
  snapshotEventSupabaseId?: string;
  events?: Array<{ id: number; supabaseId?: string }>;
  insertedTimelogSupabaseId?: string;
  timelogInsertResult?: Promise<{ data: { id: string } | null; error: null }>;
  timelogUpdateResult?: Promise<{ data: null; error: null }>;
  timelogDaysDeleteResult?: Promise<{ error: null }>;
  rpcImplementation?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  authoritativeTimelogs?: Timelog[];
}) => {
  const versionedTimelogs = timelogs.map((timelog) => (
    timelog.supabaseId && !timelog.updatedAt
      ? { ...timelog, updatedAt: '2026-08-17T10:00:00.000Z' }
      : timelog
  ));
  let snapshot = {
    ...createSnapshot(versionedTimelogs),
    events: events ?? [{ id: 1, supabaseId: snapshotEventSupabaseId }],
  };
  const setQueryData = vi.fn();
  const invalidateQueries = vi.fn();

  const timelogInsertSingle = vi.fn(() => timelogInsertResult ?? Promise.resolve({
    data: { id: insertedTimelogSupabaseId },
    error: null,
  }));
  const timelogInsertSelect = vi.fn(() => ({ single: timelogInsertSingle }));
  const timelogInsert = vi.fn(() => ({ select: timelogInsertSelect }));
  const timelogUpdateEq = vi.fn((_field: string, value: string) => {
    const result = timelogUpdateResult ?? Promise.resolve({ data: null, error: null });
    return {
      select: vi.fn(async () => {
        await result;
        return { data: [{ id: value }], error: null };
      }),
      then: result.then.bind(result),
    };
  });
  const timelogUpdate = vi.fn(() => ({ eq: timelogUpdateEq }));
  const timelogDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const timelogDelete = vi.fn(() => ({ eq: timelogDeleteEq }));
  const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
  const timelogDaysDeleteEq = vi.fn(() => timelogDaysDeleteResult ?? Promise.resolve({ error: null }));
  const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));

  const authoritativeTimelogRows = authoritativeTimelogs?.map((timelog) => ({
    id: timelog.supabaseId,
    event_id: timelog.eventSupabaseId,
    contractor_id: timelog.contractorProfileId,
    km: timelog.km,
    note: timelog.note,
    status: timelog.status,
    updated_at: timelog.updatedAt,
  }));
  const legacyTimelogResult = Promise.resolve({
    data: authoritativeTimelogRows ?? [{ id: 'positionally-wrong-timelog-uuid' }],
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
  const createOrderedQuery = <T,>(data: T[]) => {
    const result = Promise.resolve({ data, error: null });
    const order = vi.fn();
    const query = { order, then: result.then.bind(result) };
    order.mockReturnValue(query);
    return query;
  };
  const timelogDaysSelect = vi.fn(() => createOrderedQuery([]));
  const profilesSelect = vi.fn(() => createOrderedQuery(
    [...new Set(
      authoritativeTimelogs
        ?.map((timelog) => timelog.contractorProfileId)
        .filter((profileId): profileId is string => Boolean(profileId)) ?? [],
    )].map((id) => ({ id })),
  ));
  const defaultRpcImplementation = async (name: string, args: Record<string, unknown>) => {
    if (name === 'save_timelog_atomic') {
      if (args.p_timelog_id == null) {
        const inserted = await (timelogInsertResult ?? Promise.resolve({
          data: { id: insertedTimelogSupabaseId },
          error: null,
        }));
        return {
          data: inserted.data ? {
            id: inserted.data.id,
            updated_at: '2026-08-17T11:00:00.000Z',
            status: args.p_status,
          } : null,
          error: inserted.error,
        };
      }

      await (timelogUpdateResult ?? Promise.resolve({ data: null, error: null }));
      return {
        data: {
          id: args.p_timelog_id,
          updated_at: '2026-08-17T11:00:00.000Z',
          status: args.p_status,
        },
        error: null,
      };
    }

    if (name === 'transition_timelog_statuses_atomic') {
      await (timelogUpdateResult ?? Promise.resolve({ data: null, error: null }));
      return {
        data: (args.p_targets as Array<{ id: string }>).map((target) => ({
          id: target.id,
          updated_at: '2026-08-17T12:00:00.000Z',
          status: args.p_next_status,
        })),
        error: null,
      };
    }

    if (name === 'delete_timelog_atomic') {
      await (timelogDaysDeleteResult ?? Promise.resolve({ error: null }));
      return {
        data: {
          id: args.p_timelog_id,
          updated_at: args.p_expected_updated_at,
          status: args.p_expected_status,
        },
        error: null,
      };
    }

    throw new Error(`Unexpected RPC ${name}`);
  };
  const rpc = vi.fn(rpcImplementation ?? defaultRpcImplementation);

  vi.doMock('../../../lib/app-config', () => ({
    appDataSource: 'supabase',
  }));

  vi.doMock('../../../lib/supabase', () => ({
    isSupabaseConfigured: true,
    supabase: {
      rpc,
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
            select: timelogDaysSelect,
          };
        }

        if (table === 'events') {
          return {
            select: authoritativeTimelogs
              ? vi.fn(() => createOrderedQuery(
                snapshot.events
                  .filter((event) => event.supabaseId)
                  .map((event) => ({ id: event.supabaseId })),
              ))
              : eventsSelect,
          };
        }

        if (table === 'profiles') {
          return { select: profilesSelect };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    },
  }));

  vi.doMock('../../../lib/supabase-mappers', () => ({
    mapTimelog: vi.fn((row: Record<string, unknown>) => ({
      days: [],
      km: row.km ?? 0,
      note: row.note ?? '',
      status: row.status ?? 'draft',
      updatedAt: row.updated_at,
    })),
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
    setSnapshot: (nextSnapshot: typeof snapshot) => {
      snapshot = structuredClone(nextSnapshot);
    },
    setQueryData,
    timelogInsert,
    timelogUpdate,
    timelogUpdateEq,
    timelogDeleteEq,
    timelogDaysDeleteEq,
    rpc,
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
      updatedAt: '2026-08-17T10:00:00.000Z',
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

  it('rejects an awaitable timelog load reset before response', async () => {
    const rows = createDeferred<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>();
    const createOrderedQuery = <T,>(result: Promise<{ data: T[]; error: null }>) => {
      const order = vi.fn();
      const query = { order, then: result.then.bind(result) };
      order.mockReturnValue(query);
      return query;
    };
    const updateLocalAppState = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => {
            if (table === 'timelogs') return createOrderedQuery(rows.promise);
            if (table === 'timelog_days') return createOrderedQuery(Promise.resolve({ data: [], error: null }));
            if (table === 'profiles') return createOrderedQuery(Promise.resolve({ data: [], error: null }));
            if (table === 'events') return createOrderedQuery(Promise.resolve({ data: [], error: null }));
            throw new Error(`Unexpected table ${table}`);
          }),
        })),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => createSnapshot([]),
      updateLocalAppState,
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { loadSupabaseTimelogs, resetSupabaseTimelogsHydration } = await import('./timelogs.service');

    const staleLoad = loadSupabaseTimelogs();
    resetSupabaseTimelogsHydration();
    rows.resolve({ data: [], error: null });

    await expect(staleLoad).rejects.toThrow('Timelog hydration scope changed.');
    expect(updateLocalAppState).not.toHaveBeenCalled();
  });

  it('invalidates an older public fetch after a successful status mutation', async () => {
    const targetTimelog: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'target-timelog-row',
      eventSupabaseId: 'event-row-1',
      contractorProfileId: 'profile-uuid-1',
      days: [],
      km: 0,
      note: 'Current',
      status: 'draft',
      updatedAt: '2026-08-17T10:00:00.000Z',
    };
    let snapshot = {
      ...createSnapshot([targetTimelog]),
      events: [{ id: 1, supabaseId: 'event-row-1' }],
    };
    const staleFetch = createDeferred<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>();
    const createOrderedQuery = <T,>(result: Promise<{ data: T[]; error: null }>) => {
      const order = vi.fn();
      const query = { order, then: result.then.bind(result) };
      order.mockReturnValue(query);
      return query;
    };
    const timelogSelect = vi.fn(() => createOrderedQuery(staleFetch.promise));
    const statusSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'target-timelog-row' }],
      error: null,
    });
    const statusEq = vi.fn(() => ({ select: statusSelect }));
    const timelogUpdate = vi.fn(() => ({ eq: statusEq }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => ({
          data: (args.p_targets as Array<{ id: string }>).map(({ id }) => ({
            id,
            updated_at: '2026-08-17T11:00:00.000Z',
            status: args.p_next_status,
          })),
          error: null,
        })),
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return { select: timelogSelect, update: timelogUpdate };
          }
          if (table === 'timelog_days') {
            return { select: vi.fn(() => createOrderedQuery(Promise.resolve({ data: [], error: null }))) };
          }
          if (table === 'profiles') {
            return { select: vi.fn(() => createOrderedQuery(Promise.resolve({ data: [{ id: 'profile-uuid-1' }], error: null }))) };
          }
          if (table === 'events') {
            return { select: vi.fn(() => createOrderedQuery(Promise.resolve({ data: [{ id: 'event-row-1' }], error: null }))) };
          }
          throw new Error(`Unexpected table ${table}`);
        }),
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
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData: vi.fn(),
        invalidateQueries: vi.fn(),
      },
    }));
    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: { timelogs: { all: ['timelogs'] } },
    }));

    const { fetchTimelogsSnapshot, updateTimelogStatus } = await import('./timelogs.service');
    const oldFetch = fetchTimelogsSnapshot();
    await vi.waitFor(() => expect(timelogSelect).toHaveBeenCalledOnce());

    await updateTimelogStatus(1, 'sub');
    staleFetch.resolve({
      data: [{
        id: 'target-timelog-row',
        event_id: 'event-row-1',
        contractor_id: 'profile-uuid-1',
        status: 'draft',
      }],
      error: null,
    });

    await expect(oldFetch).resolves.toEqual([
      expect.objectContaining({ supabaseId: 'target-timelog-row', status: 'pending_ch' }),
    ]);
    expect(snapshot.timelogs).toEqual([
      expect.objectContaining({ supabaseId: 'target-timelog-row', status: 'pending_ch' }),
    ]);
  });

  it('updates timelog status in Supabase using the mapped row id', async () => {
    const harness = await setupStableUuidWriteHarness({
      timelogs: [{
        id: 1,
        eid: 1,
        supabaseId: 'timelog-uuid-1',
        eventSupabaseId: 'event-uuid-1',
        contractorProfileId: 'profile-uuid-1',
        days: [],
        km: 0,
        note: '',
        status: 'draft',
      }],
    });

    const result = await harness.service.updateTimelogStatus(1, 'sub');

    expect(harness.rpc).toHaveBeenCalledWith('transition_timelog_statuses_atomic', {
      p_targets: [{
        id: 'timelog-uuid-1',
        expected_updated_at: '2026-08-17T10:00:00.000Z',
      }],
      p_expected_status: 'draft',
      p_next_status: 'pending_ch',
    });
    expect(result.status).toBe('pending_ch');
    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      contractorProfileId: 'profile-uuid-1',
      status: 'pending_ch',
      updatedAt: '2026-08-17T12:00:00.000Z',
    });
  });

  it('keeps local state unchanged when the atomic status RPC reports a conflict', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await setupStableUuidWriteHarness({
      timelogs: [{
        id: 1,
        eid: 1,
        supabaseId: 'timelog-uuid-1',
        eventSupabaseId: 'event-uuid-1',
        contractorProfileId: 'profile-uuid-1',
        days: [],
        km: 0,
        note: '',
        status: 'draft',
      }],
      rpcImplementation: async () => ({
        data: null,
        error: { message: 'timelog_mutation_conflict' },
      }),
    });

    await expect(harness.service.updateTimelogStatus(1, 'sub')).rejects.toThrow(
      'Výkaz se mezitím změnil. Obnovte data a zkuste to znovu.',
    );

    expect(harness.getSnapshot().timelogs[0].status).toBe('draft');
    consoleError.mockRestore();
  });

  it('approves all matching event timelogs in Supabase and updates local state', async () => {
    const harness = await setupStableUuidWriteHarness({
      timelogs: [
        { id: 1, eid: 7, supabaseId: 'timelog-uuid-1', contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'pending_coo' },
        { id: 2, eid: 7, supabaseId: 'timelog-uuid-2', contractorProfileId: 'profile-uuid-2', days: [], km: 0, note: '', status: 'pending_coo' },
        { id: 3, eid: 8, supabaseId: 'timelog-uuid-3', contractorProfileId: 'profile-uuid-3', days: [], km: 0, note: '', status: 'pending_coo' },
      ],
    });

    const approved = await harness.service.approveAllTimelogsForEvent(7);

    expect(harness.rpc).toHaveBeenCalledOnce();
    expect(harness.rpc).toHaveBeenCalledWith('transition_timelog_statuses_atomic', {
      p_targets: [
        { id: 'timelog-uuid-1', expected_updated_at: '2026-08-17T10:00:00.000Z' },
        { id: 'timelog-uuid-2', expected_updated_at: '2026-08-17T10:00:00.000Z' },
      ],
      p_expected_status: 'pending_coo',
      p_next_status: 'approved',
    });
    expect(approved).toHaveLength(2);
    expect(harness.getSnapshot().timelogs.map(({ status }) => status)).toEqual([
      'approved',
      'approved',
      'pending_coo',
    ]);
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

  it('creates with an explicit event UUID, repairs its local event ID, and retains stable IDs', async () => {
    const harness = await setupStableUuidWriteHarness({
      events: [
        { id: 1, supabaseId: 'event-b-uuid' },
        { id: 2, supabaseId: 'explicit-event-uuid' },
      ],
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

    expect(harness.rpc).toHaveBeenCalledWith('save_timelog_atomic', expect.objectContaining({
      p_timelog_id: null,
      p_event_id: 'explicit-event-uuid',
    }));
    expect(created).toMatchObject({
      eid: 2,
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'explicit-event-uuid',
    });
    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      eid: 2,
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'explicit-event-uuid',
    });
    expect(harness.setQueryData).toHaveBeenNthCalledWith(1, ['timelogs'], [expect.objectContaining({
      eid: 2,
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'explicit-event-uuid',
    })]);

    const saved = await harness.service.saveTimelog({ ...created, note: 'Immediate save' });
    expect(saved).toMatchObject({
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'explicit-event-uuid',
    });
    expect(harness.rpc).toHaveBeenCalledWith('save_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'created-timelog-uuid',
      p_event_id: 'explicit-event-uuid',
    }));

    await harness.service.updateTimelogStatus(created.id, 'sub');
    await harness.service.deleteTimelog(created.id);

    expect(harness.timelogsSelect).not.toHaveBeenCalled();
    expect(harness.eventsSelect).not.toHaveBeenCalled();
    expect(harness.rpc).toHaveBeenCalledWith('delete_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'created-timelog-uuid',
    }));
  });

  it('rejects a Supabase create without an explicit canonical event UUID', async () => {
    const harness = await setupStableUuidWriteHarness({
      snapshotEventSupabaseId: 'snapshot-event-uuid',
    });

    await expect(harness.service.createTimelog({
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
      km: 0,
      note: '',
      status: 'draft',
    })).rejects.toThrow('Nepodarilo se sparovat akci s databazovym zaznamem.');

    expect(harness.rpc).not.toHaveBeenCalled();
    expect(harness.eventsSelect).not.toHaveBeenCalled();
  });

  it('reloads and updates an existing rejected pair instead of inserting a duplicate', async () => {
    const eventSupabaseId = 'event-uuid-rejected';
    const contractorProfileId = 'profile-uuid-1';
    const harness = await setupStableUuidWriteHarness({
      timelogs: [],
      events: [{ id: 4, supabaseId: eventSupabaseId }],
      authoritativeTimelogs: [{
        id: 8,
        eid: 4,
        supabaseId: 'rejected-timelog-uuid',
        eventSupabaseId,
        contractorProfileId,
        days: [{ d: '2026-06-10', f: '08:00', t: '17:00', type: 'provoz' }],
        km: 0,
        note: 'Vráceno CH',
        status: 'rejected',
        updatedAt: '2026-08-19T11:20:57.284Z',
      }],
    });

    const saved = await harness.service.saveTimelog({
      id: -1,
      eid: 99,
      eventSupabaseId,
      contractorProfileId,
      days: [{ d: '2026-06-10', f: '08:00', t: '18:00', type: 'provoz' }],
      km: 0,
      note: 'Opraveno Crew',
      status: 'pending_ch',
    });

    expect(harness.rpc).toHaveBeenCalledWith('save_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'rejected-timelog-uuid',
      p_event_id: eventSupabaseId,
      p_contractor_id: contractorProfileId,
      p_expected_updated_at: '2026-08-19T11:20:57.284Z',
      p_expected_status: 'rejected',
      p_status: 'pending_ch',
    }));
    expect(saved).toMatchObject({
      id: 1,
      supabaseId: 'rejected-timelog-uuid',
      eventSupabaseId,
      contractorProfileId,
      status: 'pending_ch',
    });
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

    expect(harness.rpc).toHaveBeenCalledWith('save_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'stable-timelog-uuid',
      p_event_id: 'snapshot-event-uuid',
    }));
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
    expect(harness.rpc).toHaveBeenCalledWith('delete_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'stable-timelog-uuid',
    }));
  });

  it('reconciles a stale reindexed save by timelog UUID without overwriting the new numeric occupant', async () => {
    const currentTimelogB: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'timelog-b-uuid',
      eventSupabaseId: 'event-b-uuid',
      contractorProfileId: 'profile-b',
      days: [{ d: '2026-04-10', f: '08:00', t: '12:00', type: 'provoz' }],
      km: 0,
      note: 'Current B',
      status: 'draft',
      updatedAt: '2026-08-17T10:00:00.000Z',
    };
    const currentTimelogA: Timelog = {
      id: 2,
      eid: 2,
      supabaseId: 'timelog-a-uuid',
      eventSupabaseId: 'event-a-uuid',
      contractorProfileId: 'profile-a',
      days: [{ d: '2026-04-10', f: '13:00', t: '17:00', type: 'instal' }],
      km: 0,
      note: 'Current A',
      status: 'draft',
    };
    const harness = await setupStableUuidWriteHarness({
      events: [
        { id: 1, supabaseId: 'event-b-uuid' },
        { id: 2, supabaseId: 'event-a-uuid' },
      ],
      timelogs: [currentTimelogB, currentTimelogA],
    });

    const saved = await harness.service.saveTimelog({
      ...currentTimelogA,
      id: 1,
      eid: 1,
      eventSupabaseId: 'event-a-uuid',
      note: 'Saved stale A',
    });

    expect(harness.rpc).toHaveBeenCalledWith('save_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'timelog-a-uuid',
    }));
    expect(saved).toMatchObject({
      id: 2,
      eid: 2,
      supabaseId: 'timelog-a-uuid',
      eventSupabaseId: 'event-a-uuid',
      note: 'Saved stale A',
    });
    expect(harness.getSnapshot().timelogs).toEqual([
      currentTimelogB,
      expect.objectContaining({
        id: 2,
        eid: 2,
        supabaseId: 'timelog-a-uuid',
        eventSupabaseId: 'event-a-uuid',
        note: 'Saved stale A',
      }),
    ]);
    expect(harness.setQueryData).toHaveBeenLastCalledWith(['timelogs'], [
      currentTimelogB,
      expect.objectContaining({
        id: 2,
        eid: 2,
        supabaseId: 'timelog-a-uuid',
        eventSupabaseId: 'event-a-uuid',
        note: 'Saved stale A',
      }),
    ]);
    expect(harness.timelogsSelect).not.toHaveBeenCalled();
  });

  it('deletes a stale reindexed empty timelog by UUID and removes its current local row', async () => {
    const currentTimelogB: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'timelog-b-uuid',
      eventSupabaseId: 'event-b-uuid',
      contractorProfileId: 'profile-b',
      days: [{ d: '2026-04-10', f: '08:00', t: '12:00', type: 'provoz' }],
      km: 0,
      note: 'Current B',
      status: 'draft',
      updatedAt: '2026-08-17T10:00:00.000Z',
    };
    const currentTimelogA: Timelog = {
      id: 2,
      eid: 2,
      supabaseId: 'timelog-a-uuid',
      eventSupabaseId: 'event-a-uuid',
      contractorProfileId: 'profile-a',
      days: [{ d: '2026-04-10', f: '13:00', t: '17:00', type: 'instal' }],
      km: 0,
      note: 'Current A',
      status: 'draft',
    };
    const harness = await setupStableUuidWriteHarness({
      events: [
        { id: 1, supabaseId: 'event-b-uuid' },
        { id: 2, supabaseId: 'event-a-uuid' },
      ],
      timelogs: [currentTimelogB, currentTimelogA],
    });

    const deleted = await harness.service.saveTimelog({
      ...currentTimelogA,
      id: 1,
      eid: 1,
      eventSupabaseId: 'event-a-uuid',
      days: [],
    });

    expect(deleted).toMatchObject({
      id: 2,
      eid: 2,
      supabaseId: 'timelog-a-uuid',
      eventSupabaseId: 'event-a-uuid',
      days: [],
    });
    expect(harness.rpc).toHaveBeenCalledWith('delete_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'timelog-a-uuid',
    }));
    expect(harness.getSnapshot().timelogs).toEqual([currentTimelogB]);
    expect(harness.setQueryData).toHaveBeenLastCalledWith(['timelogs'], [currentTimelogB]);
    expect(harness.timelogsSelect).not.toHaveBeenCalled();
  });

  it('merges a pending create by returned UUID against a refreshed current snapshot', async () => {
    const insertDeferred = createDeferred<{ data: { id: string } | null; error: null }>();
    const currentOtherTimelog: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'other-timelog-uuid',
      eventSupabaseId: 'other-event-uuid',
      contractorProfileId: 'profile-other',
      days: [{ d: '2026-04-10', f: '08:00', t: '12:00', type: 'provoz' }],
      km: 0,
      note: 'Other current row',
      status: 'draft',
    };
    const hydratedCreatedTimelog: Timelog = {
      id: 2,
      eid: 2,
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'target-event-uuid',
      contractorProfileId: 'profile-target',
      days: [],
      km: 0,
      note: '',
      status: 'draft',
    };
    const harness = await setupStableUuidWriteHarness({
      events: [{ id: 1, supabaseId: 'target-event-uuid' }],
      timelogInsertResult: insertDeferred.promise,
    });

    const createPromise = harness.service.createTimelog({
      eid: 1,
      eventSupabaseId: 'target-event-uuid',
      contractorProfileId: 'profile-target',
      days: [{ d: '2026-04-10', f: '13:00', t: '17:00', type: 'instal' }],
      km: 12,
      note: 'Created while refreshing',
      status: 'draft',
    });
    await vi.waitFor(() => expect(harness.rpc).toHaveBeenCalledOnce());

    harness.setSnapshot({
      ...createSnapshot([currentOtherTimelog, hydratedCreatedTimelog]),
      events: [
        { id: 1, supabaseId: 'other-event-uuid' },
        { id: 2, supabaseId: 'target-event-uuid' },
      ],
    });
    insertDeferred.resolve({ data: { id: 'created-timelog-uuid' }, error: null });

    const created = await createPromise;

    expect(created).toMatchObject({
      id: 2,
      eid: 2,
      supabaseId: 'created-timelog-uuid',
      eventSupabaseId: 'target-event-uuid',
      note: 'Created while refreshing',
    });
    expect(harness.getSnapshot().timelogs).toEqual([
      currentOtherTimelog,
      expect.objectContaining({
        id: 2,
        eid: 2,
        supabaseId: 'created-timelog-uuid',
        note: 'Created while refreshing',
      }),
    ]);
  });

  it('reconciles a save by UUID when a refresh reindexes rows during the write', async () => {
    const updateDeferred = createDeferred<{ data: null; error: null }>();
    const initialTimelog: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'target-timelog-uuid',
      eventSupabaseId: 'target-event-uuid',
      contractorProfileId: 'profile-target',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
      km: 0,
      note: 'Initial target',
      status: 'draft',
    };
    const currentOtherTimelog: Timelog = {
      ...initialTimelog,
      id: 1,
      supabaseId: 'other-timelog-uuid',
      eventSupabaseId: 'other-event-uuid',
      contractorProfileId: 'profile-other',
      note: 'Current other row',
    };
    const currentTargetTimelog: Timelog = { ...initialTimelog, id: 2, eid: 2 };
    const harness = await setupStableUuidWriteHarness({
      events: [{ id: 1, supabaseId: 'target-event-uuid' }],
      timelogs: [initialTimelog],
      timelogUpdateResult: updateDeferred.promise,
    });

    const savePromise = harness.service.saveTimelog({
      ...initialTimelog,
      note: 'Saved while refreshing',
    });
    await vi.waitFor(() => expect(harness.rpc).toHaveBeenCalledOnce());

    harness.setSnapshot({
      ...createSnapshot([currentOtherTimelog, currentTargetTimelog]),
      events: [
        { id: 1, supabaseId: 'other-event-uuid' },
        { id: 2, supabaseId: 'target-event-uuid' },
      ],
    });
    updateDeferred.resolve({ data: null, error: null });

    const saved = await savePromise;

    expect(saved).toMatchObject({
      id: 2,
      eid: 2,
      supabaseId: 'target-timelog-uuid',
      eventSupabaseId: 'target-event-uuid',
      note: 'Saved while refreshing',
    });
    expect(harness.getSnapshot().timelogs).toEqual([
      currentOtherTimelog,
      expect.objectContaining({
        id: 2,
        eid: 2,
        supabaseId: 'target-timelog-uuid',
        note: 'Saved while refreshing',
      }),
    ]);
  });

  it('updates status by UUID when a refresh reindexes rows during the write', async () => {
    const updateDeferred = createDeferred<{ data: null; error: null }>();
    const initialTarget: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'target-timelog-uuid',
      eventSupabaseId: 'target-event-uuid',
      contractorProfileId: 'profile-target',
      days: [],
      km: 0,
      note: 'Target',
      status: 'draft',
    };
    const currentOther: Timelog = {
      ...initialTarget,
      id: 1,
      supabaseId: 'other-timelog-uuid',
      contractorProfileId: 'profile-other',
      note: 'Other',
    };
    const currentTarget: Timelog = { ...initialTarget, id: 2 };
    const harness = await setupStableUuidWriteHarness({
      snapshotEventSupabaseId: 'target-event-uuid',
      timelogs: [initialTarget],
      timelogUpdateResult: updateDeferred.promise,
    });

    const statusPromise = harness.service.updateTimelogStatus(1, 'sub');
    await vi.waitFor(() => expect(harness.rpc).toHaveBeenCalledOnce());
    harness.setSnapshot({
      ...createSnapshot([currentOther, currentTarget]),
      events: [{ id: 1, supabaseId: 'target-event-uuid' }],
    });
    updateDeferred.resolve({ data: null, error: null });

    const updated = await statusPromise;

    expect(updated).toMatchObject({ id: 2, supabaseId: 'target-timelog-uuid', status: 'pending_ch' });
    expect(harness.getSnapshot().timelogs).toEqual([
      currentOther,
      expect.objectContaining({ id: 2, supabaseId: 'target-timelog-uuid', status: 'pending_ch' }),
    ]);
  });

  it('deletes by UUID when a refresh reindexes rows during the write', async () => {
    const deleteDeferred = createDeferred<{ error: null }>();
    const initialTarget: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'target-timelog-uuid',
      eventSupabaseId: 'target-event-uuid',
      contractorProfileId: 'profile-target',
      days: [],
      km: 0,
      note: 'Target',
      status: 'draft',
    };
    const currentOther: Timelog = {
      ...initialTarget,
      id: 1,
      supabaseId: 'other-timelog-uuid',
      contractorProfileId: 'profile-other',
      note: 'Other',
    };
    const currentTarget: Timelog = { ...initialTarget, id: 2 };
    const harness = await setupStableUuidWriteHarness({
      snapshotEventSupabaseId: 'target-event-uuid',
      timelogs: [initialTarget],
      timelogDaysDeleteResult: deleteDeferred.promise,
    });

    const deletePromise = harness.service.deleteTimelog(1);
    await vi.waitFor(() => expect(harness.rpc).toHaveBeenCalledOnce());
    harness.setSnapshot({
      ...createSnapshot([currentOther, currentTarget]),
      events: [{ id: 1, supabaseId: 'target-event-uuid' }],
    });
    deleteDeferred.resolve({ error: null });

    await deletePromise;

    expect(harness.rpc).toHaveBeenCalledWith('delete_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'target-timelog-uuid',
    }));
    expect(harness.getSnapshot().timelogs).toEqual([currentOther]);
  });

  it('updates a batch by stable UUIDs when a refresh reindexes rows during the writes', async () => {
    const updateDeferred = createDeferred<{ data: null; error: null }>();
    const initialTarget: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'target-timelog-uuid',
      eventSupabaseId: 'target-event-uuid',
      contractorProfileId: 'profile-target',
      days: [],
      km: 0,
      note: 'Target',
      status: 'approved',
    };
    const currentOther: Timelog = {
      ...initialTarget,
      id: 1,
      supabaseId: 'other-timelog-uuid',
      contractorProfileId: 'profile-other',
      note: 'Other',
    };
    const currentTarget: Timelog = { ...initialTarget, id: 2 };
    const harness = await setupStableUuidWriteHarness({
      snapshotEventSupabaseId: 'target-event-uuid',
      timelogs: [initialTarget],
      timelogUpdateResult: updateDeferred.promise,
    });

    const batchPromise = harness.service.markTimelogsAsInvoiced([1]);
    await vi.waitFor(() => expect(harness.rpc).toHaveBeenCalledOnce());
    harness.setSnapshot({
      ...createSnapshot([currentOther, currentTarget]),
      events: [{ id: 1, supabaseId: 'target-event-uuid' }],
    });
    updateDeferred.resolve({ data: null, error: null });

    const updated = await batchPromise;

    expect(updated).toEqual([
      expect.objectContaining({ id: 2, supabaseId: 'target-timelog-uuid', status: 'invoiced' }),
    ]);
    expect(harness.getSnapshot().timelogs).toEqual([
      currentOther,
      expect.objectContaining({ id: 2, supabaseId: 'target-timelog-uuid', status: 'invoiced' }),
    ]);
  });

  it('persists timelog edits to Supabase and rewrites timelog days for the mapped row id', async () => {
    const original: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'timelog-row-1',
      eventSupabaseId: 'event-row-1',
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
      km: 10,
      note: 'Puvodni',
      status: 'draft',
    };
    const harness = await setupStableUuidWriteHarness({
      events: [{ id: 1, supabaseId: 'event-row-1' }],
      timelogs: [original],
    });

    const updated = await harness.service.saveTimelog({
      ...original,
      km: 25,
      note: 'Aktualizovano',
      days: [
        { d: '2026-04-11', f: '09:00', t: '15:00', type: 'provoz' },
        { d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal', note: 'Ranni priprava' },
      ],
    });

    expect(harness.rpc).toHaveBeenCalledWith('save_timelog_atomic', {
      p_timelog_id: 'timelog-row-1',
      p_event_id: 'event-row-1',
      p_contractor_id: 'profile-uuid-1',
      p_expected_updated_at: '2026-08-17T10:00:00.000Z',
      p_expected_status: 'draft',
      p_km: 25,
      p_note: 'Aktualizovano',
      p_status: 'draft',
      p_days: [
      {
        date: '2026-04-10',
        time_from: '08:00',
        time_to: '18:00',
        day_type: 'instal',
        note: 'Ranni priprava',
      },
      {
        date: '2026-04-11',
        time_from: '09:00',
        time_to: '15:00',
        day_type: 'provoz',
        note: null,
      },
      ],
    });
    expect(updated.days).toEqual([
      { d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal', note: 'Ranni priprava' },
      { d: '2026-04-11', f: '09:00', t: '15:00', type: 'provoz' },
    ]);
    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      days: updated.days,
      note: 'Aktualizovano',
      km: 25,
      updatedAt: '2026-08-17T11:00:00.000Z',
    });
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
    const original: Timelog = {
      id: 1,
      eid: 1,
      supabaseId: 'stable-timelog-row',
      eventSupabaseId: 'event-row-1',
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '23:00', t: '01:00', type: 'provoz' }],
      km: 0,
      note: '',
      status: 'draft',
    };
    const harness = await setupStableUuidWriteHarness({
      timelogs: [original],
      events: [{ id: 1, supabaseId: 'event-row-1' }],
    });

    const result = await harness.service.saveTimelog({
      ...original,
      days: [],
    });

    expect(harness.rpc).toHaveBeenCalledWith('delete_timelog_atomic', {
      p_timelog_id: 'stable-timelog-row',
      p_expected_updated_at: '2026-08-17T10:00:00.000Z',
      p_expected_status: 'draft',
    });
    expect(harness.timelogsSelect).not.toHaveBeenCalled();
    expect(result.days).toEqual([]);
    expect(harness.getSnapshot().timelogs).toEqual([]);
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
