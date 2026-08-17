import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      supabaseId: 'event-uuid-1',
      projectId: 'project-uuid-1',
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
      supabaseId: 'event-uuid-2',
      projectId: 'project-uuid-2',
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
      profileId: 'profile-uuid-1',
      userId: 'user-uuid-1',
      name: 'Test User',
      ii: 'TU',
      bg: '#000',
      fg: '#fff',
      tags: [],
      events: 2,
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
      supabaseId: 'timelog-uuid-1',
      eventSupabaseId: 'event-uuid-1',
      updatedAt: '2026-04-20T10:00:00Z',
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal' as const }],
      km: 10,
      note: '',
      status: 'approved' as const,
    },
    {
      id: 2,
      supabaseId: 'timelog-uuid-2',
      eventSupabaseId: 'event-uuid-2',
      updatedAt: '2026-04-20T11:00:00Z',
      eid: 2,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-11', f: '09:00', t: '16:00', type: 'provoz' as const }],
      km: 0,
      note: '',
      status: 'approved' as const,
    },
  ],
  receipts: [
    {
      id: 11,
      supabaseId: 'receipt-uuid-11',
      updatedAt: '2026-04-20T12:00:00Z',
      contractorProfileId: 'profile-uuid-1',
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
  projects: [
    { id: 'AK001', supabaseId: 'project-uuid-1', name: 'Projekt 1', client: 'Klient A', clientId: 'client-uuid-1', createdAt: '2026-04-01' },
    { id: 'AK002', supabaseId: 'project-uuid-2', name: 'Projekt 2', client: 'Klient A', clientId: 'client-uuid-1', createdAt: '2026-04-01' },
  ],
  clients: [
    { id: 1, supabaseId: 'client-uuid-1', name: 'Klient A', ico: '87654321', dic: '', street: 'Odberatelska 1', zip: '120 00', city: 'Praha', country: 'Ceska republika' },
  ],
  ...overrides,
});

describe('invoices.service billing batches', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('routes Supabase invoice lifecycle writes through atomic invoice RPCs', () => {
    const serviceSource = readFileSync(resolve(
      process.cwd(),
      'src/features/invoices/services/invoices.service.ts',
    ), 'utf8');

    expect(serviceSource).not.toContain('getSupabaseTimelogIdMap');
    expect(serviceSource).not.toContain('getSupabaseEventIdMap');
    expect(serviceSource).not.toContain('getSupabaseReceiptIdMap');
    expect(serviceSource).toContain('createInvoiceAtomicRpc({');
    expect(serviceSource).toContain('await markInvoiceSentAtomicRpc(');
    expect(serviceSource).toContain('await markInvoicePaidAtomicRpc(');
    expect(serviceSource).toContain('await deleteInvoiceAtomicRpc(');
    expect(serviceSource).not.toMatch(/\.from\('invoices'\)\s*\.update\(/);
    const safeSelectSource = serviceSource.slice(
      serviceSource.indexOf('const safeSelect'),
      serviceSource.indexOf('const getSupabaseIdRows'),
    );
    expect(safeSelectSource).not.toContain('return [];');
    expect(safeSelectSource).toContain("throw new Error('Faktury se nepodařilo načíst.')");
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
    expect(created[0].contractorProfileId).toBe('profile-uuid-1');
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
          supabaseId: 'timelog-uuid-2',
          eventSupabaseId: 'event-uuid-2',
          updatedAt: '2026-04-20T11:00:00Z',
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
          contractorProfileId: 'profile-uuid-2',
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
        contractorProfileId: 'profile-uuid-1',
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

    const preview = getInvoiceCreatePreview('profile-uuid-1');

    expect(preview?.contractorName).toBe('Test User');
    expect(preview?.contractorProfileId).toBe('profile-uuid-1');
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
          contractorProfileId: 'profile-uuid-1',
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
        contractorProfileId: 'profile-uuid-1',
        contractorName: 'Test User',
        timelogCount: 1,
        receiptCount: 1,
        totalAmount: 2050,
      },
    ]);

    const preview = getInvoiceCreatePreview('profile-uuid-1');
    expect(preview?.timelogIds).toEqual([2]);
    expect(preview?.receiptIds).toEqual([11]);
    expect(preview?.items).toHaveLength(1);
    expect(preview?.items[0].jobNumber).toBe('AK002');
  });

  it('creates invoice from selected subset of approved items only', async () => {
    let snapshot = createSnapshot();
    const markTimelogsAsInvoiced = vi.fn();
    const markReceiptsAsAttached = vi.fn();
    const rpc = vi.fn((name: string) => {
      if (name === 'next_self_billing_invoice_sequence') return Promise.resolve({ data: 1, error: null });
      if (name === 'create_invoice_atomic') return Promise.resolve({
        data: [{
          invoice_id: 'invoice-uuid-1', invoice_status: 'draft', invoice_updated_at: '2026-04-27T10:00:00Z', paid_at: null,
          timelogs: [{ id: 'timelog-uuid-2', status: 'invoiced', updated_at: '2026-04-27T10:00:00Z' }],
          receipts: [{ id: 'receipt-uuid-11', status: 'attached', updated_at: '2026-04-27T10:00:00Z' }],
        }],
        error: null,
      });
      throw new Error(`Unexpected RPC ${name}`);
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn(() => { throw new Error('Invoice creation must not use REST writes'); }),
        rpc,
      },
    }));
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

    const created = await createInvoiceFromSelection('profile-uuid-1', [2], [11]);

    expect(created?.jobNumbers).toEqual(['AK002']);
    expect(created?.timelogIds).toEqual([2]);
    expect(created?.receiptIds).toEqual([11]);
    expect(created?.total).toBe(2050);
    expect(rpc).toHaveBeenCalledWith('create_invoice_atomic', expect.objectContaining({
      p_timelogs: [{ id: 'timelog-uuid-2', expected_updated_at: '2026-04-20T11:00:00Z' }],
      p_receipts: [{ id: 'receipt-uuid-11', expected_updated_at: '2026-04-20T12:00:00Z' }],
    }));
    expect(markTimelogsAsInvoiced).not.toHaveBeenCalled();
    expect(markReceiptsAsAttached).not.toHaveBeenCalled();
    expect(snapshot.timelogs.find((item) => item.supabaseId === 'timelog-uuid-2')?.status).toBe('invoiced');
    expect(snapshot.receipts.find((item) => item.supabaseId === 'receipt-uuid-11')?.status).toBe('attached');

    snapshot = {
      ...snapshot,
      invoices: [],
      timelogs: snapshot.timelogs.map((row) => row.id === 2
        ? { ...row, supabaseId: undefined, status: 'approved' as const }
        : row),
      receipts: snapshot.receipts.map((row) => ({ ...row, status: 'approved' as const })),
    };
    await expect(createInvoiceFromSelection('profile-uuid-1', [2], [11])).rejects.toThrow(
      'Faktura obsahuje neplatné nebo neúplné údaje.',
    );

    snapshot = {
      ...snapshot,
      timelogs: snapshot.timelogs.map((row) => row.id === 2 ? { ...row, supabaseId: 'timelog-uuid-2' } : row),
    };
    await expect(createInvoiceFromSelection('profile-uuid-1', [2, 2], [11])).rejects.toThrow(
      'Faktura obsahuje neplatné nebo neúplné údaje.',
    );
    expect(rpc.mock.calls.filter(([name]) => name === 'create_invoice_atomic')).toHaveLength(1);
  });

  it('persists invoice number dates and billing snapshots when creating an invoice', async () => {
    let snapshot = createSnapshot({
      timelogs: [
        {
          id: 2,
          supabaseId: 'timelog-uuid-2',
          eventSupabaseId: 'event-uuid-2',
          updatedAt: '2026-04-20T11:00:00Z',
          eid: 2,
          contractorProfileId: 'profile-uuid-1',
          days: [{ d: '2026-04-11', f: '09:00', t: '16:00', type: 'provoz' as const }],
          km: 0,
          note: '',
          status: 'approved' as const,
        },
      ],
      receipts: [
        {
          id: 11,
          supabaseId: 'receipt-uuid-11',
          updatedAt: '2026-04-20T12:00:00Z',
          contractorProfileId: 'profile-uuid-1',
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
    });
    snapshot = {
      ...snapshot,
      contractors: [{
        ...snapshot.contractors[0],
        name: 'Tomas Novak',
        ico: '12345678',
        bank: '123456789/0100',
        billingName: 'Tomas Novak',
        billingStreet: 'Dodavatelska 1',
        billingZip: '110 00',
        billingCity: 'Praha',
        billingCountry: 'Ceska republika',
      }],
      events: snapshot.events.map((event) => event.id === 2 ? { ...event, projectId: 'project-uuid-2' } : event),
      projects: [{ id: 'AK002', supabaseId: 'project-uuid-2', name: 'Projekt 2', client: 'Klient B', clientId: 'client-uuid-2', createdAt: '2026-04-01' }],
      clients: [{ id: 2, supabaseId: 'client-uuid-2', name: 'Klient B', ico: '87654321', dic: '', street: 'Odberatelska 1', zip: '120 00', city: 'Praha', country: 'Ceska republika' }],
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T10:00:00Z'));

    const rpc = vi.fn((name: string) => Promise.resolve(name === 'next_self_billing_invoice_sequence'
      ? { data: 1, error: null }
      : {
        data: [{
          invoice_id: 'invoice-uuid-1', invoice_status: 'draft', invoice_updated_at: '2026-04-27T10:00:00Z', paid_at: null,
          timelogs: [{ id: 'timelog-uuid-2', status: 'invoiced', updated_at: '2026-04-27T10:00:00Z' }],
          receipts: [{ id: 'receipt-uuid-11', status: 'attached', updated_at: '2026-04-27T10:00:00Z' }],
        }],
        error: null,
      }));
    const fromMock = vi.fn(() => { throw new Error('Invoice creation must not use REST writes'); });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: fromMock, rpc } }));
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
    vi.doMock('../../../utils', () => ({ calculateTotalHours: () => 7 }));
    vi.doMock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

    const { createInvoiceFromSelection } = await import('./invoices.service');
    await createInvoiceFromSelection('profile-uuid-1', [2], [11]);

    expect(rpc).toHaveBeenCalledWith('next_self_billing_invoice_sequence', {
      p_invoice_year: 2026,
      p_supplier_profile_id: 'profile-uuid-1',
    });
    expect(rpc).toHaveBeenCalledWith('create_invoice_atomic', expect.objectContaining({
      p_invoice: expect.objectContaining({
        invoice_number: 'SF-2026-NOVAK-T-0001',
        issue_date: '2026-04-27',
        taxable_supply_date: '2026-04-27',
        due_date: '2026-05-11',
        currency: 'CZK',
        supplier_snapshot: expect.objectContaining({ vatPayer: false, ico: '12345678' }),
        customer_snapshot: expect.objectContaining({ clientId: 'client-uuid-2', name: 'Klient B' }),
      }),
    }));
  });

  it('marks paid and deletes through atomic RPCs and reconciles children by stable UUID', async () => {
    let snapshot = createSnapshot({
      invoices: [{
        id: 'invoice-uuid-1', updatedAt: '2026-04-28T10:00:00Z', contractorProfileId: 'profile-uuid-1',
        eid: 2, eventIds: [2], timelogIds: [2], timelogSupabaseIds: ['timelog-uuid-2'],
        receiptIds: [11], receiptSupabaseIds: ['receipt-uuid-11'], hours: 7, hAmt: 1750,
        km: 0, kAmt: 0, receiptAmt: 300, total: 2050, job: 'AK002', status: 'sent', sentAt: '2026-04-28T09:00:00Z',
      }],
      timelogs: createSnapshot().timelogs.map((row) => row.id === 2 ? { ...row, status: 'invoiced' as const } : row),
      receipts: createSnapshot().receipts.map((row) => ({ ...row, status: 'attached' as const })),
    });
    const rpc = vi.fn((name: string) => Promise.resolve(name === 'mark_invoice_paid_atomic'
      ? {
        data: [{
          invoice_id: 'invoice-uuid-1', invoice_status: 'paid', invoice_updated_at: '2026-04-28T11:00:00Z', paid_at: '2026-04-28T11:00:00Z',
          timelogs: [{ id: 'timelog-uuid-2', status: 'paid', updated_at: '2026-04-28T11:00:00Z' }],
          receipts: [{ id: 'receipt-uuid-11', status: 'reimbursed', updated_at: '2026-04-28T11:00:00Z' }],
        }], error: null,
      }
      : {
        data: [{
          invoice_id: 'invoice-uuid-1', invoice_status: 'draft', invoice_updated_at: '2026-04-28T12:00:00Z', paid_at: null,
          timelogs: [{ id: 'timelog-uuid-2', status: 'approved', updated_at: '2026-04-28T12:00:00Z' }],
          receipts: [{ id: 'receipt-uuid-11', status: 'approved', updated_at: '2026-04-28T12:00:00Z' }],
        }], error: null,
      }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from: vi.fn(() => { throw new Error('Lifecycle mutations must not use REST'); }), rpc },
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapInvoice: vi.fn() }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    const markTimelogsAsPaid = vi.fn();
    const markTimelogsAsApproved = vi.fn();
    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      getTimelogs: () => structuredClone(snapshot.timelogs), markTimelogsAsInvoiced: vi.fn(),
      markTimelogsAsPaid, markTimelogsAsApproved, markTimelogsAsPaidForInvoice: vi.fn(),
    }));
    const markReceiptsAsReimbursed = vi.fn();
    vi.doMock('../../receipts/services/receipts.service', () => ({
      getReceipts: () => structuredClone(snapshot.receipts), markReceiptsAsAttached: vi.fn(),
      markReceiptsAsReimbursed, markReceiptsAsReimbursedForInvoice: vi.fn(),
    }));
    vi.doMock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

    const { approveInvoice, deleteInvoice } = await import('./invoices.service');
    await approveInvoice('invoice-uuid-1');

    expect(rpc).toHaveBeenCalledWith('mark_invoice_paid_atomic', {
      p_invoice_id: 'invoice-uuid-1', p_expected_status: 'sent',
      p_expected_updated_at: '2026-04-28T10:00:00Z', p_paid_at: expect.any(String),
    });
    expect(snapshot.timelogs.find((row) => row.supabaseId === 'timelog-uuid-2')?.status).toBe('paid');
    expect(snapshot.receipts[0].status).toBe('reimbursed');
    expect(markTimelogsAsPaid).not.toHaveBeenCalled();
    expect(markReceiptsAsReimbursed).not.toHaveBeenCalled();

    snapshot = {
      ...snapshot,
      invoices: snapshot.invoices.map((invoice) => ({ ...invoice, status: 'draft' as const, updatedAt: '2026-04-28T11:30:00Z' })),
      timelogs: snapshot.timelogs.map((row) => row.supabaseId === 'timelog-uuid-2' ? { ...row, status: 'invoiced' as const } : row),
      receipts: snapshot.receipts.map((row) => ({ ...row, status: 'attached' as const })),
    };
    await deleteInvoice('invoice-uuid-1');

    expect(rpc).toHaveBeenCalledWith('delete_invoice_atomic', {
      p_invoice_id: 'invoice-uuid-1', p_expected_status: 'draft', p_expected_updated_at: '2026-04-28T11:30:00Z',
    });
    expect(snapshot.invoices).toEqual([]);
    expect(snapshot.timelogs.find((row) => row.supabaseId === 'timelog-uuid-2')?.status).toBe('approved');
    expect(snapshot.receipts[0].status).toBe('approved');
    expect(markTimelogsAsApproved).not.toHaveBeenCalled();
  });

  it('marks sent through the atomic RPC and reconciles the canonical invoice version by UUID', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-28T09:30:00Z'));
    let snapshot = createSnapshot({
      invoices: [{
        id: 'invoice-uuid-1', updatedAt: '2026-04-28T09:00:00Z', contractorProfileId: 'profile-uuid-1',
        eid: 2, eventIds: [2], timelogIds: [2], timelogSupabaseIds: ['timelog-uuid-2'],
        receiptIds: [11], receiptSupabaseIds: ['receipt-uuid-11'], hours: 7, hAmt: 1750,
        km: 0, kAmt: 0, receiptAmt: 300, total: 2050, job: 'AK002', status: 'draft', sentAt: null,
      }],
      timelogs: createSnapshot().timelogs.map((row) => row.id === 2 ? { ...row, status: 'invoiced' as const } : row),
      receipts: createSnapshot().receipts.map((row) => ({ ...row, status: 'attached' as const })),
    });
    const from = vi.fn(() => { throw new Error('Sending an invoice must not use REST DML'); });
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        invoice_id: 'invoice-uuid-1', invoice_status: 'sent', invoice_updated_at: '2026-04-28T09:31:00Z', paid_at: null,
        timelogs: [{ id: 'timelog-uuid-2', status: 'invoiced', updated_at: '2026-04-20T11:00:00Z' }],
        receipts: [{ id: 'receipt-uuid-11', status: 'attached', updated_at: '2026-04-20T12:00:00Z' }],
      }],
      error: null,
    });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from, rpc } }));
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
      getTimelogs: () => structuredClone(snapshot.timelogs), markTimelogsAsInvoiced: vi.fn(),
      markTimelogsAsPaid: vi.fn(), markTimelogsAsApproved: vi.fn(), markTimelogsAsPaidForInvoice: vi.fn(),
    }));
    vi.doMock('../../receipts/services/receipts.service', () => ({
      getReceipts: () => structuredClone(snapshot.receipts), markReceiptsAsAttached: vi.fn(),
      markReceiptsAsReimbursed: vi.fn(), markReceiptsAsReimbursedForInvoice: vi.fn(),
    }));
    vi.doMock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

    const { sendInvoice } = await import('./invoices.service');
    const sent = await sendInvoice('invoice-uuid-1');

    expect(rpc).toHaveBeenCalledWith('mark_invoice_sent_atomic', {
      p_invoice_id: 'invoice-uuid-1',
      p_expected_updated_at: '2026-04-28T09:00:00Z',
      p_sent_at: '2026-04-28T09:30:00.000Z',
    });
    expect(from).not.toHaveBeenCalled();
    expect(snapshot.invoices[0]).toMatchObject({
      id: 'invoice-uuid-1', status: 'sent', sentAt: '2026-04-28T09:30:00.000Z', updatedAt: '2026-04-28T09:31:00Z',
    });
    expect(sent).toMatchObject({
      id: 'invoice-uuid-1', status: 'sent', sentAt: '2026-04-28T09:30:00.000Z', updatedAt: '2026-04-28T09:31:00Z',
    });
  });

  it('preserves contractor and legacy timelog UUIDs during Supabase hydration', async () => {
    let snapshot = createSnapshot({
      timelogs: [
        { ...createSnapshot().timelogs[0], id: 1, supabaseId: 'other-timelog-uuid' },
        { ...createSnapshot().timelogs[1], id: 2, supabaseId: 'legacy-timelog-uuid', status: 'invoiced' },
      ],
    });
    const createDoubleOrderMock = <T,>(data: T[]) => {
      const secondOrder = vi.fn().mockResolvedValue({ data, error: null });
      const firstOrder = vi.fn(() => ({ order: secondOrder }));
      return { order: firstOrder };
    };

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'invoices') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'invoice-row-1',
                      contractor_id: 'profile-uuid-1',
                      event_id: 'event-row-1',
                      timelog_id: 'legacy-timelog-uuid',
                      job_number: 'AK001',
                      total_hours: 8,
                      amount_hours: 2000,
                      amount_km: 0,
                      amount_receipts: 300,
                      total_amount: 2300,
                      status: 'draft',
                      sent_at: null,
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

          if (table === 'invoice_items' || table === 'invoice_timelogs' || table === 'invoice_receipts') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            };
          }

          if (table === 'timelogs') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [{ id: 'other-timelog-uuid' }, { id: 'legacy-timelog-uuid' }],
                  error: null,
                }),
              })),
            };
          }

          if (table === 'receipts') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapInvoice: vi.fn(() => ({
        id: 'invoice-row-1',
        contractorProfileId: 'profile-uuid-1',
        eid: Number.NaN,
        hours: 8,
        hAmt: 2000,
        km: 0,
        kAmt: 0,
        receiptAmt: 300,
        total: 2300,
        job: 'AK001',
        status: 'draft',
        sentAt: null,
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

    const { getInvoices } = await import('./invoices.service');

    getInvoices();
    await vi.waitFor(() => expect(getInvoices()).toHaveLength(1));
    const invoices = getInvoices();

    expect(invoices[0].contractorProfileId).toBe('profile-uuid-1');
    expect(invoices[0].eid).toBe(1);
    expect(invoices[0].timelogIds).toEqual([2]);
    expect(invoices[0].timelogSupabaseIds).toEqual(['legacy-timelog-uuid']);
  });
});
