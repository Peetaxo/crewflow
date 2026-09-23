import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Timelog } from '../../types';
import { ShiftWorkflowError, type SaveShiftWorkflow, type ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import ShiftWorkflowEditor from './ShiftWorkflowEditor';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const profile = id(3);
const scope: ShiftWorkflowScope = { source: 'supabase', userId: id(1), profileId: id(2), role: 'crewhead' };
const makeData = (): ShiftWorkflowManagementData => ({
  snapshot: { revision: 4, assignedEventIds: [], rounds: [], workflows: [] },
  events: ['Přípravy', 'Instalace', 'Deinstalace', 'Jiná akce'].map((name, i) => ({
    id: i + 21, supabaseId: id(i + 21), updatedAt: time, name, job: i === 1 ? 'OTHER' : 'JOB',
    startDate: '2026-09-23', endDate: '2026-09-23', projectId: 'P',
  } as Event)),
  eventCrewAssignments: [21, 22].map((n) => ({ eventId: n, eventSupabaseId: id(n), contractorProfileId: profile, name: 'Petr' })),
  timelogs: [], invoices: [],
});
function setup(overrides: Partial<React.ComponentProps<typeof ShiftWorkflowEditor>> = {}) {
  const props = { scope, data: makeData(), profileId: profile, workflowId: null,
    onSave: vi.fn<(command: SaveShiftWorkflow) => Promise<unknown>>().mockResolvedValue(undefined),
    onClose: vi.fn(), onReload: vi.fn<() => Promise<ShiftWorkflowManagementData>>().mockResolvedValue(makeData()),
    ...overrides };
  return { ...render(<ShiftWorkflowEditor {...props} />), props };
}
const selectBoth = () => {
  fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Instalace · OTHER/ }));
};
const confirmCross = () => fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji propojení různých projektů nebo jobnumber' }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Uložit propojení' }));

describe('ShiftWorkflowEditor', () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each(['crewhead', 'coo'] as const)('lets %s explicitly connect own assigned shifts without a group name', async (role) => {
    const { props } = setup({ scope: { ...scope, role } });
    expect(screen.getByText(/všechny přiřazené lidi/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Název/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Deinstalace · JOB')).not.toBeInTheDocument();
    expect(screen.getByText('Přípravy · JOB')).toBeInTheDocument();
    selectBoth(); save();
    expect(props.onSave).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Potvrďte/);
    confirmCross(); save();
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(vi.mocked(props.onSave).mock.calls[0][0]).toMatchObject({ workflowId: null, eventIds: [id(21), id(22)], confirmCrossProject: true });
  });

  it('does not render management to crew', () => {
    setup({ scope: { ...scope, role: 'crew' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers server-required confirmation for null and explicit raw jobs with the same project fallback', async () => {
    const data = makeData();
    data.events = data.events.map((e) => ({ ...e, job: 'JOB', rawJobNumber: e.id === 21 ? null : 'JOB' }));
    const { props } = setup({ data });
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Instalace · JOB/ }));
    confirmCross(); save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(vi.mocked(props.onSave).mock.calls[0][0].confirmCrossProject).toBe(true);
  });

  it('retains members not assigned to the displayed person when editing', async () => {
    const data = makeData();
    data.snapshot.workflows = [{ id: id(10), eventIds: [id(21), id(23)], updatedAt: time }];
    const { props } = setup({ data, workflowId: id(10) });
    expect(screen.getByRole('checkbox', { name: /Deinstalace · JOB/ })).toBeChecked();
    save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(vi.mocked(props.onSave).mock.calls[0][0].eventIds).toEqual([id(21), id(23)]);
  });

  it('shows why an already submitted shift cannot be selected', () => {
    const data = makeData();
    data.timelogs = [{ id: 101, eventSupabaseId: id(21), status: 'pending_ch' } as Timelog];
    setup({ data });
    expect(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })).toBeDisabled();
    expect(screen.getByText(/Přípravy: již začalo schvalování/)).toBeInTheDocument();
  });

  it('shows moved and remaining source members and requires an independent move confirmation', async () => {
    const data = makeData();
    data.snapshot.workflows = [{ id: id(11), eventIds: [id(22), id(23)], updatedAt: time }];
    const { props } = setup({ data });
    selectBoth(); confirmCross(); save();
    expect(await screen.findByRole('alert')).toHaveTextContent(/přesun/);
    expect(screen.getByText(/V původním propojení zůstane: Deinstalace · JOB/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji přesun z jiného propojení' }));
    save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(Object.keys(vi.mocked(props.onSave).mock.calls[0][0].eventVersions)).toEqual([id(21), id(22), id(23)]);
  });

  it('retries an ambiguous result with the same immutable request and locks editing', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Výsledek není ověřený.')).mockResolvedValueOnce(undefined);
    setup({ onSave }); selectBoth(); confirmCross(); save();
    const retry = await screen.findByRole('button', { name: 'Zopakovat stejný požadavek' });
    expect(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })).toBeDisabled();
    fireEvent.click(retry);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0]).toBe(onSave.mock.calls[0][0]);
  });

  it('preserves selection on conflict reload but resets confirmations and demands a new review', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Data se změnila.')).mockResolvedValueOnce(undefined);
    const next = makeData(); next.snapshot.revision = 8;
    next.events = next.events.map((e) => ({ ...e, updatedAt: '2026-09-23T12:00:00Z' }));
    const { props } = setup({ onSave, onReload: vi.fn().mockResolvedValue(next) });
    selectBoth(); confirmCross(); save();
    fireEvent.click(await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    await waitFor(() => expect(props.onReload).toHaveBeenCalledOnce());
    expect(await screen.findByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Přípravy · JOB/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Instalace · OTHER/ })).toBeChecked();
    save(); expect(onSave).toHaveBeenCalledTimes(1);
    confirmCross();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' }));
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0]).toMatchObject({ expectedRevision: 8 });
    expect(onSave.mock.calls[1][0].requestId).not.toBe(onSave.mock.calls[0][0].requestId);
  });

  it('does not silently drop a selected event that disappears on refresh', async () => {
    const next = makeData(); next.events = next.events.filter((e) => e.id !== 22);
    const onSave = vi.fn().mockRejectedValue(new ShiftWorkflowError('conflict', 'Data se změnila.'));
    setup({ onSave, onReload: vi.fn().mockResolvedValue(next) }); selectBoth(); confirmCross(); save();
    fireEvent.click(await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    expect(await screen.findByText('Nedostupná vybraná směna')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uložit propojení' })).toBeDisabled();
  });

  it('uses frozen opening data until an explicit refresh', async () => {
    const { props, rerender } = setup();
    const newer = makeData(); newer.snapshot.revision = 99;
    newer.events[0].name = 'Nový název';
    rerender(<ShiftWorkflowEditor {...props} data={newer} />);
    selectBoth(); confirmCross(); save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(vi.mocked(props.onSave).mock.calls[0][0].expectedRevision).toBe(4);
  });

  it('prevents duplicate saves and ignores completion after unmount', async () => {
    let resolve!: (value: unknown) => void;
    const request = new Promise((done) => { resolve = done; });
    const { props, unmount } = setup({ onSave: vi.fn().mockReturnValue(request) });
    selectBoth(); confirmCross(); save(); save();
    expect(props.onSave).toHaveBeenCalledOnce();
    unmount(); await act(async () => { resolve(undefined); });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('retires a pending editor on role change and never closes the new session', async () => {
    let resolve!: (value: unknown) => void;
    const request = new Promise((done) => { resolve = done; });
    const { props, rerender } = setup({ onSave: vi.fn().mockReturnValue(request) });
    selectBoth(); confirmCross(); save();
    rerender(<ShiftWorkflowEditor {...props} scope={{ ...scope, role: 'crew' }} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => { resolve(undefined); });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('can explicitly dissolve an editable existing link without deleting its shifts', async () => {
    const data = makeData(); data.snapshot.workflows = [{ id: id(10), eventIds: [id(21), id(23)], updatedAt: time }];
    const { props } = setup({ data, workflowId: id(10) });
    fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy · JOB/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Deinstalace · JOB/ }));
    expect(screen.getByText(/Samotné směny ani jejich evidence se nesmažou/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit propojení' }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(vi.mocked(props.onSave).mock.calls[0][0]).toMatchObject({ workflowId: id(10), deleteWorkflow: true, eventIds: [] });
  });
});
