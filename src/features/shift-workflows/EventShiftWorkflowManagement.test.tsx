import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Role } from '../../types';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import { ShiftWorkflowError } from './shift-workflows.contract';
import { EventShiftWorkflowCreateAction, EventShiftWorkflowDetails } from './EventShiftWorkflowManagement';

const mocks = vi.hoisted(() => ({ role: 'crewhead' as Role, user: 'user1', ready: true, load: vi.fn(), save: vi.fn(), reload: vi.fn(), snapshot: {} as ShiftWorkflowManagementData['snapshot'] }));
vi.mock('./useShiftWorkflows', () => ({ useShiftWorkflows: () => ({
  scope: { source: 'supabase', role: mocks.role, userId: mocks.user, profileId: 'manager' },
  scopeKey: `${mocks.user}:${mocks.role}`, ready: mocks.ready, save: mocks.save, reload: mocks.reload,
  query: { data: mocks.snapshot },
}) }));
vi.mock('./shift-workflows.management-loader', () => ({ loadEventShiftWorkflowManagementData: mocks.load }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const events = [21, 22, 23].map((n) => ({ id: n, supabaseId: id(n), updatedAt: time, name: `Směna ${n}`, job: 'JOB', startDate: '2026-09-23', endDate: '2026-09-23' } as Event));
const makeData = (): ShiftWorkflowManagementData => ({ snapshot: { revision: 4, rounds: [], assignedEventIds: [], workflows: [{ id: id(10), eventIds: events.map((e) => e.supabaseId!), updatedAt: time }] }, events, timelogs: [], invoices: [], eventCrewAssignments: [] });
const create = () => fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
const edit = () => fireEvent.click(screen.getByRole('button', { name: 'Upravit propojení' }));
const selectTwo = () => [21, 22].forEach((n) => fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`Směna ${n} · JOB`) })));
const deferred = <T,>() => { let resolve!: (data: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

describe('event workflow owners', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.role = 'crewhead'; mocks.user = 'user1'; mocks.ready = true; mocks.snapshot = makeData().snapshot; mocks.load.mockResolvedValue(makeData()); mocks.save.mockResolvedValue(undefined); });
  it.each(['crewhead', 'coo'] as const)('lets %s create from all visible events after a fresh read, with no initial selection', async (role) => {
    mocks.role = role; render(<EventShiftWorkflowCreateAction />);
    expect(mocks.load).not.toHaveBeenCalled(); create();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /Směna 23/ })).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Uložit propojení' })).toBeDisabled();
    selectTwo(); fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji přesun z jiného propojení' }));
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ workflowId: null, eventIds: [id(21), id(22)], expectedRevision: 4, eventVersions: { [id(21)]: time, [id(22)]: time, [id(23)]: time } });
    create(); await screen.findByRole('dialog'); expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it.each(['crew', 'admin'])('does not give %s access to either management owner', (role) => {
    mocks.role = role as Role; render(<><EventShiftWorkflowCreateAction /><EventShiftWorkflowDetails event={events[0]} /></>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('shows linked names, jobs and dates and edits the full stored group', async () => {
    render(<EventShiftWorkflowDetails event={events[0]} />);
    const overview = await screen.findByRole('region', { name: 'Propojené směny' });
    expect(overview).toHaveTextContent('Směna 23 · JOB'); expect(overview).toHaveTextContent('2026-09-23');
    edit(); const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('checkbox').filter((e) => (e as HTMLInputElement).checked)).toHaveLength(3);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0][0].eventIds).toEqual(events.map((e) => e.supabaseId));
  });
  it('has no create or edit route for an unlinked event', () => {
    mocks.snapshot = { ...makeData().snapshot, workflows: [] };
    render(<EventShiftWorkflowDetails event={events[0]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('fails closed and retries a failed read while preserving unrelated content', async () => {
    mocks.load.mockRejectedValueOnce(new Error('unavailable'));
    render(<><p>Ostatní údaje</p><EventShiftWorkflowCreateAction /></>); create();
    expect(await screen.findByRole('alert')).toHaveTextContent('nepodařilo načíst');
    expect(screen.getByText('Ostatní údaje')).toBeInTheDocument(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit načíst znovu' }));
    await screen.findByRole('dialog'); expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(['user', 'role', 'ready'] as const)('retires an in-progress open on %s changes and ignores late data after switching back', async (field) => {
    const old = deferred<ShiftWorkflowManagementData>(); mocks.load.mockReturnValueOnce(old.promise);
    const { rerender } = render(<EventShiftWorkflowCreateAction />); create();
    if (field === 'user') mocks.user = 'user2'; else if (field === 'role') mocks.role = 'crew'; else mocks.ready = false;
    rerender(<EventShiftWorkflowCreateAction />);
    mocks.user = 'user1'; mocks.role = 'crewhead'; mocks.ready = true; rerender(<EventShiftWorkflowCreateAction />);
    await act(async () => { old.resolve(makeData()); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.load.mock.calls[0][2].aborted).toBe(true);
  });
  it('retires the old detail load on event-to-event navigation', async () => {
    const old = deferred<ShiftWorkflowManagementData>(); mocks.load.mockReturnValueOnce(old.promise);
    const fresh = makeData(); fresh.events = fresh.events.map((e) => ({ ...e, name: `Nová ${e.id}` })); mocks.load.mockResolvedValue(fresh);
    const { rerender } = render(<EventShiftWorkflowDetails event={events[0]} />);
    rerender(<EventShiftWorkflowDetails event={events[1]} />);
    await screen.findByText('Nová 22 · JOB'); await act(async () => { old.resolve(makeData()); });
    expect(screen.queryByText('Směna 21 · JOB')).not.toBeInTheDocument();
  });
  it('cannot close a new event dialog when the old save completes', async () => {
    const old = deferred<unknown>(); mocks.save.mockReturnValueOnce(old.promise);
    const { rerender } = render(<EventShiftWorkflowDetails event={events[0]} />); await screen.findByRole('button', { name: 'Upravit propojení' }); edit(); await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));
    rerender(<EventShiftWorkflowDetails event={events[1]} />); await screen.findByRole('button', { name: 'Upravit propojení' }); edit(); await screen.findByRole('dialog');
    await act(async () => { old.resolve(undefined); }); expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('cannot publish an old conflict refresh into a new event dialog', async () => {
    mocks.save.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Změna'));
    const old = deferred<ShiftWorkflowManagementData>();
    const { rerender } = render(<EventShiftWorkflowDetails event={events[0]} />); await screen.findByRole('button', { name: 'Upravit propojení' }); edit(); await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' })); await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' });
    mocks.load.mockReturnValueOnce(old.promise); fireEvent.click(screen.getByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    rerender(<EventShiftWorkflowDetails event={events[1]} />); await screen.findByRole('button', { name: 'Upravit propojení' }); edit(); await screen.findByRole('dialog');
    const obsolete = makeData(); obsolete.events = obsolete.events.map((e) => ({ ...e, name: 'Obsolete' }));
    await act(async () => { old.resolve(obsolete); }); expect(screen.getByRole('checkbox', { name: /Směna 22/ })).toBeChecked(); expect(screen.queryByText(/Obsolete/)).not.toBeInTheDocument();
  });
});
