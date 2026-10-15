import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useBilling } from './useBilling';
import { BillingError, parseBillingSnapshot } from './contract';
import { billingSnapshotFixture, id } from './test-fixtures';
const io = vi.hoisted(() => ({ auth: { currentUserId: '00000000-0000-4000-8000-000000000002', currentProfileId: '00000000-0000-4000-8000-000000000001', role: 'crew', isAuthenticated: true, isLoading: false, isRoleSwitching: false }, read: vi.fn(), execute: vi.fn() }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => io.auth }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: 'crew' }) }));
vi.mock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('./service', async (original) => ({ ...await original(), billingService: { read: (...args: unknown[]) => io.read(...args), execute: (...args: unknown[]) => io.execute(...args) } }));
beforeEach(() => { io.read.mockReset(); io.execute.mockReset(); Object.assign(io.auth, { currentUserId: id(2), currentProfileId: id(1), isAuthenticated: true }); });
it('discards late data and download side effects when identity changes', async () => {
  let finish!: (value: unknown) => void;
  io.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockImplementation(() => new Promise(() => {}));
  let current!: ReturnType<typeof useBilling>;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Probe() { current = useBilling(); return null; }
  const tree = () => <QueryClientProvider client={client}><Probe /></QueryClientProvider>;
  const view = render(tree());
  const before = current.capture();
  const oldScope = { ...current.scope };
  io.auth.currentUserId = id(22); io.auth.currentProfileId = id(21);
  view.rerender(tree());
  await act(async () => finish(parseBillingSnapshot(billingSnapshotFixture(), oldScope)));
  expect(current.query.data).toBeUndefined();
  expect(before()).toBe(false);
  expect(client.getQueryData(['invoice-billing', 'supabase', id(2), id(1), 'crew'])).toBeUndefined();
  view.unmount(); client.clear();
});
it('reloads authoritative truth after replay and never uses the old command receipt as data', async () => {
  const scope = { source: 'supabase' as const, userId: id(2), profileId: id(1), role: 'crew' as const };
  const truth = parseBillingSnapshot(billingSnapshotFixture(), scope);
  io.read.mockResolvedValue(truth); io.execute.mockResolvedValue({ statement: { status: 'ready', id: 'old' } });
  let current!: ReturnType<typeof useBilling>; const client = new QueryClient();
  function Probe() { current = useBilling(); return null; }
  const view = render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  await waitFor(() => expect(current.query.data).toBe(truth));
  await act(async () => { await current.execute({ kind: 'refresh', requestId: id(80), statementId: id(8), expectedUpdatedAt: truth.statements[0].updatedAt }); });
  expect(io.read.mock.calls.length).toBeGreaterThan(1); expect(current.query.data).toBe(truth);
  view.unmount(); client.clear();
});

it('refreshes scoped actual invoices on visible resume even when billing statements did not change, and retires the listener', async () => {
  const { usePrivateInvoiceQuery } = await import('./useBillingScope');
  const readInvoices = vi.fn().mockResolvedValue([{ id: 'same-invoice', status: 'sent', pdfPath: null }]);
  let latest!: ReturnType<typeof usePrivateInvoiceQuery<{ id: string; status: string; pdfPath: string | null }[]>>;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  function Probe() { latest = usePrivateInvoiceQuery('invoices', readInvoices); return null; }
  const view = render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  await waitFor(() => expect(latest.query.data?.[0].status).toBe('sent'));
  readInvoices.mockResolvedValue([{ id: 'same-invoice', status: 'paid', pdfPath: 'durable.pdf' }]);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => expect(latest.query.data?.[0]).toMatchObject({ status: 'paid', pdfPath: 'durable.pdf' }));
  view.unmount(); const calls = readInvoices.mock.calls.length;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(readInvoices).toHaveBeenCalledTimes(calls); client.clear();
});

it('retains an immutable operation across ambiguity even when the original caller changes its input', async () => {
  const truth = parseBillingSnapshot(billingSnapshotFixture(), { source: 'supabase', userId: id(2), profileId: id(1), role: 'crew' });
  io.read.mockResolvedValue(truth);
  io.execute.mockRejectedValueOnce(new BillingError('ambiguous', 'lost')).mockResolvedValue(undefined);
  let latest!: ReturnType<typeof useBilling>; const client = new QueryClient();
  function Probe() { latest = useBilling(); return null; }
  const view = render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  await waitFor(() => expect(latest.query.data).toBeTruthy());
  const command = { kind: 'refresh' as const, requestId: id(80), statementId: id(8), expectedUpdatedAt: truth.statements[0].updatedAt };
  await act(async () => { await expect(latest.execute(command)).rejects.toMatchObject({ kind: 'ambiguous' }); });
  command.expectedUpdatedAt = '2026-10-15T11:00:00.999999+00:00';
  await act(async () => { await latest.retry(); });
  expect(io.execute.mock.calls[1][1]).toMatchObject({ requestId: id(80), expectedUpdatedAt: truth.statements[0].updatedAt });
  view.unmount(); client.clear();
});
