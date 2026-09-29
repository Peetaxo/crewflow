import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SharedTimelogEditor from './SharedTimelogEditor';
import { createShiftEvidenceSession } from './shift-evidence-session';
import type { ShiftEvidenceData } from './shift-evidence-loader';
import type { Role } from '../../types';

vi.mock('./TimelogEvidenceSection', () => ({ default: ({ timelog, readOnly, onChange }: { timelog: { note: string; supabaseId: string }; readOnly: boolean; onChange: (v: unknown) => void }) => (
  <input aria-label={`Hodiny ${timelog.supabaseId}`} disabled={readOnly} value={timelog.note} onChange={(e) => onChange({ ...timelog, note: e.target.value })} />
) }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-29T10:00:00Z';
const data = (): ShiftEvidenceData => ({ legacy: false, contractor: { profileId: id(3), name: 'Jan Crew', rate: 300 } as ShiftEvidenceData['contractor'],
  events: [31, 32].map((n) => ({ id: n, supabaseId: id(n), name: n === 31 ? 'Přípravy' : 'Instalace', job: 'JOB', startDate: '2026-09-29', endDate: '2026-09-29' })) as ShiftEvidenceData['events'],
  context: { workflowId: id(10), contractorProfileId: id(3), anchorEventId: id(31), eventIds: [id(31), id(32)], activeRound: null,
    timelogs: [21, 22].map((n) => ({ id: n, supabaseId: id(n), eid: n + 10, eventSupabaseId: id(n + 10), contractorProfileId: id(3),
      updatedAt: time, status: 'draft', km: 0, note: '', days: [{ id: id(n + 100), d: '2026-09-29', f: '08:00', t: '10:00', type: 'pripravy' }] })) } });
const setup = (value = data(), role: Role = 'crew') => {
  const write = vi.fn(async () => { throw new Error('test write blocked'); });
  const session = createShiftEvidenceSession({ context: value.context, role, write, assertCurrent: () => {} });
  const close = vi.fn(); const reload = vi.fn();
  const view = render(<SharedTimelogEditor data={value} role={role} session={session} editorSessionKey="one" onClose={close} onReload={reload}
    actorProfileId={id(3)} actorUserId={id(4)} />);
  return { ...view, session, write, close, reload };
};

describe('shared evidence modal composition', () => {
  it('uses one dialog, two independent sections and one submit action', () => {
    setup(); expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Přípravy · JOB' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Instalace · JOB' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Odeslat vše ke kontrole' })).toHaveLength(1);
    expect(screen.getByText(/nevytváří fakturu/)).toBeInTheDocument();
  });
  it('edits only the matching part and cancels delayed autosave on unmount', async () => {
    vi.useFakeTimers();
    try {
      const h = setup(); fireEvent.change(screen.getByLabelText(`Hodiny ${id(21)}`), { target: { value: 'jen první' } });
      expect(h.session.getSnapshot().context.timelogs.map((t) => t.note)).toEqual(['jen první', '']);
      h.unmount(); await act(async () => { vi.advanceTimersByTime(2000); }); expect(h.write).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('warns before discarding dirty hours instead of silently closing', () => {
    const h = setup(); fireEvent.change(screen.getByLabelText(`Hodiny ${id(21)}`), { target: { value: 'rozpracováno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít evidenci' })); expect(h.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zahodit neuložené změny' })); expect(h.close).toHaveBeenCalledOnce();
  });
  it('shows an active round together and labels later drafts outside that approval', () => {
    const value = data(); value.context.timelogs[0].status = 'pending_ch';
    value.context.activeRound = { id: id(40), workflowId: id(10), contractorProfileId: id(3), status: 'pending_ch',
      eventIds: [id(31)], timelogIds: [id(21)], note: '', updatedAt: time };
    setup(value);
    expect(screen.getByLabelText(`Hodiny ${id(21)}`)).toBeDisabled(); expect(screen.getByLabelText(`Hodiny ${id(22)}`)).not.toBeDisabled();
    expect(screen.getByText('Mimo aktuální schvalování')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Odeslat vše ke kontrole' })).toBeDisabled();
    expect(within(screen.getByRole('region', { name: 'Celkem v aktuálním kole' })).getByText('2,0 h')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Rozpracováno mimo aktuální kolo' })).getByText('2,0 h')).toBeInTheDocument();
  });
  it('sums the submitted draft scope and updates its totals from current edits', () => {
    const value = data(); value.context.timelogs[1].status = 'approved';
    const h = setup(value);
    const total = within(screen.getByRole('region', { name: 'Celkem k odeslání' }));
    expect(total.getByText('2,0 h')).toBeInTheDocument();
    expect(total.getByText('600 Kc')).toBeInTheDocument();
    act(() => h.session.edit({ ...h.session.getSnapshot().context.timelogs[0], days: [{ ...value.context.timelogs[0].days[0], t: '11:00' }] }));
    expect(total.getByText('3,0 h')).toBeInTheDocument();
    expect(total.getByText('900 Kc')).toBeInTheDocument();
  });
  it('identifies the exact incomplete section before submitting any part', async () => {
    const value = data(); value.context.timelogs[1].days = [];
    const h = setup(value);
    fireEvent.click(screen.getByRole('button', { name: 'Odeslat vše ke kontrole' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Instalace' })).getByRole('alert')).toHaveTextContent('Doplňte alespoň jeden záznam hodin.'));
    expect(screen.getByText('Instalace: Doplňte alespoň jeden záznam hodin.')).toBeInTheDocument();
    expect(h.write).not.toHaveBeenCalled();
  });
  it('keeps every COO section read-only and offers no correction action', () => {
    const value = data(); value.context.timelogs.forEach((t) => { t.status = 'pending_coo'; });
    value.context.activeRound = { id: id(40), workflowId: id(10), contractorProfileId: id(3), status: 'pending_coo',
      eventIds: value.context.eventIds, timelogIds: value.context.timelogs.map((t) => t.supabaseId!), note: '', updatedAt: time };
    setup(value, 'coo'); expect(screen.getAllByRole('textbox').filter((e) => e.getAttribute('aria-label')?.startsWith('Hodiny')).every((e) => (e as HTMLInputElement).disabled)).toBe(true);
    expect(screen.queryByRole('button', { name: /úpravy/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schválit celé kolo' })).toBeDisabled(); // Missing frozen targeted approval is not approval authority.
  });
  it('requires both reason and affected section for a CH return', async () => {
    const value = data(); value.context.timelogs.forEach((t) => { t.status = 'pending_ch'; });
    value.context.activeRound = { id: id(40), workflowId: id(10), contractorProfileId: id(3), status: 'pending_ch',
      eventIds: value.context.eventIds, timelogIds: value.context.timelogs.map((t) => t.supabaseId!), note: '', updatedAt: time };
    const h = setup(value, 'crewhead'); fireEvent.click(screen.getByRole('button', { name: 'Vrátit celé kolo' }));
    expect(h.write).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Důvod vrácení nebo úpravy'), { target: { value: 'Opravte čas' } });
    fireEvent.change(screen.getByLabelText('Dotčená směna'), { target: { value: id(31) } });
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit celé kolo' }));
    await waitFor(() => expect(h.write).toHaveBeenCalledOnce());
  });
});
