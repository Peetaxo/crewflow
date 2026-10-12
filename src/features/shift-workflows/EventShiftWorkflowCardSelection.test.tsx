import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, EventCrewAssignment, Invoice, Timelog } from '../../types';
import { ShiftWorkflowError, type ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import EventShiftWorkflowCardSelection from './EventShiftWorkflowCardSelection';

const liveDetail = vi.hoisted(() => ({ timelogs: [] as Timelog[], crewAssignments: [] as EventCrewAssignment[] }));
vi.mock('../events/services/events.service', () => ({ getEventDetailData: () => ({ ...liveDetail, applications: [], contractors: [] }) }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-10-12T11:00:00Z';
const scope: ShiftWorkflowScope = { source: 'supabase', role: 'crewhead', userId: id(1), profileId: id(2) };
const makeData = (): ShiftWorkflowManagementData => ({ snapshot: { revision: 4, assignedEventIds: [], rounds: [], workflows: [] },
  events: ['Přípravy', 'Instalace', 'Zdrojový zbytek', 'Starší', 'Nejstarší'].map((name, i) => ({ id: i + 21, supabaseId: id(i + 21), name,
    job: 'JOB', rawJobNumber: i === 0 ? null : 'JOB', projectId: 'P', updatedAt: time,
    startDate: i === 3 ? '2026-09-20' : i === 4 ? '2026-09-01' : '2026-10-12', endDate: i === 3 ? '2026-09-20' : i === 4 ? '2026-09-01' : '2026-10-12', needed: 2, filled: 0, status: 'upcoming', client: 'Klient' } as Event)),
  timelogs: [], invoices: [], eventCrewAssignments: [] });
const report = (overrides: Partial<Timelog> = {}): Timelog => ({ id: 100, eid: 21, eventSupabaseId: id(21), contractorProfileId: id(99),
  status: 'draft', days: [{ d: '2026-10-12', f: '08:00', t: '16:00', type: 'instal' }], km: 0, note: '', approvals: [], ...overrides });
function setup(data = makeData(), role: ShiftWorkflowScope['role'] = 'crewhead', source: ShiftWorkflowScope['source'] = 'supabase') {
  const props = { scope: { ...scope, role, source }, workflowId: null, data, onSave: vi.fn().mockResolvedValue(undefined), onReload: vi.fn().mockResolvedValue(makeData()), onClose: vi.fn() };
  const view = render(<main className="nodu-page-frame"><EventShiftWorkflowCardSelection {...props} /></main>);
  return { ...view, props };
}
const selectBoth = () => ['Přípravy', 'Instalace'].forEach((name) => fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`${name} · JOB`) })));
const continueToSummary = () => fireEvent.click(screen.getByRole('button', { name: 'Pokračovat' }));
const confirmCross = () => fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji propojení různých projektů nebo jobnumber' }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { liveDetail.timelogs = []; liveDetail.crewAssignments = []; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-12T12:00:00')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('card selection shared draft', () => {
  it('keeps empty captured card evidence when another person publishes a live submitted report', () => {
    setup(); const card = screen.getByRole('checkbox', { name: /Přípravy/ });
    expect(within(card).getByText('Casy nezadane')).toBeInTheDocument();
    liveDetail.timelogs = [report({ status: 'pending_ch' })];
    liveDetail.crewAssignments = [{ eventId: 21, eventSupabaseId: id(21), contractorProfileId: id(99), name: 'Živý člověk' }];
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Přípravy' } });
    expect(card).toHaveAttribute('aria-disabled', 'false'); expect(within(card).getByText('Casy nezadane')).toBeInTheDocument();
    expect(within(card).getByText(/Cas neurcen/)).toBeInTheDocument(); expect(within(card).queryByText('Živý člověk')).not.toBeInTheDocument();
    expect(within(card).queryByText('Ceka CH')).not.toBeInTheDocument();
  });
  it.each(['supabase', 'local'] as const)('presents only captured report and crew identities for %s without leaking live data', (source) => {
    const data = makeData();
    const matchingReport = report({ eid: source === 'supabase' ? 900 : 21, eventSupabaseId: source === 'supabase' ? id(21) : id(900) });
    const otherReport = report({ id: 101, eid: source === 'supabase' ? 21 : 900, eventSupabaseId: source === 'supabase' ? id(900) : id(21), status: 'pending_ch',
      days: [{ d: '2026-10-12', f: '10:00', t: '18:00', type: 'instal' }] });
    data.timelogs = [matchingReport, otherReport];
    data.eventCrewAssignments = [
      { eventId: matchingReport.eid, eventSupabaseId: matchingReport.eventSupabaseId, contractorProfileId: id(99), name: 'Zachycený člověk' },
      { eventId: otherReport.eid, eventSupabaseId: otherReport.eventSupabaseId, contractorProfileId: id(98), name: 'Jiná směna' },
    ];
    const { props, rerender } = setup(data, 'crewhead', source);
    const expectCaptured = () => {
      const card = screen.getByRole('checkbox', { name: /Přípravy/ });
      expect(card).toHaveAttribute('aria-disabled', 'false'); expect(within(card).getByText('Casy rozepsane')).toBeInTheDocument();
      expect(within(card).getByText(/08:00 - 16:00/)).toBeInTheDocument(); expect(within(card).getByText('Zachycený člověk')).toBeInTheDocument();
      expect(within(card).queryByText('Jiná směna')).not.toBeInTheDocument(); expect(within(card).queryByText('Ceka CH')).not.toBeInTheDocument();
    };
    expectCaptured();
    liveDetail.timelogs = [report({ status: 'pending_ch' })]; liveDetail.crewAssignments = [{ eventId: 21, eventSupabaseId: id(21), contractorProfileId: id(99), name: 'Živý člověk' }];
    const published = makeData(); published.timelogs = liveDetail.timelogs; published.eventCrewAssignments = liveDetail.crewAssignments;
    rerender(<main className="nodu-page-frame"><EventShiftWorkflowCardSelection {...props} data={published} /></main>);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Přípravy' } }); expectCaptured();
  });
  it('replaces captured card evidence only after a successful explicit refresh and retains selected identities', async () => {
    const { props } = setup(); props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Změna'));
    const openingCard = screen.getByRole('checkbox', { name: /Přípravy/ });
    props.onReload.mockRejectedValueOnce(new Error('offline'));
    const fresh = makeData(); fresh.snapshot.revision = 8; fresh.timelogs = [report({ status: 'pending_ch' })];
    fresh.eventCrewAssignments = [{ eventId: 21, eventSupabaseId: id(21), contractorProfileId: id(99), name: 'Obnovený člověk' }];
    selectBoth(); continueToSummary(); confirmCross(); save();
    fireEvent.click(await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' })); await screen.findByText(/nepodařilo bezpečně ověřit/);
    expect(within(openingCard).getByText('Casy nezadane')).toBeInTheDocument();
    props.onReload.mockResolvedValue(fresh); fireEvent.click(screen.getByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    await screen.findByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' });
    expect(screen.getByRole('button', { name: 'Propojit směny' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Zpět k výběru' }));
    const card = screen.getByRole('checkbox', { name: /Přípravy/ }); expect(card).toBeChecked(); expect(card).toHaveAttribute('aria-disabled', 'false');
    expect(within(card).getByText('Ceka CH')).toBeInTheDocument(); expect(within(card).getByText(/08:00 - 16:00/)).toBeInTheDocument();
    expect(within(card).getByText('Obnovený člověk')).toBeInTheDocument(); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
  });
  it.each(['crewhead', 'coo'] as const)('requires raw cross-project and source-move confirmations for %s in the full summary', async (role) => {
    const data = makeData(); data.snapshot.workflows = [{ id: id(10), eventIds: [id(22), id(23)], updatedAt: time }];
    const { props } = setup(data, role); selectBoth();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Starší' } }); continueToSummary();
    const summary = screen.getByRole('dialog'); expect(within(summary).getByText('Přípravy · JOB')).toBeInTheDocument(); expect(within(summary).getByText('Instalace · JOB')).toBeInTheDocument();
    expect(within(summary).getByText(/V původním propojení zůstane: Zdrojový zbytek · JOB/)).toBeInTheDocument(); expect(within(summary).queryByRole('searchbox')).not.toBeInTheDocument(); expect(props.onSave).not.toHaveBeenCalled();
    save(); expect(await screen.findByRole('alert')).toHaveTextContent(/Potvrďte/); confirmCross(); save(); expect(props.onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Potvrzuji přesun z jiného propojení' })); save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce());
    expect(props.onSave.mock.calls[0][0]).toMatchObject({ eventIds: [id(21), id(22)], confirmCrossProject: true, confirmMoves: true, expectedRevision: 4 });
    expect(Object.keys(props.onSave.mock.calls[0][0].eventVersions)).toEqual([id(21), id(22), id(23)]);
  });
  it.each(['crew', 'admin'] as const)('gives no creation controls to %s', (role) => { setup(makeData(), role as ShiftWorkflowScope['role']); expect(screen.queryByRole('searchbox')).not.toBeInTheDocument(); });
  it.each(['other-person', 'source-remnant', 'round', 'invoice'] as const)('blocks a prospective whole group for %s evidence', (kind) => {
    const data = makeData();
    if (kind === 'source-remnant') { data.snapshot.workflows = [{ id: id(10), eventIds: [id(22), id(23)], updatedAt: time }]; data.timelogs = [report({ eid: 23, eventSupabaseId: id(23), status: 'pending_ch' })]; }
    if (kind === 'other-person') data.timelogs = [report({ eid: 22, eventSupabaseId: id(22), status: 'pending_ch' })];
    if (kind === 'round') data.snapshot.rounds = [{ id: id(50), eventIds: [id(22)], workflowId: null } as ShiftWorkflowManagementData['snapshot']['rounds'][number]];
    if (kind === 'invoice') { data.timelogs = [report({ eid: 22, supabaseId: id(100), eventSupabaseId: id(22) })]; data.invoices = [{ id: 'invoice-1', timelogSupabaseIds: [id(100)] } as Invoice]; }
    const { props } = setup(data); fireEvent.click(screen.getByRole('checkbox', { name: /Přípravy/ }));
    const blocked = screen.getByRole('checkbox', { name: /Instalace/ }); expect(blocked).toHaveAttribute('aria-disabled', 'true'); expect(blocked).toHaveAccessibleDescription();
    fireEvent.click(blocked); expect(screen.getByText('Vybráno: 1')).toBeInTheDocument(); expect(props.onSave).not.toHaveBeenCalled();
  });
  it('locks summary back for an ambiguous result and retries the exact pending command', async () => {
    const { props } = setup(); props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Neověřeno')); selectBoth(); continueToSummary(); confirmCross(); save();
    const retry = await screen.findByRole('button', { name: 'Zopakovat stejný požadavek' }); expect(screen.getByRole('button', { name: 'Zpět k výběru' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zpět k výběru' })); expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(retry); await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(2)); expect(props.onSave.mock.calls[1][0]).toBe(props.onSave.mock.calls[0][0]);
  });
  it('keeps conflict selection on a failed refresh, then requires explicit review of fresh versions', async () => {
    const { props } = setup(); props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Změna')); props.onReload.mockRejectedValueOnce(new Error('offline'));
    selectBoth(); continueToSummary(); confirmCross(); save(); fireEvent.click(await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    await screen.findByText(/nepodařilo bezpečně ověřit/); expect(screen.getByRole('button', { name: 'Zpět k výběru' })).toBeDisabled(); expect(screen.getByText('Vybráno směn: 2')).toBeInTheDocument();
    const fresh = makeData(); fresh.snapshot.revision = 8; fresh.events = fresh.events.map((event) => ({ ...event, updatedAt: '2026-10-12T12:00:00Z' })); props.onReload.mockResolvedValue(fresh);
    fireEvent.click(screen.getByRole('button', { name: 'Obnovit data a ponechat výběr' })); const review = await screen.findByRole('checkbox', { name: 'Zkontroloval jsem výběr po obnovení dat' }); expect(review).not.toBeChecked();
    save(); expect(props.onSave).toHaveBeenCalledTimes(1); confirmCross(); fireEvent.click(review); save();
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(2)); expect(props.onSave.mock.calls[1][0].expectedRevision).toBe(8);
  });
  it('preserves a missing selected identity and warns in the summary after refresh', async () => {
    const { props } = setup(); props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Změna')); const fresh = makeData(); fresh.events = fresh.events.filter((event) => event.id !== 22); props.onReload.mockResolvedValue(fresh);
    selectBoth(); continueToSummary(); confirmCross(); save(); fireEvent.click(await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' }));
    expect(await screen.findByText('Nedostupná vybraná směna')).toBeInTheDocument(); expect(screen.getByText('Vybráno směn: 2')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Propojit směny' })).toBeDisabled();
  });
  it('freezes opening versions despite new data props and preserves search through summary back', async () => {
    const { props, rerender } = setup(); selectBoth(); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Starší' } });
    const newer = makeData(); newer.snapshot.revision = 99; newer.events[0].name = 'Nový název';
    rerender(<main className="nodu-page-frame"><EventShiftWorkflowCardSelection {...props} data={newer} /></main>);
    continueToSummary(); fireEvent.click(screen.getByRole('button', { name: 'Zpět k výběru' })); expect(screen.getByRole('searchbox')).toHaveValue('Starší'); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    continueToSummary(); confirmCross(); save(); await waitFor(() => expect(props.onSave).toHaveBeenCalledOnce()); expect(props.onSave.mock.calls[0][0].expectedRevision).toBe(4);
  });
  it('keeps the anchor compact when the first available shift is in the future', () => {
    const data = makeData(); data.events = [{ ...data.events[1], startDate: '2026-10-13', endDate: '2026-10-13' }]; setup(data);
    expect(screen.getByRole('checkbox', { name: /Instalace/ })).toBeInTheDocument();
    expect(screen.queryByText('Od zvoleného data tu zatím nejsou žádné směny.')).not.toBeInTheDocument();
  });
  it('keeps the next available cards visible after a native date jump to a day without occurrences', () => {
    setup(); selectBoth(); fireEvent.change(screen.getByLabelText('Přejít na datum'), { target: { value: '2026-10-10' } });
    expect(screen.getByLabelText('Přejít na datum')).toHaveValue('2026-10-10'); expect(screen.getByText('Vybráno: 2')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Přípravy/ })).toBeChecked(); expect(screen.getByRole('checkbox', { name: /Instalace/ })).toBeChecked();
    expect(screen.queryByText('Od zvoleného data tu zatím nejsou žádné směny.')).not.toBeInTheDocument();
  });
  it('reaches a bounded older batch from an empty prepared week without mount or restore cascades', () => {
    mockGalleryGeometry(); const data = makeData(); data.events = data.events.filter((event) => event.id >= 24); setup(data);
    const root = document.querySelector<HTMLElement>('.nodu-page-frame')!;
    expect(document.querySelector('[data-workflow-start-date]')).toHaveAttribute('data-workflow-start-date', '2026-10-05');
    expect(screen.queryByRole('checkbox', { name: /Starší/ })).not.toBeInTheDocument(); expect(root.scrollTop).toBeGreaterThan(0);
    root.scrollTop = 100; const before = document.querySelector<HTMLElement>('[data-workflow-date="2026-10-12"]')!.getBoundingClientRect().top;
    fireEvent.scroll(root);
    expect(screen.getByRole('checkbox', { name: /Starší/ })).toBeInTheDocument(); expect(screen.queryByRole('checkbox', { name: /Nejstarší/ })).not.toBeInTheDocument();
    expect(document.querySelector('[data-workflow-start-date]')).toHaveAttribute('data-workflow-start-date', '2026-09-14');
    expect(document.querySelector<HTMLElement>('[data-workflow-date="2026-10-12"]')!.getBoundingClientRect().top).toBe(before);
    fireEvent.scroll(root); fireEvent.scroll(root); expect(screen.queryByRole('checkbox', { name: /Nejstarší/ })).not.toBeInTheDocument();
  });
  it('restores the same real gallery occurrence, window and offset after global search clears', () => {
    mockGalleryGeometry(); setup(); const root = document.querySelector<HTMLElement>('.nodu-page-frame')!;
    root.scrollTop = 250; fireEvent.scroll(root); const before = document.querySelector<HTMLElement>('[data-workflow-occurrence]')!.getBoundingClientRect().top;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Starší' } }); expect(screen.getByRole('checkbox', { name: /Starší/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(root.scrollTop).toBe(250); expect(document.querySelector<HTMLElement>('[data-workflow-occurrence]')!.getBoundingClientRect().top).toBe(before);
    expect(document.querySelector('[data-workflow-start-date]')).toHaveAttribute('data-workflow-start-date', '2026-10-05');
  });
  it('retires a pending save and refresh when the selection owner unmounts', async () => {
    const oldSave = deferred<unknown>(); const oldRefresh = deferred<ShiftWorkflowManagementData>(); const { props, unmount } = setup(); props.onSave.mockReturnValue(oldSave.promise);
    selectBoth(); continueToSummary(); confirmCross(); save(); save(); expect(props.onSave).toHaveBeenCalledOnce(); unmount(); await act(async () => oldSave.resolve(undefined)); expect(props.onClose).not.toHaveBeenCalled();
    const next = setup(); next.props.onSave.mockRejectedValueOnce(new ShiftWorkflowError('conflict', 'Změna')); next.props.onReload.mockReturnValue(oldRefresh.promise);
    selectBoth(); continueToSummary(); confirmCross(); save(); fireEvent.click(await screen.findByRole('button', { name: 'Obnovit data a ponechat výběr' })); next.unmount();
    await act(async () => oldRefresh.resolve(makeData())); expect(next.props.onClose).not.toHaveBeenCalled();
  });
});

function mockGalleryGeometry() {
  const rect = (top: number, height = 100) => ({ top, bottom: top + height, height, x: 0, y: top, left: 0, right: 390, width: 390, toJSON: () => ({}) });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const root = this.closest<HTMLElement>('.nodu-page-frame');
    if (!root) return rect(0, 0);
    if (this === root) return rect(0, 600);
    if (this.hasAttribute('data-workflow-toolbar')) return rect(16, 80);
    if (this.classList.contains('nodu-workflow-selection')) return rect(-root.scrollTop, 2000);
    const dates = [...root.querySelectorAll<HTMLElement>('[data-workflow-date]')];
    const date = this.dataset.workflowDate ?? this.dataset.workflowOccurrence?.split('|').at(-1);
    const index = dates.findIndex((element) => element.dataset.workflowDate === date);
    if (this.hasAttribute('data-workflow-date')) return rect(300 + index * 300 - root.scrollTop, 40);
    if (this.hasAttribute('data-workflow-occurrence')) return rect(350 + index * 300 - root.scrollTop, 120);
    return rect(0, 0);
  });
}
