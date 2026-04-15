import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice, ReceiptItem, Timelog } from '../../../types';

const createSnapshot = (overrides?: Partial<{
  invoices: Invoice[];
  timelogs: Timelog[];
  receipts: ReceiptItem[];
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
    {
      id: 2,
      name: 'Akce 2',
      job: 'AK002',
      startDate: '2026-04-11',
      endDate: '2026-04-11',
      city: 'Brno',
      needed: 1,
      filled: 1,
      status: 'upcoming' as const,
      client: 'Klient B',
    },
  ],
  contractors: [
    {
      id: 1,
      name: 'Test User',
      ii: 'TU',
      bg: '#000',
      fg: '#fff',
      tags: [],
      events: 2,
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
  timelogs: [
    {
      id: 1,
      eid: 1,
      cid: 1,
      days: [{ d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal' as const }],
      km: 10,
      note: '',
      status: 'approved' as const,
    },
    {
      id: 2,
      eid: 2,
      cid: 1,
      days: [{ d: '2026-04-11', f: '09:00', t: '16:00', type: 'provoz' as const }],
      km: 0,
      note: '',
      status: 'approved' as const,
    },
  ],
  receipts: [
    {
      id: 11,
      cid: 1,
      eid: 2,
      job: 'AK002',
      title: 'Parkovne',
      vendor: 'Parking',
      amount: 300,
      paidAt: '2026-04-11',
      note: '',
      status: 'approved' as const,
    },
  ],
  invoices: [],
  candidates: [],
  projects: [],
  clients: [],
  ...overrides,
});

describe('invoices.service billing batches', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates one invoice batch for one contractor with multiple job numbers', async () => {
    let snapshot = createSnapshot();
    const markTimelogsAsInvoiced = vi.fn();
    const markReceiptsAsAttached = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapInvoice: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      getTimelogs: () => structuredClone(snapshot.timelogs),
      markTimelogsAsInvoiced,
      markTimelogsAsPaid: vi.fn(),
      markTimelogsAsPaidForInvoice: vi.fn(),
    }));

    vi.doMock('../../receipts/services/receipts.service', () => ({
      getReceipts: () => structuredClone(snapshot.receipts),
      markReceiptsAsAttached,
      markReceiptsAsReimbursed: vi.fn(),
      markReceiptsAsReimbursedForInvoice: vi.fn(),
    }));

    vi.doMock('../../../data', () => ({
      KM_RATE: 5,
    }));

    vi.doMock('../../../utils', () => ({
      calculateTotalHours: (days: Timelog['days']) => {
        const day = days[0];
        if (!day) return 0;
        const from = Number(day.f.split(':')[0]);
        const to = Number(day.t.split(':')[0]);
        return to - from;
      },
    }));

    vi.doMock('sonner', () => ({
      toast: {
        info: vi.fn(),
        success: vi.fn(),
      },
    }));

    const { generateInvoices, getPendingInvoiceBatchCount } = await import('./invoices.service');

    expect(getPendingInvoiceBatchCount()).toBe(1);

    const created = await generateInvoices();

    expect(created).toHaveLength(1);
    expect(created[0].cid).toBe(1);
    expect(created[0].jobNumbers).toEqual(['AK001', 'AK002']);
    expect(created[0].job).toBe('AK001, AK002');
    expect(created[0].timelogIds).toEqual([1, 2]);
    expect(created[0].receiptIds).toEqual([11]);
    expect(created[0].hours).toBe(17);
    expect(created[0].hAmt).toBe(4250);
    expect(created[0].kAmt).toBe(50);
    expect(created[0].receiptAmt).toBe(300);
    expect(created[0].total).toBe(4600);
    expect(snapshot.invoices).toHaveLength(1);
    expect(markTimelogsAsInvoiced).toHaveBeenCalledWith([1, 2]);
    expect(markReceiptsAsAttached).toHaveBeenCalledWith([11]);
  });

  it('returns only contractors with approved items as invoice candidates', async () => {
    let snapshot = createSnapshot({
      contractors: [
        ...createSnapshot().contractors,
        {
          id: 2,
          name: 'Bez schvaleni',
          ii: 'BS',
          bg: '#111',
          fg: '#fff',
          tags: [],
          events: 0,
          rate: 200,
          phone: '',
          email: '',
          ico: '',
          dic: '',
          bank: '',
          city: 'Brno',
          reliable: true,
          note: '',
        },
      ],
      timelogs: [
        ...createSnapshot().timelogs,
        {
          id: 3,
          eid: 1,
          cid: 2,
          days: [{ d: '2026-04-12', f: '08:00', t: '10:00', type: 'instal' as const }],
          km: 0,
          note: '',
          status: 'draft',
        },
      ],
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapInvoice: vi.fn() }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      getTimelogs: () => structuredClone(snapshot.timelogs),
      markTimelogsAsInvoiced: vi.fn(),
      markTimelogsAsPaid: vi.fn(),
      markTimelogsAsPaidForInvoice: vi.fn(),
    }));
    vi.doMock('../../receipts/services/receipts.service', () => ({
      getReceipts: () => structuredClone(snapshot.receipts),
      markReceiptsAsAttached: vi.fn(),
      markReceiptsAsReimbursed: vi.fn(),
      markReceiptsAsReimbursedForInvoice: vi.fn(),
    }));
    vi.doMock('../../../data', () => ({ KM_RATE: 5 }));
    vi.doMock('../../../utils', () => ({
      calculateTotalHours: (days: Timelog['days']) => {
        const day = days[0];
        if (!day) return 0;
        return Number(day.t.split(':')[0]) - Number(day.f.split(':')[0]);
      },
    }));
    vi.doMock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

    const { getInvoiceCreateCandidates } = await import('./invoices.service');

    expect(getInvoiceCreateCandidates()).toEqual([
      {
        contractorId: 1,
        contractorName: 'Test User',
        timelogCount: 2,
        receiptCount: 1,
        totalAmount: 4600,
      },
    ]);
  });

  it('builds preview grouped by job number for one contractor', async () => {
    let snapshot = createSnapshot();

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapInvoice: vi.fn() }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      getTimelogs: () => structuredClone(snapshot.timelogs),
      markTimelogsAsInvoiced: vi.fn(),
      markTimelogsAsPaid: vi.fn(),
      markTimelogsAsPaidForInvoice: vi.fn(),
    }));
    vi.doMock('../../receipts/services/receipts.service', () => ({
      getReceipts: () => structuredClone(snapshot.receipts),
      markReceiptsAsAttached: vi.fn(),
      markReceiptsAsReimbursed: vi.fn(),
      markReceiptsAsReimbursedForInvoice: vi.fn(),
    }));
    vi.doMock('../../../data', () => ({ KM_RATE: 5 }));
    vi.doMock('../../../utils', () => ({
      calculateTotalHours: (days: Timelog['days']) => {
        const day = days[0];
        if (!day) return 0;
        return Number(day.t.split(':')[0]) - Number(day.f.split(':')[0]);
      },
    }));
    vi.doMock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

    const { getInvoiceCreatePreview } = await import('./invoices.service');

    const preview = getInvoiceCreatePreview(1);

    expect(preview?.contractorName).toBe('Test User');
    expect(preview?.items).toHaveLength(2);
    expect(preview?.items[0]).toMatchObject({
      jobNumber: 'AK001',
      timelogIds: [1],
      receiptIds: [],
      totalAmount: 2550,
    });
    expect(preview?.items[1]).toMatchObject({
      jobNumber: 'AK002',
      timelogIds: [2],
      receiptIds: [11],
      totalAmount: 2050,
    });
    expect(preview?.totalAmount).toBe(4600);
  });

  it('does not offer timelogs already linked to an existing invoice again', async () => {
    let snapshot = createSnapshot({
      invoices: [
        {
          id: 'FAK-EXIST-001',
          cid: 1,
          eid: 1,
          hours: 10,
          hAmt: 2500,
          km: 50,
          kAmt: 250,
          receiptAmt: 0,
          total: 2750,
          job: 'AK001',
          jobNumbers: ['AK001'],
          timelogIds: [1],
          receiptIds: [],
          eventIds: [1],
          status: 'draft',
          sentAt: null,
        },
      ],
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapInvoice: vi.fn() }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      getTimelogs: () => structuredClone(snapshot.timelogs),
      markTimelogsAsInvoiced: vi.fn(),
      markTimelogsAsPaid: vi.fn(),
      markTimelogsAsPaidForInvoice: vi.fn(),
    }));
    vi.doMock('../../receipts/services/receipts.service', () => ({
      getReceipts: () => structuredClone(snapshot.receipts),
      markReceiptsAsAttached: vi.fn(),
      markReceiptsAsReimbursed: vi.fn(),
      markReceiptsAsReimbursedForInvoice: vi.fn(),
    }));
    vi.doMock('../../../data', () => ({ KM_RATE: 5 }));
    vi.doMock('../../../utils', () => ({
      calculateTotalHours: (days: Timelog['days']) => {
        const day = days[0];
        if (!day) return 0;
        return Number(day.t.split(':')[0]) - Number(day.f.split(':')[0]);
      },
    }));
    vi.doMock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

    const { getInvoiceCreateCandidates, getInvoiceCreatePreview } = await import('./invoices.service');

    expect(getInvoiceCreateCandidates()).toEqual([
      {
        contractorId: 1,
        contractorName: 'Test User',
        timelogCount: 1,
        receiptCount: 1,
        totalAmount: 2050,
      },
    ]);

    const preview = getInvoiceCreatePreview(1);
    expect(preview?.timelogIds).toEqual([2]);
    expect(preview?.receiptIds).toEqual([11]);
    expect(preview?.items).toHaveLength(1);
    expect(preview?.items[0].jobNumber).toBe('AK002');
  });

  it('creates invoice from selected subset of approved items only', async () => {
    let snapshot = createSnapshot();
    const markTimelogsAsInvoiced = vi.fn();
    const markReceiptsAsAttached = vi.fn();
    const invoiceInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'invoice-uuid-1' }, error: null });
    const invoiceInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: invoiceInsertSingle })) }));
    const invoiceItemsInsert = vi.fn().mockResolvedValue({ error: null });
    const invoiceTimelogsInsert = vi.fn().mockResolvedValue({ error: null });
    const invoiceReceiptsInsert = vi.fn().mockResolvedValue({ error: null });
    const timelogsUpdateIn = vi.fn().mockResolvedValue({ error: null });
    const receiptsUpdateIn = vi.fn().mockResolvedValue({ error: null });

    const fromMock = vi.fn((table: string) => {
      if (table === 'invoices') return { insert: invoiceInsert };
      if (table === 'invoice_items') return { insert: invoiceItemsInsert };
      if (table === 'invoice_timelogs') return { insert: invoiceTimelogsInsert };
      if (table === 'invoice_receipts') return { insert: invoiceReceiptsInsert };
      if (table === 'timelogs') return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [{ id: 'timelog-uuid-1' }, { id: 'timelog-uuid-2' }], error: null }) })), update: vi.fn(() => ({ in: timelogsUpdateIn })) };
      if (table === 'receipts') return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [{ id: 'receipt-uuid-11' }], error: null }) })), update: vi.fn(() => ({ in: receiptsUpdateIn })) };
      if (table === 'profiles') return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [{ id: 'profile-uuid-1', last_name: 'User', first_name: 'Test' }], error: null }) })) };
      if (table === 'events') return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [{ id: 'event-uuid-1', date_from: '2026-04-10', name: 'Akce 1' }, { id: 'event-uuid-2', date_from: '2026-04-11', name: 'Akce 2' }], error: null }) })) };
      throw new Error(`Unexpected table ${table}`);
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: fromMock } }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapInvoice: vi.fn() }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      getTimelogs: () => structuredClone(snapshot.timelogs),
      markTimelogsAsInvoiced,
      markTimelogsAsPaid: vi.fn(),
      markTimelogsAsPaidForInvoice: vi.fn(),
    }));
    vi.doMock('../../receipts/services/receipts.service', () => ({
      getReceipts: () => structuredClone(snapshot.receipts),
      markReceiptsAsAttached,
      markReceiptsAsReimbursed: vi.fn(),
      markReceiptsAsReimbursedForInvoice: vi.fn(),
    }));
    vi.doMock('../../../data', () => ({ KM_RATE: 5 }));
    vi.doMock('../../../utils', () => ({
      calculateTotalHours: (days: Timelog['days']) => {
        const day = days[0];
        if (!day) return 0;
        return Number(day.t.split(':')[0]) - Number(day.f.split(':')[0]);
      },
    }));
    vi.doMock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

    const { createInvoiceFromSelection } = await import('./invoices.service');

    const created = await createInvoiceFromSelection(1, [2], [11]);

    expect(created?.jobNumbers).toEqual(['AK002']);
    expect(created?.timelogIds).toEqual([2]);
    expect(created?.receiptIds).toEqual([11]);
    expect(created?.total).toBe(2050);
    expect(invoiceItemsInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        job_number: 'AK002',
        amount_hours: 1750,
        amount_km: 0,
        amount_receipts: 300,
        total_amount: 2050,
      }),
    ]);
    expect(invoiceTimelogsInsert).toHaveBeenCalledWith([
      { invoice_id: 'invoice-uuid-1', timelog_id: 'timelog-uuid-2' },
    ]);
    expect(invoiceReceiptsInsert).toHaveBeenCalledWith([
      { invoice_id: 'invoice-uuid-1', receipt_id: 'receipt-uuid-11' },
    ]);
    expect(markTimelogsAsInvoiced).toHaveBeenCalledWith([2]);
    expect(markReceiptsAsAttached).toHaveBeenCalledWith([11]);
  });
});
