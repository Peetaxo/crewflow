import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timelog, TimelogStatus } from '../../../types';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const createSnapshot = (timelogs: Timelog[]) => ({
  events: [
    { id: 1, supabaseId: 'event-uuid-1' },
    { id: 2, supabaseId: 'event-uuid-2' },
  ],
  contractors: [],
  timelogs,
  invoices: [],
  receipts: [],
  candidates: [],
  projects: [],
  clients: [],
});

const makeTimelog = (overrides: Partial<Timelog> = {}): Timelog => ({
  id: 1,
  eid: 1,
  supabaseId: 'timelog-uuid-1',
  eventSupabaseId: 'event-uuid-1',
  contractorProfileId: 'profile-uuid-1',
  updatedAt: '2026-08-17T10:00:00.000Z',
  days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' }],
  km: 0,
  note: '',
  status: 'draft',
  ...overrides,
});

const setupAtomicHarness = async ({
  timelogs,
  saveImplementation,
  statusImplementation,
  deleteImplementation,
  importImplementation,
  authoritativeTimelogs = timelogs,
  authoritativeReadGate,
}: {
  timelogs: Timelog[];
  saveImplementation?: (...args: unknown[]) => Promise<unknown>;
  statusImplementation?: (...args: unknown[]) => Promise<unknown>;
  deleteImplementation?: (...args: unknown[]) => Promise<unknown>;
  importImplementation?: (...args: unknown[]) => Promise<unknown>;
  authoritativeTimelogs?: Timelog[];
  authoritativeReadGate?: Promise<void>;
}) => {
  let snapshot = createSnapshot(timelogs);
  const setQueryData = vi.fn();
  const invalidateQueries = vi.fn();
  const saveTimelogAtomicRpc = vi.fn(saveImplementation ?? (async (input: unknown) => {
    const current = input as { timelogId: string | null; status: TimelogStatus };
    return {
      id: current.timelogId ?? 'created-timelog-uuid',
      updated_at: '2026-08-17T11:00:00.000Z',
      status: current.status,
    };
  }));
  const transitionTimelogStatusesAtomicRpc = vi.fn(
    statusImplementation ?? (async (input: unknown) => {
      const current = input as {
        targets: Array<{ id: string }>;
        nextStatus: TimelogStatus;
      };
      return current.targets.map(({ id }, index) => ({
        id,
        updated_at: `2026-08-17T12:00:0${index}.000Z`,
        status: current.nextStatus,
      }));
    }),
  );
  const deleteTimelogAtomicRpc = vi.fn(
    deleteImplementation ?? (async (input: unknown) => {
      const current = input as { id: string; expectedUpdatedAt: string; expectedStatus: TimelogStatus };
      return {
        id: current.id,
        updated_at: current.expectedUpdatedAt,
        status: current.expectedStatus,
      };
    }),
  );
  const importApprovedTimelogAtomicRpc = vi.fn(
    importImplementation ?? (async (input: unknown) => {
      const current = input as { timelogId: string | null };
      return {
        id: current.timelogId ?? 'imported-timelog-uuid',
        updated_at: '2026-08-17T13:00:00.000Z',
        status: 'approved' as const,
      };
    }),
  );

  const createOrderedQuery = <T,>(data: T[]) => {
    const response = (async () => {
      await authoritativeReadGate;
      return { data, error: null };
    })();
    const order = vi.fn();
    const query = { order, then: response.then.bind(response) };
    order.mockReturnValue(query);
    return query;
  };
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => {
      if (table === 'timelogs') {
        return createOrderedQuery(authoritativeTimelogs.map((timelog) => ({
          id: timelog.supabaseId,
          event_id: timelog.eventSupabaseId,
          contractor_id: timelog.contractorProfileId,
          km: timelog.km,
          note: timelog.note,
          status: timelog.status,
          updated_at: timelog.updatedAt,
        })));
      }
      if (table === 'timelog_days') {
        return createOrderedQuery(authoritativeTimelogs.flatMap((timelog) => (
          timelog.days.map((day, index) => ({
            id: `${timelog.supabaseId}-day-${index}`,
            timelog_id: timelog.supabaseId,
            date: day.d,
            time_from: day.f,
            time_to: day.t,
            day_type: day.type,
            note: day.note ?? null,
          }))
        )));
      }
      if (table === 'profiles') {
        return createOrderedQuery([{ id: 'profile-uuid-1' }, { id: 'profile-uuid-2' }]);
      }
      if (table === 'events') {
        return createOrderedQuery([{ id: 'event-uuid-1' }, { id: 'event-uuid-2' }]);
      }
      throw new Error(`Unexpected read table ${table}`);
    }),
  }));

  vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
  vi.doMock('../../../lib/supabase', () => ({
    isSupabaseConfigured: true,
    supabase: { from },
  }));
  vi.doMock('./timelog-mutation-rpc.service', () => ({
    saveTimelogAtomicRpc,
    transitionTimelogStatusesAtomicRpc,
    deleteTimelogAtomicRpc,
    importApprovedTimelogAtomicRpc,
  }));
  vi.doMock('../../../lib/supabase-mappers', () => ({
    mapTimelog: (row: Record<string, unknown>, dayRows: Array<Record<string, unknown>>) => ({
      id: Number.NaN,
      eid: Number.NaN,
      contractorProfileId: row.contractor_id,
      updatedAt: row.updated_at,
      days: dayRows.map((day) => ({
        d: day.date,
        f: day.time_from,
        t: day.time_to,
        type: day.day_type,
        note: day.note ?? '',
      })),
      km: row.km,
      note: row.note,
      status: row.status,
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
    queryClient: { setQueryData, invalidateQueries },
  }));
  vi.doMock('../../../lib/query-keys', () => ({
    queryKeys: { timelogs: { all: ['timelogs'] } },
  }));

  return {
    service: await import('./timelogs.service'),
    saveTimelogAtomicRpc,
    transitionTimelogStatusesAtomicRpc,
    deleteTimelogAtomicRpc,
    importApprovedTimelogAtomicRpc,
    from,
    getSnapshot: () => structuredClone(snapshot),
  };
};

describe('timelog atomic write coordination', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates parent and days through one RPC and stores the canonical version', async () => {
    const harness = await setupAtomicHarness({ timelogs: [] });

    const created = await harness.service.createTimelog({
      eid: 1,
      eventSupabaseId: 'event-uuid-1',
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz' }],
      km: 0,
      note: '',
      status: 'draft',
    });

    expect(harness.saveTimelogAtomicRpc).toHaveBeenCalledOnce();
    expect(harness.saveTimelogAtomicRpc).toHaveBeenCalledWith(expect.objectContaining({
      timelogId: null,
      eventId: 'event-uuid-1',
      contractorId: 'profile-uuid-1',
      expectedUpdatedAt: null,
      expectedStatus: null,
    }));
    expect(created).toMatchObject({
      supabaseId: 'created-timelog-uuid',
      updatedAt: '2026-08-17T11:00:00.000Z',
    });
    expect(harness.from).not.toHaveBeenCalled();
  });

  it('saves parent and replacement days through one versioned RPC', async () => {
    const timelog = makeTimelog();
    const harness = await setupAtomicHarness({ timelogs: [timelog] });

    await harness.service.saveTimelog({ ...timelog, km: 12, note: 'nová data' });

    expect(harness.saveTimelogAtomicRpc).toHaveBeenCalledWith(expect.objectContaining({
      timelogId: 'timelog-uuid-1',
      expectedUpdatedAt: '2026-08-17T10:00:00.000Z',
      expectedStatus: 'draft',
      km: 12,
      note: 'nová data',
    }));
    expect(harness.getSnapshot().timelogs[0].updatedAt).toBe('2026-08-17T11:00:00.000Z');
    expect(harness.from).not.toHaveBeenCalled();
  });

  it('deletes only the versioned parent RPC and relies on database cascade', async () => {
    const timelog = makeTimelog();
    const harness = await setupAtomicHarness({ timelogs: [timelog] });

    await harness.service.deleteTimelog(1);

    expect(harness.deleteTimelogAtomicRpc).toHaveBeenCalledWith({
      id: 'timelog-uuid-1',
      expectedUpdatedAt: '2026-08-17T10:00:00.000Z',
      expectedStatus: 'draft',
    });
    expect(harness.getSnapshot().timelogs).toEqual([]);
    expect(harness.from).not.toHaveBeenCalled();
  });

  it('serializes overlapping saves and reads the version produced by the first save', async () => {
    const first = createDeferred<{
      id: string;
      updated_at: string;
      status: TimelogStatus;
    }>();
    let call = 0;
    const harness = await setupAtomicHarness({
      timelogs: [makeTimelog()],
      saveImplementation: async () => {
        call += 1;
        if (call === 1) return first.promise;
        return {
          id: 'timelog-uuid-1',
          updated_at: '2026-08-17T12:00:00.000Z',
          status: 'draft' as const,
        };
      },
    });

    const firstSave = harness.service.saveTimelog({ ...makeTimelog(), note: 'first' });
    const secondSave = harness.service.saveTimelog({ ...makeTimelog(), note: 'second' });
    await vi.waitFor(() => expect(harness.saveTimelogAtomicRpc).toHaveBeenCalledTimes(1));

    first.resolve({
      id: 'timelog-uuid-1',
      updated_at: '2026-08-17T11:00:00.000Z',
      status: 'draft',
    });
    await firstSave;
    await secondSave;

    expect(harness.saveTimelogAtomicRpc).toHaveBeenCalledTimes(2);
    expect(harness.saveTimelogAtomicRpc.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      expectedUpdatedAt: '2026-08-17T11:00:00.000Z',
      note: 'second',
    }));
    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      note: 'second',
      updatedAt: '2026-08-17T12:00:00.000Z',
    });
  });

  it('reserves the local row before hydrating a missing UUID and version', async () => {
    const authoritativeRead = createDeferred<void>();
    const firstRpc = createDeferred<{
      id: string;
      updated_at: string;
      status: TimelogStatus;
    }>();
    let call = 0;
    const staleLocalTimelog = makeTimelog({
      id: 41,
      supabaseId: undefined,
      updatedAt: undefined,
    });
    const harness = await setupAtomicHarness({
      timelogs: [staleLocalTimelog],
      authoritativeTimelogs: [makeTimelog()],
      authoritativeReadGate: authoritativeRead.promise,
      saveImplementation: async () => {
        call += 1;
        if (call === 1) return firstRpc.promise;
        return {
          id: 'timelog-uuid-1',
          updated_at: '2026-08-17T12:00:00.000Z',
          status: 'draft' as const,
        };
      },
    });

    const firstSave = harness.service.saveTimelog({ ...staleLocalTimelog, note: 'first' });
    const secondSave = harness.service.saveTimelog({ ...staleLocalTimelog, note: 'second' });

    await vi.waitFor(() => expect(harness.from).toHaveBeenCalledTimes(4));
    expect(harness.saveTimelogAtomicRpc).not.toHaveBeenCalled();

    authoritativeRead.resolve();
    await vi.waitFor(() => expect(harness.saveTimelogAtomicRpc).toHaveBeenCalledTimes(1));
    expect(harness.saveTimelogAtomicRpc.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      expectedUpdatedAt: '2026-08-17T10:00:00.000Z',
      note: 'first',
    }));
    expect(harness.saveTimelogAtomicRpc).toHaveBeenCalledTimes(1);

    firstRpc.resolve({
      id: 'timelog-uuid-1',
      updated_at: '2026-08-17T11:00:00.000Z',
      status: 'draft',
    });
    await firstSave;
    await secondSave;

    expect(harness.saveTimelogAtomicRpc).toHaveBeenCalledTimes(2);
    expect(harness.saveTimelogAtomicRpc.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      expectedUpdatedAt: '2026-08-17T11:00:00.000Z',
      note: 'second',
    }));
  });

  it('coordinates a batch and a same-row delete without Promise.all partial writes', async () => {
    const batch = createDeferred<Array<{
      id: string;
      updated_at: string;
      status: TimelogStatus;
    }>>();
    const second = makeTimelog({
      id: 2,
      eid: 2,
      supabaseId: 'timelog-uuid-2',
      eventSupabaseId: 'event-uuid-2',
      contractorProfileId: 'profile-uuid-2',
    });
    const harness = await setupAtomicHarness({
      timelogs: [makeTimelog(), second],
      statusImplementation: async () => batch.promise,
    });

    const statusPromise = harness.service.updateTimelogStatuses([2, 1], 'sub');
    const deletePromise = harness.service.deleteTimelog(1);
    await vi.waitFor(() => (
      expect(harness.transitionTimelogStatusesAtomicRpc).toHaveBeenCalledTimes(1)
    ));
    expect(harness.deleteTimelogAtomicRpc).not.toHaveBeenCalled();
    expect(harness.transitionTimelogStatusesAtomicRpc).toHaveBeenCalledWith({
      targets: [
        { id: 'timelog-uuid-1', expectedUpdatedAt: '2026-08-17T10:00:00.000Z' },
        { id: 'timelog-uuid-2', expectedUpdatedAt: '2026-08-17T10:00:00.000Z' },
      ],
      expectedStatus: 'draft',
      nextStatus: 'pending_ch',
    });

    batch.resolve([
      { id: 'timelog-uuid-1', updated_at: '2026-08-17T11:00:00.000Z', status: 'pending_ch' },
      { id: 'timelog-uuid-2', updated_at: '2026-08-17T11:00:01.000Z', status: 'pending_ch' },
    ]);
    await statusPromise;
    await deletePromise.catch(() => undefined);

    expect(harness.deleteTimelogAtomicRpc).toHaveBeenCalledWith(expect.objectContaining({
      id: 'timelog-uuid-1',
      expectedUpdatedAt: '2026-08-17T11:00:00.000Z',
      expectedStatus: 'pending_ch',
    }));
  });

  it('imports through the dedicated RPC and commits its canonical invoiced status', async () => {
    const pendingCoo = makeTimelog({ status: 'pending_coo' });
    const harness = await setupAtomicHarness({
      timelogs: [pendingCoo],
      importImplementation: async () => ({
        id: 'timelog-uuid-1',
        updated_at: '2026-08-17T13:00:00.000Z',
        status: 'invoiced' as const,
      }),
    });

    const imported = await harness.service.importApprovedTimelog({
      ...pendingCoo,
      km: 18,
      note: 'PowerApps: invoice.pdf',
      status: 'approved',
    });

    expect(harness.importApprovedTimelogAtomicRpc).toHaveBeenCalledWith({
      timelogId: 'timelog-uuid-1',
      eventId: 'event-uuid-1',
      contractorId: 'profile-uuid-1',
      expectedUpdatedAt: '2026-08-17T10:00:00.000Z',
      expectedStatus: 'pending_coo',
      km: 18,
      note: 'PowerApps: invoice.pdf',
      days: pendingCoo.days,
    });
    expect(imported).toMatchObject({
      status: 'invoiced',
      updatedAt: '2026-08-17T13:00:00.000Z',
    });
    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      status: 'invoiced',
      updatedAt: '2026-08-17T13:00:00.000Z',
    });
  });

  it('commits an authoritative reload after a failed mutation before rejecting', async () => {
    const conflict = new Error('Výkaz se mezitím změnil. Obnovte data a zkuste to znovu.');
    const authoritative = makeTimelog({
      note: 'server truth',
      updatedAt: '2026-08-17T15:00:00.000Z',
    });
    const harness = await setupAtomicHarness({
      timelogs: [makeTimelog()],
      authoritativeTimelogs: [authoritative],
      saveImplementation: async () => {
        throw conflict;
      },
    });

    await expect(harness.service.saveTimelog({
      ...makeTimelog(),
      note: 'stale client edit',
    })).rejects.toBe(conflict);

    expect(harness.getSnapshot().timelogs[0]).toMatchObject({
      note: 'server truth',
      updatedAt: '2026-08-17T15:00:00.000Z',
    });
    expect(harness.from).toHaveBeenCalledTimes(4);
  });
});
