import React from 'react';
import { QueryClient, QueryClientProvider, QueryObserver, onlineManager, focusManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppDataFreshness from './AppDataFreshness';
import { operationalQueryOptions } from '../../lib/operational-query-options';

const io = vi.hoisted(() => ({
  source: 'supabase', native: false, addListener: vi.fn(), getState: vi.fn(), remove: vi.fn(),
  auth: { isAuthenticated: true, isLoading: false, isRoleSwitching: false, currentUserId: 'u1', currentProfileId: 'p1', role: 'crew' },
  context: { currentTab: 'my-timelogs', selectedEventId: null as string | null, selectedProjectIdForStats: null as string | null },
}));
vi.mock('../../lib/app-config', () => ({ get appDataSource() { return io.source; } }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => io.auth }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => io.context }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => io.native } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: io.addListener, getState: io.getState } }));
let onNativeState: (event: { isActive: boolean }) => void;
const clients: QueryClient[] = []; const stops: (() => void)[] = [];
function createClient() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false } } }); clients.push(client); return client; }
function observe(client: QueryClient, key: readonly unknown[], read = vi.fn().mockResolvedValue(['cached']), enabled = true) {
  client.setQueryData(key, ['cached']);
  const observer = new QueryObserver(client, { queryKey: key, queryFn: read, enabled });
  stops.push(observer.subscribe(() => {})); return read;
}
function mount(client: QueryClient) {
  const tree = () => <QueryClientProvider client={client}><AppDataFreshness /><input aria-label="Rozepsaná poznámka" defaultValue="" /></QueryClientProvider>;
  const view = render(tree()); return { ...view, rerender: () => view.rerender(tree()) };
}
async function settled(client: QueryClient) { await waitFor(() => expect(client.isFetching()).toBe(0)); }
beforeEach(() => {
  io.source = 'supabase'; io.native = false;
  Object.assign(io.auth, { isAuthenticated: true, isLoading: false, isRoleSwitching: false, currentUserId: 'u1', currentProfileId: 'p1', role: 'crew' });
  Object.assign(io.context, { currentTab: 'my-timelogs', selectedEventId: null, selectedProjectIdForStats: null });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  onlineManager.setOnline(true); focusManager.setFocused(undefined); io.getState.mockReset().mockResolvedValue({ isActive: true }); io.remove.mockReset().mockResolvedValue(undefined);
  io.addListener.mockReset().mockImplementation(async (_name, handler) => { onNativeState = handler; return { remove: io.remove }; });
});
afterEach(() => { act(() => { stops.splice(0).forEach(stop => stop()); clients.splice(0).forEach(client => client.clear()); onlineManager.setOnline(true); focusManager.setFocused(undefined); vi.useRealTimers(); }); });

describe('operational foreground bridge', () => {
  it('refreshes active current operational queries on navigation and browser resume without restarting a shared read', async () => {
    const client = createClient();
    const active = observe(client, ['timelogs']); const invoice = observe(client, ['invoices', 'supabase', 'u1', 'p1', 'crew']);
    const unrelated = observe(client, ['clients']); const disabled = observe(client, ['events'], vi.fn(), false);
    const oldScope = observe(client, ['invoices', 'supabase', 'old-user', 'old-profile', 'crew']);
    const dormant = vi.fn(); client.setQueryDefaults(['receipts'], { queryFn: dormant }); client.setQueryData(['receipts'], ['cached']);
    const view = mount(client); await settled(client); active.mockClear(); invoice.mockClear();
    io.context.currentTab = 'approvals'; view.rerender(); await settled(client);
    expect(active).toHaveBeenCalledOnce(); expect(invoice).toHaveBeenCalledOnce();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); await settled(client);
    expect(active).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(active).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    let finish!: (rows: string[]) => void; active.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    expect(active).toHaveBeenCalledTimes(3);
    await act(async () => finish(['remote'])); expect(client.getQueryData(['timelogs'])).toEqual(['remote']);
    for (const read of [unrelated, disabled, oldScope, dormant]) expect(read).not.toHaveBeenCalled();
    view.unmount(); const count = active.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
    expect(active).toHaveBeenCalledTimes(count);
  });

  it.each(['local', 'loading', 'switching', 'signed out', 'missing user', 'missing profile', 'missing role'])('disables the bridge and warning while %s', async mode => {
    if (mode === 'local') io.source = 'local';
    if (mode === 'loading') io.auth.isLoading = true;
    if (mode === 'switching') io.auth.isRoleSwitching = true;
    if (mode === 'signed out') io.auth.isAuthenticated = false;
    if (mode === 'missing user') io.auth.currentUserId = '';
    if (mode === 'missing profile') io.auth.currentProfileId = '';
    if (mode === 'missing role') io.auth.role = '';
    io.native = true; const client = createClient(); const read = observe(client, ['events']); mount(client);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await act(async () => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('offline')); });
    expect(read).not.toHaveBeenCalled(); expect(io.addListener).not.toHaveBeenCalled();
    expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument();
  });

  it('refreshes on native foreground and retires the listener on identity changes and unmount', async () => {
    io.native = true; const client = createClient(); const read = observe(client, ['events']); const view = mount(client); await settled(client);
    expect(io.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function)); read.mockClear();
    await act(async () => onNativeState({ isActive: false })); expect(read).not.toHaveBeenCalled();
    await act(async () => onNativeState({ isActive: true })); await settled(client); expect(read).toHaveBeenCalledOnce();
    const retired = onNativeState; io.auth.currentUserId = 'u2'; view.rerender(); await settled(client);
    const calls = read.mock.calls.length; await act(async () => retired({ isActive: true })); expect(read).toHaveBeenCalledTimes(calls);
    expect(io.remove).toHaveBeenCalledOnce(); view.unmount(); expect(io.remove).toHaveBeenCalledTimes(2);
    await act(async () => onNativeState({ isActive: true })); expect(read).toHaveBeenCalledTimes(calls);
  });

  it('removes a native listener that resolves after unmount', async () => {
    io.native = true; let finish!: (handle: { remove: typeof io.remove }) => void;
    io.addListener.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const client = createClient(); observe(client, ['events']); const view = mount(client); view.unmount();
    await act(async () => finish({ remove: io.remove })); expect(io.remove).toHaveBeenCalledOnce();
  });
});

describe('stale data feedback', () => {
  it('retains cached rows and draft offline, keeps the warning through failed retries, and clears it after actual success', async () => {
    const client = createClient(); const read = observe(client, ['timelogs']); mount(client); await settled(client);
    const input = screen.getByLabelText('Rozepsaná poznámka'); fireEvent.change(input, { target: { value: 'Moje rozepsané hodnoty' } });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
    expect(screen.getByText(/Zobrazená data jsou z posledního načtení/)).toBeInTheDocument();
    expect(client.getQueryData(['timelogs'])).toEqual(['cached']);
    const calls = read.mock.calls.length; fireEvent.click(screen.getByRole('button', { name: 'Zkusit obnovit' })); expect(read).toHaveBeenCalledTimes(calls);
    read.mockRejectedValue(new Error('temporary read failure'));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await act(async () => { window.dispatchEvent(new Event('online')); }); await settled(client);
    expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
    expect(client.getQueryData(['timelogs'])).toEqual(['cached']); expect(input).toHaveValue('Moje rozepsané hodnoty');
    let finish!: (rows: string[]) => void; read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit obnovit' }));
    expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
    await act(async () => finish(['new rows']));
    await waitFor(() => expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument());
    expect(client.getQueryData(['timelogs'])).toEqual(['new rows']); expect(input).toHaveValue('Moje rozepsané hodnoty');
    expect(screen.getByLabelText('Rozepsaná poznámka')).toBe(input);
  });

  it('does not clear an offline warning before the reconnect read succeeds', async () => {
    const client = createClient(); const read = observe(client, ['events']); mount(client); await settled(client);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    let finish!: (rows: string[]) => void; read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
    await act(async () => finish(['fresh']));
    await waitFor(() => expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument());
  });

  it('shows active read errors but ignores inactive, disabled, unrelated and retired-scope errors', async () => {
    const client = createClient(); const active = observe(client, ['events']); const view = mount(client); await settled(client);
    const fail = async () => { throw new Error('read failure'); };
    for (const key of [['receipts'], ['clients'], ['invoices', 'supabase', 'retired', 'p1', 'crew']]) {
      await client.fetchQuery({ queryKey: key, queryFn: fail, staleTime: 0 }).catch(() => {});
    }
    observe(client, ['clients']); observe(client, ['invoices', 'supabase', 'retired', 'p1', 'crew']); observe(client, ['receipts'], vi.fn(), false);
    await act(async () => {}); expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument();
    active.mockRejectedValue(new Error('active read failure'));
    await act(async () => { await client.refetchQueries({ queryKey: ['events'] }); });
    expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
    io.auth.isRoleSwitching = true; view.rerender(); expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument();
  });

  it('warns when a current read is paused even if navigator still reports online', async () => {
    const client = createClient(); observe(client, ['events']); mount(client); await settled(client);
    onlineManager.setOnline(false);
    await act(async () => { void client.refetchQueries({ queryKey: ['events'] }); });
    expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
    await act(async () => { onlineManager.setOnline(true); });
    await waitFor(() => expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument());
  });
});

it('keeps an initially offline cache stale until a reconnect read succeeds', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  const client = createClient(); let finish!: (rows: string[]) => void;
  observe(client, ['events'], vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })));
  mount(client); expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => { window.dispatchEvent(new Event('online')); });
  expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
  await act(async () => finish(['fresh']));
  await waitFor(() => expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument());
});

it('reconciles connectivity on native resume when the online event happened in the background', async () => {
  io.native = true; const client = createClient(); observe(client, ['events']); mount(client); await settled(client);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => { window.dispatchEvent(new Event('offline')); });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => onNativeState({ isActive: true })); await settled(client);
  expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument();
});

it('suspends operational polling on native inactivity even if the WebView remains visible, then refreshes on foreground', async () => {
  vi.useFakeTimers(); io.native = true; const client = createClient();
  client.setQueryData(['timelogs'], ['cached']);
  const read = vi.fn().mockResolvedValue(['cached']);
  const observer = new QueryObserver(client, { queryKey: ['timelogs'], queryFn: read, ...operationalQueryOptions(true) });
  stops.push(observer.subscribe(() => {})); const view = mount(client);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  await act(async () => onNativeState({ isActive: false }));
  const calls = read.mock.calls.length;
  expect(document.visibilityState).toBe('visible');
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(read).toHaveBeenCalledTimes(calls);
  read.mockResolvedValue(['remote']);
  await act(async () => { onNativeState({ isActive: true }); await vi.advanceTimersByTimeAsync(1); });
  expect(client.getQueryData(['timelogs'])).toEqual(['remote']); expect(read).toHaveBeenCalledTimes(calls + 1);
  view.unmount(); expect(focusManager.isFocused()).toBe(true);
});

it('honors native background state at mount without letting a late initial state replace a newer event', async () => {
  io.native = true; io.getState.mockResolvedValueOnce({ isActive: false });
  const client = createClient(); observe(client, ['events']); const first = mount(client);
  await act(async () => {}); expect(focusManager.isFocused()).toBe(false); first.unmount();
  let finish!: (state: { isActive: boolean }) => void;
  io.getState.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const second = mount(client);
  await act(async () => onNativeState({ isActive: true }));
  await act(async () => finish({ isActive: false }));
  expect(focusManager.isFocused()).toBe(true); second.unmount();
});

it('ignores an initial native state read that resolves after unmount', async () => {
  io.native = true; let finish!: (state: { isActive: boolean }) => void;
  io.getState.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const client = createClient(); observe(client, ['events']); const view = mount(client); view.unmount();
  await act(async () => finish({ isActive: false })); expect(focusManager.isFocused()).toBe(true);
});

it('keeps actual offline state on native foreground and waits for a successful later read', async () => {
  io.native = true; const client = createClient(); const read = observe(client, ['events']); mount(client); await settled(client);
  const calls = read.mock.calls.length;
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => onNativeState({ isActive: true }));
  expect(onlineManager.isOnline()).toBe(false); expect(read).toHaveBeenCalledTimes(calls);
  expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
  read.mockRejectedValue(new Error('transport failed'));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await act(async () => onNativeState({ isActive: true })); await settled(client);
  expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
});

it('keeps failed-read feedback through manual cache publication until an actual read succeeds', async () => {
  const client = createClient(); const read = observe(client, ['events']); mount(client); await settled(client);
  read.mockRejectedValue(new Error('failed read'));
  await act(async () => { await client.refetchQueries({ queryKey: ['events'] }); });
  expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
  await act(async () => { client.setQueryData(['events'], ['own write']); });
  expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
  let finish!: (rows: string[]) => void; read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Zkusit obnovit' }));
  await act(async () => { client.setQueryData(['events'], ['another manual publication']); });
  expect(screen.getByText('Data nemusí být aktuální')).toBeInTheDocument();
  await act(async () => finish(['actual read']));
  await waitFor(() => expect(screen.queryByText('Data nemusí být aktuální')).not.toBeInTheDocument());
});
