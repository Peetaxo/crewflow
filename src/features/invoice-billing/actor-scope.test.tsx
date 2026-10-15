import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import InvoiceBillingView from './InvoiceBillingView';
import { id } from './test-fixtures';
const io = vi.hoisted(() => ({
 auth: { currentUserId: '00000000-0000-4000-8000-000000000009', currentProfileId: '00000000-0000-4000-8000-000000000019', role: 'coo', isAuthenticated: true, isLoading: false, isRoleSwitching: false },
 rows: vi.fn(), select: vi.fn(), retained: [{ profileId: '00000000-0000-4000-8000-000000000019', userId: '00000000-0000-4000-8000-000000000009', name: 'Původní správce' }],
}));
vi.mock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => io.auth }));
vi.mock('../../lib/app-data', () => ({ getLocalAppState: () => ({ contractors: io.retained }), subscribeToLocalAppState: () => () => {} }));
vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: () => ({ select: (fields: string) => { io.select(fields); return io.rows(); } }) } }));
vi.mock('./useBilling', () => ({ useBilling: () => ({ ready: true, scopeKey: io.auth.currentProfileId, scope: { source: 'supabase', role: io.auth.role, userId: io.auth.currentUserId, profileId: io.auth.currentProfileId }, query: { data: undefined }, capture: () => () => true }) }));
vi.mock('../invoices/queries/useInvoicesQuery', () => ({ useInvoicesQuery: () => ({ data: [{ id: 'invoice-1', job: 'J1', status: 'paid', total: 250, paidByUserId: id(9), paidByProfileId: id(19), paymentRecordedAt: '2026-10-15T10:00:00Z' }] }) }));
vi.mock('../invoices/services/invoices.service', () => ({ approveInvoice: vi.fn(), getInvoiceDependencies: () => ({ timelogs: [], events: [], contractors: [] }) }));
vi.mock('../invoices/services/invoice-pdf.service', () => ({ generateInvoicePdf: vi.fn(), getInvoicePdfDownloadUrl: vi.fn() }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: io.auth.role, searchQuery: '', setCurrentTab: vi.fn(), setSettingsSection: vi.fn() }) }));
it('never uses a previous manager roster or late name read for a new ready Crew scope', async () => {
 const managerRows = [{ id: id(19), user_id: id(9), first_name: 'Původní', last_name: 'správce' }];
 let finishOld!: (value: unknown) => void;
 io.rows.mockResolvedValueOnce({ data: managerRows, error: null }).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValue({ data: [{ id: id(1), user_id: id(2), first_name: 'Nový', last_name: 'Crew' }], error: null });
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 const tree = () => <QueryClientProvider client={client}><InvoiceBillingView /></QueryClientProvider>;
 const view = render(tree());
 await waitFor(() => expect(screen.getByText(/Úhradu zaznamenal\/a: Původní správce/)).toBeInTheDocument());
 let oldRead!: Promise<unknown>;
 act(() => { oldRead = client.invalidateQueries({ queryKey: ['invoice-billing-actors'] }); });
 await waitFor(() => expect(finishOld).toBeTypeOf('function'));
 Object.assign(io.auth, { currentUserId: id(2), currentProfileId: id(1), role: 'crew' }); view.rerender(tree());
 expect(screen.getByText(/Úhradu zaznamenal\/a: Jméno není dostupné/)).toBeInTheDocument();
 expect(screen.queryByText(/Úhradu zaznamenal\/a: Původní správce/)).not.toBeInTheDocument();
 await act(async () => { finishOld({ data: managerRows, error: null }); await oldRead; });
 expect(screen.getByText(/Úhradu zaznamenal\/a: Jméno není dostupné/)).toBeInTheDocument();
 expect(io.retained[0].name).toBe('Původní správce');
 expect(io.select).toHaveBeenCalledWith('id,user_id,first_name,last_name');
 expect(client.getQueryData(['invoice-billing-actors', 'supabase', id(9), id(19), 'coo'])).toBeUndefined();
 view.unmount(); client.clear();
});
