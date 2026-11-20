import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SharedTimelogEditor from './SharedTimelogEditor';
import { createShiftEvidenceSession } from './shift-evidence-session';
import { ShiftWorkflowError } from './shift-workflows.contract';
import type { ShiftEvidenceData } from './shift-evidence-loader';
import type { Role } from '../../types';

const { readInvoice, downloadInvoice } = vi.hoisted(() => ({ readInvoice: vi.fn(), downloadInvoice: vi.fn() }));
vi.mock('./shift-invoice-attachment', async (importOriginal) => ({
  ...await importOriginal<object>(), readShiftInvoiceAttachment: readInvoice, downloadShiftInvoiceAttachment: downloadInvoice,
}));
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
const setup = (value = data(), role: Role = 'crew', source: 'local' | 'supabase' = 'local', strict = false) => {
  const write = vi.fn<Parameters<typeof createShiftEvidenceSession>[0]['write']>(async () => { throw new Error('test write blocked'); });
  const session = createShiftEvidenceSession({ context: value.context, role, write, assertCurrent: () => {} });
  const close = vi.fn(); const reload = vi.fn();
  const editor = <SharedTimelogEditor source={source} data={value} role={role} session={session} editorSessionKey="one" onClose={close} onReload={reload}
    actorProfileId={id(3)} actorUserId={id(4)} />;
  const view = render(strict ? <StrictMode>{editor}</StrictMode> : editor);
  return { ...view, session, write, close, reload };
};

describe('shared evidence modal composition', () => {
  it('uses one dialog, two independent sections and one submit action', () => {
    setup(); expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Přípravy · JOB' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Instalace · JOB' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Odeslat vše ke kontrole' })).toHaveLength(1);
    expect(screen.getByText(/připraví podklad k fakturaci/)).toBeInTheDocument();
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

const recipient = { eligible: true, customer_id: id(80), customer_name: 'Produkční odběratel', attachment: null };
const attached = { ...recipient, attachment: { id: id(81), invoice_number: '2026-17', issue_date: '2026-09-29',
  due_date: '2026-10-13', total_amount: 1200.5, storage_path: 'private/faktura.pdf' } };
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Odeslat vše ke kontrole' }));
const pdf = () => new File(['%PDF-1.7'], 'faktura.pdf', { type: 'application/pdf' });

function fillInvoice(file: File) {
  fireEvent.change(screen.getByLabelText('Originál faktury PDF'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('Číslo originální faktury'), { target: { value: ' FA-3 ' } });
  fireEvent.change(screen.getByLabelText('Datum vystavení'), { target: { value: '2026-09-29' } });
  fireEvent.change(screen.getByLabelText('Datum splatnosti'), { target: { value: '2026-10-13' } });
  fireEvent.change(screen.getByLabelText('Celková částka (Kč)'), { target: { value: '1200,50' } });
}

describe('optional invoice in the crew evidence editor', () => {
  beforeEach(() => { readInvoice.mockReset(); downloadInvoice.mockReset(); });

  it('captures one PDF on submit and replays its exact contents after an inconclusive submit', async () => {
    readInvoice.mockResolvedValue(recipient);
    const h = setup(data(), 'crew', 'supabase', true);
    h.write.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Nejistý výsledek'));
    fireEvent.click(await screen.findByRole('button', { name: 'Přiložit vlastní fakturu (PDF)' }));
    expect(screen.getByText('Produkční odběratel')).toBeInTheDocument();
    const file = pdf(); fillInvoice(file);
    expect(h.write).not.toHaveBeenCalled();
    submit();
    const retry = await screen.findByRole('button', { name: 'Opakovat stejný požadavek' });
    expect(screen.getByLabelText('Originál faktury PDF')).toBeDisabled();
    const [hours, , invoice] = h.write.mock.calls[0];
    expect(hours).toMatchObject({ kind: 'submit', timelogs: [{ id: id(21) }, { id: id(22) }] });
    expect(invoice).toMatchObject({ kind: 'replace', file, customerId: id(80), invoiceNumber: 'FA-3',
      issueDate: '2026-09-29', dueDate: '2026-10-13', totalAmount: '1200.50', requestId: expect.any(String) });
    fireEvent.click(retry);
    await waitFor(() => expect(h.write).toHaveBeenCalledTimes(2));
    expect(h.write.mock.calls[1][0]).toEqual(hours);
    expect(h.write.mock.calls[1][2]).toEqual(invoice);
  });

  it('shows unavailable attachment support while preserving ordinary report submission', async () => {
    readInvoice.mockRejectedValue(new Error('private backend detail'));
    const h = setup(data(), 'crew', 'supabase');
    fireEvent.click(await screen.findByRole('button', { name: 'Přiložit vlastní fakturu (PDF)' }));
    expect(await screen.findByText(/Přílohu se nepodařilo načíst/)).toBeInTheDocument();
    expect(screen.queryByText('private backend detail')).not.toBeInTheDocument();
    submit();
    await waitFor(() => expect(h.write).toHaveBeenCalledOnce());
    expect(h.write.mock.calls[0][2]).toBeUndefined();
  });

  it('keeps a returned PDF through note edits unless the crew member explicitly removes it', async () => {
    readInvoice.mockResolvedValue(attached);
    const value = data(); value.context.timelogs.forEach((t) => { t.status = 'rejected'; });
    const first = setup(value, 'crew', 'supabase');
    expect(await screen.findByText(/2026-17/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(`Hodiny ${id(21)}`), { target: { value: 'Opravená poznámka' } });
    submit();
    await waitFor(() => expect(first.write).toHaveBeenCalledOnce());
    expect(first.write.mock.calls[0][2]).toBeUndefined();
    first.unmount();
    const second = setup(value, 'crew', 'supabase');
    fireEvent.click(await screen.findByRole('button', { name: 'Odebrat přílohu' }));
    submit();
    await waitFor(() => expect(second.write).toHaveBeenCalledOnce());
    expect(second.write.mock.calls[0][2]).toEqual({ kind: 'remove' });
  });

  it('shows the submitted PDF only for the frozen round while approval is pending', async () => {
    readInvoice.mockResolvedValue(attached);
    const value = data(); value.context.timelogs[0].status = 'pending_ch';
    value.context.activeRound = { id: id(40), workflowId: id(10), contractorProfileId: id(3), status: 'pending_ch',
      eventIds: [id(31)], timelogIds: [id(21)], note: '', updatedAt: time };
    setup(value, 'crew', 'supabase');
    expect(await screen.findByText('Příloha čeká na schválení hodin.')).toBeInTheDocument();
    expect(readInvoice).toHaveBeenLastCalledWith([id(21)], expect.any(Function));
    expect(screen.queryByRole('button', { name: 'Odebrat přílohu' })).not.toBeInTheDocument();
  });

  it('rejects oversized PDFs while letting the crew member cancel the selection and send hours', async () => {
    readInvoice.mockResolvedValue(recipient);
    const h = setup(data(), 'crew', 'supabase');
    fireEvent.click(await screen.findByRole('button', { name: 'Přiložit vlastní fakturu (PDF)' }));
    fillInvoice(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'velka.pdf', { type: 'application/pdf' }));
    expect(within(screen.getByRole('region', { name: 'Vlastní faktura' })).getByRole('alert')).toHaveTextContent('do 5 MiB');
    submit();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Odeslat vše ke kontrole' })).toBeEnabled());
    expect(h.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit výběr PDF' }));
    submit();
    await waitFor(() => expect(h.write).toHaveBeenCalledOnce());
    expect(h.write.mock.calls[0][2]).toBeUndefined();
  });

  it.each([true, false])('disables new upload when standing consent or an unresolved recipient precludes it (consent=%s)', async (consent) => {
    readInvoice.mockResolvedValue({ ...recipient, eligible: false, ...(consent ? {} : { customer_id: null, customer_name: null }) });
    const h = setup(data(), 'crew', 'supabase');
    await waitFor(() => expect(screen.queryByText('Načítání údajů k příloze…')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Přiložit vlastní fakturu (PDF)' })).not.toBeInTheDocument();
    if (!consent) expect(screen.getByText(/nelze jednoznačně určit odběratele/)).toBeInTheDocument();
    submit();
    await waitFor(() => expect(h.write).toHaveBeenCalledOnce());
  });

  it('ignores a pending attachment lookup after the editor changes owner in StrictMode', async () => {
    let finishOld: (value: typeof attached) => void;
    readInvoice.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValue(recipient);
    const value = data();
    const session = createShiftEvidenceSession({ context: value.context, role: 'crew', write: vi.fn(), assertCurrent: () => {} });
    const view = (user: string) => <StrictMode><SharedTimelogEditor source="supabase" data={value} role="crew" session={session}
      actorProfileId={id(3)} actorUserId={user} editorSessionKey={user} onClose={vi.fn()} onReload={vi.fn()} /></StrictMode>;
    const editor = render(view(id(4)));
    await waitFor(() => expect(finishOld).toBeTypeOf('function'));
    const retiredAssert = readInvoice.mock.calls[0][1];
    editor.rerender(view(id(5)));
    await act(async () => { finishOld(attached); });
    expect(retiredAssert).toThrow('Přístup k evidenci se změnil.');
    expect(screen.queryByText(/2026-17/)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Přiložit vlastní fakturu (PDF)' })).toBeInTheDocument();
  });
});
