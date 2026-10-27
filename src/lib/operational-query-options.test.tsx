import React from 'react';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { useReceiptsQuery } from '../features/receipts/queries/useReceiptsQuery';

const io = vi.hoisted(() => ({
  source: 'supabase', revision: 1,
  auth: { isAuthenticated: true, isLoading: false, isRoleSwitching: false, currentUserId: 'u1', currentProfileId: 'p1', role: 'crew' },
  events: vi.fn(), timelogs: vi.fn(), receipts: vi.fn(),
}));
vi.mock('./app-config', () => ({ get appDataSource() { return io.source; } }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => io.auth }));
vi.mock('../features/events/services/events.service', () => ({ fetchEventsSnapshot: io.events }));
vi.mock('../features/timelogs/services/timelogs.service', () => ({ fetchTimelogsSnapshot: io.timelogs }));
vi.mock('../features/receipts/services/receipts.service', () => ({ fetchReceiptsSnapshot: io.receipts }));
const clients: QueryClient[] = [];
const client = () => {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false } } });
  clients.push(value); return value;
};
const cases = [
  ['events', useEventsQuery, io.events], ['timelogs', useTimelogsQuery, io.timelogs], ['receipts', useReceiptsQuery, io.receipts],
] as const;
beforeEach(() => {
  io.source = 'supabase'; io.revision = 1;
  Object.assign(io.auth, { isAuthenticated: true, isLoading: false, isRoleSwitching: false, currentUserId: 'u1', currentProfileId: 'p1', role: 'crew' });
  for (const read of [io.events, io.timelogs, io.receipts]) read.mockReset().mockImplementation(async () => [io.revision]);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  focusManager.setFocused(true); onlineManager.setOnline(true);
});
afterEach(() => { clients.splice(0).forEach((value) => value.clear()); vi.useRealTimers(); focusManager.setFocused(undefined); onlineManager.setOnline(true); });

describe('scoped operational query observers', () => {
  it.each(cases)('reads fresh cached %s again when a surface opens', async (prefix, useHook, read) => {
    const cache = client(); cache.setQueryData([prefix], [0]);
    let rows: unknown;
    function Probe() { rows = useHook().data; return null; }
    const view = render(<QueryClientProvider client={cache}><Probe /></QueryClientProvider>);
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    await waitFor(() => expect(rows).toEqual([1]));
    view.unmount(); io.revision = 2;
    render(<QueryClientProvider client={cache}><Probe /></QueryClientProvider>);
    await waitFor(() => expect(rows).toEqual([2]));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('shares initial and interval reads between two mounted observers and publishes another actor within 20 seconds', async () => {
    vi.useFakeTimers(); const cache = client(); const seen: unknown[] = [];
    function Probe({ index }: { index: number }) { seen[index] = useTimelogsQuery().data; return null; }
    render(<QueryClientProvider client={cache}><Probe index={0} /><Probe index={1} /></QueryClientProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(io.timelogs).toHaveBeenCalledOnce(); expect(seen).toEqual([[1], [1]]);
    io.revision = 2;
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(seen).toEqual([[2], [2]]); expect(io.timelogs).toHaveBeenCalledTimes(2);
  });

  it.each(['hidden', 'offline', 'local', 'disabled'])('does not poll while %s', async (mode) => {
    vi.useFakeTimers(); const cache = client();
    if (mode === 'local') io.source = 'local';
    if (mode === 'hidden') Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    if (mode === 'offline') { Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); onlineManager.setOnline(false); }
    if (mode === 'disabled') io.auth.isRoleSwitching = true;
    function Probe() { useEventsQuery(); return null; }
    render(<QueryClientProvider client={cache}><Probe /></QueryClientProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const calls = io.events.mock.calls.length;
    if (mode === 'disabled' || mode === 'offline') expect(calls).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(io.events).toHaveBeenCalledTimes(calls);
  });

  it('preserves fresh local-cache mount behavior', async () => {
    io.source = 'local'; const cache = client(); cache.setQueryData(['events'], [0]);
    function Probe() { useEventsQuery(); return null; }
    render(<QueryClientProvider client={cache}><Probe /></QueryClientProvider>);
    await act(async () => {}); expect(io.events).not.toHaveBeenCalled();
  });
});
