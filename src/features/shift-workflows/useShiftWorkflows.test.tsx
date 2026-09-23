import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../../types';
import type { SaveShiftWorkflow, ShiftWorkflowScope, ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { shiftWorkflowQueryKey, useShiftWorkflows } from './useShiftWorkflows';

const boundary = vi.hoisted(() => ({
  source: 'supabase' as 'local' | 'supabase',
  auth: { currentUserId: 'u1' as string | null, currentProfileId: 'p1' as string | null, role: 'coo' as Role | null,
    isAuthenticated: true, isLoading: false, isRoleSwitching: false },
  contextRole: 'coo' as Role,
  read: vi.fn(), save: vi.fn(),
}));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => boundary.auth }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: boundary.contextRole }) }));
vi.mock('../../lib/app-config', () => ({ get appDataSource() { return boundary.source; } }));
vi.mock('./shift-workflows.gateway', () => ({
  readShiftWorkflowSnapshot: (...args: unknown[]) => boundary.read(...args),
  saveShiftWorkflow: (...args: unknown[]) => boundary.save(...args),
}));

const snapshot = (revision = 0): ShiftWorkflowSnapshot => ({ revision, workflows: [], rounds: [], assignedEventIds: [] });
const command = {} as SaveShiftWorkflow; // The hook delegates payload validation to the gateway.
const clients: QueryClient[] = [];
type HookValue = ReturnType<typeof useShiftWorkflows>;
const scope = (): ShiftWorkflowScope => ({ source: boundary.source, userId: boundary.auth.currentUserId,
  profileId: boundary.auth.currentProfileId, role: boundary.source === 'local' ? boundary.contextRole : boundary.auth.role ?? 'crew' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { resolve, promise };
}

function setup(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  let latest!: HookValue;
  const observed: Array<ShiftWorkflowSnapshot | undefined> = [];
  function Probe({ enabled }: { enabled: boolean }) {
    latest = useShiftWorkflows(enabled);
    observed.push(latest.query.data);
    return null;
  }
  const tree = (enabled = true) => {
    const inner = <QueryClientProvider client={client}><Probe enabled={enabled} /></QueryClientProvider>;
    return strict ? <React.StrictMode>{inner}</React.StrictMode> : inner;
  };
  const view = render(tree());
  return { client, observed, current: () => latest, rerender: (enabled = true) => view.rerender(tree(enabled)), unmount: view.unmount };
}

beforeEach(() => {
  boundary.source = 'supabase';
  Object.assign(boundary.auth, { currentUserId: 'u1', currentProfileId: 'p1', role: 'coo',
    isAuthenticated: true, isLoading: false, isRoleSwitching: false });
  boundary.contextRole = 'coo';
  boundary.read.mockReset().mockResolvedValue(snapshot());
  boundary.save.mockReset().mockResolvedValue({ requestId: 'r1', workflowId: 'w1', revision: 1 });
});
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe('shared workflow scope', () => {
  it('keys every identity dimension and source independently', () => {
    const original = scope();
    const variants: ShiftWorkflowScope[] = [original, { ...original, userId: 'u2' },
      { ...original, profileId: 'p2' }, { ...original, role: 'crew' }, { ...original, source: 'local' }];
    expect(new Set(variants.map((s) => JSON.stringify(shiftWorkflowQueryKey(s)))).size).toBe(5);
  });

  it.each([
    ['loading', { isLoading: true }], ['switching', { isRoleSwitching: true }],
    ['signed out', { isAuthenticated: false }], ['no user', { currentUserId: null }],
    ['no profile', { currentProfileId: null }], ['no role', { role: null }],
  ])('does not fetch while %s', (_name, change) => {
    Object.assign(boundary.auth, change);
    const view = setup();
    expect(view.current().ready).toBe(false);
    expect(boundary.read).not.toHaveBeenCalled();
  });

  it.each([
    ['user', { currentUserId: 'u2' }], ['profile', { currentProfileId: 'p2' }],
    ['role', { role: 'crew' as Role }], ['sign out', { isAuthenticated: false }],
    ['loading', { isLoading: true }], ['switching', { isRoleSwitching: true }],
  ])('masks old data immediately and removes old queries on %s change', async (_name, change) => {
    const view = setup();
    await waitFor(() => expect(view.current().query.data?.revision).toBe(0));
    const oldKey = shiftWorkflowQueryKey(scope());
    const oldSave = view.current().save;
    const oldReload = view.current().reload;
    boundary.read.mockImplementation(() => new Promise(() => {}));
    view.observed.length = 0;
    Object.assign(boundary.auth, change);
    view.rerender();
    expect(view.observed[0]).toBeUndefined();
    expect(view.client.getQueryData(oldKey)).toBeUndefined();
    await expect(oldSave(command)).rejects.toMatchObject({ kind: 'denied' });
    await expect(oldReload()).rejects.toMatchObject({ kind: 'denied' });
    expect(boundary.save).not.toHaveBeenCalled();
  });

  it('cancels pending old reads and cannot restore them on A→B→A', async () => {
    const pending = deferred<ShiftWorkflowSnapshot>();
    boundary.read.mockImplementationOnce(() => pending.promise);
    const view = setup();
    await waitFor(() => expect(boundary.read).toHaveBeenCalledOnce());
    const firstSignal = boundary.read.mock.calls[0][1] as AbortSignal;
    const oldSave = view.current().save;
    boundary.auth.currentUserId = 'u2';
    view.rerender();
    await waitFor(() => expect(view.current().query.data).toEqual(snapshot()));
    boundary.auth.currentUserId = 'u1';
    view.rerender();
    await waitFor(() => expect(view.current().query.data).toEqual(snapshot()));
    await act(async () => pending.resolve(snapshot(99)));
    expect(firstSignal.aborted).toBe(true);
    expect(view.current().query.data?.revision).toBe(0);
    await expect(oldSave(command)).rejects.toMatchObject({ kind: 'denied' });
  });

  it('ignores a mutation completion after its scope is retired', async () => {
    const pending = deferred<{ requestId: string; workflowId: string; revision: number }>();
    boundary.save.mockReturnValue(pending.promise);
    const view = setup();
    await waitFor(() => expect(view.current().query.data).toEqual(snapshot()));
    let result!: Promise<unknown>;
    act(() => { result = view.current().save(command).catch((error: unknown) => error); });
    await waitFor(() => expect(boundary.save).toHaveBeenCalledOnce());
    boundary.auth.currentUserId = 'u2';
    view.rerender();
    await waitFor(() => expect(view.current().query.data).toEqual(snapshot()));
    const reads = boundary.read.mock.calls.length;
    await act(async () => pending.resolve({ requestId: 'r1', workflowId: 'w1', revision: 1 }));
    await expect(result).resolves.toMatchObject({ kind: 'denied' });
    expect(boundary.read).toHaveBeenCalledTimes(reads);
    expect(view.current().saving).toBe(false);
  });

  it('works in StrictMode and invalidates only the current membership scope', async () => {
    const view = setup(true);
    await waitFor(() => expect(view.current().query.data).toEqual(snapshot()));
    boundary.read.mockResolvedValue(snapshot(1));
    await act(async () => { await view.current().save(command); });
    await waitFor(() => expect(view.current().query.data?.revision).toBe(1));
  });

  it('retires disabled callbacks and local testing role scopes', async () => {
    boundary.source = 'local';
    const view = setup();
    await waitFor(() => expect(view.current().query.data).toEqual(snapshot()));
    const oldSave = view.current().save;
    const oldKey = shiftWorkflowQueryKey(scope());
    boundary.contextRole = 'crew';
    view.rerender();
    expect(view.client.getQueryData(oldKey)).toBeUndefined();
    await expect(oldSave(command)).rejects.toMatchObject({ kind: 'denied' });
    view.rerender(false);
    expect(view.current().query.data).toBeUndefined();
    await expect(view.current().save(command)).rejects.toMatchObject({ kind: 'denied' });
  });

  it('keeps a shared pending query alive when one of two current consumers unmounts', async () => {
    const pending = deferred<ShiftWorkflowSnapshot>();
    boundary.read.mockReturnValue(pending.promise);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    let first!: HookValue;
    function First() { first = useShiftWorkflows(); return null; }
    function Second() { useShiftWorkflows(); return null; }
    const tree = (second: boolean) => <QueryClientProvider client={client}>
      <First />{second ? <Second /> : null}
    </QueryClientProvider>;
    const view = render(tree(true));
    await waitFor(() => expect(boundary.read).toHaveBeenCalledOnce());
    view.rerender(tree(false));
    await act(async () => pending.resolve(snapshot(3)));
    await waitFor(() => expect(first.query.data?.revision).toBe(3));
    expect(boundary.read).toHaveBeenCalledOnce();
    expect(client.getQueryData(shiftWorkflowQueryKey(scope()))).toEqual(snapshot(3));
  });
});
