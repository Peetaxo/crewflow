import React, { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextType } from '../../app/providers/auth-context';
import type { AppContextType } from '../../context/app-context';
import type { Role } from '../../types';
import { BillingError, type BillingSnapshot, type BillingScope, type SaveBillingGroup } from './billing-groups.model';
import { billingQueryKey, useBillingGroups } from './useBillingGroups';

const boundaries = vi.hoisted(() => ({
  source: 'supabase' as 'local' | 'supabase',
  auth: null as AuthContextType | null,
  context: null as AppContextType | null,
  read: vi.fn(),
  save: vi.fn(),
  events: vi.fn(),
  timelogs: vi.fn(),
}));

vi.mock('../../app/providers/useAuth', () => ({
  useAuth: () => boundaries.auth,
}));

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => boundaries.context,
}));

vi.mock('../../lib/app-config', () => ({
  get appDataSource() {
    return boundaries.source;
  },
}));

vi.mock('../../lib/app-data', () => ({
  getLocalAppState: () => ({ projects: [] }),
}));

vi.mock('./billing-groups.gateway', () => ({
  readBillingGroups: (...args: unknown[]) => boundaries.read(...args),
  saveBillingGroup: (...args: unknown[]) => boundaries.save(...args),
  BillingError,
}));

vi.mock('../events/services/events.service', () => ({
  fetchEventsSnapshot: () => boundaries.events(),
}));

vi.mock('../timelogs/services/timelogs.service', () => ({
  fetchTimelogsSnapshot: () => boundaries.timelogs(),
}));

const noop = () => undefined;
const asyncNoop = async () => undefined;

function authFor(userId: string | null, profileId: string | null, role: Role | null, overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    isAuthRequired: true,
    isAuthenticated: true,
    isLoading: false,
    hasKnownSession: true,
    isDevSession: false,
    session: null,
    user: null,
    role,
    isRoleSwitching: false,
    profile: null,
    currentProfileId: profileId,
    currentUserId: userId,
    currentContractorId: null,
    devLoginOptions: [],
    signIn: asyncNoop,
    signInAsDevUser: noop,
    switchRole: asyncNoop,
    signOut: asyncNoop,
    ...overrides,
  };
}

function contextFor(role: Role): AppContextType {
  return {
    darkMode: false,
    setDarkMode: noop,
    sidebarCollapsed: false,
    setSidebarCollapsed: noop,
    role,
    setRole: noop,
    currentTab: 'dashboard',
    setCurrentTab: noop,
    setNavigationGuardMessage: noop,
    settingsSection: 'menu',
    setSettingsSection: noop,
    searchQuery: '',
    setSearchQuery: noop,
    timelogFilter: '',
    setTimelogFilter: noop,
    projectFilter: '',
    setProjectFilter: noop,
    selectedContractorProfileId: null,
    setSelectedContractorProfileId: noop,
    selectedEventId: null,
    setSelectedEventId: noop,
    selectedProjectIdForStats: null,
    setSelectedProjectIdForStats: noop,
    selectedClientIdForStats: null,
    setSelectedClientIdForStats: noop,
    editingTimelog: null,
    setEditingTimelog: noop,
    editingProject: null,
    setEditingProject: noop,
    editingReceipt: null,
    setEditingReceipt: noop,
    editingClient: null,
    setEditingClient: noop,
    deleteConfirm: null,
    setDeleteConfirm: noop,
    eventTab: 'all',
    setEventTab: noop,
    eventsViewMode: 'list',
    setEventsViewMode: noop,
    eventsCalendarMode: 'month',
    setEventsCalendarMode: noop,
    eventsFilter: 'all',
    setEventsFilter: noop,
    eventsCalendarDate: '2026-01-01',
    setEventsCalendarDate: noop,
    handleDelete: asyncNoop,
  };
}

const snapshot = (revision: number | null): BillingSnapshot => ({ revision, groups: [] });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function command(): SaveBillingGroup {
  return {
    requestId: 'request-1',
    groupId: '00000000-0000-4000-8000-000000000001',
    name: 'Invoices',
    eventIds: [],
    expectedRevision: 0,
    eventVersions: {},
    confirmCrossProject: false,
    confirmMoves: false,
    deleteGroup: false,
  };
}

type HookValue = ReturnType<typeof useBillingGroups>;

function Probe({ onValue, enabled = true }: { onValue: (value: HookValue) => void; enabled?: boolean }) {
  onValue(useBillingGroups(enabled));
  return null;
}

function renderProbe(client: QueryClient, onValue: (value: HookValue) => void, enabled = true) {
  return render(
    <QueryClientProvider client={client}>
      <Probe onValue={onValue} enabled={enabled} />
    </QueryClientProvider>,
  );
}

describe('billingQueryKey', () => {
  it('separates every billing scope dimension', () => {
    const scope: BillingScope = { source: 'supabase', userId: 'u1', profileId: 'p1', role: 'coo' };
    const keys = [
      billingQueryKey(scope),
      billingQueryKey({ ...scope, source: 'local' }),
      billingQueryKey({ ...scope, userId: 'u2' }),
      billingQueryKey({ ...scope, profileId: 'p2' }),
      billingQueryKey({ ...scope, role: 'crew' }),
    ];

    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(5);
  });
});

describe('useBillingGroups', () => {
  const clients: QueryClient[] = [];

  beforeEach(() => {
    boundaries.source = 'supabase';
    boundaries.auth = authFor('u1', 'p1', 'coo');
    boundaries.context = contextFor('coo');
    boundaries.read.mockReset();
    boundaries.save.mockReset();
    boundaries.events.mockReset().mockResolvedValue([]);
    boundaries.timelogs.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
  });

  function client() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(queryClient);
    return queryClient;
  }

  it.each([
    ['enabled is false', false, authFor('u1', 'p1', 'coo')],
    ['auth is loading', true, authFor('u1', 'p1', 'coo', { isLoading: true })],
    ['role is switching', true, authFor('u1', 'p1', 'coo', { isRoleSwitching: true })],
    ['auth is unauthenticated', true, authFor('u1', 'p1', 'coo', { isAuthenticated: false })],
    ['role is absent', true, authFor('u1', 'p1', null)],
    ['user id is absent', true, authFor(null, 'p1', 'coo')],
  ])('does not read while %s', (_label, enabled, auth) => {
    boundaries.auth = auth;
    boundaries.read.mockResolvedValue(snapshot(1));
    const queryClient = client();
    let latest!: HookValue;
    renderProbe(queryClient, (value) => { latest = value; }, enabled);

    expect(latest.ready).toBe(false);
    expect(boundaries.read).not.toHaveBeenCalled();
  });

  it('keeps the current scope empty when a previous identity read resolves late', async () => {
    const firstRead = deferred<BillingSnapshot>();
    boundaries.read.mockImplementation((scope: BillingScope, signal: AbortSignal) => {
      if (scope.userId !== 'u1') return Promise.resolve(snapshot(null));
      return new Promise<BillingSnapshot>((resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(signal.reason ?? new DOMException('Billing groups read aborted.', 'AbortError'));
        }, { once: true });
        firstRead.promise.then(resolve);
      });
    });
    const queryClient = client();
    let latest!: HookValue;
    const view = renderProbe(queryClient, (value) => { latest = value; });

    await waitFor(() => expect(boundaries.read).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', profileId: 'p1', role: 'coo' }),
      expect.any(AbortSignal),
    ));

    boundaries.auth = authFor('u2', 'p2', 'crew');
    boundaries.context = contextFor('crew');
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );

    const firstSignal = boundaries.read.mock.calls[0]?.[1] as AbortSignal;
    await waitFor(() => expect(firstSignal.aborted).toBe(true));
    await waitFor(() => expect(queryClient.getQueryData<{ snapshot: BillingSnapshot }>(
      billingQueryKey({ source: 'supabase', userId: 'u2', profileId: 'p2', role: 'crew' }),
    )?.snapshot.revision).toBeNull());
    await act(async () => { firstRead.resolve(snapshot(99)); });

    await waitFor(() => expect(queryClient.getQueryData<{ snapshot: BillingSnapshot }>(
      billingQueryKey({ source: 'supabase', userId: 'u2', profileId: 'p2', role: 'crew' }),
    )?.snapshot.revision).toBeNull());
  });

  it('waits for a complete remote auth scope before reading', async () => {
    boundaries.auth = authFor(null, null, null, { isLoading: true, isAuthenticated: false });
    boundaries.read.mockResolvedValue(snapshot(1));
    const queryClient = client();
    let latest!: HookValue;
    const view = renderProbe(queryClient, (value) => { latest = value; });

    expect(latest.ready).toBe(false);
    expect(boundaries.read).not.toHaveBeenCalled();

    boundaries.auth = authFor('u1', 'p1', 'coo');
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(latest.ready).toBe(true));
    await waitFor(() => expect(boundaries.read).toHaveBeenCalledTimes(1));
    expect(boundaries.read).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'supabase', userId: 'u1', profileId: 'p1', role: 'coo' }),
      expect.any(AbortSignal),
    );
  });

  it('invalidates only the caller scope and rejects a save that becomes stale', async () => {
    boundaries.read.mockResolvedValue(snapshot(1));
    const pendingSave = deferred<{ requestId: string; groupId: string; revision: number }>();
    boundaries.save.mockReturnValue(pendingSave.promise);
    const queryClient = client();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    let latest!: HookValue;
    const view = renderProbe(queryClient, (value) => { latest = value; });

    await waitFor(() => expect(latest.query.isSuccess).toBe(true));
    const oldSave = latest.save(command());
    const staleSave = expect(oldSave).rejects.toThrow();

    await waitFor(() => expect(boundaries.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', profileId: 'p1', role: 'coo' }),
      expect.anything(),
    ));
    boundaries.auth = authFor('u2', 'p2', 'crew');
    boundaries.context = contextFor('crew');
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );
    await act(async () => {
      pendingSave.resolve({ requestId: 'request-1', groupId: command().groupId, revision: 2 });
    });

    await staleSave;
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: billingQueryKey({ source: 'supabase', userId: 'u1', profileId: 'p1', role: 'coo' }),
      exact: true,
    });
    expect(invalidate).not.toHaveBeenCalledWith(expect.objectContaining({
      queryKey: billingQueryKey({ source: 'supabase', userId: 'u2', profileId: 'p2', role: 'crew' }),
    }));
  });

  it('does not let a stale reload start a read after the same key is reactivated', async () => {
    boundaries.read.mockResolvedValue(snapshot(1));
    const queryClient = client();
    let latest!: HookValue;
    const view = renderProbe(queryClient, (value) => { latest = value; });

    await waitFor(() => expect(latest.query.isSuccess).toBe(true));
    const staleReload = latest.reload;
    boundaries.auth = authFor('u1', 'p1', 'coo', { isLoading: true });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );
    boundaries.auth = authFor('u1', 'p1', 'coo');
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );
    const readsBeforeReload = boundaries.read.mock.calls.length;

    await expect(staleReload()).rejects.toThrow();
    expect(boundaries.read).toHaveBeenCalledTimes(readsBeforeReload);
  });

  it('keeps the committed activation active through StrictMode lifecycle checks', async () => {
    boundaries.read.mockResolvedValue(snapshot(1));
    boundaries.save.mockResolvedValue({ requestId: 'request-1', groupId: command().groupId, revision: 2 });
    const queryClient = client();
    let latest!: HookValue;
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <Probe onValue={(value) => { latest = value; }} />
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(latest.query.isSuccess).toBe(true));
    await expect(latest.reload()).resolves.toMatchObject({ isSuccess: true });
    await expect(latest.save(command())).resolves.toMatchObject({ revision: 2 });
  });

  it('rejects a stale save before dispatching it', async () => {
    boundaries.read.mockResolvedValue(snapshot(1));
    const queryClient = client();
    let latest!: HookValue;
    const view = renderProbe(queryClient, (value) => { latest = value; });

    await waitFor(() => expect(latest.query.isSuccess).toBe(true));
    const staleSave = latest.save;
    boundaries.auth = authFor('u2', 'p2', 'crew');
    boundaries.context = contextFor('crew');
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );

    await expect(staleSave(command())).rejects.toMatchObject({ kind: 'denied' });
    expect(boundaries.save).not.toHaveBeenCalled();
  });

  it('rejects a retained save after unmount without dispatching it', async () => {
    boundaries.read.mockResolvedValue(snapshot(1));
    const queryClient = client();
    let latest!: HookValue;
    const view = renderProbe(queryClient, (value) => { latest = value; });

    await waitFor(() => expect(latest.query.isSuccess).toBe(true));
    const staleSave = latest.save;
    view.unmount();

    await expect(staleSave(command())).rejects.toMatchObject({ kind: 'denied' });
    expect(boundaries.save).not.toHaveBeenCalled();
  });

  it('keeps a same-scope pending read valid after readiness is restored', async () => {
    const firstRead = deferred<BillingSnapshot>();
    boundaries.read.mockReturnValue(firstRead.promise);
    const queryClient = client();
    let latest!: HookValue;
    const view = renderProbe(queryClient, (value) => { latest = value; });

    await waitFor(() => expect(boundaries.read).toHaveBeenCalledTimes(1));
    boundaries.auth = authFor('u1', 'p1', 'coo', { isLoading: true });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );
    boundaries.auth = authFor('u1', 'p1', 'coo');
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );

    await act(async () => { firstRead.resolve(snapshot(1)); });
    await waitFor(() => expect(queryClient.getQueryData<NonNullable<HookValue['query']['data']>>(
      billingQueryKey(latest.scope),
    )?.snapshot.revision).toBe(1));
    expect(boundaries.read).toHaveBeenCalledTimes(1);
    expect(latest.query.error).toBeNull();
  });

  it('lets a remaining same-scope observer receive its shared pending read', async () => {
    const pendingRead = deferred<BillingSnapshot>();
    boundaries.read.mockReturnValue(pendingRead.promise);
    const queryClient = client();
    let first!: HookValue;
    let second!: HookValue;
    const Pair = ({ showFirst }: { showFirst: boolean }) => (
      <QueryClientProvider client={queryClient}>
        {showFirst && <Probe key="first" onValue={(value) => { first = value; }} />}
        <Probe key="second" onValue={(value) => { second = value; }} />
      </QueryClientProvider>
    );
    const view = render(<Pair showFirst />);

    await waitFor(() => expect(boundaries.read).toHaveBeenCalledTimes(1));
    const sharedSignal = boundaries.read.mock.calls[0]?.[1] as AbortSignal;
    view.rerender(<Pair showFirst={false} />);
    expect(sharedSignal.aborted).toBe(false);
    await act(async () => { pendingRead.resolve(snapshot(3)); });

    expect(sharedSignal.aborted).toBe(false);
    await waitFor(() => expect(queryClient.getQueryData<NonNullable<HookValue['query']['data']>>(
      billingQueryKey(second.scope),
    )?.snapshot.revision).toBe(3));
    view.rerender(<Pair showFirst={false} />);
    await waitFor(() => expect(second.query.data?.snapshot.revision).toBe(3));
    expect(first.scope.userId).toBe('u1');
  });

  it.each([
    ['A to B to A', () => {
      boundaries.auth = authFor('u2', 'p2', 'crew');
      boundaries.context = contextFor('crew');
    }, () => {
      boundaries.auth = authFor('u1', 'p1', 'coo');
      boundaries.context = contextFor('coo');
    }],
    ['ready to paused to ready', () => {
      boundaries.auth = authFor('u1', 'p1', 'coo', { isLoading: true });
    }, () => {
      boundaries.auth = authFor('u1', 'p1', 'coo');
    }],
  ])('rejects an old save after %s but allows the new activation', async (_label, makeStale, reactivate) => {
    boundaries.read.mockResolvedValue(snapshot(1));
    boundaries.save.mockResolvedValue({ requestId: 'request-1', groupId: command().groupId, revision: 2 });
    const queryClient = client();
    let latest!: HookValue;
    const view = renderProbe(queryClient, (value) => { latest = value; });

    await waitFor(() => expect(latest.query.isSuccess).toBe(true));
    const staleSave = latest.save;
    makeStale();
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );
    reactivate();
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <Probe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );

    await expect(staleSave(command())).rejects.toMatchObject({ kind: 'denied' });
    expect(boundaries.save).not.toHaveBeenCalled();
    await expect(latest.save(command())).resolves.toMatchObject({ revision: 2 });
    expect(boundaries.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', profileId: 'p1', role: 'coo' }),
      expect.anything(),
    );
  });

  it('bypasses remote auth gates in local mode', async () => {
    boundaries.source = 'local';
    boundaries.auth = authFor(null, null, null, {
      isLoading: true,
      isRoleSwitching: true,
      isAuthenticated: false,
    });
    boundaries.context = contextFor('coo');
    boundaries.read.mockResolvedValue(snapshot(1));
    vi.resetModules();
    const { useBillingGroups: useLocalBillingGroups } = await import('./useBillingGroups');
    type LocalHookValue = ReturnType<typeof useLocalBillingGroups>;
    const LocalProbe = ({ onValue }: { onValue: (value: LocalHookValue) => void }) => {
      onValue(useLocalBillingGroups());
      return null;
    };
    const queryClient = client();
    let latest!: LocalHookValue;
    render(
      <QueryClientProvider client={queryClient}>
        <LocalProbe onValue={(value) => { latest = value; }} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(latest.ready).toBe(true));
    await waitFor(() => expect(boundaries.read).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'local', role: 'coo', userId: null, profileId: null }),
      expect.any(AbortSignal),
    ));
  });
});
