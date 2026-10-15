import { beforeEach, expect, it, vi } from 'vitest';
import type { Invoice } from '../../../types';
const io = vi.hoisted(() => ({ snapshot: { invoices: [] as Invoice[], timelogs: [], receipts: [], events: [], contractors: [] }, rpc: vi.fn() }));
vi.mock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { rpc: (...args: unknown[]) => io.rpc(...args) } }));
vi.mock('../../../lib/app-data', () => ({ getLocalAppState: () => structuredClone(io.snapshot), updateLocalAppState: (change: (state: typeof io.snapshot) => typeof io.snapshot) => { io.snapshot = change(io.snapshot); }, subscribeToLocalAppState: () => () => {} }));
vi.mock('../../../lib/query-client', () => ({ queryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn() } }));
vi.mock('../../timelogs/services/timelogs.service', () => ({ getTimelogs: () => [], loadTimelogsSnapshot: async () => [], markTimelogsAsApproved: vi.fn(), markTimelogsAsInvoiced: vi.fn(), markTimelogsAsPaid: vi.fn(), markTimelogsAsPaidForInvoice: vi.fn() }));
vi.mock('../../receipts/services/receipts.service', () => ({ getReceipts: () => [], fetchReceiptsSnapshot: async () => [], markReceiptsAsAttached: vi.fn(), markReceiptsAsReimbursed: vi.fn(), markReceiptsAsReimbursedForInvoice: vi.fn() }));
const current: Invoice = { id: 'invoice-current', updatedAt: '2026-10-15T10:00:00.123456+00:00', eid: 1, hours: 8, hAmt: 2000, km: 0, kAmt: 0, total: 2000, job: 'J1', status: 'sent', sentAt: null, timelogIds: [], receiptIds: [], timelogSupabaseIds: [], receiptSupabaseIds: [] };
beforeEach(() => { io.snapshot.invoices = []; io.rpc.mockReset().mockResolvedValue({ data: [{ invoice_id: current.id, invoice_status: 'paid', invoice_updated_at: '2026-10-15T11:00:00.123456+00:00', paid_at: '2026-10-15T11:00:00Z', timelogs: [], receipts: [] }], error: null }); });
it.each(['missing', 'stale'] as const)('records payment using the currently displayed server version when the global cache is %s', async (cache) => {
  if (cache === 'stale') io.snapshot.invoices = [{ ...current, status: 'draft', updatedAt: '2026-10-14T01:00:00Z' }];
  const { approveInvoice } = await import('./invoices.service');
  const result = await approveInvoice(current.id, current);
  expect(io.rpc).toHaveBeenCalledWith('mark_invoice_paid_atomic', expect.objectContaining({ p_invoice_id: current.id, p_expected_status: 'sent', p_expected_updated_at: current.updatedAt }));
  expect(result).toMatchObject({ id: current.id, status: 'paid', updatedAt: '2026-10-15T11:00:00.123456+00:00' });
});
