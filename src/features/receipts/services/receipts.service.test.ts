import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, ReceiptItem } from '../../../types';

const createSnapshot = (overrides?: Partial<{
  receipts: ReceiptItem[];
  contractors: Contractor[];
  events: Event[];
}>) => ({
  events: [
    {
      id: 1,
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
  });

  it('updates receipt status in Supabase using the mapped row id', async () => {
    let snapshot = createSnapshot();

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: updateEq }));
    const selectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'receipt-row-1' }],
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
          if (table !== 'receipts') {
            throw new Error(`Unexpected table ${table}`);
          }

          return {
            select: selectMock,
            update: updateMock,
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
      mapReceipt: vi.fn(),
    }));

    const { updateReceiptStatus } = await import('./receipts.service');

    const updated = await updateReceiptStatus(1, 'submit');

    expect(selectMock).toHaveBeenCalledWith('id');
    expect(updateMock).toHaveBeenCalledWith({ status: 'submitted' });
    expect(updateEq).toHaveBeenCalledWith('id', 'receipt-row-1');
    expect(updated.status).toBe('submitted');
    expect(snapshot.receipts[0].status).toBe('submitted');
  });

  it('creates a new receipt in Supabase with mapped contractor and event row ids', async () => {
    let snapshot = createSnapshot({
      receipts: [],
    });

    const receiptInsertSingle = vi.fn().mockResolvedValue({
      data: { id: 'receipt-row-2', updated_at: '2026-04-12T10:00:00Z' }, error: null,
    });
    const receiptsInsert = vi.fn(() => ({
      select: vi.fn(() => ({ single: receiptInsertSingle })),
    }));
    const receiptsSelect = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'receipt-row-1' }],
        error: null,
      })),
    }));
    const profilesSelect = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'profile-uuid-1' }],
          error: null,
        })),
      })),
    }));
    const eventsSelect = vi.fn(() => ({
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
          if (table === 'receipts') {
            return {
              insert: receiptsInsert,
              select: receiptsSelect,
            };
          }

          if (table === 'profiles') {
            return {
              select: profilesSelect,
            };
          }

          if (table === 'events') {
            return {
              select: eventsSelect,
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
      contractorProfileId: 'profile-uuid-1',
      eid: 1,
      job: ' ak001 ',
      title: ' Parkovne ',
      vendor: ' Garage ',
      amount: 300,
      paidAt: '2026-04-12',
      note: ' Poznamka ',
      status: 'draft',
    });

    expect(receiptsInsert).toHaveBeenCalledWith({
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

    const receiptsInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: 'receipt-row-2', updated_at: '2026-04-12T10:00:00Z' }, error: null,
        }),
      })),
    }));
    const eventsSelect = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'event-row-1' }],
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

          if (table === 'events') {
            return {
              select: eventsSelect,
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

    const { createEmptyReceipt, saveReceipt } = await import('./receipts.service');

    const createdDraft = createEmptyReceipt('profile-uuid-1');
    const created = await saveReceipt({
      ...createdDraft,
      eid: 1,
      job: ' AK001 ',
      title: ' Taxi ',
      vendor: ' Bolt ',
      amount: 300,
      note: ' Poznamka ',
    });

    expect(receiptsInsert).toHaveBeenCalledWith(expect.objectContaining({
      contractor_id: 'profile-uuid-1',
    }));
    expect(created.contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.receipts[0].contractorProfileId).toBe('profile-uuid-1');
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

    snapshot = {
      ...snapshot,
      receipts: snapshot.receipts.map((receipt) => ({
        ...receipt,
        id: receipt.supabaseId === 'receipt-uuid-delete' ? 2 : 1,
      })),
    };
    resolveDelete?.({ data: { id: 'receipt-uuid-delete' }, error: null });

    await expect(pendingDelete).resolves.toEqual({ id: 1 });
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
});
