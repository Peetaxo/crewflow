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
      cid: 1,
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

    const receiptsInsert = vi.fn().mockResolvedValue({
      data: [{ id: 'receipt-row-2' }],
      error: null,
    });
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
      cid: 1,
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
    expect(snapshot.receipts).toHaveLength(1);
    expect(snapshot.receipts[0].title).toBe('Parkovne');
  });

  it('derives contractorProfileId from local contractor data for new receipts created from numeric selection', async () => {
    let snapshot = createSnapshot({
      receipts: [],
    });

    const receiptsInsert = vi.fn().mockResolvedValue({
      data: [{ id: 'receipt-row-2' }],
      error: null,
    });
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

    const createdDraft = createEmptyReceipt(1);
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
});
