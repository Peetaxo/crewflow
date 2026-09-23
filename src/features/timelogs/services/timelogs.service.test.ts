import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, Timelog, TimelogApproval } from '../../../types';

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
  contractors = [],
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
  contractors?: Contractor[];
}) => {
  const versionedTimelogs = timelogs.map((timelog) => (
    timelog.supabaseId && !timelog.updatedAt
      ? { ...timelog, updatedAt: '2026-08-17T10:00:00.000Z' }
      : timelog
  ));
  let snapshot = {
    ...createSnapshot(versionedTimelogs),
    contractors,
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
  const timelogApprovalsSelect = vi.fn(() => createOrderedQuery([]));
  const profilesSelect = vi.fn(() => Object.assign(createOrderedQuery(
    [...new Set(
      authoritativeTimelogs
        ?.map((timelog) => timelog.contractorProfileId)
        .filter((profileId): profileId is string => Boolean(profileId)) ?? [],
    )].map((id) => ({ id })),
  ), {
    eq: vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'profile-uuid-1' }, error: null }),
    })),
  }));
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

    if (name === 'resolve_timelog_approvals_atomic') {
      await (timelogUpdateResult ?? Promise.resolve({ data: null, error: null }));
      return {
        data: (args.p_targets as Array<{ id: string }>).map((target) => ({
          id: target.id,
          updated_at: '2026-08-17T12:00:00.000Z',
          status: args.p_resolution === 'approved' ? 'approved' : 'rejected',
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
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-uuid-1' } },
          error: null,
        }),
      },
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

        if (table === 'timelog_approvals') {
          return { select: timelogApprovalsSelect };
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
    mapTimelogApproval: vi.fn(),
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

  describe.each(['local', 'supabase'] as const)('complete hours in %s mode', (source) => {
    const complete: Timelog = {
      id: 1, eid: 1, supabaseId: 'timelog-1', eventSupabaseId: 'event-1',
      contractorProfileId: 'profile-1', updatedAt: 'v1', status: 'draft', km: 0, note: '',
      days: [{ d: '2026-09-01', f: '22:00', t: '6:00', type: 'instal' }],
    };
    const incomplete: Timelog = { ...complete, id: 2, supabaseId: 'timelog-2', days: [{ ...complete.days[0], t: '' }] };
    const setup = async (timelogs = [complete, incomplete]) => {
      const harness = await setupStableUuidWriteHarness({
        timelogs,
        snapshotEventSupabaseId: 'event-1',
        contractors: source === 'local'
          ? [targetedContractor('profile-1', 'user-1')]
          : [],
      });
      if (source === 'supabase') return harness;
      vi.resetModules();
      vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
      return { ...harness, service: await import('./timelogs.service') };
    };

    it.each(['pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid'] as const)('rejects incomplete save/create with intended status %s without changing input', async (status) => {
      const harness = await setup();
      const submitted = { ...incomplete, status };
      await expect(harness.service.saveTimelog(submitted)).rejects.toThrow('Doplňte platný čas od a do');
      await expect(harness.service.createTimelog(submitted)).rejects.toThrow('Doplňte platný čas od a do');
      expect(submitted.days[0].t).toBe('');
      expect(harness.getSnapshot().timelogs[1]).toEqual(incomplete);
      expect(harness.rpc).not.toHaveBeenCalled();
    });

    it('rejects zero-day submission before the empty-draft deletion branch', async () => {
      const harness = await setup();
      await expect(harness.service.saveTimelog({ ...incomplete, days: [], status: 'pending_ch' }))
        .rejects.toThrow('Doplňte alespoň jeden záznam hodin.');
      expect(harness.getSnapshot().timelogs).toHaveLength(2);
      expect(harness.rpc).not.toHaveBeenCalled();
    });

    it('rejects invoicing and paid transitions for the complete batch before writing', async () => {
      const harness = await setup();
      await expect(harness.service.markTimelogsAsInvoiced([1, 2])).rejects.toThrow('Doplňte platný čas');
      await expect(harness.service.markTimelogsAsPaid([1, 2])).rejects.toThrow('Doplňte platný čas');
      expect(harness.getSnapshot().timelogs).toEqual([complete, incomplete]);
      expect(harness.rpc).not.toHaveBeenCalled();
    });

    it.each(['sub', 'ch', 'coo'] as const)('validates every row before a bulk or single %s transition', async (action) => {
      const harness = await setup();
      await expect(harness.service.updateTimelogStatuses([1, 2], action)).rejects.toThrow('Doplňte platný čas od a do');
      await expect(harness.service.updateTimelogStatus(2, action)).rejects.toThrow('Doplňte platný čas od a do');
      expect(harness.getSnapshot().timelogs).toEqual([complete, incomplete]);
      expect(harness.rpc).not.toHaveBeenCalled();
    });

    it('validates approval imports and approve-all before mutations', async () => {
      const items = [complete, incomplete].map((item) => ({ ...item, status: 'pending_coo' as const }));
      const harness = await setup(items);
      await expect(harness.service.importApprovedTimelog(incomplete)).rejects.toThrow('Doplňte platný čas od a do');
      await expect(harness.service.approveAllTimelogsForEvent(1, {
        currentProfileId: 'profile-1',
      })).rejects.toThrow('Doplňte platný čas od a do');
      expect(harness.getSnapshot().timelogs).toEqual(items);
      expect(harness.rpc).not.toHaveBeenCalled();
    });

    it.each(['draft', 'rejected', 'pending_crew_confirmation'] as const)('preserves partial actuals saved as %s', async (status) => {
      const harness = await setup();
      const saved = await harness.service.saveTimelog({ ...incomplete, status });
      expect(saved.days).toEqual(incomplete.days);
      expect(saved.status).toBe(status);
    });
  });

  it('loads stable Supabase timelog identity and approval history without matching local numeric ids', async () => {
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
      review_note: 'Opravte přestávku.',
      status: 'draft',
      submitted_at: null,
      approved_at: null,
      created_at: '2026-04-20T07:00:00Z',
      updated_at: '2026-04-20T09:00:00Z',
    }]);
    const timelogDaysQuery = createOrderedQuery([{
      id: 'timelog-day-row-1',
      timelog_id: 'timelog-row-1',
      date: '2026-04-20',
      time_from: '08:00',
      time_to: '17:00',
      day_type: 'instal',
      note: null,
      created_at: '2026-04-20T07:00:00Z',
    }]);
    const timelogApprovalsQuery = createOrderedQuery([{
      id: 'approval-row-1',
      handoff_batch_id: 'batch-row-1',
      approval_round_id: 'round-row-1',
      timelog_id: 'timelog-row-1',
      approver_profile_id: 'approver-profile-1',
      approver_user_id: 'approver-user-1',
      requested_by_profile_id: 'requester-profile-1',
      requested_by_user_id: 'requester-user-1',
      status: 'pending',
      requested_at: '2026-04-20T08:00:00Z',
      resolved_at: null,
      resolved_timelog_expected_updated_at: null,
      resolved_approval_expected_updated_at: null,
      superseded_at: null,
      note: '',
      updated_at: '2026-04-20T08:00:00Z',
    }, {
      id: 'approval-for-local-id',
      handoff_batch_id: 'batch-local-id',
      approval_round_id: 'round-local-id',
      timelog_id: '1',
      approver_profile_id: 'approver-profile-1',
      approver_user_id: 'approver-user-1',
      requested_by_profile_id: 'requester-profile-1',
      requested_by_user_id: 'requester-user-1',
      status: 'pending',
      requested_at: '2026-04-20T08:00:00Z',
      resolved_at: null,
      resolved_timelog_expected_updated_at: null,
      resolved_approval_expected_updated_at: null,
      superseded_at: null,
      note: '',
      updated_at: '2026-04-20T08:00:00Z',
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
            if (table === 'timelog_approvals') return timelogApprovalsQuery;
            if (table === 'profiles') return profilesQuery;
            if (table === 'events') return eventsQuery;
            throw new Error(`Unexpected table ${table}`);
          }),
        })),
      },
    }));

    vi.doUnmock('../../../lib/supabase-mappers');

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
      reviewNote: 'Opravte přestávku.',
      approvals: [expect.objectContaining({
        id: 'approval-row-1',
        timelogId: 'timelog-row-1',
        status: 'pending',
      })],
    })]);
    expect(eventsQuery.order.mock.calls).toEqual([
      ['date_from'],
      ['name'],
      ['id'],
    ]);
    expect(updateLocalAppState).not.toHaveBeenCalled();
  });

  it('propagates approval history query failures from authoritative reloads', async () => {
    const createOrderedQuery = (table: string) => {
      const result = Promise.resolve({
        data: [],
        error: table === 'timelog_approvals' ? { message: 'approval history unavailable' } : null,
      });
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
          select: vi.fn(() => createOrderedQuery(table)),
        })),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => createSnapshot([]),
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { loadTimelogsSnapshot } = await import('./timelogs.service');
    await expect(loadTimelogsSnapshot()).rejects.toThrow('approval history unavailable');
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
            if (table === 'timelog_approvals') return createOrderedQuery(Promise.resolve({ data: [], error: null }));
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
            if (table === 'timelog_approvals') return createOrderedQuery(Promise.resolve({ data: [], error: null }));
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
      days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' }],
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
          if (table === 'timelog_approvals') {
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
        days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' }],
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
        days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' }],
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
    const first = { id: 1, eid: 7, supabaseId: '11111111-1111-4111-8111-111111111111', contractorProfileId: 'profile-uuid-1', days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' as const }], km: 0, note: '', status: 'pending_coo' as const, approvals: [] };
    const second = { id: 2, eid: 7, supabaseId: '22222222-2222-4222-8222-222222222222', contractorProfileId: 'profile-uuid-2', days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' as const }], km: 0, note: '', status: 'pending_coo' as const, approvals: [] };
    const unrelated = { id: 3, eid: 8, supabaseId: '33333333-3333-4333-8333-333333333333', contractorProfileId: 'profile-uuid-3', days: [], km: 0, note: '', status: 'pending_coo' as const, approvals: [] };
    const harness = await setupStableUuidWriteHarness({
      timelogs: [first, second, unrelated],
      authoritativeTimelogs: [
        { ...first, status: 'approved' },
        { ...second, status: 'approved' },
        unrelated,
      ],
    });

    const approved = await harness.service.approveAllTimelogsForEvent(7);

    expect(harness.rpc).toHaveBeenCalledOnce();
    expect(harness.rpc).toHaveBeenLastCalledWith('resolve_timelog_approvals_atomic', {
      p_targets: [
        { id: '11111111-1111-4111-8111-111111111111', expected_updated_at: '2026-08-17T10:00:00.000Z', approval_id: null, approval_updated_at: null },
        { id: '22222222-2222-4222-8222-222222222222', expected_updated_at: '2026-08-17T10:00:00.000Z', approval_id: null, approval_updated_at: null },
      ],
      p_resolution: 'approved',
      p_note: '',
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

          if (table === 'timelog_approvals') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
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
    expect(timelogs[0].approvals).toEqual([]);
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
      days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' }],
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
      days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' }],
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

const TARGETED_IDS = {
  timelog1: '11111111-1111-4111-8111-111111111111',
  timelog2: '22222222-2222-4222-8222-222222222222',
  event1: '33333333-3333-4333-8333-333333333333',
  requester: '44444444-4444-4444-8444-444444444444',
  approver: '55555555-5555-4555-8555-555555555555',
  otherApprover: '66666666-6666-4666-8666-666666666666',
  contractor1: '77777777-7777-4777-8777-777777777777',
  contractor2: '88888888-8888-4888-8888-888888888888',
  approval1: '99999999-9999-4999-8999-999999999999',
  approval2: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  round1: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  round2: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const;

const targetedEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 7,
  supabaseId: TARGETED_IDS.event1,
  name: 'Targeted approval event',
  job: 'TARGET-1',
  startDate: '2026-09-21',
  endDate: '2026-09-21',
  city: 'Praha',
  needed: 2,
  filled: 2,
  status: 'upcoming',
  client: 'Klient',
  contactProfileId: TARGETED_IDS.approver,
  contactApprovesHours: true,
  timelogApproverProfileId: null,
  ...overrides,
});

const targetedContractor = (
  profileId: string,
  userId: string,
  overrides: Partial<Contractor> = {},
): Contractor => ({
  id: 1,
  profileId,
  userId,
  name: profileId,
  ii: 'TA',
  bg: '#000',
  fg: '#fff',
  tags: [],
  events: 1,
  rate: 250,
  phone: '',
  email: '',
  ico: '',
  dic: '',
  bank: '',
  city: 'Praha',
  reliable: true,
  note: '',
  ...overrides,
});

const targetedApproval = (overrides: Partial<TimelogApproval> = {}): TimelogApproval => ({
  id: TARGETED_IDS.approval1,
  approvalRoundId: TARGETED_IDS.round1,
  timelogId: TARGETED_IDS.timelog1,
  approverProfileId: TARGETED_IDS.approver,
  approverUserId: 'approver-user',
  status: 'pending',
  requestedByProfileId: TARGETED_IDS.requester,
  requestedByUserId: 'requester-user',
  requestedAt: '2026-09-21T09:00:00.000Z',
  resolvedAt: null,
  supersededAt: null,
  note: '',
  updatedAt: '2026-09-21T09:00:00.000Z',
  ...overrides,
});

const targetedTimelog = (overrides: Partial<Timelog> = {}): Timelog => ({
  id: 47,
  eid: 7,
  supabaseId: TARGETED_IDS.timelog1,
  eventSupabaseId: TARGETED_IDS.event1,
  contractorProfileId: TARGETED_IDS.contractor1,
  updatedAt: '2026-09-21T10:00:00.000Z',
  days: [{ d: '2026-09-21', f: '08:00', t: '17:00', type: 'provoz' }],
  km: 0,
  note: '',
  status: 'pending_ch',
  approvals: [],
  ...overrides,
});

const setupTargetedRemoteHarness = async ({
  timelogs,
  authoritativeTimelogs = timelogs,
  events = [targetedEvent()],
  contractors,
  authenticatedProfileId = TARGETED_IDS.requester,
  handoffImplementation,
  resolveImplementation,
}: {
  timelogs: Timelog[];
  authoritativeTimelogs?: Timelog[];
  events?: Event[];
  contractors?: Contractor[];
  authenticatedProfileId?: string | null;
  handoffImplementation?: (targets: Array<Record<string, unknown>>) => Promise<Array<Record<string, unknown>>>;
  resolveImplementation?: (input: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
}) => {
  let snapshot = {
    ...createSnapshot(timelogs),
    events,
    contractors: contractors ?? [
      targetedContractor(TARGETED_IDS.requester, 'requester-user'),
      targetedContractor(TARGETED_IDS.approver, 'approver-user', { id: 2 }),
      targetedContractor(TARGETED_IDS.otherApprover, 'other-user', { id: 3 }),
    ],
  };
  const setQueryData = vi.fn();
  const invalidateQueries = vi.fn();
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: 'authenticated-user' } },
    error: null,
  });
  const maybeSingleProfile = vi.fn().mockResolvedValue({
    data: authenticatedProfileId ? { id: authenticatedProfileId } : null,
    error: null,
  });
  const profileEq = vi.fn(() => ({ maybeSingle: maybeSingleProfile }));
  let authoritativeReadCount = 0;

  const createOrderedQuery = <T,>(data: T[]) => {
    const result = Promise.resolve({ data, error: null });
    const order = vi.fn();
    const query = { order, then: result.then.bind(result) };
    order.mockReturnValue(query);
    return query;
  };
  const from = vi.fn((table: string) => ({
    select: vi.fn((columns: string) => {
      if (table === 'profiles' && columns === 'id') {
        const query = createOrderedQuery(snapshot.contractors
          .flatMap((contractor) => contractor.profileId ? [{ id: contractor.profileId }] : []));
        return Object.assign(query, { eq: profileEq });
      }
      authoritativeReadCount += 1;
      if (table === 'timelogs') {
        return createOrderedQuery(authoritativeTimelogs.map((timelog) => ({
          id: timelog.supabaseId,
          event_id: timelog.eventSupabaseId,
          contractor_id: timelog.contractorProfileId,
          km: timelog.km,
          note: timelog.note,
          review_note: timelog.reviewNote ?? null,
          status: timelog.status,
          updated_at: timelog.updatedAt,
        })));
      }
      if (table === 'timelog_days') {
        return createOrderedQuery(authoritativeTimelogs.flatMap((timelog) => timelog.days.map((day, index) => ({
          id: `${timelog.supabaseId}-day-${index}`,
          timelog_id: timelog.supabaseId,
          date: day.d,
          time_from: day.f,
          time_to: day.t,
          day_type: day.type,
          note: day.note ?? null,
        }))));
      }
      if (table === 'timelog_approvals') {
        return createOrderedQuery(authoritativeTimelogs.flatMap((timelog) => (
          (timelog.approvals ?? []).map((approval) => ({
            ...approval,
            timelog_id: timelog.supabaseId,
          }))
        )));
      }
      if (table === 'events') {
        return createOrderedQuery(events.flatMap((event) => event.supabaseId ? [{ id: event.supabaseId }] : []));
      }
      throw new Error(`Unexpected read table ${table}`);
    }),
  }));

  const handoffTimelogsForApprovalAtomicRpc = vi.fn(handoffImplementation ?? (async (targets) => targets.map((target) => ({
    id: target.id,
    updated_at: '2026-09-21T11:00:00.000Z',
    status: 'pending_coo',
    approval_id: target.approvalId,
    approval_round_id: target.approvalRoundId,
    approval_status: 'pending',
    approval_updated_at: '2026-09-21T11:00:00.000Z',
  }))));
  const resolveTimelogApprovalsAtomicRpc = vi.fn(resolveImplementation ?? (async (input) => (
    (input.targets as Array<Record<string, unknown>>).map((target) => ({
      id: target.id,
      updated_at: '2026-09-21T12:00:00.000Z',
      status: input.resolution === 'approved' ? 'approved' : 'rejected',
    }))
  )));
  const transitionTimelogStatusesAtomicRpc = vi.fn(async (input: {
    targets: Array<{ id: string }>;
    nextStatus: string;
  }) => input.targets.map(({ id }) => ({
    id,
    updated_at: '2026-09-21T13:00:00.000Z',
    status: input.nextStatus,
  })));

  vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
  vi.doMock('../../../lib/supabase', () => ({
    isSupabaseConfigured: true,
    supabase: { auth: { getUser }, from },
  }));
  vi.doMock('./timelog-approval-rpc.service', () => ({
    handoffTimelogsForApprovalAtomicRpc,
    resolveTimelogApprovalsAtomicRpc,
  }));
  vi.doMock('./timelog-mutation-rpc.service', () => ({
    transitionTimelogStatusesAtomicRpc,
    saveTimelogAtomicRpc: vi.fn(),
    deleteTimelogAtomicRpc: vi.fn(),
    importApprovedTimelogAtomicRpc: vi.fn(),
  }));
  vi.doMock('../../../lib/supabase-mappers', () => ({
    mapTimelog: (row: Record<string, unknown>, days: Array<Record<string, unknown>>) => ({
      id: Number.NaN,
      eid: Number.NaN,
      days: days.map((day) => ({
        d: day.date,
        f: day.time_from,
        t: day.time_to,
        type: day.day_type,
        note: day.note ?? '',
      })),
      km: row.km,
      note: row.note,
      reviewNote: row.review_note ?? undefined,
      status: row.status,
      updatedAt: row.updated_at,
    }),
    mapTimelogApproval: (row: TimelogApproval) => structuredClone(row),
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
    queryClient: { setQueryData, invalidateQueries },
  }));
  vi.doMock('../../../lib/query-keys', () => ({ queryKeys: { timelogs: { all: ['timelogs'] } } }));

  return {
    service: await import('./timelogs.service'),
    getSnapshot: () => structuredClone(snapshot),
    getUser,
    profileEq,
    from,
    handoffTimelogsForApprovalAtomicRpc,
    resolveTimelogApprovalsAtomicRpc,
    transitionTimelogStatusesAtomicRpc,
    getAuthoritativeReadCount: () => authoritativeReadCount,
  };
};

const setupTargetedLocalHarness = async ({
  timelogs,
  events = [targetedEvent()],
}: {
  timelogs: Timelog[];
  events?: Event[];
}) => {
  let snapshot = {
    ...createSnapshot(timelogs),
    events,
    contractors: [
      targetedContractor(TARGETED_IDS.requester, 'requester-user'),
      targetedContractor(TARGETED_IDS.approver, 'approver-user', { id: 2 }),
      targetedContractor(TARGETED_IDS.otherApprover, 'other-user', { id: 3 }),
    ],
  };
  const handoffTimelogsForApprovalAtomicRpc = vi.fn();
  const resolveTimelogApprovalsAtomicRpc = vi.fn();
  const transitionTimelogStatusesAtomicRpc = vi.fn();

  vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
  vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
  vi.doMock('./timelog-approval-rpc.service', () => ({
    handoffTimelogsForApprovalAtomicRpc,
    resolveTimelogApprovalsAtomicRpc,
  }));
  vi.doMock('./timelog-mutation-rpc.service', () => ({
    transitionTimelogStatusesAtomicRpc,
    saveTimelogAtomicRpc: vi.fn(),
    deleteTimelogAtomicRpc: vi.fn(),
    importApprovedTimelogAtomicRpc: vi.fn(),
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
    queryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn() },
  }));
  vi.doMock('../../../lib/query-keys', () => ({ queryKeys: { timelogs: { all: ['timelogs'] } } }));

  return {
    service: await import('./timelogs.service'),
    getSnapshot: () => structuredClone(snapshot),
    handoffTimelogsForApprovalAtomicRpc,
    resolveTimelogApprovalsAtomicRpc,
  };
};

describe('targeted timelog approval action routing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('exports TimelogAction and routes remote CH handoff with stable tokens before reloading canonical data', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce(TARGETED_IDS.approval1)
      .mockReturnValueOnce(TARGETED_IDS.round1);
    vi.stubGlobal('crypto', { randomUUID });
    const canonicalApproval = targetedApproval();
    const canonical = targetedTimelog({
      id: 1,
      status: 'pending_coo',
      updatedAt: '2026-09-21T11:00:00.000Z',
      approvals: [canonicalApproval],
    });
    const initial = targetedTimelog({ id: 47 });
    const harness = await setupTargetedRemoteHarness({
      timelogs: [initial],
      authoritativeTimelogs: [canonical],
    });

    const result = await harness.service.updateTimelogStatus(47, 'ch', {
      currentProfileId: TARGETED_IDS.otherApprover,
    });

    expect(harness.getUser).toHaveBeenCalledOnce();
    expect(harness.profileEq).toHaveBeenCalledWith('user_id', 'authenticated-user');
    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(harness.handoffTimelogsForApprovalAtomicRpc).toHaveBeenCalledWith([{
      id: TARGETED_IDS.timelog1,
      expectedUpdatedAt: '2026-09-21T10:00:00.000Z',
      approvalId: TARGETED_IDS.approval1,
      approvalRoundId: TARGETED_IDS.round1,
    }]);
    expect(harness.transitionTimelogStatusesAtomicRpc).not.toHaveBeenCalled();
    expect(harness.getAuthoritativeReadCount()).toBe(4);
    expect(result).toMatchObject({
      id: 47,
      supabaseId: TARGETED_IDS.timelog1,
      status: 'pending_coo',
      approvals: [expect.objectContaining({ id: TARGETED_IDS.approval1 })],
    });
  });

  it('routes targeted COO approval and return with exact active approval tokens and trimmed note', async () => {
    const active = targetedApproval();
    const pending = targetedTimelog({ status: 'pending_coo', approvals: [active] });
    const approvedHarness = await setupTargetedRemoteHarness({
      timelogs: [pending],
      authoritativeTimelogs: [targetedTimelog({ status: 'approved', approvals: [{ ...active, status: 'approved' }] })],
      authenticatedProfileId: TARGETED_IDS.approver,
    });

    await approvedHarness.service.updateTimelogStatus(47, 'coo');

    expect(approvedHarness.resolveTimelogApprovalsAtomicRpc).toHaveBeenCalledWith({
      targets: [{
        id: TARGETED_IDS.timelog1,
        expectedUpdatedAt: '2026-09-21T10:00:00.000Z',
        approvalId: TARGETED_IDS.approval1,
        approvalUpdatedAt: '2026-09-21T09:00:00.000Z',
      }],
      resolution: 'approved',
      note: '',
    });

    vi.resetModules();
    const returnHarness = await setupTargetedRemoteHarness({
      timelogs: [pending],
      authoritativeTimelogs: [targetedTimelog({
        status: 'rejected',
        reviewNote: 'Opravte pauzu.',
        approvals: [{ ...active, status: 'returned', note: 'Opravte pauzu.' }],
      })],
      authenticatedProfileId: TARGETED_IDS.approver,
    });
    const returned = await returnHarness.service.updateTimelogStatus(47, 'rej', {
      note: '  Opravte pauzu.  ',
      currentProfileId: TARGETED_IDS.otherApprover,
    });

    expect(returnHarness.resolveTimelogApprovalsAtomicRpc).toHaveBeenCalledWith({
      targets: [{
        id: TARGETED_IDS.timelog1,
        expectedUpdatedAt: '2026-09-21T10:00:00.000Z',
        approvalId: TARGETED_IDS.approval1,
        approvalUpdatedAt: '2026-09-21T09:00:00.000Z',
      }],
      resolution: 'returned',
      note: 'Opravte pauzu.',
    });
    expect(returned.reviewNote).toBe('Opravte pauzu.');
  });

  it('routes legacy zero-history COO resolution with null approval tokens', async () => {
    const legacy = targetedTimelog({ status: 'pending_coo', approvals: [] });
    const harness = await setupTargetedRemoteHarness({
      timelogs: [legacy],
      authoritativeTimelogs: [targetedTimelog({ status: 'approved', approvals: [] })],
      authenticatedProfileId: TARGETED_IDS.approver,
    });

    await harness.service.updateTimelogStatus(47, 'coo');

    expect(harness.resolveTimelogApprovalsAtomicRpc).toHaveBeenCalledWith({
      targets: [{
        id: TARGETED_IDS.timelog1,
        expectedUpdatedAt: '2026-09-21T10:00:00.000Z',
        approvalId: null,
        approvalUpdatedAt: null,
      }],
      resolution: 'approved',
      note: '',
    });
  });

  it('fails closed before RPC for a wrong authenticated assignee, multiple active approvals, or missing event approver', async () => {
    const pending = targetedTimelog({ status: 'pending_coo', approvals: [targetedApproval()] });
    const wrongAssignee = await setupTargetedRemoteHarness({
      timelogs: [pending],
      authenticatedProfileId: TARGETED_IDS.otherApprover,
    });
    await expect(wrongAssignee.service.updateTimelogStatus(47, 'coo', {
      currentProfileId: TARGETED_IDS.approver,
    })).rejects.toThrow('Tento výkaz čeká na jiného schvalovatele.');
    expect(wrongAssignee.resolveTimelogApprovalsAtomicRpc).not.toHaveBeenCalled();
    expect(wrongAssignee.getAuthoritativeReadCount()).toBe(4);

    vi.resetModules();
    const ambiguous = await setupTargetedRemoteHarness({
      timelogs: [targetedTimelog({
        status: 'pending_coo',
        approvals: [targetedApproval(), targetedApproval({ id: TARGETED_IDS.approval2 })],
      })],
      authenticatedProfileId: TARGETED_IDS.approver,
    });
    await expect(ambiguous.service.updateTimelogStatus(47, 'coo'))
      .rejects.toThrow('Schválení výkazu není jednoznačné.');
    expect(ambiguous.resolveTimelogApprovalsAtomicRpc).not.toHaveBeenCalled();

    vi.resetModules();
    const missingApprover = await setupTargetedRemoteHarness({
      timelogs: [targetedTimelog()],
      events: [targetedEvent({ contactProfileId: null })],
    });
    await expect(missingApprover.service.updateTimelogStatus(47, 'ch'))
      .rejects.toThrow('Akce nemá nastaveného schvalovatele hodin.');
    expect(missingApprover.handoffTimelogsForApprovalAtomicRpc).not.toHaveBeenCalled();
    expect(missingApprover.getUser).not.toHaveBeenCalled();
    expect(missingApprover.getAuthoritativeReadCount()).toBe(0);
  });

  it('reloads server truth after an uncertain approval RPC failure and rethrows the same error object', async () => {
    const uncertain = { message: 'connection lost after commit', details: 'unknown result' };
    const active = targetedApproval();
    const harness = await setupTargetedRemoteHarness({
      timelogs: [targetedTimelog({ status: 'pending_coo', approvals: [active] })],
      authoritativeTimelogs: [targetedTimelog({
        status: 'approved',
        updatedAt: '2026-09-21T12:00:00.000Z',
        approvals: [{ ...active, status: 'approved' }],
      })],
      authenticatedProfileId: TARGETED_IDS.approver,
      resolveImplementation: async () => { throw uncertain; },
    });

    await expect(harness.service.updateTimelogStatus(47, 'coo')).rejects.toBe(uncertain);

    expect(harness.getAuthoritativeReadCount()).toBe(4);
    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      id: 47,
      status: 'approved',
      updatedAt: '2026-09-21T12:00:00.000Z',
    });
  });

  it('serializes overlapping targeted mutations and reuses the first request UUIDs until it settles', async () => {
    const handoff = createDeferred<Array<Record<string, unknown>>>();
    const randomUUID = vi.fn()
      .mockReturnValueOnce(TARGETED_IDS.approval1)
      .mockReturnValueOnce(TARGETED_IDS.round1);
    vi.stubGlobal('crypto', { randomUUID });
    const harness = await setupTargetedRemoteHarness({
      timelogs: [targetedTimelog()],
      authoritativeTimelogs: [targetedTimelog({
        status: 'pending_coo',
        updatedAt: '2026-09-21T11:00:00.000Z',
        approvals: [targetedApproval()],
      })],
      handoffImplementation: async () => handoff.promise,
    });

    const first = harness.service.updateTimelogStatus(47, 'ch');
    const second = harness.service.updateTimelogStatus(47, 'ch');
    await vi.waitFor(() => expect(harness.handoffTimelogsForApprovalAtomicRpc).toHaveBeenCalledOnce());
    expect(randomUUID).toHaveBeenCalledTimes(2);

    handoff.resolve([{
      id: TARGETED_IDS.timelog1,
      updated_at: '2026-09-21T11:00:00.000Z',
      status: 'pending_coo',
      approval_id: TARGETED_IDS.approval1,
      approval_round_id: TARGETED_IDS.round1,
      approval_status: 'pending',
      approval_updated_at: '2026-09-21T11:00:00.000Z',
    }]);

    await expect(first).resolves.toMatchObject({ id: 47, status: 'pending_coo' });
    await expect(second).rejects.toThrow('Vybrané výkazy nelze schválit společně.');
    expect(harness.handoffTimelogsForApprovalAtomicRpc).toHaveBeenCalledOnce();
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it('rejects ambiguous mixed return batches without partially routing either mutation path', async () => {
    const harness = await setupTargetedRemoteHarness({
      timelogs: [
        targetedTimelog({ id: 47, status: 'pending_coo', approvals: [targetedApproval()] }),
        targetedTimelog({ id: 9, supabaseId: TARGETED_IDS.timelog2, status: 'pending_ch' }),
      ],
      authenticatedProfileId: TARGETED_IDS.approver,
    });

    await expect(harness.service.updateTimelogStatuses([47, 9], 'rej', { note: 'Opravit.' }))
      .rejects.toThrow('Vybrané výkazy nelze schválit společně.');
    expect(harness.resolveTimelogApprovalsAtomicRpc).not.toHaveBeenCalled();
    expect(harness.transitionTimelogStatusesAtomicRpc).not.toHaveBeenCalled();
    expect(harness.getSnapshot().timelogs.map(({ status }) => status)).toEqual(['pending_coo', 'pending_ch']);
  });

  it('bulk-approves only targeted reports assigned to the authenticated profile plus deliberate legacy rows', async () => {
    const mine = targetedTimelog({ approvals: [targetedApproval()], status: 'pending_coo' });
    const someoneElses = targetedTimelog({
      id: 9,
      supabaseId: TARGETED_IDS.timelog2,
      contractorProfileId: TARGETED_IDS.contractor2,
      days: [{ d: '2026-09-21', f: '08:00', t: '', type: 'provoz' }],
      approvals: [targetedApproval({
        id: TARGETED_IDS.approval2,
        approvalRoundId: TARGETED_IDS.round2,
        timelogId: TARGETED_IDS.timelog2,
        approverProfileId: TARGETED_IDS.otherApprover,
      })],
      status: 'pending_coo',
    });
    const legacy = targetedTimelog({ id: 12, supabaseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'pending_coo' });
    const harness = await setupTargetedRemoteHarness({
      timelogs: [mine, someoneElses, legacy],
      authoritativeTimelogs: [
        { ...mine, status: 'approved' },
        someoneElses,
        { ...legacy, status: 'approved' },
      ],
      authenticatedProfileId: TARGETED_IDS.approver,
    });

    const approved = await harness.service.approveAllTimelogsForEvent(7, {
      currentProfileId: TARGETED_IDS.otherApprover,
    });

    expect(harness.resolveTimelogApprovalsAtomicRpc).toHaveBeenCalledWith(expect.objectContaining({
      targets: [
        expect.objectContaining({ id: TARGETED_IDS.timelog1, approvalId: TARGETED_IDS.approval1 }),
        expect.objectContaining({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', approvalId: null }),
      ],
      resolution: 'approved',
    }));
    expect(approved.map(({ id }) => id)).toEqual([47, 12]);
  });

  it('keeps non-approval status routing on the existing transition RPC', async () => {
    const draft = targetedTimelog({ status: 'draft' });
    const harness = await setupTargetedRemoteHarness({ timelogs: [draft] });

    await harness.service.updateTimelogStatus(47, 'sub');

    expect(harness.transitionTimelogStatusesAtomicRpc).toHaveBeenCalledOnce();
    expect(harness.handoffTimelogsForApprovalAtomicRpc).not.toHaveBeenCalled();
    expect(harness.resolveTimelogApprovalsAtomicRpc).not.toHaveBeenCalled();
  });

  it('mirrors single-assignee handoff and resolution locally with stable synthetic approval metadata', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T10:30:00.000Z'));
    const randomUUID = vi.fn()
      .mockReturnValueOnce(TARGETED_IDS.approval1)
      .mockReturnValueOnce(TARGETED_IDS.round1);
    vi.stubGlobal('crypto', { randomUUID });
    const handoffHarness = await setupTargetedLocalHarness({ timelogs: [targetedTimelog()] });

    const handedOff = await handoffHarness.service.updateTimelogStatus(47, 'ch', {
      currentProfileId: TARGETED_IDS.requester,
    });

    expect(handedOff).toMatchObject({
      status: 'pending_coo',
      approvals: [expect.objectContaining({
        id: TARGETED_IDS.approval1,
        approvalRoundId: TARGETED_IDS.round1,
        approverProfileId: TARGETED_IDS.approver,
        requestedByProfileId: TARGETED_IDS.requester,
        status: 'pending',
        requestedAt: '2026-09-21T10:30:00.000Z',
        updatedAt: '2026-09-21T10:30:00.000Z',
      })],
    });
    expect(handoffHarness.handoffTimelogsForApprovalAtomicRpc).not.toHaveBeenCalled();

    vi.resetModules();
    const resolutionHarness = await setupTargetedLocalHarness({ timelogs: [handedOff] });
    const returned = await resolutionHarness.service.updateTimelogStatus(47, 'rej', {
      currentProfileId: TARGETED_IDS.approver,
      note: '  Opravte pauzu.  ',
    });
    expect(returned).toMatchObject({
      status: 'rejected',
      reviewNote: 'Opravte pauzu.',
      approvals: [expect.objectContaining({
        status: 'returned',
        note: 'Opravte pauzu.',
        resolvedAt: '2026-09-21T10:30:00.000Z',
      })],
    });
    expect(resolutionHarness.resolveTimelogApprovalsAtomicRpc).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('uses the stable event UUID exclusively when a stale numeric event id points elsewhere', async () => {
    const staleNumericEvent = targetedEvent({
      supabaseId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      contactProfileId: TARGETED_IDS.otherApprover,
    });
    const stableEvent = targetedEvent({
      id: 99,
      supabaseId: TARGETED_IDS.event1,
      contactProfileId: TARGETED_IDS.approver,
    });
    const randomUUID = vi.fn()
      .mockReturnValueOnce(TARGETED_IDS.approval1)
      .mockReturnValueOnce(TARGETED_IDS.round1);
    vi.stubGlobal('crypto', { randomUUID });
    const harness = await setupTargetedLocalHarness({
      timelogs: [targetedTimelog({ eid: staleNumericEvent.id })],
      events: [staleNumericEvent, stableEvent],
    });

    const handedOff = await harness.service.updateTimelogStatus(47, 'ch', {
      currentProfileId: TARGETED_IDS.requester,
    });

    expect(handedOff.approvals).toEqual([
      expect.objectContaining({ approverProfileId: TARGETED_IDS.approver }),
    ]);
  });

  it('validates an entire local resolution batch before changing any report', async () => {
    const mine = targetedTimelog({ status: 'pending_coo', approvals: [targetedApproval()] });
    const other = targetedTimelog({
      id: 9,
      supabaseId: TARGETED_IDS.timelog2,
      status: 'pending_coo',
      approvals: [targetedApproval({
        id: TARGETED_IDS.approval2,
        approvalRoundId: TARGETED_IDS.round2,
        timelogId: TARGETED_IDS.timelog2,
        approverProfileId: TARGETED_IDS.otherApprover,
      })],
    });
    const harness = await setupTargetedLocalHarness({ timelogs: [mine, other] });

    await expect(harness.service.updateTimelogStatuses([47, 9], 'coo', {
      currentProfileId: TARGETED_IDS.approver,
    })).rejects.toThrow('Tento výkaz čeká na jiného schvalovatele.');
    expect(harness.getSnapshot().timelogs).toEqual([mine, other]);
  });

  it('bulk-approves only the local assignee reports and deliberate legacy rows', async () => {
    const mine = targetedTimelog({ status: 'pending_coo', approvals: [targetedApproval()] });
    const other = targetedTimelog({
      id: 9,
      supabaseId: TARGETED_IDS.timelog2,
      status: 'pending_coo',
      days: [{ d: '2026-09-21', f: '08:00', t: '', type: 'provoz' }],
      approvals: [targetedApproval({
        id: TARGETED_IDS.approval2,
        approvalRoundId: TARGETED_IDS.round2,
        timelogId: TARGETED_IDS.timelog2,
        approverProfileId: TARGETED_IDS.otherApprover,
      })],
    });
    const legacy = targetedTimelog({ id: 12, supabaseId: undefined, status: 'pending_coo', approvals: [] });
    const harness = await setupTargetedLocalHarness({ timelogs: [mine, other, legacy] });

    const approved = await harness.service.approveAllTimelogsForEvent(7, {
      currentProfileId: TARGETED_IDS.approver,
    });

    expect(approved.map(({ id }) => id)).toEqual([47, 12]);
    expect(harness.getSnapshot().timelogs.map(({ status }) => status)).toEqual([
      'approved',
      'pending_coo',
      'approved',
    ]);
  });
});

describe('timelog Supabase policies', () => {
  it('allows CrewHead to submit draft timelogs to CH review', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/crewhead-timelog-approval-policy.sql'), 'utf8');

    expect(sql).toContain("status in ('draft'::timelog_status, 'pending_ch'::timelog_status)");
  });
});
