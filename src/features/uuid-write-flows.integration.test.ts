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
      supabaseId: 'event-row-1',
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
      supabaseId: 'timelog-row-1',
      eventSupabaseId: 'event-row-1',
      contractorProfileId: 'profile-uuid-1',
      updatedAt: '2026-08-17T10:00:00.000Z',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
      km: 12,
      note: '',
      status: 'draft',
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
    vi.unstubAllGlobals();
  });

  it('completes timelog, receipt and invoice write flows without profiles lookup when contractor profileId exists locally', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'receipt-row-1') });
    let snapshot = createSnapshot();
    const timelogRows: Array<Record<string, unknown> & { id: string; updated_at: string }> = [{
      id: 'timelog-row-1',
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      updated_at: '2026-08-17T10:00:00.000Z',
      status: 'draft',
    }];
    let profileSelectCalls = 0;
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const setQueryData = vi.fn();
    const receiptUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const receiptUpdateIn = vi.fn().mockResolvedValue({ error: null });
    const receiptRows: Array<Record<string, unknown> & { id: string; updated_at: string }> = [];
    const receiptInsert = vi.fn((payload: Record<string, unknown>) => {
      const row = {
        id: typeof payload.id === 'string' ? payload.id : `receipt-row-${receiptRows.length + 1}`,
        updated_at: '2026-08-17T14:00:00.000Z',
        event_id: payload.event_id,
        status: payload.status,
      };
      receiptRows.push({ ...row, ...payload });
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: row, error: null }),
        })),
      };
    });
    const invoiceInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'invoice-row-1' }, error: null });
    const invoiceInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: invoiceInsertSingle })) }));
    const invoiceItemsInsert = vi.fn().mockResolvedValue({ error: null });
    const invoiceTimelogsInsert = vi.fn().mockResolvedValue({ error: null });
    const invoiceReceiptsInsert = vi.fn().mockResolvedValue({ error: null });

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
        const eventResult = Promise.resolve({
          data: [{ id: 'event-row-1' }],
          error: null,
        });
        const eventOrderQuery = Object.assign(eventResult, {
          order: vi.fn(() => eventOrderQuery),
        });
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => eventOrderQuery),
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
        };
      }

      if (table === 'timelogs') {
        const timelogResult = Promise.resolve({
          data: timelogRows,
          error: null,
        });
        const timelogOrderQuery = Object.assign(timelogResult, {
          order: vi.fn(() => timelogOrderQuery),
        });
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => timelogOrderQuery),
          })),
        };
      }

      if (table === 'receipts') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: receiptRows,
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
    let timelogRpcVersion = 10;
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'save_timelog_atomic') {
        timelogRpcVersion += 1;
        const canonical = {
          id: args.p_timelog_id as string,
          updated_at: `2026-08-17T${timelogRpcVersion}:00:00.000Z`,
          status: args.p_status,
        };
        const row = timelogRows.find((item) => item.id === canonical.id);
        if (row) Object.assign(row, canonical);
        return {
          data: canonical,
          error: null,
        };
      }
      if (name === 'transition_timelog_statuses_atomic') {
        timelogRpcVersion += 1;
        const data = (args.p_targets as Array<{ id: string }>).map(({ id }) => ({
          id,
          updated_at: `2026-08-17T${timelogRpcVersion}:00:00.000Z`,
          status: args.p_next_status,
        }));
        data.forEach((canonical) => {
          const row = timelogRows.find((item) => item.id === canonical.id);
          if (row) Object.assign(row, canonical);
        });
        return {
          data,
          error: null,
        };
      }
      if (name === 'transition_receipt_statuses_atomic') {
        const nextStatus = args.p_next_status as string;
        const updatedAt = nextStatus === 'submitted'
          ? '2026-08-17T14:10:00.000Z'
          : '2026-08-17T14:20:00.000Z';
        const data = (args.p_receipts as Array<{ id: string }>).map(({ id }) => ({
          id,
          updated_at: updatedAt,
          status: nextStatus,
        }));
        data.forEach((canonical) => {
          const row = receiptRows.find((receipt) => receipt.id === canonical.id);
          if (row) Object.assign(row, canonical);
        });
        return {
          data,
          error: null,
        };
      }
      if (name === 'create_invoice_atomic') {
        return {
          data: [{
            invoice_id: 'invoice-row-1', invoice_status: 'draft', invoice_updated_at: '2026-08-17T15:00:00.000Z', paid_at: null,
            timelogs: [{ id: 'timelog-row-1', status: 'invoiced', updated_at: '2026-08-17T15:00:00.000Z' }],
            receipts: [{ id: 'receipt-row-1', status: 'attached', updated_at: '2026-08-17T15:00:00.000Z' }],
          }],
          error: null,
        };
      }
      return { data: 1, error: null };
    });
    vi.doMock('../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: fromMock,
        rpc,
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
      queryClient: { invalidateQueries, setQueryData },
    }));
    vi.doMock('../lib/query-keys', () => ({
      queryKeys: {
        invoices: { all: ['invoices'] },
        timelogs: { all: ['timelogs'] },
        receipts: { all: ['receipts'] },
      },
    }));
    vi.doMock('../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn((row: Record<string, unknown>) => ({
        ...snapshot.timelogs.find((timelog) => timelog.supabaseId === row.id),
        updatedAt: row.updated_at,
        status: row.status,
      })),
      mapReceipt: vi.fn((row: Record<string, unknown>) => ({
        id: Number.NaN,
        supabaseId: row.id,
        updatedAt: row.updated_at,
        contractorProfileId: row.contractor_id,
        eventSupabaseId: row.event_id,
        eid: Number.NaN,
        job: row.job_number,
        title: row.name,
        vendor: row.supplier,
        amount: row.amount,
        paidAt: row.paid_at,
        note: row.note,
        status: row.status,
      })),
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

    const { saveTimelog, updateTimelogStatus } = await import('./timelogs/services/timelogs.service');
    const { createEmptyReceipt, saveReceipt, updateReceiptStatus } = await import('./receipts/services/receipts.service');
    const { createInvoiceFromSelection, getInvoiceCreateCandidates } = await import('./invoices/services/invoices.service');

    const savedTimelog = await saveTimelog({
      ...snapshot.timelogs[0],
      note: 'UUID first timelog',
    });
    await updateTimelogStatus(savedTimelog.id, 'sub');
    await updateTimelogStatus(savedTimelog.id, 'ch');
    await updateTimelogStatus(savedTimelog.id, 'coo');

    const receiptDraft = createEmptyReceipt('profile-uuid-1');
    let savedReceipt = await saveReceipt({
      ...receiptDraft,
      eid: 1,
      job: 'AK001',
      title: 'Parkovne',
      vendor: 'Parking',
      amount: 300,
    });
    savedReceipt = await updateReceiptStatus(savedReceipt.id, 'submit');
    savedReceipt = await updateReceiptStatus(savedReceipt.id, 'approve');

    expect(profileSelectCalls).toBe(0);

    expect(snapshot.timelogs).toEqual([
      expect.objectContaining({ id: savedTimelog.id, supabaseId: 'timelog-row-1', updatedAt: expect.any(String) }),
    ]);
    expect(snapshot.receipts).toEqual([
      expect.objectContaining({ id: savedReceipt.id, supabaseId: 'receipt-row-1', updatedAt: '2026-08-17T14:20:00.000Z' }),
    ]);

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
    expect(rpc).toHaveBeenCalledWith('create_invoice_atomic', expect.objectContaining({
      p_invoice: expect.objectContaining({ contractor_id: 'profile-uuid-1' }),
      p_receipts: [{ id: 'receipt-row-1', expected_updated_at: '2026-08-17T14:20:00.000Z' }],
    }));
    expect(receiptInsert).toHaveBeenCalledWith(expect.objectContaining({
      contractor_id: 'profile-uuid-1',
    }));
    expect(rpc).toHaveBeenCalledWith('save_timelog_atomic', expect.objectContaining({
      p_timelog_id: 'timelog-row-1',
      p_contractor_id: 'profile-uuid-1',
    }));
    expect(snapshot.timelogs[0].status).toBe('invoiced');
    expect(snapshot.receipts[0].status).toBe('attached');
  });
});
