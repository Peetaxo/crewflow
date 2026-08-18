import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, ReceiptItem } from '../../../types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const createDeferred = <T>() => {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
};

const createSnapshot = (overrides?: Partial<{
  receipts: ReceiptItem[];
  contractors: Contractor[];
  events: Event[];
}>) => ({
  events: [
    {
      id: 1,
      supabaseId: 'event-row-1',
      name: 'Akce 1',
      job: 'AK001',
      startDate: '2026-04-10',
      endDate: '2026-04-10',
      city: 'Praha',
      needed: 1,
      filled: 1,
      status: 'upcoming' as const,
      client: 'Klient A',
    },
  ],
  contractors: [
    {
      id: 1,
      profileId: 'profile-uuid-1',
      userId: 'user-uuid-1',
      name: 'Test User',
      ii: 'TU',
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
    },
  ],
  receipts: [
    {
      id: 1,
      supabaseId: 'receipt-row-1',
      updatedAt: '2026-04-10T10:00:00Z',
      eventSupabaseId: 'event-row-1',
      contractorProfileId: 'profile-uuid-1',
      eid: 1,
      job: 'AK001',
      title: 'Parkovne',
      vendor: 'Garage',
      amount: 250,
      paidAt: '2026-04-10',
      note: '',
      status: 'draft' as const,
    },
  ],
  timelogs: [],
  invoices: [],
  candidates: [],
  projects: [],
  clients: [],
  ...overrides,
});

describe('receipts.service write flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a Supabase receipt draft with a stable UUID', async () => {
    const uuid = vi.fn(() => 'client-uuid-1');
    vi.stubGlobal('crypto', { randomUUID: uuid });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => createSnapshot({ receipts: [] }),
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {},
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const { createEmptyReceipt } = await import('./receipts.service');

    expect(createEmptyReceipt('profile-1').supabaseId).toBe('client-uuid-1');
    expect(uuid).toHaveBeenCalledOnce();
  });

  it('keeps local receipt drafts without a stable UUID', async () => {
    const uuid = vi.fn(() => 'unexpected-uuid');
    vi.stubGlobal('crypto', { randomUUID: uuid });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => createSnapshot({ receipts: [] }),
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const { createEmptyReceipt } = await import('./receipts.service');

    expect(createEmptyReceipt('profile-1').supabaseId).toBeUndefined();
    expect(uuid).not.toHaveBeenCalled();
  });

  it('continues replacing local receipts by local id', async () => {
    let snapshot = createSnapshot({
      receipts: [{ ...createSnapshot().receipts[0], supabaseId: undefined, updatedAt: undefined }],
    });
    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const { saveReceipt } = await import('./receipts.service');
    const saved = await saveReceipt({ ...snapshot.receipts[0], title: 'Edited locally' });

    expect(saved).toMatchObject({ id: 1, title: 'Edited locally' });
    expect(snapshot.receipts).toEqual([expect.objectContaining({ id: 1, title: 'Edited locally' })]);
  });

  const setupReceiptCreateIntentHarness = async ({
    loseFirstInsertResponse = false,
    failFirstRecovery = false,
    deferFirstUpdateResponse = false,
    deferFirstRecovery = false,
  } = {}) => {
    let snapshot = createSnapshot({ receipts: [] });
    let authoritativeReceiptRow: Record<string, unknown> | null = null;
    let recoveryFailuresRemaining = failFirstRecovery ? 1 : 0;
    let version = 0;
    const firstRecovery = createDeferred<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>();
    const firstUpdateResponse = createDeferred<{
      data: Record<string, unknown> | null;
      error: Record<string, unknown> | null;
    }>();
    const uuid = vi.fn()
      .mockReturnValueOnce('receipt-client-uuid-1')
      .mockReturnValueOnce('receipt-client-uuid-2')
      .mockReturnValue('receipt-client-uuid-3');
    vi.stubGlobal('crypto', { randomUUID: uuid });

    const mutationResponse = () => ({
      id: authoritativeReceiptRow?.id,
      updated_at: authoritativeReceiptRow?.updated_at,
      event_id: authoritativeReceiptRow?.event_id,
      status: authoritativeReceiptRow?.status,
    });
    const insert = vi.fn((payload: Record<string, unknown>) => {
      if (authoritativeReceiptRow?.id === payload.id) {
        return {
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            }),
          })),
        };
      }
      version += 1;
      authoritativeReceiptRow = {
        ...payload,
        updated_at: `2026-04-12T1${version}:00:00Z`,
      };
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue(
            loseFirstInsertResponse && insert.mock.calls.length === 1
              ? { data: null, error: { code: 'XX000', message: 'connection lost after committed insert' } }
              : { data: mutationResponse(), error: null },
          ),
        })),
      };
    });
    const updateSingle = vi.fn(async () => {
      version += 1;
      authoritativeReceiptRow = {
        ...authoritativeReceiptRow,
        updated_at: `2026-04-12T1${version}:00:00Z`,
      };
      if (deferFirstUpdateResponse && updateSingle.mock.calls.length === 1) {
        return firstUpdateResponse.promise;
      }
      return { data: mutationResponse(), error: null };
    });
    const updateSelect = vi.fn(() => ({ single: updateSingle }));
    const updateStatusEq = vi.fn(() => ({ select: updateSelect }));
    const updateVersionEq = vi.fn(() => ({ eq: updateStatusEq }));
    const updateIdEq = vi.fn(() => ({ eq: updateVersionEq }));
    const update = vi.fn((payload: Record<string, unknown>) => {
      authoritativeReceiptRow = { ...authoritativeReceiptRow, ...payload };
      return { eq: updateIdEq };
    });
    const deleteSingle = vi.fn(async () => {
      const id = authoritativeReceiptRow?.id;
      authoritativeReceiptRow = null;
      return { data: { id }, error: null };
    });
    const deleteSelect = vi.fn(() => ({ single: deleteSingle }));
    const deleteStatusIn = vi.fn(() => ({ select: deleteSelect }));
    const deleteVersionEq = vi.fn(() => ({ in: deleteStatusIn }));
    const deleteIdEq = vi.fn(() => ({ eq: deleteVersionEq }));
    const deleteReceiptRow = vi.fn(() => ({ eq: deleteIdEq }));
    const rpc = vi.fn();

    const receiptsOrder = vi.fn(async () => {
      if (deferFirstRecovery && receiptsOrder.mock.calls.length === 1) {
        return firstRecovery.promise;
      }
      if (recoveryFailuresRemaining > 0) {
        recoveryFailuresRemaining -= 1;
        return { data: [], error: { message: 'temporary receipt refresh failure' } };
      }
      return {
        data: authoritativeReceiptRow ? [structuredClone(authoritativeReceiptRow)] : [],
        error: null,
      };
    });
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();
    const cancelQueries = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/query-client', () => ({
      queryClient: { setQueryData, invalidateQueries, cancelQueries },
    }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        rpc,
        from: vi.fn((table: string) => {
          if (table === 'receipts') {
            return {
              insert,
              update,
              delete: deleteReceiptRow,
              select: vi.fn(() => ({ order: receiptsOrder })),
            };
          }
          const data = table === 'profiles'
            ? [{ id: 'profile-uuid-1' }]
            : [{ id: 'event-row-1' }];
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data, error: null }) })),
            })),
          };
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn((row: Record<string, unknown>) => ({
        id: Number.NaN,
        supabaseId: row.id,
        updatedAt: row.updated_at,
        eventSupabaseId: row.event_id,
        contractorProfileId: row.contractor_id,
        eid: Number.NaN,
        job: row.job_number,
        title: row.name,
        vendor: row.supplier,
        amount: row.amount,
        paidAt: row.paid_at,
        note: row.note,
        status: row.status,
      })),
    }));

    return {
      service: await import('./receipts.service'),
      insert,
      update,
      updateIdEq,
      updateVersionEq,
      updateStatusEq,
      deleteReceiptRow,
      receiptsOrder,
      rpc,
      uuid,
      firstRecovery,
      firstUpdateResponse,
      setQueryData,
      cancelQueries,
      setAuthoritativeReceiptRow: (row: Record<string, unknown> | null) => {
        authoritativeReceiptRow = row ? structuredClone(row) : null;
      },
      setSnapshot: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
      },
      getSnapshot: () => structuredClone(snapshot),
    };
  };

  const newReceiptDraft = (): ReceiptItem => ({
    id: 1,
    supabaseId: 'receipt-client-uuid-1',
    contractorProfileId: 'profile-uuid-1',
    eid: 1,
    eventSupabaseId: 'event-row-1',
    job: 'AK001',
    title: 'Taxi',
    vendor: 'Bolt',
    amount: 300,
    paidAt: '2026-04-12',
    note: '',
    status: 'draft',
  });

  const setupDeferredReceiptHydration = async () => {
    let snapshot = createSnapshot({ receipts: [] });
    const firstReceipts = createDeferred<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>();
    const canonicalRow = {
      id: 'receipt-row-1',
      updated_at: '2026-04-10T12:00:00Z',
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      job_number: 'AK001',
      name: 'Taxi',
      supplier: 'Bolt',
      amount: 300,
      paid_at: '2026-04-10',
      note: '',
      status: 'attached',
    };
    const receiptsOrder = vi.fn()
      .mockImplementationOnce(() => firstReceipts.promise)
      .mockResolvedValue({ data: [canonicalRow], error: null });
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();
    const cancelQueries = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/query-client', () => ({
      queryClient: { setQueryData, invalidateQueries, cancelQueries },
    }));
    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: { receipts: { all: ['receipts'] } },
    }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'receipts') return { select: vi.fn(() => ({ order: receiptsOrder })) };
          const data = table === 'profiles'
            ? [{ id: 'profile-uuid-1' }]
            : [{ id: 'event-row-1' }];
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data, error: null }) })),
            })),
          };
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn((row: Record<string, unknown>) => ({
        ...newReceiptDraft(),
        supabaseId: row.id,
        updatedAt: row.updated_at,
        eventSupabaseId: row.event_id,
        status: row.status,
      })),
    }));

    return {
      service: await import('./receipts.service'),
      firstReceipts,
      canonicalRow,
      receiptsOrder,
      setQueryData,
      cancelQueries,
      getSnapshot: () => structuredClone(snapshot),
    };
  };

  const setupQueuedReceiptMutationHarness = async () => {
    let snapshot = createSnapshot({
      receipts: [
        {
          ...createSnapshot().receipts[0],
          id: 1,
          title: 'Receipt A',
          supabaseId: 'receipt-uuid-a',
          updatedAt: '2026-04-10T10:00:00Z',
        },
        {
          ...createSnapshot().receipts[0],
          id: 2,
          title: 'Receipt B',
          supabaseId: 'receipt-uuid-b',
          updatedAt: '2026-04-10T10:00:01Z',
        },
      ],
    });
    const rpc = vi.fn().mockImplementation(async (
      _name: string,
      args: { p_receipts: Array<{ id: string }> },
    ) => ({
      data: [{
        id: args.p_receipts[0].id,
        status: 'submitted',
        updated_at: '2026-04-10T11:00:00Z',
      }],
      error: null,
    }));
    let deletedId = '';
    const deleteSingle = vi.fn(async () => ({ data: { id: deletedId }, error: null }));
    const deleteSelect = vi.fn(() => ({ single: deleteSingle }));
    const deleteStatusIn = vi.fn(() => ({ select: deleteSelect }));
    const deleteVersionEq = vi.fn(() => ({ in: deleteStatusIn }));
    const deleteIdEq = vi.fn((_column: string, value: string) => {
      deletedId = value;
      return { eq: deleteVersionEq };
    });
    const deleteReceiptRow = vi.fn(() => ({ eq: deleteIdEq }));
    const from = vi.fn(() => ({ delete: deleteReceiptRow }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from, rpc },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const service = await import('./receipts.service');
    const { runLifecycleDataMutation } = await import('../../event-lifecycle-generation');
    return {
      service,
      rpc,
      from,
      deleteIdEq,
      deleteVersionEq,
      deleteStatusIn,
      getSnapshot: () => structuredClone(snapshot),
      setSnapshot: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
      },
      holdQueue: () => {
        const blocker = createDeferred<void>();
        const pending = runLifecycleDataMutation(['receipt:test-blocker'], () => blocker.promise);
        return {
          release: async () => {
            blocker.resolve(undefined);
            await pending;
          },
        };
      },
    };
  };

  it('routes receipt writes without positional receipt or event identity helpers', () => {
    const serviceSource = readFileSync(resolve(
      process.cwd(),
      'src/features/receipts/services/receipts.service.ts',
    ), 'utf8');

    expect(serviceSource).not.toContain('getSupabaseReceiptRowIds');
    expect(serviceSource).not.toContain('getSupabaseReceiptRowId');
    expect(serviceSource).not.toContain('getSupabaseEventIdMap');
    expect(serviceSource).not.toContain('type ReceiptCreateIntent');
    expect(serviceSource).not.toContain('receiptCreateIntentByLocalId');
    const saveSource = serviceSource.slice(
      serviceSource.indexOf('export const saveReceipt'),
      serviceSource.indexOf('export const deleteReceipt'),
    );
    expect(saveSource).not.toContain('.find((receipt) => receipt.id === updated.id)');
    expect(serviceSource).toContain('transitionReceiptStatusesAtomicRpc({');
  });

  it.each([
    ['receipt UUID', { supabaseId: undefined }],
    ['event UUID', { eventSupabaseId: undefined }],
  ])('fails closed before every Supabase request when a create is missing its %s', async (_label, overrides) => {
    const harness = await setupReceiptCreateIntentHarness();

    await expect(harness.service.saveReceipt({
      ...newReceiptDraft(),
      ...overrides,
    })).rejects.toThrow('Účtenka obsahuje neplatné nebo neúplné údaje.');

    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(harness.deleteReceiptRow).not.toHaveBeenCalled();
    expect(harness.receiptsOrder).not.toHaveBeenCalled();
  });

  it('fails closed before every Supabase request when an existing receipt lacks its canonical version', async () => {
    const harness = await setupReceiptCreateIntentHarness();
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      receipts: [{ ...newReceiptDraft(), updatedAt: undefined }],
    }));

    await expect(harness.service.saveReceipt({
      ...newReceiptDraft(),
      title: 'Edited taxi',
    })).rejects.toThrow('Účtenka se mezitím změnila. Obnovte data a zkuste to znovu.');

    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(harness.deleteReceiptRow).not.toHaveBeenCalled();
    expect(harness.receiptsOrder).not.toHaveBeenCalled();
  });

  it('requires the draft event UUID to match exactly one current event before inserting', async () => {
    const harness = await setupReceiptCreateIntentHarness();
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      events: [
        { ...snapshot.events[0], id: 1, supabaseId: 'event-row-other' },
        { ...snapshot.events[0], id: 2, supabaseId: 'event-row-other' },
      ],
    }));

    await expect(harness.service.saveReceipt(newReceiptDraft()))
      .rejects.toThrow('Účtenka obsahuje neplatné nebo neúplné údaje.');

    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.receiptsOrder).not.toHaveBeenCalled();
  });

  it('updates receipt status in Supabase using its stable UUID and version', async () => {
    let snapshot = createSnapshot();

    const from = vi.fn(() => { throw new Error('Receipt status must not use REST DML'); });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'receipt-row-1', status: 'submitted', updated_at: '2026-04-10T11:00:00Z' }],
      error: null,
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from,
        rpc,
      },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn(),
    }));

    const { updateReceiptStatus } = await import('./receipts.service');

    const updated = await updateReceiptStatus(1, 'submit');

    expect(rpc).toHaveBeenCalledWith('transition_receipt_statuses_atomic', {
      p_receipts: [{ id: 'receipt-row-1', expected_updated_at: '2026-04-10T10:00:00Z' }],
      p_expected_status: 'draft',
      p_next_status: 'submitted',
    });
    expect(from).not.toHaveBeenCalled();
    expect(updated.status).toBe('submitted');
    expect(updated.updatedAt).toBe('2026-04-10T11:00:00Z');
    expect(snapshot.receipts[0].status).toBe('submitted');
    expect(snapshot.receipts[0].updatedAt).toBe('2026-04-10T11:00:00Z');
  });

  it('pins a queued status transition to the initiating receipt UUID and version across local-id reindex', async () => {
    const harness = await setupQueuedReceiptMutationHarness();
    const queue = harness.holdQueue();
    const pending = harness.service.updateReceiptStatus(1, 'submit');
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      receipts: snapshot.receipts.map((receipt) => ({
        ...receipt,
        id: receipt.supabaseId === 'receipt-uuid-a' ? 2 : 1,
      })),
    }));

    await queue.release();
    await expect(pending).resolves.toMatchObject({
      id: 2,
      supabaseId: 'receipt-uuid-a',
      status: 'submitted',
      updatedAt: '2026-04-10T11:00:00Z',
    });

    expect(harness.rpc).toHaveBeenCalledWith('transition_receipt_statuses_atomic', {
      p_receipts: [{ id: 'receipt-uuid-a', expected_updated_at: '2026-04-10T10:00:00Z' }],
      p_expected_status: 'draft',
      p_next_status: 'submitted',
    });
    expect(harness.getSnapshot().receipts.find((receipt) => receipt.supabaseId === 'receipt-uuid-a'))
      .toMatchObject({ id: 2, status: 'submitted', updatedAt: '2026-04-10T11:00:00Z' });
    expect(harness.getSnapshot().receipts.find((receipt) => receipt.supabaseId === 'receipt-uuid-b'))
      .toMatchObject({ id: 1, status: 'draft', updatedAt: '2026-04-10T10:00:01Z' });
  });

  it('pins a queued delete to the initiating receipt UUID, version and status across local-id reindex', async () => {
    const harness = await setupQueuedReceiptMutationHarness();
    const queue = harness.holdQueue();
    const pending = harness.service.deleteReceipt(1);
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      receipts: snapshot.receipts.map((receipt) => ({
        ...receipt,
        id: receipt.supabaseId === 'receipt-uuid-a' ? 2 : 1,
      })),
    }));

    await queue.release();
    await expect(pending).resolves.toEqual({ id: 2 });

    expect(harness.deleteIdEq).toHaveBeenCalledWith('id', 'receipt-uuid-a');
    expect(harness.deleteVersionEq).toHaveBeenCalledWith('updated_at', '2026-04-10T10:00:00Z');
    expect(harness.deleteStatusIn).toHaveBeenCalledWith('status', ['draft', 'rejected']);
    expect(harness.getSnapshot().receipts).toEqual([
      expect.objectContaining({ id: 1, supabaseId: 'receipt-uuid-b', title: 'Receipt B' }),
    ]);
  });

  it.each([
    ['status', 'Účtenku se nepodařilo uložit.'],
    ['delete', 'Účtenku se nepodařilo smazat.'],
  ] as const)('rejects a queued %s after auth reset without making a request', async (operation, message) => {
    const harness = await setupQueuedReceiptMutationHarness();
    const queue = harness.holdQueue();
    const pending = operation === 'status'
      ? harness.service.updateReceiptStatus(1, 'submit')
      : harness.service.deleteReceipt(1);
    const captured = pending.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );

    harness.service.resetSupabaseReceiptsHydration();
    await queue.release();
    const outcome = await captured;

    expect(outcome.value).toBeNull();
    expect(outcome.error).toEqual(expect.objectContaining({ message }));
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(harness.from).not.toHaveBeenCalled();
  });

  it.each([
    ['status', 'Účtenka obsahuje neplatné nebo neúplné údaje.'],
    ['delete', 'Účtenka se mezitím změnila. Obnovte data a zkuste to znovu.'],
  ] as const)('fails closed before queueing an ambiguous local-id %s', async (operation, message) => {
    const harness = await setupQueuedReceiptMutationHarness();
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      receipts: snapshot.receipts.map((receipt) => ({ ...receipt, id: 1 })),
    }));

    const pending = operation === 'status'
      ? harness.service.updateReceiptStatus(1, 'submit')
      : harness.service.deleteReceipt(1);

    await expect(pending).rejects.toThrow(message);
    expect(harness.rpc).not.toHaveBeenCalled();
    expect(harness.from).not.toHaveBeenCalled();
  });

  it('reconciles a deferred status response to receipt B by UUID after A deletion and B/C reindex', async () => {
    let snapshot = createSnapshot({
      receipts: [
        {
          ...createSnapshot().receipts[0], id: 1, title: 'Receipt B', supabaseId: 'receipt-uuid-b',
          updatedAt: '2026-04-10T10:00:00Z',
        },
        {
          ...createSnapshot().receipts[0], id: 2, title: 'Receipt C', supabaseId: 'receipt-uuid-c',
          updatedAt: '2026-04-10T10:00:01Z',
        },
      ],
    });
    let resolveRpc: ((value: { data: Array<{ id: string; status: string; updated_at: string }>; error: null }) => void) | undefined;
    const rpcResult = new Promise<{ data: Array<{ id: string; status: string; updated_at: string }>; error: null }>((resolve) => {
      resolveRpc = resolve;
    });
    const rpc = vi.fn(() => rpcResult);

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc } }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const { updateReceiptStatus } = await import('./receipts.service');
    const pending = updateReceiptStatus(1, 'submit');
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    snapshot = {
      ...snapshot,
      receipts: snapshot.receipts.map((receipt) => ({
        ...receipt,
        id: receipt.supabaseId === 'receipt-uuid-b' ? 2 : 1,
      })),
    };
    resolveRpc?.({
      data: [{ id: 'receipt-uuid-b', status: 'submitted', updated_at: '2026-04-10T11:00:00Z' }],
      error: null,
    });

    await expect(pending).resolves.toMatchObject({ supabaseId: 'receipt-uuid-b', status: 'submitted' });
    expect(snapshot.receipts.find((receipt) => receipt.supabaseId === 'receipt-uuid-b')).toMatchObject({
      id: 2, status: 'submitted', updatedAt: '2026-04-10T11:00:00Z',
    });
    expect(snapshot.receipts.find((receipt) => receipt.supabaseId === 'receipt-uuid-c')).toMatchObject({
      id: 1, status: 'draft', updatedAt: '2026-04-10T10:00:01Z',
    });
  });

  it('updates receipt B and event B by stable UUID after A deletion and B/C reindex', async () => {
    let snapshot = createSnapshot({
      events: [
        { ...createSnapshot().events[0], id: 1, supabaseId: 'event-uuid-b', name: 'Event B' },
        { ...createSnapshot().events[0], id: 2, supabaseId: 'event-uuid-c', name: 'Event C' },
      ],
      receipts: [
        {
          ...createSnapshot().receipts[0], id: 1, eid: 1, title: 'Receipt B', supabaseId: 'receipt-uuid-b',
          eventSupabaseId: 'event-uuid-b', updatedAt: '2026-04-10T10:00:00Z',
        },
        {
          ...createSnapshot().receipts[0], id: 2, eid: 2, title: 'Receipt C', supabaseId: 'receipt-uuid-c',
          eventSupabaseId: 'event-uuid-c', updatedAt: '2026-04-10T10:00:01Z',
        },
      ],
    });
    let resolveUpdate: ((value: {
      data: { id: string; updated_at: string; event_id: string; status: string };
      error: null;
    }) => void) | undefined;
    const updateResult = new Promise<{
      data: { id: string; updated_at: string; event_id: string; status: string };
      error: null;
    }>((resolve) => { resolveUpdate = resolve; });
    const single = vi.fn(() => updateResult);
    const select = vi.fn(() => ({ single }));
    const statusEq = vi.fn(() => ({ select }));
    const versionEq = vi.fn(() => ({ eq: statusEq }));
    const idEq = vi.fn(() => ({ eq: versionEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    const from = vi.fn((table: string) => {
      expect(table).toBe('receipts');
      return { update };
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from } }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const { saveReceipt } = await import('./receipts.service');
    const pending = saveReceipt({ ...snapshot.receipts[0], title: 'Receipt B edited' });
    await vi.waitFor(() => expect(single).toHaveBeenCalledTimes(1));
    snapshot = {
      ...snapshot,
      events: snapshot.events.map((event) => ({ ...event, id: event.supabaseId === 'event-uuid-b' ? 2 : 1 })),
      receipts: snapshot.receipts.map((receipt) => ({
        ...receipt,
        id: receipt.supabaseId === 'receipt-uuid-b' ? 2 : 1,
        eid: receipt.eventSupabaseId === 'event-uuid-b' ? 2 : 1,
      })),
    };
    resolveUpdate?.({
      data: {
        id: 'receipt-uuid-b', updated_at: '2026-04-10T11:00:00Z', event_id: 'event-uuid-b', status: 'draft',
      },
      error: null,
    });

    await expect(pending).resolves.toMatchObject({
      id: 2, eid: 2, supabaseId: 'receipt-uuid-b', eventSupabaseId: 'event-uuid-b', title: 'Receipt B edited',
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'event-uuid-b', name: 'Receipt B edited' }));
    expect(idEq).toHaveBeenCalledWith('id', 'receipt-uuid-b');
    expect(versionEq).toHaveBeenCalledWith('updated_at', '2026-04-10T10:00:00Z');
    expect(statusEq).toHaveBeenCalledWith('status', 'draft');
    expect(snapshot.receipts.find((receipt) => receipt.supabaseId === 'receipt-uuid-b')).toMatchObject({
      id: 2, eid: 2, title: 'Receipt B edited', updatedAt: '2026-04-10T11:00:00Z',
    });
    expect(snapshot.receipts.find((receipt) => receipt.supabaseId === 'receipt-uuid-c')).toMatchObject({
      id: 1, eid: 1, title: 'Receipt C', updatedAt: '2026-04-10T10:00:01Z',
    });
  });

  it('creates a new receipt in Supabase with mapped contractor and event row ids', async () => {
    let snapshot = createSnapshot({
      receipts: [],
    });
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'receipt-row-2') });

    const receiptInsertSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'receipt-row-2', updated_at: '2026-04-12T10:00:00Z', event_id: 'event-row-1', status: 'draft',
      },
      error: null,
    });
    const receiptsInsert = vi.fn(() => ({
      select: vi.fn(() => ({ single: receiptInsertSingle })),
    }));
    const profilesSelect = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'profile-uuid-1' }],
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
          if (table === 'receipts') {
            return {
              insert: receiptsInsert,
            };
          }

          if (table === 'profiles') {
            return {
              select: profilesSelect,
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn(),
    }));

    const { saveReceipt } = await import('./receipts.service');

    const created = await saveReceipt({
      id: 2,
      supabaseId: 'receipt-row-2',
      contractorProfileId: 'profile-uuid-1',
      eid: 1,
      eventSupabaseId: 'event-row-1',
      job: ' ak001 ',
      title: ' Parkovne ',
      vendor: ' Garage ',
      amount: 300,
      paidAt: '2026-04-12',
      note: ' Poznamka ',
      status: 'draft',
    });

    expect(receiptsInsert).toHaveBeenCalledWith({
      id: 'receipt-row-2',
      contractor_id: 'profile-uuid-1',
      event_id: 'event-row-1',
      job_number: 'AK001',
      name: 'Parkovne',
      supplier: 'Garage',
      amount: 300,
      paid_at: '2026-04-12',
      note: 'Poznamka',
      status: 'draft',
    });
    expect(created.job).toBe('AK001');
    expect(created.title).toBe('Parkovne');
    expect(created.vendor).toBe('Garage');
    expect(created.note).toBe('Poznamka');
    expect(created.supabaseId).toBe('receipt-row-2');
    expect(created.updatedAt).toBe('2026-04-12T10:00:00Z');
    expect(snapshot.receipts).toHaveLength(1);
    expect(snapshot.receipts[0].title).toBe('Parkovne');
  });

  it('persists contractorProfileId for new receipts created from UUID selection', async () => {
    let snapshot = createSnapshot({
      receipts: [],
    });
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'receipt-row-2') });

    const receiptsInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'receipt-row-2', updated_at: '2026-04-12T10:00:00Z', event_id: 'event-row-1', status: 'draft',
          },
          error: null,
        }),
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'receipts') {
            return {
              insert: receiptsInsert,
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn(),
    }));

    const { saveReceipt } = await import('./receipts.service');

    const created = await saveReceipt({
      id: 1,
      supabaseId: 'receipt-row-2',
      contractorProfileId: 'profile-uuid-1',
      eid: 1,
      eventSupabaseId: 'event-row-1',
      job: ' AK001 ',
      title: ' Taxi ',
      vendor: ' Bolt ',
      amount: 300,
      paidAt: '2026-04-12',
      note: ' Poznamka ',
      status: 'draft',
    });

    expect(receiptsInsert).toHaveBeenCalledWith(expect.objectContaining({
      contractor_id: 'profile-uuid-1',
    }));
    expect(created.contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.receipts[0].contractorProfileId).toBe('profile-uuid-1');
  });

  it.each([
    [{ code: '42501', message: 'permission denied for relation receipts' }, 'Účtenku nelze uložit, protože k ní nemáte oprávnění.'],
    [{ code: 'XX000', message: 'sensitive internal receipt insert detail' }, 'Účtenku se nepodařilo uložit.'],
  ])('keeps receipt save database errors diagnostic-only', async (databaseError, expectedMessage) => {
    let snapshot = createSnapshot({ receipts: [] });
    const single = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({ single })),
    }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from: vi.fn(() => ({ insert })) },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    try {
      const { saveReceipt } = await import('./receipts.service');

      await expect(saveReceipt({
        id: 2, supabaseId: 'receipt-row-2', contractorProfileId: 'profile-uuid-1',
        eid: 1, eventSupabaseId: 'event-row-1',
        job: 'AK001', title: 'Taxi', vendor: 'Bolt', amount: 300, paidAt: '2026-04-12',
        note: '', status: 'draft',
      })).rejects.toThrow(expectedMessage);
      expect(snapshot.receipts).toEqual([]);
      expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('sensitive internal receipt insert detail'));
      if (databaseError.code === 'XX000') {
        expect(consoleError).toHaveBeenCalledWith('Unexpected receipt create error', databaseError);
      }
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each(['submitted', 'approved', 'attached', 'reimbursed'] as const)(
    'refuses to delete a %s receipt before making a database request',
    async (status) => {
      const from = vi.fn();
      let snapshot = createSnapshot({
        receipts: [{
          ...createSnapshot().receipts[0],
          supabaseId: 'receipt-uuid-1',
          updatedAt: '2026-04-12T10:00:00Z',
          status,
        }],
      });

      vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
      vi.doMock('../../../lib/supabase', () => ({
        isSupabaseConfigured: true,
        supabase: { from },
      }));
      vi.doMock('../../../lib/app-data', () => ({
        getLocalAppState: () => structuredClone(snapshot),
        updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
          snapshot = structuredClone(updater(structuredClone(snapshot)));
          return structuredClone(snapshot);
        },
        subscribeToLocalAppState: vi.fn(() => () => undefined),
      }));
      vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

      const { deleteReceipt } = await import('./receipts.service');

      await expect(deleteReceipt(1)).rejects.toThrow(
        'Účtenku lze smazat pouze jako koncept nebo po zamítnutí.',
      );
      expect(from).not.toHaveBeenCalled();
      expect(snapshot.receipts).toHaveLength(1);
    },
  );

  it.each(['draft', 'rejected'] as const)(
    'deletes a %s receipt by its stable UUID and expected version',
    async (status) => {
      let snapshot = createSnapshot({
        receipts: [{
          ...createSnapshot().receipts[0],
          supabaseId: 'receipt-uuid-1',
          updatedAt: '2026-04-12T10:00:00Z',
          status,
        }],
      });
      const single = vi.fn().mockResolvedValue({
        data: { id: 'receipt-uuid-1' },
        error: null,
      });
      const select = vi.fn(() => ({ single }));
      const inStatuses = vi.fn(() => ({ select }));
      const updatedAtEq = vi.fn(() => ({ in: inStatuses }));
      const idEq = vi.fn(() => ({ eq: updatedAtEq }));
      const deleteRequest = vi.fn(() => ({ eq: idEq }));
      const from = vi.fn((table: string) => {
        expect(table).toBe('receipts');
        return { delete: deleteRequest };
      });

      vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
      vi.doMock('../../../lib/supabase', () => ({
        isSupabaseConfigured: true,
        supabase: { from },
      }));
      vi.doMock('../../../lib/app-data', () => ({
        getLocalAppState: () => structuredClone(snapshot),
        updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
          snapshot = structuredClone(updater(structuredClone(snapshot)));
          return structuredClone(snapshot);
        },
        subscribeToLocalAppState: vi.fn(() => () => undefined),
      }));
      vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

      const { deleteReceipt } = await import('./receipts.service');

      await expect(deleteReceipt(1)).resolves.toEqual({ id: 1 });
      expect(deleteRequest).toHaveBeenCalledTimes(1);
      expect(idEq).toHaveBeenCalledWith('id', 'receipt-uuid-1');
      expect(updatedAtEq).toHaveBeenCalledWith('updated_at', '2026-04-12T10:00:00Z');
      expect(inStatuses).toHaveBeenCalledWith('status', ['draft', 'rejected']);
      expect(select).toHaveBeenCalledWith('id');
      expect(snapshot.receipts).toEqual([]);
    },
  );

  it('fails closed without mutating local state when the Supabase client is unavailable', async () => {
    let snapshot = createSnapshot({
      receipts: [{
        ...createSnapshot().receipts[0],
        supabaseId: 'receipt-uuid-1',
        updatedAt: '2026-04-12T10:00:00Z',
      }],
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: null,
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const { deleteReceipt } = await import('./receipts.service');

    await expect(deleteReceipt(1)).rejects.toThrow('Účtenku se nepodařilo smazat.');
    expect(snapshot.receipts).toHaveLength(1);
  });

  it('removes the stable receipt UUID from the latest snapshot after an in-flight reindex', async () => {
    let snapshot = createSnapshot({
      receipts: [
        {
          ...createSnapshot().receipts[0],
          id: 1,
          supabaseId: 'receipt-uuid-delete',
          updatedAt: '2026-04-12T10:00:00Z',
        },
        {
          ...createSnapshot().receipts[0],
          id: 2,
          title: 'Keep me',
          supabaseId: 'receipt-uuid-keep',
          updatedAt: '2026-04-12T11:00:00Z',
        },
      ],
    });
    let resolveDelete: ((value: { data: { id: string }; error: null }) => void) | undefined;
    const deleteResult = new Promise<{ data: { id: string }; error: null }>((resolve) => {
      resolveDelete = resolve;
    });
    const single = vi.fn(() => deleteResult);
    const from = vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              select: vi.fn(() => ({ single })),
            })),
          })),
        })),
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const { deleteReceipt } = await import('./receipts.service');
    const pendingDelete = deleteReceipt(1);

    await vi.waitFor(() => expect(single).toHaveBeenCalledTimes(1));

    snapshot = {
      ...snapshot,
      receipts: snapshot.receipts.map((receipt) => ({
        ...receipt,
        id: receipt.supabaseId === 'receipt-uuid-delete' ? 2 : 1,
      })),
    };
    resolveDelete?.({ data: { id: 'receipt-uuid-delete' }, error: null });

    await expect(pendingDelete).resolves.toEqual({ id: 2 });
    expect(snapshot.receipts).toHaveLength(1);
    expect(snapshot.receipts[0]).toMatchObject({ id: 1, supabaseId: 'receipt-uuid-keep', title: 'Keep me' });
  });

  it.each([
    [{ message: 'receipt_delete_conflict: hidden database detail' }, 'Účtenka se mezitím změnila. Obnovte data a zkuste to znovu.'],
    [{ code: '42501', message: 'permission denied for table receipts' }, 'Účtenku nelze smazat, protože k ní nemáte oprávnění.'],
    [{ message: 'new row violates row-level security policy for table receipts' }, 'Účtenku nelze smazat, protože k ní nemáte oprávnění.'],
  ])('maps receipt delete conflicts and authorization errors without exposing raw details', async (databaseError, expectedMessage) => {
    let snapshot = createSnapshot({
      receipts: [{
        ...createSnapshot().receipts[0],
        supabaseId: 'receipt-uuid-1',
        updatedAt: '2026-04-12T10:00:00Z',
      }],
    });
    const single = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    const from = vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              select: vi.fn(() => ({ single })),
            })),
          })),
        })),
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    const { deleteReceipt } = await import('./receipts.service');

    await expect(deleteReceipt(1)).rejects.toThrow(expectedMessage);
    expect(snapshot.receipts).toHaveLength(1);
  });

  it('keeps unexpected receipt delete errors diagnostic-only', async () => {
    let snapshot = createSnapshot({
      receipts: [{
        ...createSnapshot().receipts[0],
        supabaseId: 'receipt-uuid-1',
        updatedAt: '2026-04-12T10:00:00Z',
      }],
    });
    const databaseError = { code: 'XX000', message: 'sensitive receipt relation detail' };
    const single = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    const from = vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              select: vi.fn(() => ({ single })),
            })),
          })),
        })),
      })),
    }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapReceipt: vi.fn() }));

    try {
      const { deleteReceipt } = await import('./receipts.service');

      await expect(deleteReceipt(1)).rejects.toThrow('Účtenku se nepodařilo smazat.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected receipt delete error', databaseError);
      expect(snapshot.receipts).toHaveLength(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('discards a receipt fetch that started before a canonical status mutation', async () => {
    let snapshot = createSnapshot();
    const deferredReceipts = createDeferred<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>();
    const receiptsOrder = vi.fn()
      .mockImplementationOnce(() => deferredReceipts.promise)
      .mockImplementation(async () => ({
        data: [{
          id: 'receipt-row-1',
          updated_at: snapshot.receipts[0].updatedAt,
          event_id: 'event-row-1',
          contractor_id: 'profile-uuid-1',
          status: snapshot.receipts[0].status,
        }],
        error: null,
      }));
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'receipt-row-1', status: 'submitted', updated_at: '2026-04-10T11:00:00Z' }],
      error: null,
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        rpc,
        from: vi.fn((table: string) => {
          if (table === 'receipts') {
            return { select: vi.fn(() => ({ order: receiptsOrder })) };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({ data: [{ id: 'profile-uuid-1' }], error: null }),
                })),
              })),
            };
          }
          if (table === 'events') {
            return {
              select: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({ data: [{ id: 'event-row-1' }], error: null }),
                })),
              })),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn((row: Record<string, unknown>) => ({
        ...snapshot.receipts[0],
        supabaseId: row.id,
        updatedAt: row.updated_at,
        status: row.status,
      })),
    }));

    const { fetchReceiptsSnapshot, updateReceiptStatus } = await import('./receipts.service');
    const staleFetch = fetchReceiptsSnapshot();
    await vi.waitFor(() => expect(receiptsOrder).toHaveBeenCalledTimes(1));

    await expect(updateReceiptStatus(1, 'submit')).resolves.toMatchObject({
      supabaseId: 'receipt-row-1',
      status: 'submitted',
      updatedAt: '2026-04-10T11:00:00Z',
    });
    deferredReceipts.resolve({
      data: [{
        id: 'receipt-row-1', updated_at: '2026-04-10T10:00:00Z', event_id: 'event-row-1',
        contractor_id: 'profile-uuid-1', status: 'draft',
      }],
      error: null,
    });

    await expect(staleFetch).resolves.toEqual(snapshot.receipts);
    expect(receiptsOrder).toHaveBeenCalledTimes(2);
    expect(snapshot.receipts[0]).toMatchObject({
      status: 'submitted',
      updatedAt: '2026-04-10T11:00:00Z',
    });
  });

  it('discards a receipt fetch when another lifecycle mutation attaches the receipt', async () => {
    let snapshot = createSnapshot({
      receipts: [{ ...createSnapshot().receipts[0], status: 'approved' }],
    });
    const deferredReceipts = createDeferred<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>();
    const receiptsOrder = vi.fn()
      .mockImplementationOnce(() => deferredReceipts.promise)
      .mockImplementation(async () => ({
        data: [{
          id: 'receipt-row-1',
          updated_at: snapshot.receipts[0].updatedAt,
          event_id: 'event-row-1',
          contractor_id: 'profile-uuid-1',
          status: snapshot.receipts[0].status,
        }],
        error: null,
      }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'receipts') return { select: vi.fn(() => ({ order: receiptsOrder })) };
          const data = table === 'profiles'
            ? [{ id: 'profile-uuid-1' }]
            : [{ id: 'event-row-1' }];
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data, error: null }) })),
            })),
          };
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn((row: Record<string, unknown>) => ({
        ...snapshot.receipts[0], supabaseId: row.id, updatedAt: row.updated_at, status: row.status,
      })),
    }));

    const { fetchReceiptsSnapshot } = await import('./receipts.service');
    const { advanceLifecycleSnapshotGeneration } = await import('../../event-lifecycle-generation');
    const staleFetch = fetchReceiptsSnapshot();
    await vi.waitFor(() => expect(receiptsOrder).toHaveBeenCalledTimes(1));

    advanceLifecycleSnapshotGeneration();
    snapshot = {
      ...snapshot,
      receipts: [{ ...snapshot.receipts[0], status: 'attached', updatedAt: '2026-04-10T12:00:00Z' }],
    };
    deferredReceipts.resolve({
      data: [{
        id: 'receipt-row-1', updated_at: '2026-04-10T10:00:00Z', event_id: 'event-row-1',
        contractor_id: 'profile-uuid-1', status: 'approved',
      }],
      error: null,
    });

    await expect(staleFetch).resolves.toEqual(snapshot.receipts);
    expect(receiptsOrder).toHaveBeenCalledTimes(2);
  });

  it('authoritatively reloads after a lost status response and does not poison the next mutation', async () => {
    let snapshot = createSnapshot();
    let authoritativeStatus: ReceiptItem['status'] = 'submitted';
    let authoritativeUpdatedAt = '2026-04-10T11:00:00Z';
    let rpcCalls = 0;
    const rpc = vi.fn(async () => {
      rpcCalls += 1;
      if (rpcCalls === 1) {
        return {
          data: null,
          error: { code: 'XX000', message: 'connection lost after committed receipt transition' },
        };
      }
      authoritativeStatus = 'approved';
      authoritativeUpdatedAt = '2026-04-10T12:00:00Z';
      return {
        data: [{ id: 'receipt-row-1', status: authoritativeStatus, updated_at: authoritativeUpdatedAt }],
        error: null,
      };
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        rpc,
        from: vi.fn((table: string) => {
          if (table === 'receipts') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [{
                    id: 'receipt-row-1', updated_at: authoritativeUpdatedAt, event_id: 'event-row-1',
                    contractor_id: 'profile-uuid-1', status: authoritativeStatus,
                  }],
                  error: null,
                }),
              })),
            };
          }
          const data = table === 'profiles'
            ? [{ id: 'profile-uuid-1' }]
            : [{ id: 'event-row-1' }];
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data, error: null }) })),
            })),
          };
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn((row: Record<string, unknown>) => ({
        ...createSnapshot().receipts[0],
        supabaseId: row.id,
        updatedAt: row.updated_at,
        status: row.status,
      })),
    }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { updateReceiptStatus } = await import('./receipts.service');

      await expect(updateReceiptStatus(1, 'submit')).rejects.toThrow(
        'Operaci s účtenkami se nepodařilo dokončit.',
      );
      expect(snapshot.receipts[0]).toMatchObject({
        status: 'submitted', updatedAt: '2026-04-10T11:00:00Z',
      });

      await expect(updateReceiptStatus(1, 'approve')).resolves.toMatchObject({
        status: 'approved', updatedAt: '2026-04-10T12:00:00Z',
      });
      expect(rpc).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('inserts once and version-updates the same draft UUID across two immediate saves', async () => {
    const harness = await setupReceiptCreateIntentHarness();
    const draft = newReceiptDraft();

    const firstSave = harness.service.saveReceipt(draft);
    const secondSave = harness.service.saveReceipt(draft);
    const [first, second] = await Promise.all([firstSave, secondSave]);

    expect(harness.uuid).not.toHaveBeenCalled();
    expect(harness.insert).toHaveBeenCalledTimes(1);
    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.insert).toHaveBeenCalledWith(expect.objectContaining({ id: draft.supabaseId }));
    expect(harness.updateIdEq).toHaveBeenCalledWith('id', draft.supabaseId);
    expect(harness.updateVersionEq).toHaveBeenCalledWith('updated_at', '2026-04-12T11:00:00Z');
    expect(harness.updateStatusEq).toHaveBeenCalledWith('status', 'draft');
    expect(first.supabaseId).toBe('receipt-client-uuid-1');
    expect(second.supabaseId).toBe('receipt-client-uuid-1');
    expect(harness.getSnapshot().receipts).toHaveLength(1);
  });

  it('never redirects a receipt retry after local ids are reindexed', async () => {
    const harness = await setupReceiptCreateIntentHarness({
      loseFirstInsertResponse: true,
      failFirstRecovery: true,
    });
    const draft = newReceiptDraft();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(harness.service.saveReceipt(draft)).rejects.toThrow('Účtenku se nepodařilo uložit.');
      harness.setSnapshot((snapshot) => ({
        ...snapshot,
        receipts: [{
          ...newReceiptDraft(),
          id: draft.id,
          supabaseId: 'receipt-row-other',
          updatedAt: 'v-other',
        }],
      }));

      const recovered = await harness.service.saveReceipt(draft);

      expect(harness.uuid).not.toHaveBeenCalled();
      expect(harness.insert).toHaveBeenCalledTimes(2);
      expect(harness.insert.mock.calls.map(([payload]) => ({
        id: payload.id,
        eventId: payload.event_id,
      }))).toEqual([
        { id: draft.supabaseId, eventId: draft.eventSupabaseId },
        { id: draft.supabaseId, eventId: draft.eventSupabaseId },
      ]);
      expect(harness.update).not.toHaveBeenCalled();
      expect(recovered.supabaseId).toBe('receipt-client-uuid-1');
      expect(harness.getSnapshot().receipts).toHaveLength(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('recovers a duplicate UUID only when the exact authoritative row matches the requested create', async () => {
    const harness = await setupReceiptCreateIntentHarness({
      loseFirstInsertResponse: true,
      failFirstRecovery: true,
    });
    const draft = newReceiptDraft();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(harness.service.saveReceipt(draft))
        .rejects.toThrow('Účtenku se nepodařilo uložit.');
      harness.setAuthoritativeReceiptRow({
        id: draft.supabaseId,
        updated_at: '2026-04-12T11:00:00Z',
        event_id: draft.eventSupabaseId,
        contractor_id: draft.contractorProfileId,
        job_number: draft.job,
        name: 'Different receipt',
        supplier: draft.vendor,
        amount: draft.amount,
        paid_at: draft.paidAt,
        note: draft.note,
        status: 'draft',
      });

      await expect(harness.service.saveReceipt(draft))
        .rejects.toThrow('Účtenku se nepodařilo uložit.');

      expect(harness.insert).toHaveBeenCalledTimes(2);
      expect(harness.receiptsOrder).toHaveBeenCalledTimes(2);
      expect(harness.getSnapshot().receipts).toEqual([]);
      expect(harness.setQueryData).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('drops queued and in-flight receipt saves when their initiating auth epoch resets', async () => {
    const harness = await setupReceiptCreateIntentHarness({ deferFirstUpdateResponse: true });
    const draft = { ...newReceiptDraft(), updatedAt: '2026-04-12T10:00:00Z' };
    harness.setSnapshot((snapshot) => ({ ...snapshot, receipts: [draft] }));

    const firstSave = harness.service.saveReceipt({ ...draft, title: 'Edited taxi' });
    const firstExpectation = expect(firstSave).rejects.toThrow('Účtenku se nepodařilo uložit.');
    await vi.waitFor(() => expect(harness.update).toHaveBeenCalledOnce());
    const secondSave = harness.service.saveReceipt({ ...draft, title: 'Edited taxi' });
    const secondExpectation = expect(secondSave).rejects.toThrow('Účtenku se nepodařilo uložit.');
    harness.service.resetSupabaseReceiptsHydration();
    harness.firstUpdateResponse.resolve({
      data: {
        id: draft.supabaseId,
        updated_at: '2026-04-12T11:00:00Z',
        event_id: draft.eventSupabaseId,
        status: 'draft',
      },
      error: null,
    });

    await firstExpectation;
    await secondExpectation;
    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.update).toHaveBeenCalledOnce();
    expect(harness.getSnapshot().receipts).toEqual([draft]);
    expect(harness.setQueryData).not.toHaveBeenCalled();
  });

  it('does not commit receipt recovery rows after the initiating auth epoch resets', async () => {
    const harness = await setupReceiptCreateIntentHarness({
      loseFirstInsertResponse: true,
      deferFirstRecovery: true,
    });
    const draft = newReceiptDraft();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const pendingSave = harness.service.saveReceipt(draft);
      const capturedSave = pendingSave.then(
        (value) => ({ value, error: null }),
        (error: unknown) => ({ value: null, error }),
      );
      await vi.waitFor(() => expect(harness.receiptsOrder).toHaveBeenCalledOnce());
      harness.service.resetSupabaseReceiptsHydration();
      harness.firstRecovery.resolve({
        data: [{
          id: draft.supabaseId,
          updated_at: '2026-04-12T11:00:00Z',
          event_id: draft.eventSupabaseId,
          contractor_id: draft.contractorProfileId,
          job_number: draft.job,
          name: draft.title,
          supplier: draft.vendor,
          amount: draft.amount,
          paid_at: draft.paidAt,
          note: draft.note,
          status: 'draft',
        }],
        error: null,
      });

      const outcome = await capturedSave;
      expect(outcome.value).toBeNull();
      expect(outcome.error).toEqual(expect.objectContaining({ message: 'Účtenku se nepodařilo uložit.' }));
      expect(harness.getSnapshot().receipts).toEqual([]);
      expect(harness.setQueryData).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('uses a fresh factory UUID after the canonical receipt is deliberately deleted', async () => {
    const harness = await setupReceiptCreateIntentHarness();
    const firstDraft = harness.service.createEmptyReceipt('profile-uuid-1');
    const first = await harness.service.saveReceipt({
      ...firstDraft,
      eid: 1,
      eventSupabaseId: 'event-row-1',
      job: 'AK001',
      title: 'Taxi',
      vendor: 'Bolt',
      amount: 300,
    });

    await harness.service.deleteReceipt(first.id);
    const secondDraft = harness.service.createEmptyReceipt('profile-uuid-1');
    const second = await harness.service.saveReceipt({
      ...secondDraft,
      eid: 1,
      eventSupabaseId: 'event-row-1',
      job: 'AK001',
      title: 'Taxi',
      vendor: 'Bolt',
      amount: 300,
    });

    expect(harness.uuid).toHaveBeenCalledTimes(2);
    expect(harness.insert).toHaveBeenCalledTimes(2);
    expect(firstDraft.supabaseId).toBe('receipt-client-uuid-1');
    expect(secondDraft.supabaseId).toBe('receipt-client-uuid-2');
    expect(second.supabaseId).toBe('receipt-client-uuid-2');
    expect(harness.getSnapshot().receipts).toHaveLength(1);
  });

  it('keeps lazy hydration retryable when its first snapshot is discarded by a lifecycle generation change', async () => {
    let snapshot = createSnapshot({ receipts: [] });
    const firstReceipts = createDeferred<{
      data: Array<Record<string, unknown>>;
      error: null;
    }>();
    const canonicalRow = {
      id: 'receipt-row-1',
      updated_at: '2026-04-10T12:00:00Z',
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      job_number: 'AK001',
      name: 'Taxi',
      supplier: 'Bolt',
      amount: 300,
      paid_at: '2026-04-10',
      note: '',
      status: 'attached',
    };
    const receiptsOrder = vi.fn()
      .mockImplementationOnce(() => firstReceipts.promise)
      .mockResolvedValue({ data: [canonicalRow], error: null });
    const setQueryData = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/query-client', () => ({
      queryClient: { setQueryData, invalidateQueries: vi.fn() },
    }));
    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: { receipts: { all: ['receipts'] } },
    }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'receipts') return { select: vi.fn(() => ({ order: receiptsOrder })) };
          const data = table === 'profiles'
            ? [{ id: 'profile-uuid-1' }]
            : [{ id: 'event-row-1' }];
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data, error: null }) })),
            })),
          };
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn((row: Record<string, unknown>) => ({
        ...newReceiptDraft(),
        supabaseId: row.id,
        updatedAt: row.updated_at,
        status: row.status,
      })),
    }));

    const { getReceipts } = await import('./receipts.service');
    const { advanceLifecycleSnapshotGeneration } = await import('../../event-lifecycle-generation');

    expect(getReceipts()).toEqual([]);
    await vi.waitFor(() => expect(receiptsOrder).toHaveBeenCalledTimes(1));
    advanceLifecycleSnapshotGeneration();
    firstReceipts.resolve({ data: [{ ...canonicalRow, status: 'approved' }], error: null });
    await vi.waitFor(() => expect(setQueryData).not.toHaveBeenCalled());
    await Promise.resolve();

    expect(getReceipts()).toEqual([]);
    await vi.waitFor(() => expect(receiptsOrder).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(snapshot.receipts).toHaveLength(1));
    expect(snapshot.receipts[0]).toMatchObject({
      supabaseId: 'receipt-row-1', status: 'attached', updatedAt: '2026-04-10T12:00:00Z',
    });
  });

  it('retries one direct receipt hydration after a same-session generation discard and commits only the retry', async () => {
    const harness = await setupDeferredReceiptHydration();
    const { advanceLifecycleSnapshotGeneration } = await import('../../event-lifecycle-generation');

    const pendingFetch = harness.service.fetchReceiptsSnapshot();
    await vi.waitFor(() => expect(harness.receiptsOrder).toHaveBeenCalledOnce());
    advanceLifecycleSnapshotGeneration();
    harness.firstReceipts.resolve({
      data: [{ ...harness.canonicalRow, status: 'approved' }],
      error: null,
    });

    await expect(pendingFetch).resolves.toEqual([
      expect.objectContaining({ supabaseId: 'receipt-row-1', status: 'attached' }),
    ]);
    expect(harness.receiptsOrder).toHaveBeenCalledTimes(2);
    expect(harness.getSnapshot().receipts).toEqual([
      expect.objectContaining({ supabaseId: 'receipt-row-1', status: 'attached' }),
    ]);
    expect(harness.setQueryData).toHaveBeenCalledTimes(1);
  });

  it('does not commit or retry a direct receipt hydration started before reset', async () => {
    const harness = await setupDeferredReceiptHydration();

    const pendingFetch = harness.service.fetchReceiptsSnapshot();
    await vi.waitFor(() => expect(harness.receiptsOrder).toHaveBeenCalledOnce());
    harness.service.resetSupabaseReceiptsHydration();
    harness.firstReceipts.resolve({ data: [harness.canonicalRow], error: null });

    await expect(pendingFetch).resolves.toEqual([]);
    expect(harness.getSnapshot().receipts).toEqual([]);
    expect(harness.setQueryData).not.toHaveBeenCalled();
    expect(harness.receiptsOrder).toHaveBeenCalledOnce();
    expect(harness.cancelQueries).toHaveBeenCalledWith({ queryKey: ['receipts'] });
  });

  it('does not commit or retry lazy receipt hydration started before reset', async () => {
    const harness = await setupDeferredReceiptHydration();

    expect(harness.service.getReceipts()).toEqual([]);
    await vi.waitFor(() => expect(harness.receiptsOrder).toHaveBeenCalledOnce());
    harness.service.resetSupabaseReceiptsHydration();
    harness.firstReceipts.resolve({ data: [harness.canonicalRow], error: null });
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.getSnapshot().receipts).toEqual([]);
    expect(harness.setQueryData).not.toHaveBeenCalled();
    expect(harness.receiptsOrder).toHaveBeenCalledOnce();
    expect(harness.cancelQueries).toHaveBeenCalledWith({ queryKey: ['receipts'] });
  });

  it('recovers a lost create response by its one stable client UUID without inserting twice', async () => {
    let snapshot = createSnapshot({ receipts: [] });
    let insertedRow: Record<string, unknown> | null = null;
    const insert = vi.fn((payload: Record<string, unknown>) => {
      insertedRow = {
        ...payload,
        updated_at: '2026-04-12T10:00:00Z',
      };
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'XX000', message: 'connection lost after receipt insert commit' },
          }),
        })),
      };
    });
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'receipt-client-uuid') });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'receipts') {
            return {
              insert,
              select: vi.fn(() => ({
                order: vi.fn(async () => ({ data: insertedRow ? [insertedRow] : [], error: null })),
              })),
            };
          }
          const data = table === 'profiles'
            ? [{ id: 'profile-uuid-1' }]
            : [{ id: 'event-row-1' }];
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data, error: null }) })),
            })),
          };
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapReceipt: vi.fn((row: Record<string, unknown>) => ({
        id: Number.NaN,
        supabaseId: row.id,
        updatedAt: row.updated_at,
        eventSupabaseId: row.event_id,
        contractorProfileId: row.contractor_id,
        eid: Number.NaN,
        job: row.job_number,
        title: row.name,
        vendor: row.supplier,
        amount: row.amount,
        paidAt: row.paid_at,
        note: row.note,
        status: row.status,
      })),
    }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { saveReceipt } = await import('./receipts.service');
      const created = await saveReceipt({
        id: 1, supabaseId: 'receipt-client-uuid', contractorProfileId: 'profile-uuid-1',
        eid: 1, eventSupabaseId: 'event-row-1',
        job: 'AK001', title: 'Taxi', vendor: 'Bolt', amount: 300, paidAt: '2026-04-12',
        note: '', status: 'draft',
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'receipt-client-uuid' }));
      expect(created).toMatchObject({
        supabaseId: 'receipt-client-uuid', updatedAt: '2026-04-12T10:00:00Z', title: 'Taxi',
      });
      expect(snapshot.receipts).toHaveLength(1);
    } finally {
      consoleError.mockRestore();
    }
  });
});
