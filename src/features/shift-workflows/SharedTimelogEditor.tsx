import { appDataSource } from '../../lib/app-config';
import { BillingApprovalPreview } from '../invoice-billing/BillingApprovalPreview';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import type { Role, Timelog } from '../../types';
import { KM_RATE } from '../../data';
import { calculateMealAllowance, calculateTotalHours, formatCurrency } from '../../utils';
import { getActiveTimelogApproval } from '../timelogs/services/timelog-approval-state';
import { ShiftInvoiceAttachment } from './ShiftInvoiceAttachment';
import TimelogEvidenceSection from './TimelogEvidenceSection';
import type { ShiftEvidenceData } from './shift-evidence-loader';
import type { ShiftEvidenceSession } from './shift-evidence-session';
import { serializeShiftReports } from './shift-workflows.batch-commands';
import { canonicalUuid } from './shift-workflows.contract';
import { useShiftInvoiceDraft } from './useShiftInvoiceDraft';

export interface SharedTimelogEditorProps {
  source?: 'local' | 'supabase'; data: ShiftEvidenceData; role: Role; session: ShiftEvidenceSession; editorSessionKey: string;
  actorProfileId: string | null; actorUserId: string | null;
  onClose: () => void; onReload: () => void;
}
const statuses = { draft: 'Rozpracováno', rejected: 'Vráceno k opravě', pending_ch: 'Čeká na kontrolu produkce',
  pending_coo: 'Čeká na schválení', pending_crew_confirmation: 'Úpravy čekají na potvrzení crew',
  approved: 'Schváleno', invoiced: 'Vyfakturováno', paid: 'Zaplaceno' };

function EvidenceTotal({ label, reports, data }: { label: string; reports: Timelog[]; data: ShiftEvidenceData }) {
  const totals = reports.reduce((sum, report) => {
    const hours = calculateTotalHours(report.days);
    const meals = calculateMealAllowance(report.days, { enabled: Boolean(data.events.find((event) => event.supabaseId === report.eventSupabaseId)?.mealAllowanceEnabled) });
    return { hours: sum.hours + hours, km: sum.km + report.km, meals: sum.meals + meals,
      amount: sum.amount + hours * data.contractor.rate + report.km * KM_RATE + meals };
  }, { hours: 0, km: 0, meals: 0, amount: 0 });
  return <section aria-label={label} className="rounded-2xl border border-[var(--nodu-border)] p-3 text-sm">
    <h2 className="font-semibold">{label}</h2>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      <dt>Hodiny</dt><dd className="text-right">{totals.hours.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h</dd>
      <dt>Cestovné</dt><dd className="text-right">{totals.km.toLocaleString('cs-CZ')} km</dd>
      <dt>Jídlo</dt><dd className="text-right">{formatCurrency(totals.meals)}</dd>
      <dt>Odměna včetně cestovného a jídla</dt><dd className="text-right font-semibold">{formatCurrency(totals.amount)}</dd>
    </dl>
  </section>;
}

export default function SharedTimelogEditor({ data, role, session, editorSessionKey, actorProfileId, actorUserId, onClose, onReload, source = appDataSource }: SharedTimelogEditorProps) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [showBillingQuote, setShowBillingQuote] = useState(false);
  const [reason, setReason] = useState('');
  const [affectedEvent, setAffectedEvent] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invalidSection, setInvalidSection] = useState<{ id: string; message: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const alive = useRef(true);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (role !== 'crew' || !state.dirty || state.busy || state.error || actionBusy || confirmClose) return;
    const timer = setTimeout(() => { void session.save().catch(() => undefined); }, 800);
    return () => clearTimeout(timer);
  }, [role, session, state.context, state.dirty, state.busy, state.error, actionBusy, confirmClose]);
  const round = state.context.activeRound;
  const frozen = state.context.timelogs.filter((t) => round?.timelogIds.includes(t.supabaseId!));
  const drafts = state.context.timelogs.filter((t) => !round?.timelogIds.includes(t.supabaseId!) && ['draft', 'rejected'].includes(t.status));
  const later = drafts.length > 0;
  const invoiceOwner = source === 'supabase' && role === 'crew' && actorProfileId === state.context.contractorProfileId
    && canonicalUuid.safeParse(actorUserId).success && canonicalUuid.safeParse(actorProfileId).success
    ? JSON.stringify([editorSessionKey, actorUserId, actorProfileId]) : null;
  const invoiceTimelogKey = (round ? [...round.timelogIds] : drafts.map((report) => report.supabaseId!)).sort().join(',');
  const invoice = useShiftInvoiceDraft(invoiceOwner, invoiceTimelogKey, round ? `${round.id}:${round.status}` : 'draft');
  const confirmsRound = state.cohort === 'confirmation' && round?.status === 'pending_crew_confirmation';
  const canEditInvoice = Boolean(invoiceOwner && (!round && later || confirmsRound));
  const canCooDecide = role === 'coo' && round?.status === 'pending_coo' && frozen.length === round.timelogIds.length && frozen.every((t) => {
    const approval = getActiveTimelogApproval(t);
    return approval?.status === 'pending' && approval.approverProfileId === actorProfileId && approval.approverUserId === actorUserId;
  });
  const canChDecide = role === 'crewhead' && round?.status === 'pending_ch';
  const editingRound = canChDecide && editingRoundId === round.id;
  let title = data.events.length > 1 ? 'Společná evidence' : 'Evidence hodin';
  if (canChDecide || canCooDecide) title = editingRound ? 'Úprava výkazu' : 'Kontrola výkazu';
  const locked = actionBusy || state.busy || state.canRetry || state.needsReload;
  const run = async (action: () => Promise<unknown>) => {
    if (actionBusy) return;
    setActionBusy(true); setActionError(null);
    try { await action(); } catch (error) { if (alive.current) setActionError(error instanceof Error ? error.message : 'Operaci se nepodařilo dokončit.'); }
    finally { if (alive.current) setActionBusy(false); }
  };
  const requestClose = () => {
    if (state.busy || actionBusy || state.dirty || state.canRetry || invoice.draft) setConfirmClose(true);
    else onClose();
  };
  const requestReload = () => {
    if ((state.dirty || invoice.draft) && !window.confirm('Znovu načíst evidenci a zahodit neuložené změny?')) return;
    onReload();
  };
  const annotationsReady = reason.trim().length > 0 && Boolean(affectedEvent);
  const validateSections = (reports: Timelog[]) => {
    setInvalidSection(null);
    for (const report of reports) {
      try { serializeShiftReports([report], true); }
      catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Doplňte údaje směny.';
        const name = data.events.find((event) => event.supabaseId === report.eventSupabaseId)?.name ?? 'Směna';
        setInvalidSection({ id: report.eventSupabaseId!, message });
        throw new Error(`${name}: ${message}`);
      }
    }
  };
  return <Dialog.Root open onOpenChange={(open) => { if (!open) requestClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <Dialog.Content className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-[rgb(var(--nodu-paper-rgb))] text-[var(--nodu-text)] sm:inset-x-[5vw] sm:inset-y-[4vh] sm:h-auto sm:rounded-[28px] sm:border sm:border-[var(--nodu-border)] lg:inset-x-[15vw]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--nodu-border)] px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <div><Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-[var(--nodu-text-soft)]">{data.contractor.name} · {data.events.length} {data.events.length === 1 ? 'směna' : 'směny'}</Dialog.Description>
          </div>
          <Button variant="ghost" size="icon" aria-label="Zavřít evidenci" onClick={requestClose}><X size={20} /></Button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <p className="text-sm text-[var(--nodu-text-soft)]">Hodiny zůstávají rozepsané podle směn. Finální schválení připraví podklad k fakturaci; případné vystavení závisí na souhlasu dodavatele.</p>
          {round && <div className="rounded-2xl border border-[var(--nodu-border)] p-3 text-sm" role="status">
            <p className="font-semibold">{statuses[round.status]}</p><p>Aktuální kolo zahrnuje {round.timelogIds.length} {round.timelogIds.length === 1 ? 'výkaz' : 'výkazy'}.</p>
            {round.note && <p className="mt-2 whitespace-pre-wrap">{round.note}</p>}
          </div>}
          {round && <EvidenceTotal label="Celkem v aktuálním kole" reports={frozen} data={data} />}
          {later && <EvidenceTotal label={round ? 'Rozpracováno mimo aktuální kolo' : 'Celkem k odeslání'} reports={drafts} data={data} />}
          {role === 'crew' && round?.status === 'pending_crew_confirmation' && later && <div className="flex flex-wrap gap-2">
            <Button variant={state.cohort === 'confirmation' ? 'default' : 'outline'} disabled={locked || state.dirty} onClick={() => session.setCohort('confirmation')}>Upravit potvrzované kolo</Button>
            <Button variant={state.cohort === 'drafts' ? 'default' : 'outline'} disabled={locked || state.dirty} onClick={() => session.setCohort('drafts')}>Upravit pozdější směny</Button>
          </div>}
          {canChDecide && <Button variant="outline" disabled={locked || confirmClose || state.dirty} onClick={() => setEditingRoundId(editingRound ? null : round.id)}>
            {editingRound ? 'Zpět na kontrolu' : 'Upravit výkaz'}
          </Button>}
          {data.events.map((event) => {
            const report = state.context.timelogs.find((t) => t.eventSupabaseId === event.supabaseId);
            const outside = round && report && !round.timelogIds.includes(report.supabaseId!) && ['draft', 'rejected'].includes(report.status);
            return <section key={event.supabaseId} className="rounded-[22px] border border-[var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-3 sm:p-4" aria-label={event.name}>
              <h2 className="text-lg font-semibold">{event.name}{event.job && event.job !== event.name ? ` · ${event.job}` : ''}</h2>
              <p className="mb-3 text-sm text-[var(--nodu-text-soft)]">{new Date(`${event.startDate}T12:00:00`).toLocaleDateString('cs-CZ')}{event.endDate !== event.startDate ? ` – ${new Date(`${event.endDate}T12:00:00`).toLocaleDateString('cs-CZ')}` : ''} · {report ? statuses[report.status] : 'Chybí výkaz'}</p>
              {invalidSection?.id === event.supabaseId && <p role="alert" className="mb-3 text-sm text-red-700">{invalidSection.message}</p>}
              {outside && <p className="mb-3 text-sm font-medium text-[var(--nodu-accent)]">Mimo aktuální schvalování</p>}
              {report ? <TimelogEvidenceSection timelog={report} event={event} contractor={data.contractor} role={role}
                editorSessionKey={editorSessionKey} readOnly={actionBusy || confirmClose || (role === 'crewhead' && !editingRound) || !session.isEditable(report)} showReviewNoteEditor={false}
                onChange={(value) => { session.edit(value); if (invalidSection?.id === value.eventSupabaseId) setInvalidSection(null); setActionError(null); }} />
                : <p role="alert">Výkaz této směny se nepodařilo načíst. Před odesláním obnovte data.</p>}
            </section>;
          })}
          {invoiceOwner && invoiceTimelogKey && <ShiftInvoiceAttachment key={`${invoiceOwner}:${invoiceTimelogKey}:${round?.id ?? ''}:${round?.status ?? ''}`}
            invoice={invoice} editable={canEditInvoice} waiting={round?.status === 'pending_ch' || round?.status === 'pending_coo'}
            locked={locked || confirmClose} onChange={() => setActionError(null)} />}
          {(canChDecide || role === 'coo' && round?.status === 'pending_coo') && <div className="space-y-3 rounded-2xl border border-[var(--nodu-border)] p-4">
            <label className="block text-sm">Důvod vrácení nebo úpravy<Textarea aria-label="Důvod vrácení nebo úpravy" value={reason} onChange={(e) => setReason(e.target.value)} disabled={locked} /></label>
            <label className="block text-sm">Dotčená směna<select className="mt-1 block w-full rounded-xl border border-[var(--nodu-border)] bg-transparent p-2" aria-label="Dotčená směna" value={affectedEvent} disabled={locked} onChange={(e) => setAffectedEvent(e.target.value)}>
              <option value="">Vyberte směnu</option>{data.events.filter((e) => round?.eventIds.includes(e.supabaseId!)).map((e) => <option key={e.supabaseId} value={e.supabaseId}>{e.name}</option>)}
            </select></label>
          </div>}
          {showBillingQuote && round?.status === 'pending_coo' && <BillingApprovalPreview timelogIds={frozen.map((t) => t.supabaseId!)}
            onApprove={(quote) => session.transition('approve', { billingQuoteId: quote.id })} retryApproval={session.retry}
            onCancel={() => setShowBillingQuote(false)} onStale={requestReload} />}
          {(actionError || state.error) && <p role="alert" className="text-sm text-red-700">{actionError ?? state.error?.message}</p>}
          {state.refreshError && <p role="alert" className="text-sm">{state.refreshError.message}</p>}
          {state.canRetry && <Button disabled={state.busy || actionBusy} onClick={() => { void run(async () => {
            const result = await session.retry();
            if (alive.current && result.round?.status === 'pending_ch') invoice.reset();
          }); }}>Opakovat stejný požadavek</Button>}
          {(state.needsReload || state.refreshError) && <Button variant="outline" disabled={state.busy || actionBusy} onClick={requestReload}>Znovu načíst evidenci</Button>}
          {confirmClose && <div role="alert" className="space-y-3 rounded-2xl border border-[var(--nodu-border)] p-4">
            <p>{state.canRetry || state.busy || actionBusy ? 'Uložení ještě není potvrzené. Po opětovném otevření zkontrolujte stav.' : 'V evidenci jsou neuložené změny.'}</p>
            {invoice.draft && <p>Změna přílohy se ukládá při odeslání výkazu.</p>}
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setConfirmClose(false)}>Pokračovat v úpravách</Button>
              <Button variant="outline" onClick={onClose}>{state.canRetry || state.busy || actionBusy ? 'Zavřít a ověřit později' : 'Zahodit neuložené změny'}</Button>
              {role === 'crew' && state.dirty && !invoice.draft && !state.canRetry && !state.needsReload && <Button disabled={locked} onClick={() => { void run(async () => { await session.save(); if (alive.current) onClose(); }); }}>Uložit a zavřít</Button>}
            </div>
          </div>}
        </div>
        <footer className="shrink-0 space-y-2 border-t border-[var(--nodu-border)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {role === 'crew' && <p className="text-sm text-[var(--nodu-text-soft)]">Odesláním ke kontrole uzavíráte veškerou svou práci na všech uvedených směnách odesílaného kola. Pokud budete hodiny ještě doplňovat, uložte výkazy jako rozpracované.</p>}
          <p role="status" className="text-xs text-[var(--nodu-text-soft)]">{state.busy ? 'Ukládání…' : state.canRetry ? 'Uložení není potvrzené' : state.dirty ? 'Neuložené změny' : 'Údaje jsou aktuální'}</p>
          <div className="flex flex-wrap justify-end gap-2">
            {role === 'crew' && (later || confirmsRound) && <>
              <Button variant="outline" disabled={locked || confirmClose} onClick={() => { void run(session.save); }}>Uložit rozpracované části</Button>
              {confirmsRound
                ? <Button disabled={locked || confirmClose} onClick={() => { void run(async () => {
                  validateSections(frozen);
                  const change = canEditInvoice ? invoice.prepare() : undefined;
                  await session.save();
                  await session.transition('confirm', { invoice: change });
                  if (alive.current) invoice.reset();
                }); }}>Potvrdit a odeslat celé kolo</Button>
                : <Button disabled={locked || confirmClose || Boolean(round)} onClick={() => { void run(async () => {
                  validateSections(drafts);
                  await session.submit(canEditInvoice ? invoice.prepare() : undefined);
                  if (alive.current) invoice.reset();
                }); }}>Odeslat vše ke kontrole</Button>}
            </>}
            {canChDecide && <>
              {editingRound && <Button variant="outline" disabled={locked || confirmClose || !annotationsReady || !state.dirty} onClick={() => { void run(() => session.transition('correct', { note: reason, affectedEventId: affectedEvent })); }}>Odeslat úpravy crew k potvrzení</Button>}
              <Button disabled={locked || confirmClose || state.dirty} onClick={() => { void run(() => session.transition('handoff')); }}>Předat celé kolo ke schválení</Button>
            </>}
            {role === 'coo' && round?.status === 'pending_coo' && <Button disabled={locked || confirmClose || !canCooDecide} onClick={() => { if (source === 'supabase') setShowBillingQuote(true); else void run(() => session.transition('approve')); }}>Schválit celé kolo</Button>}
            {(canChDecide || role === 'coo' && round?.status === 'pending_coo') && <Button variant="outline" disabled={locked || confirmClose || !annotationsReady || state.dirty || role === 'coo' && !canCooDecide}
              onClick={() => { void run(() => session.transition('return', { note: reason, affectedEventId: affectedEvent })); }}>Vrátit celé kolo</Button>}
          </div>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
