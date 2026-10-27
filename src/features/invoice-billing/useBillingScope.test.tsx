import React from 'react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { privateInvoiceQueryKey, usePrivateInvoiceQuery } from './useBillingScope';
const io = vi.hoisted(() => ({ source: 'supabase', auth: { currentUserId: 'u1', currentProfileId: 'p1', role: 'crew', isAuthenticated: true, isLoading: false, isRoleSwitching: false } }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => io.auth }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: 'crew' }) }));
vi.mock('../../lib/app-config', () => ({ get appDataSource() { return io.source; } }));
const clients: QueryClient[] = [];
beforeEach(() => {
  io.source = 'supabase'; io.auth.isRoleSwitching = false;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); focusManager.setFocused(undefined); });
it('refreshes fresh invoice cache on a new surface', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } }); clients.push(client);
  client.setQueryData(privateInvoiceQueryKey('invoices', { source: 'supabase', userId: 'u1', profileId: 'p1', role: 'crew' }), [0]);
  const read = vi.fn().mockResolvedValue([1]); let rows: number[] | undefined;
  function Probe() { rows = usePrivateInvoiceQuery<number[]>('invoices', read).query.data; return null; }
  render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  await waitFor(() => expect(rows).toEqual([1])); expect(read).toHaveBeenCalledOnce();
});
it('publishes remote invoice changes within 20 seconds', async () => {
  vi.useFakeTimers(); const client = new QueryClient(); clients.push(client);
  const read = vi.fn().mockResolvedValue([0]); let rows: number[] | undefined;
  function Probe() { rows = usePrivateInvoiceQuery<number[]>('invoices', read).query.data; return null; }
  render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(rows).toEqual([0]);
  read.mockResolvedValue([1]);
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); }); expect(rows).toEqual([1]);
});
it('deduplicates standalone visibility refreshes between consumers and removes both listeners', async () => {
  const client = new QueryClient(); clients.push(client); let finish!: (rows: number[]) => void;
  const read = vi.fn().mockResolvedValue([0]);
  function Probe() { usePrivateInvoiceQuery('invoices', read); return null; }
  const view = render(<QueryClientProvider client={client}><Probe /><Probe /></QueryClientProvider>);
  await waitFor(() => expect(client.isFetching()).toBe(0)); read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => finish([1])); view.unmount();
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); expect(read).toHaveBeenCalledTimes(2);
});

it('preserves local invoice focus refresh behavior without adding polling', async () => {
  io.source = 'local'; const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false } } }); clients.push(client);
  const read = vi.fn().mockResolvedValue([0]);
  function Probe() { usePrivateInvoiceQuery('invoices', read); return null; }
  render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
  await waitFor(() => expect(client.isFetching()).toBe(0)); read.mockClear();
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await waitFor(() => expect(read).toHaveBeenCalledOnce()); focusManager.setFocused(undefined);
});
