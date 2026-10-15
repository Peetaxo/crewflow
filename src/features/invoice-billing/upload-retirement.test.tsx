import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useBilling } from './useBilling';
import { retireBillingDataScope } from './identity-scope';
import { createBillingService, makeBillingCommand } from './service';
import { billingSnapshotFixture, billingDocumentFixture, id, version } from './test-fixtures';
const io = vi.hoisted(() => ({ auth: { currentUserId: '00000000-0000-4000-8000-000000000002', currentProfileId: '00000000-0000-4000-8000-000000000001', role: 'crew', isAuthenticated: true, isLoading: false, isRoleSwitching: false }, rpc: vi.fn(), invoke: vi.fn(), dispatchedAs: [] as string[] }));
vi.mock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => io.auth }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: 'crew' }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => io.rpc(...args), functions: { invoke: (...args: unknown[]) => { io.dispatchedAs.push(io.auth.currentUserId); return io.invoke(...args); } } } }));
beforeEach(() => {
  Object.assign(io.auth, { currentUserId: id(2), currentProfileId: id(1), role: 'crew', isAuthenticated: true, isLoading: false, isRoleSwitching: false });
  io.rpc.mockReset().mockResolvedValue({ data: billingSnapshotFixture(), error: null });
  io.invoke.mockReset(); io.dispatchedAs.length = 0;
});
it('never dispatches an old owner upload after its activation is synchronously retired', async () => {
  io.rpc.mockResolvedValue({ data: billingSnapshotFixture(), error: null });
  io.invoke.mockResolvedValue({ error: { status: 403 } });
  let header!: (value: ArrayBuffer) => void;
  const file = new File(['%PDF-old-owner'], 'old-owner.pdf', { type: 'application/pdf' });
  vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { header = resolve; }) } as Blob);
  const client = new QueryClient(); let latest!: ReturnType<typeof useBilling>;
  function Probe() { latest = useBilling(); return null; }
  const tree = () => <QueryClientProvider client={client}><Probe /></QueryClientProvider>;
  const view = render(tree());
  await waitFor(() => expect(latest.query.data).toBeTruthy());
  let execution!: Promise<unknown>;
  act(() => { execution = latest.execute(makeBillingCommand({ kind: 'upload', statementId: id(8), expectedUpdatedAt: version, invoiceNumber: 'OLD-1', issueDate: '2026-10-15', dueDate: '2026-10-29', file })).catch((error) => error); });
  await waitFor(() => expect(header).toBeTypeOf('function'));
  retireBillingDataScope();
  Object.assign(io.auth, { currentUserId: id(22), currentProfileId: id(21) });
  view.rerender(tree());
  await act(async () => { header(new TextEncoder().encode('%PDF-').buffer); await execution; });
  expect(io.dispatchedAs).toEqual([]);
  expect(io.invoke).not.toHaveBeenCalled();
  view.unmount(); client.clear();
});

it('retires a saved ambiguous upload retry payload before a new identity can use it', async () => {
  Object.assign(io.auth, { currentUserId: id(2), currentProfileId: id(1) });
  io.rpc.mockReset().mockResolvedValue({ data: billingSnapshotFixture(), error: null });
  io.invoke.mockReset().mockResolvedValue({ error: { status: 503 } });
  io.dispatchedAs.length = 0;
  const file = new File(['%PDF-old-owner'], 'old-owner.pdf', { type: 'application/pdf' });
  vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: async () => new TextEncoder().encode('%PDF-').buffer } as Blob);
  const client = new QueryClient(); let latest!: ReturnType<typeof useBilling>;
  function Probe() { latest = useBilling(); return null; }
  const tree = () => <QueryClientProvider client={client}><Probe /></QueryClientProvider>;
  const view = render(tree());
  await waitFor(() => expect(latest.query.data).toBeTruthy());
  await act(async () => { await expect(latest.execute(makeBillingCommand({ kind: 'upload', statementId: id(8), expectedUpdatedAt: version, invoiceNumber: 'OLD-1', issueDate: '2026-10-15', dueDate: '2026-10-29', file }))).rejects.toMatchObject({ kind: 'ambiguous' }); });
  expect(latest.canRetry).toBe(true);
  const oldRetry = latest.retry;
  retireBillingDataScope();
  Object.assign(io.auth, { currentUserId: id(22), currentProfileId: id(21) });
  view.rerender(tree());
  await act(async () => { await expect(oldRetry()).rejects.toBeDefined(); });
  expect(io.invoke).toHaveBeenCalledTimes(1);
  expect(io.dispatchedAs).toEqual([id(2)]);
  expect(latest.canRetry).toBe(false);
  expect(latest.saving).toBe(false);
  view.unmount(); client.clear();
});

function upload(file: File) {
  const command = makeBillingCommand({ kind: 'upload', statementId: id(8), expectedUpdatedAt: version, invoiceNumber: 'ORIGINAL-1', issueDate: '2026-10-15', dueDate: '2026-10-29', file });
  if (command.kind !== 'upload') throw new Error('Expected upload fixture');
  return command;
}
function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let current!: ReturnType<typeof useBilling>;
  function Probe() { current = useBilling(); return null; }
  const tree = () => <QueryClientProvider client={client}><Probe /></QueryClientProvider>;
  const view = render(tree());
  return { get current() { return current; }, rerender: () => view.rerender(tree()), unmount: () => { view.unmount(); client.clear(); } };
}
it.each(['logout/login', 'role change', 'synchronous reset', 'unmount'])('blocks an upload retired during the header read by %s', async (change) => {
  let finish!: (value: ArrayBuffer) => void;
  const file = new File(['%PDF-private'], 'private.pdf', { type: 'application/pdf' });
  vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }) } as Blob);
  io.invoke.mockResolvedValue({ error: { status: 503 } });
  const h = harness();
  try {
    await waitFor(() => expect(h.current.query.data).toBeTruthy());
    let execution!: Promise<unknown>;
    act(() => { execution = h.current.execute(upload(file)).catch((error) => error); });
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    if (change === 'logout/login') {
      retireBillingDataScope(); Object.assign(io.auth, { isAuthenticated: false, currentUserId: null, currentProfileId: null }); h.rerender();
      Object.assign(io.auth, { isAuthenticated: true, currentUserId: id(22), currentProfileId: id(21) }); h.rerender();
    } else if (change === 'role change') {
      io.auth.role = 'coo'; h.rerender();
    } else if (change === 'synchronous reset') retireBillingDataScope();
    else h.unmount();
    await act(async () => { finish(new TextEncoder().encode('%PDF-').buffer); expect(await execution).toMatchObject({ kind: 'denied' }); });
    expect(io.dispatchedAs).toEqual([]); expect(io.invoke).not.toHaveBeenCalled();
  } finally { h.unmount(); }
});
it('does not read or dispatch a file when service activation was already retired before execution', async () => {
  const file = new File(['%PDF-private'], 'private.pdf', { type: 'application/pdf' });
  const slice = vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: async () => new TextEncoder().encode('%PDF-').buffer } as Blob);
  const invoke = vi.fn().mockResolvedValue({ error: { status: 503 } });
  const service = createBillingService({ rpc: vi.fn(), functions: { invoke } });
  const result = await service.execute({ source: 'supabase', userId: id(2), profileId: id(1), role: 'crew' }, upload(file), () => false).catch((error) => error);
  expect(invoke).not.toHaveBeenCalled(); expect(slice).not.toHaveBeenCalled(); expect(result).toMatchObject({ kind: 'denied' });
});
it('keeps an active ambiguous upload retry bound to the original UUID, version, metadata and File and reloads server truth', async () => {
  const file = new File(['%PDF-original'], 'original.pdf', { type: 'application/pdf' });
  vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: async () => new TextEncoder().encode('%PDF-').buffer } as Blob);
  const command = { ...upload(file) };
  const doc = { ...billingDocumentFixture(), request_id: command.requestId, storage_path: `billing-statements/${id(8)}/documents/${command.requestId}.pdf` };
  const statement = { ...billingSnapshotFixture().statements[0], status: 'document_pending', active_document_id: doc.id, updated_at: '2026-10-15T10:00:01.123456+00:00' };
  io.invoke.mockResolvedValueOnce({ error: { status: 503 } }).mockImplementationOnce(async () => {
    io.rpc.mockResolvedValue({ data: { ...billingSnapshotFixture(), statements: [statement], documents: [doc] }, error: null });
    return { data: { statement, document: doc } };
  });
  const h = harness();
  try {
    await waitFor(() => expect(h.current.query.data).toBeTruthy());
    await act(async () => { await expect(h.current.execute(command)).rejects.toMatchObject({ kind: 'ambiguous' }); });
    expect(h.current.canRetry).toBe(true);
    const readsAfterAmbiguity = io.rpc.mock.calls.length; expect(readsAfterAmbiguity).toBeGreaterThan(1);
    command.expectedUpdatedAt = '2026-10-15T12:00:00.654321+00:00'; command.invoiceNumber = 'CHANGED'; command.file = new File(['%PDF-other'], 'other.pdf', { type: 'application/pdf' });
    await act(async () => { await h.current.retry(); });
    const first = io.invoke.mock.calls[0][1].body as FormData; const second = io.invoke.mock.calls[1][1].body as FormData;
    expect([...second.entries()]).toEqual([...first.entries()]);
    expect(second.get('file')).toBe(file); expect(second.get('requestId')).toBe(command.requestId);
    expect(second.get('expectedUpdatedAt')).toBe(version); expect(second.get('invoiceNumber')).toBe('ORIGINAL-1');
    expect(io.dispatchedAs).toEqual([id(2), id(2)]); expect(io.rpc.mock.calls.length).toBeGreaterThan(readsAfterAmbiguity);
    expect(h.current.query.data?.statements[0].status).toBe('document_pending'); expect(h.current.canRetry).toBe(false);
  } finally { h.unmount(); }
});
