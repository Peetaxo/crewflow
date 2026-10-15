import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Role } from '../../types';
import { ShiftWorkflowError, type ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { MobileEventShiftWorkflowSelection, type MobileWorkflowSelectionState } from './MobileEventShiftWorkflowSelection';
import { shiftWorkflowQueryKey } from './useShiftWorkflows';

const boundary = vi.hoisted(() => ({
  auth: { currentUserId: '00000000-0000-4000-8000-000000000001', currentProfileId: '00000000-0000-4000-8000-000000000002', role: 'crewhead' as Role, isAuthenticated: true, isLoading: false, isRoleSwitching: false },
  read: vi.fn(), save: vi.fn(), events: vi.fn(), reports: vi.fn(), invoices: vi.fn(),
}));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => boundary.auth }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: boundary.auth.role }) }));
vi.mock('../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('./shift-workflows.gateway', () => ({ readShiftWorkflowSnapshot: boundary.read, saveShiftWorkflow: boundary.save }));
vi.mock('../events/services/events.service', () => ({ fetchEventsSnapshot: boundary.events }));
vi.mock('../timelogs/services/timelogs.service', () => ({ fetchTimelogsSnapshot: boundary.reports }));
vi.mock('../invoices/services/invoices.service', () => ({ fetchInvoicesSnapshot: boundary.invoices }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-05-12T11:00:00Z';
const events: Event[] = ['Přípravy', 'Instalace', 'Deinstalace'].map((name, i) => ({ id: i + 21, supabaseId: id(i + 21), name, job: 'JOB', startDate: '2026-05-12', endDate: '2026-05-12', needed: 1, filled: 0, status: 'upcoming', city: '', client: '', updatedAt: time }));
const snapshot = (): ShiftWorkflowSnapshot => ({ revision: 1, workflows: [], rounds: [], assignedEventIds: [] });
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve };
}
let state: MobileWorkflowSelectionState | null;
function Overview() {
  return <MobileEventShiftWorkflowSelection>{(selection) => {
    state = selection;
    return <div><p>Overview</p>{selection && <>
      <button onClick={selection.open}>Open</button><button onClick={selection.retry}>Retry</button>
      <button onClick={selection.close}>Cancel</button>
      {events.map((event) => <button key={event.supabaseId} onClick={() => selection.toggle(event.supabaseId!)}>{event.name}</button>)}
      <button onClick={selection.continueToSummary}>Continue</button>
      <output>{JSON.stringify([selection.active, selection.draft.ready, selection.draft.eventIds, selection.readError])}</output>
      {selection.confirmation}
    </>}</div>;
  }}</MobileEventShiftWorkflowSelection>;
}
const clients: QueryClient[] = [];
function setup(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const tree = () => <QueryClientProvider client={client}><Overview /></QueryClientProvider>;
  const view = render(strict ? <React.StrictMode>{tree()}</React.StrictMode> : tree());
  return { ...view, tree, client };
}
beforeEach(() => {
  vi.clearAllMocks(); state = null;
  Object.assign(boundary.auth, { role: 'crewhead', currentUserId: id(1), currentProfileId: id(2), isAuthenticated: true, isLoading: false, isRoleSwitching: false });
  boundary.read.mockResolvedValue(snapshot()); boundary.events.mockResolvedValue(events); boundary.reports.mockResolvedValue([]); boundary.invoices.mockResolvedValue([]); boundary.save.mockResolvedValue({});
});
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks(); });

describe('mobile workflow opening owner with the actual deferred draft and query', () => {
  it.each(['crew', 'not ready'] as const)('returns the overview with null selection for %s', (mode) => {
    if (mode === 'crew') boundary.auth.role = 'crew'; else boundary.auth.isRoleSwitching = true;
    setup(); expect(screen.getByText('Overview')).toBeInTheDocument(); expect(state).toBeNull(); expect(boundary.events).not.toHaveBeenCalled();
  });
  it('guards same-turn double open, retires a late read on cancel, and requires a committed fresh opening boundary', async () => {
    const late = held<Event[]>(); boundary.events.mockReturnValueOnce(late.promise);
    setup(); const firstOpen = state!.open;
    act(() => { firstOpen(); firstOpen(); }); expect(state!.active).toBe(true); expect(boundary.events).toHaveBeenCalledOnce();
    act(() => state!.toggle(id(21))); const oldToggle = state!.toggle;
    act(() => { state!.close(); firstOpen(); }); expect(state!.active).toBe(false); expect(state!.draft.eventIds).toEqual([]);
    await act(async () => late.resolve(events)); expect(state!.draft.ready).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open' })); await waitFor(() => expect(state!.draft.ready).toBe(true));
    act(() => oldToggle(id(22))); expect(state!.draft.eventIds).toEqual([]); expect(boundary.events).toHaveBeenCalledTimes(2); expect(boundary.save).not.toHaveBeenCalled();
  });
  it('opens after StrictMode effect replay', async () => {
    setup(true); fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(state!.draft.ready).toBe(true)); expect(state!.active).toBe(true);
  });
  it('retires the old scope and keeps switch-back as a new opening', async () => {
    const late = held<Event[]>(); boundary.events.mockReturnValueOnce(late.promise);
    const { rerender, tree } = setup(); fireEvent.click(screen.getByRole('button', { name: 'Open' })); act(() => state!.toggle(id(21)));
    const old = state!; boundary.auth.currentUserId = id(9); rerender(tree()); expect(state!.active).toBe(false);
    await act(async () => late.resolve(events)); act(() => { old.open(); old.toggle(id(22)); old.continueToSummary(); }); expect(state!.draft.eventIds).toEqual([]);
    boundary.auth.currentUserId = id(1); rerender(tree()); expect(state!.active).toBe(false); expect(state!.draft.ready).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open' })); await waitFor(() => expect(state!.draft.ready).toBe(true)); expect(state!.draft.eventIds).toEqual([]);
  });
  it('retains missing and blocked provisional IDs and prevents Continue until unsafe choices are removed', async () => {
    const read = held<Event[]>(); boundary.events.mockReturnValue(read.promise);
    boundary.reports.mockResolvedValue([{ id: 101, eid: 22, eventSupabaseId: id(22), contractorProfileId: id(99), status: 'pending_ch', days: [], km: 0, note: '' }]);
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    act(() => { state!.toggle(id(21)); }); act(() => { state!.toggle(id(22)); });
    await act(async () => read.resolve(events.filter((event) => event.supabaseId !== id(21))));
    await waitFor(() => expect(state!.draft.ready).toBe(true)); expect(state!.draft.eventIds).toEqual([id(21), id(22)]);
    expect(state!.blockedReason(id(21))).toMatch(/není dostupná/); expect(state!.blockedReason(id(22))).toMatch(/schvalování/);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => state!.toggle(id(21))); act(() => state!.toggle(id(22))); expect(state!.draft.eventIds).toEqual([]); expect(boundary.save).not.toHaveBeenCalled();
  });
  it('exposes a capture failure and retries with provisional marks intact', async () => {
    const clone = globalThis.structuredClone;
    const cloneSpy = vi.spyOn(globalThis, 'structuredClone').mockImplementationOnce(() => { throw new Error('clone failed'); }).mockImplementation(clone);
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Open' })); act(() => state!.toggle(id(21)));
    await waitFor(() => expect(state!.readError).toBe(true)); expect(state!.draft.ready).toBe(false); expect(state!.draft.eventIds).toEqual([id(21)]);
    cloneSpy.mockImplementation(clone); fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(state!.draft.ready).toBe(true)); expect(state!.readError).toBe(false); expect(state!.draft.eventIds).toEqual([id(21)]);
  });
  it('preserves the original immutable ambiguous request and retires it on close', async () => {
    boundary.save.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Odpověď není ověřená.'));
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Open' })); await waitFor(() => expect(state!.draft.ready).toBe(true));
    act(() => state!.toggle(id(21))); act(() => state!.toggle(id(22))); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Propojit směny' }));
    await screen.findByRole('button', { name: 'Zopakovat stejný požadavek' }); const exact = boundary.save.mock.calls[0][1];
    act(() => state!.toggle(id(23))); expect(state!.draft.eventIds).toEqual([id(21), id(22)]);
    fireEvent.click(screen.getByRole('button', { name: 'Zopakovat stejný požadavek' }));
    await waitFor(() => expect(state!.active).toBe(false)); expect(boundary.save.mock.calls[1][1]).toEqual(exact); expect(state!.draft.eventIds).toEqual([]);
  });
  it('keeps captured command versions through query publication and preserves cross-project and source-remnant confirmations', async () => {
    boundary.events.mockResolvedValue(events.map((event, i) => i === 1 ? { ...event, job: 'OTHER' } : event));
    boundary.read.mockResolvedValue({ ...snapshot(), workflows: [{ id: id(10), eventIds: [id(21), id(23)], updatedAt: time }] });
    const { client } = setup(); fireEvent.click(screen.getByRole('button', { name: 'Open' })); await waitFor(() => expect(state!.draft.ready).toBe(true));
    const captured = state!.draft.data;
    await act(async () => client.setQueryData(shiftWorkflowQueryKey(state!.scope), { ...snapshot(), revision: 99 }));
    expect(state!.draft.data).toBe(captured);
    act(() => state!.toggle(id(21))); act(() => state!.toggle(id(22))); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const dialog = screen.getByRole('dialog'); expect(dialog).toHaveTextContent('V původním propojení zůstane: Deinstalace · JOB.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Propojit směny' })); expect(boundary.save).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Potvrďte přesun/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji přesun z jiného propojení' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji propojení různých projektů nebo jobnumber' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Propojit směny' })); await waitFor(() => expect(state!.active).toBe(false));
    expect(boundary.save.mock.calls[0][1]).toMatchObject({ expectedRevision: 1, eventIds: [id(21), id(22)], confirmCrossProject: true, confirmMoves: true,
      eventVersions: { [id(21)]: time, [id(22)]: time, [id(23)]: time } });
  });
  it.each(['other-person approval', 'invoice', 'round history', 'source-remnant approval'] as const)('blocks %s from complete evidence while retaining provisional choices', async (kind) => {
    const read = held<Event[]>(); boundary.events.mockReturnValueOnce(read.promise);
    const reportId = id(101); const reportEvent = kind === 'source-remnant approval' ? 23 : 21;
    boundary.reports.mockResolvedValue([{ id: 101, supabaseId: reportId, eid: reportEvent, eventSupabaseId: id(reportEvent), contractorProfileId: id(99), status: kind.includes('approval') ? 'pending_ch' : 'draft', days: [], km: 0, note: '' }]);
    if (kind === 'invoice') boundary.invoices.mockResolvedValue([{ timelogSupabaseIds: [reportId] }]);
    if (kind === 'round history') boundary.read.mockResolvedValue({ ...snapshot(), rounds: [{ id: id(301), workflowId: null, contractorProfileId: id(99), status: 'approved', eventIds: [id(21)], timelogIds: [reportId], note: '', updatedAt: time }] });
    if (kind === 'source-remnant approval') boundary.read.mockResolvedValue({ ...snapshot(), workflows: [{ id: id(10), eventIds: [id(21), id(23)], updatedAt: time }] });
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Open' })); act(() => state!.toggle(id(21))); act(() => state!.toggle(id(22)));
    await act(async () => read.resolve(events)); await waitFor(() => expect(state!.draft.ready).toBe(true));
    expect(state!.draft.eventIds).toEqual([id(21), id(22)]); expect(state!.draft.impact?.blockedReason).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(boundary.save).not.toHaveBeenCalled();
  });
  it('requires conflict refresh review and retains choices while refreshing real authoritative evidence', async () => {
    boundary.save.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Změna dat.'));
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Open' })); await waitFor(() => expect(state!.draft.ready).toBe(true));
    act(() => state!.toggle(id(21))); act(() => state!.toggle(id(22))); fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Propojit směny' })); await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' });
    const heldRead = held<Event[]>(); boundary.events.mockReturnValueOnce(heldRead.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Obnovit data a ponechat výběr' })); expect(screen.getByRole('button', { name: 'Zavřít' })).toBeDisabled();
    await act(async () => heldRead.resolve(events)); await screen.findByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' });
    expect(state!.draft.eventIds).toEqual([id(21), id(22)]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Propojit směny' })); expect(boundary.save).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Propojit směny' })); await waitFor(() => expect(state!.active).toBe(false)); expect(boundary.save).toHaveBeenCalledTimes(2);
  });
});
