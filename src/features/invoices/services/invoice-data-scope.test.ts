import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ snapshot: { invoices: [{ id: 'private-A' }], timelogs: [], receipts: [], events: [], contractors: [] }, invoices: vi.fn() }));
vi.mock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: (table: string) => ({ select: () => {
  const response = table === 'invoices' ? io.invoices() : Promise.resolve({ data: [], error: null });
  const query = { order: () => query, range: () => response, then: response.then.bind(response) }; return query;
} }) } }));
vi.mock('../../../lib/app-data', () => ({ getLocalAppState: () => structuredClone(io.snapshot), updateLocalAppState: (change: (state: typeof io.snapshot) => typeof io.snapshot) => { io.snapshot = change(io.snapshot); }, subscribeToLocalAppState: () => () => {} }));
vi.mock('../../../lib/supabase-mappers', () => ({ mapInvoice: (row: { id: string }) => ({ ...row, contractorProfileId: 'A', eid: 0 }) }));
vi.mock('../../../lib/query-client', () => ({ queryClient: { setQueryData: vi.fn(), setQueriesData: vi.fn(), invalidateQueries: vi.fn() } }));
vi.mock('../../timelogs/services/timelogs.service', () => ({ getTimelogs: () => [], loadTimelogsSnapshot: async () => [], markTimelogsAsApproved: vi.fn(), markTimelogsAsInvoiced: vi.fn(), markTimelogsAsPaid: vi.fn(), markTimelogsAsPaidForInvoice: vi.fn() }));
vi.mock('../../receipts/services/receipts.service', () => ({ getReceipts: () => [], fetchReceiptsSnapshot: async () => [], markReceiptsAsAttached: vi.fn(), markReceiptsAsReimbursed: vi.fn(), markReceiptsAsReimbursedForInvoice: vi.fn() }));
beforeEach(() => { io.snapshot = { invoices: [{ id: 'private-A' }], timelogs: [], receipts: [], events: [], contractors: [] }; io.invoices.mockReset(); });
it('clears the previous private store synchronously and never publishes its late hydration into a new owner', async () => {
  let finish!: (value: unknown) => void;
  io.invoices.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockImplementation(() => new Promise(() => {}));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const { getInvoices, resetSupabaseInvoicesHydration } = await import('./invoices.service');
    getInvoices(); resetSupabaseInvoicesHydration();
    expect(io.snapshot.invoices).toEqual([]);
    io.snapshot.invoices = [{ id: 'private-B' }];
    finish({ data: [{ id: 'private-A-delayed', contractor_id: 'A' }], error: null });
    await vi.waitFor(() => expect(warning).toHaveBeenCalled());
    expect(io.snapshot.invoices).toEqual([{ id: 'private-B' }]);
  } finally { warning.mockRestore(); error.mockRestore(); }
});
