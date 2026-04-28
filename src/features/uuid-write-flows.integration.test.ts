import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client, Contractor, Event, Invoice, Project, ReceiptItem, Timelog } from '../types';

type Snapshot = {
  events: Event[];
  contractors: Contractor[];
  timelogs: Timelog[];
  receipts: ReceiptItem[];
  invoices: Invoice[];
  candidates: [];
  projects: Project[];
  clients: Client[];
};

const createSnapshot = (): Snapshot => ({
  events: [
    {
      id: 1,
      projectId: 'project-uuid-1',
      name: 'Akce 1',
      job: 'AK001',
      startDate: '2026-04-10',
      endDate: '2026-04-10',
      city: 'Praha',
      needed: 1,
      filled: 1,
      status: 'upcoming',
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
      ico: '12345678',
      dic: '',
      bank: '123456789/0100',
      city: 'Praha',
      billingName: 'Test User',
      billingStreet: 'Dodavatelska 1',
      billingZip: '110 00',
      billingCity: 'Praha',
      billingCountry: 'Ceska republika',
      reliable: true,
      note: '',
    },
  ],
  timelogs: [
    {
      id: 1,
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
      km: 12,
      note: '',
      status: 'approved',
    },
  ],
  receipts: [],
  invoices: [],
  candidates: [],
  projects: [
    { id: 'AK001', supabaseId: 'project-uuid-1', name: 'Projekt 1', client: 'Klient A', clientId: 'client-uuid-1', createdAt: '2026-04-01' },
  ],
  clients: [
    { id: 1, supabaseId: 'client-uuid-1', name: 'Klient A', ico: '87654321', dic: '', street: 'Odberatelska 1', zip: '120 00', city: 'Praha', country: 'Ceska republika' },
  ],
});

describe('UUID write flows integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('completes timelog, receipt and invoice write flows without profiles lookup when contractor profileId exists locally', async () => {
    let snapshot = createSnapshot();
    let profileSelectCalls = 0;
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const timelogStatusEq = vi.fn().mockResolvedValue({ error: null });
    const timelogStatusIn = vi.fn().mockResolvedValue({ error: null });
    const timelogUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
    const receiptUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const receiptUpdateIn = vi.fn().mockResolvedValue({ error: null });
    const receiptInsert = vi.fn((payload: Record<string, unknown>) => {
      receiptRows.push({ id: `receipt-row-${receiptRows.length + 1}`, ...payload });
      return Promise.resolve({ error: null });
    });
    const invoiceInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'invoice-row-1' }, error: null });
    const invoiceInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: invoiceInsertSingle })) }));
    const invoiceItemsInsert = vi.fn().mockResolvedValue({ error: null });
    const invoiceTimelogsInsert = vi.fn().mockResolvedValue({ error: null });
    const invoiceReceiptsInsert = vi.fn().mockResolvedValue({ error: null });
    const receiptRows: Array<{ id: string }> = [];

    const fromMock = vi.fn((table: string) => {
      if (table === 'profiles') {
        profileSelectCalls += 1;
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'profile-uuid-1' }],
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === 'events') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'event-row-1' }],
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === 'timelog_days') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          })),
          delete: vi.fn(() => ({ eq: timelogDaysDeleteEq })),
          insert: timelogDaysInsert,
        };
      }

      if (table === 'timelogs') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [{ id: 'timelog-row-1' }],
              error: null,
            }),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            if ('contractor_id' in payload || 'event_id' in payload || 'km' in payload) {
              return { eq: timelogUpdateEq };
            }
            return { eq: timelogStatusEq, in: timelogStatusIn };
          }),
        };
      }

      if (table === 'receipts') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: receiptRows.map((row) => ({ id: row.id })),
              error: null,
            }),
          })),
          insert: receiptInsert,
          update: vi.fn((payload: Record<string, unknown>) => (
            'contractor_id' in payload || 'event_id' in payload || 'job_number' in payload
              ? { eq: receiptUpdateEq }
              : { eq: receiptUpdateEq, in: receiptUpdateIn }
          )),
        };
      }

      if (table === 'invoices') {
        return { insert: invoiceInsert };
      }

      if (table === 'invoice_items') {
        return { insert: invoiceItemsInsert };
      }

      if (table === 'invoice_timelogs') {
        return { insert: invoiceTimelogsInsert };
      }

      if (table === 'invoice_receipts') {
        return { insert: invoiceReceiptsInsert };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    vi.doMock('../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: fromMock,
        rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
      },
    }));
    vi.doMock('../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: Snapshot) => Snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../lib/query-client', () => ({
      queryClient: { invalidateQueries },
    }));
    vi.doMock('../lib/query-keys', () => ({
      queryKeys: {
        timelogs: { all: ['timelogs'] },
        receipts: { all: ['receipts'] },
      },
    }));
    vi.doMock('../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
      mapReceipt: vi.fn(),
      mapInvoice: vi.fn(),
    }));
    vi.doMock('../data', () => ({ KM_RATE: 5 }));
    vi.doMock('../utils', () => ({
      calculateTotalHours: (days: Timelog['days']) => {
        if (!Array.isArray(days)) return 0;
        const [day] = days;
        if (!day) return 0;
        return Number(day.t.split(':')[0]) - Number(day.f.split(':')[0]);
      },
    }));
    vi.doMock('sonner', () => ({
      toast: {
        info: vi.fn(),
        success: vi.fn(),
      },
    }));

    const { saveTimelog } = await import('./timelogs/services/timelogs.service');
    const { createEmptyReceipt, saveReceipt } = await import('./receipts/services/receipts.service');
    const { createInvoiceFromSelection, getInvoiceCreateCandidates } = await import('./invoices/services/invoices.service');

    const savedTimelog = await saveTimelog({
      ...snapshot.timelogs[0],
      note: 'UUID first timelog',
    });

    const receiptDraft = createEmptyReceipt('profile-uuid-1');
    const savedReceipt = await saveReceipt({
      ...receiptDraft,
      eid: 1,
      job: 'AK001',
      title: 'Parkovne',
      vendor: 'Parking',
      amount: 300,
      status: 'approved',
    });

    expect(profileSelectCalls).toBe(0);

    const candidates = getInvoiceCreateCandidates();
    const createdInvoice = await createInvoiceFromSelection('profile-uuid-1', [savedTimelog.id], [savedReceipt.id]);

    expect(savedTimelog.contractorProfileId).toBe('profile-uuid-1');
    expect(savedReceipt.contractorProfileId).toBe('profile-uuid-1');
    expect(candidates).toEqual([
      expect.objectContaining({
        contractorProfileId: 'profile-uuid-1',
      }),
    ]);
    expect(createdInvoice?.contractorProfileId).toBe('profile-uuid-1');
    expect(invoiceInsert).toHaveBeenCalledWith(expect.objectContaining({
      contractor_id: 'profile-uuid-1',
    }));
    expect(receiptInsert).toHaveBeenCalledWith(expect.objectContaining({
      contractor_id: 'profile-uuid-1',
    }));
    expect(timelogUpdateEq).toHaveBeenCalledWith('id', 'timelog-row-1');
    expect(snapshot.timelogs[0].status).toBe('invoiced');
    expect(snapshot.receipts[0].status).toBe('attached');
  });
});
