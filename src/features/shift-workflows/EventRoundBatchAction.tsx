import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import type { Event, Timelog } from '../../types';
import { BillingFinancePreview } from '../invoice-billing/BillingFinancePreview';
import { formatBillingHours, formatBillingMoney } from '../invoice-billing/contract';
import { addAmounts } from '../events/services/event-hours-costs';
import { prepareLegacyEventBatch } from './event-legacy-batch';
import { prepareEventRoundBatch, type EventRoundEntry, type ReviewedEventItem } from './event-round-batch';
import { refreshShiftEvidence } from './shift-evidence-write';
import { ShiftWorkflowError } from './shift-workflows.contract';
import { useShiftWorkflows } from './useShiftWorkflows';

export interface EventRoundBatchProps {
  event: Event; entries: EventRoundEntry[]; legacyEntries?: { report: Timelog; name: string }[];
  label: string; disabled?: boolean; legacyOnlyAction?: ReactNode;
}

type BatchPhase = 'loading' | 'review' | 'writing' | 'retry' | 'failed' | 'done';
const message = (error: unknown) => error instanceof Error ? error.message : 'Výsledek operace se nepodařilo ověřit.';
const countItems = (items: ReviewedEventItem[]) => items.reduce((sum, item) => sum + (item.count ?? 1), 0);

function BatchDialog({ selection, onClose, disabled }: {
  selection: EventRoundBatchProps; onClose: () => void; disabled?: boolean;
}) {
  const workflows = useShiftWorkflows();
  const scopeKey = workflows.scopeKey;
  const initial = useRef({ selection, scopeKey, reload: workflows.reload, scope: workflows.scope });
  const lifetime = useRef<AbortController | null>(null);
  const [items, setItems] = useState<ReviewedEventItem[]>([]);
  const [phase, setPhase] = useState<BatchPhase>('loading');
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(0);
  const busy = useRef(false);
  const [retired, setRetired] = useState(false);
  const contextValid = !retired && scopeKey === initial.current.scopeKey && workflows.ready && !workflows.query.isError;
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useLayoutEffect(() => {
    if (!contextValid) {
      lifetime.current?.abort();
      setRetired(true);
    }
  }, [contextValid]);
  const assertLive = (signal: AbortSignal) => {
    if (signal.aborted) throw new ShiftWorkflowError('denied', 'Přístup k výkazům se změnil.');
  };
  useEffect(() => {
    const signal = lifetime.current!.signal;
    const { selection: chosen, reload, scope } = initial.current;
    if (signal.aborted) return;
    const current = () => assertLive(signal);
    const prepare = async () => {
      const ids = [...chosen.entries.map(e => e.report), ...(chosen.legacyEntries ?? []).map(e => e.report)]
        .map(report => scope.source === 'local' ? report.id : report.supabaseId);
      if (new Set(ids).size !== ids.length) throw new Error('Výběr obsahuje opakovaný výkaz. Obnovte data.');
      const rounds = await prepareEventRoundBatch(chosen.event, chosen.entries, scope, reload, current);
      current();
      const legacy = chosen.legacyEntries?.length ? await prepareLegacyEventBatch(chosen.event, chosen.legacyEntries, scope, current, reload) : [];
      current();
      setItems([...rounds, ...legacy]);
      setPhase('review');
    };
    void prepare().catch(cause => { if (!signal.aborted) { setError(message(cause)); setPhase('failed'); } });
  }, []);
  const approve = initial.current.scope.role === 'coo';
  const total = countItems(items);
  const done = countItems(items.slice(0, completed));
  const refresh = (signal: AbortSignal) => refreshShiftEvidence(() => assertLive(signal), initial.current.reload);
  const save = async () => {
    const signal = lifetime.current!.signal;
    if (busy.current || signal.aborted || disabled || (phase !== 'review' && phase !== 'retry')) return;
    busy.current = true;
    setPhase('writing'); setError('');
    let index = completed;
    try {
      for (; index < items.length; index++) {
        assertLive(signal);
        await items[index].write(() => assertLive(signal));
        assertLive(signal);
        setCompleted(index + 1);
      }
      setPhase('done');
      toast.success(`${approve ? 'Schválené výkazy' : 'Výkazy předané COO'} · ${total} / ${total}`);
      await refresh(signal);
      if (!signal.aborted) onClose();
    } catch (cause) {
      if (signal.aborted) return;
      if (index === items.length) {
        setError('Výkazy jsou uložené. Přehled se nepodařilo obnovit.');
      } else {
        const kind = (cause as { kind?: string } | null)?.kind;
        setError(`${items[index].name} · ${message(cause)}`);
        setPhase(!kind || kind === 'ambiguous' ? 'retry' : 'failed');
      }
    } finally { busy.current = false; }
  };
  const close = async () => {
    if (busy.current) return;
    const signal = lifetime.current!.signal;
    if (!signal.aborted && ['retry', 'failed', 'done'].includes(phase)) {
      busy.current = true;
      try { await refresh(signal); }
      catch { if (!signal.aborted) toast.error('Přehled se nepodařilo obnovit.'); }
      finally { busy.current = false; }
    }
    onClose();
  };
  return <Dialog open onOpenChange={open => { if (!open) void close(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{approve ? 'Schválení k proplacení' : 'Předání výkazů COO'}</DialogTitle>
        <DialogDescription>{selection.event.name}{items.length > 0 && ` · Počet vybraných výkazů: ${total}`}</DialogDescription></DialogHeader>
      {!contextValid ? <p role="alert">Přístup k výkazům se změnil. Otevřete výběr znovu.</p> : <>
        {phase === 'loading' && <p role="status">Načítám výkazy a podklady…</p>}
        {items.map((item, index) => <section key={item.key} className="space-y-2 border-b border-[var(--nodu-border)] pb-3">
          <h3 className="font-semibold">{item.name}</h3>
          <p>{formatBillingHours(item.hours)}{approve && ` · ${formatBillingMoney(item.amount)}`}</p>
          {index < completed && <p className="text-sm font-semibold">{approve ? 'Schváleno k proplacení' : 'Předáno COO'}</p>}
          {index === completed && phase === 'retry' && <p className="text-sm">Výsledek čeká na ověření</p>}
          {index > completed && (phase === 'retry' || phase === 'failed') && <p className="text-sm">Čeká na zpracování</p>}
          {item.quote && <details><summary className="cursor-pointer">Rozpis částky</summary>
            <BillingFinancePreview finance={item.quote.preview} /></details>}
        </section>)}
        {approve && items.length > 0 && <p className="font-semibold">Celkem k proplacení · {formatBillingMoney(
          items.reduce<number | null>((sum, item) => addAmounts(sum, item.amount), 0))}</p>}
        {items.length > 0 && phase !== 'review' && <p role="status">{approve ? 'Schválené výkazy' : 'Výkazy předané COO'} · {done} / {total}</p>}
        {error && <p role="alert">{error}</p>}
      </>}
      <DialogFooter>
        <Button variant="outline" disabled={phase === 'writing'} onClick={() => void close()}>Zavřít</Button>
        {contextValid && (phase === 'review' || phase === 'retry') &&
          <Button disabled={disabled} onClick={() => void save()}>{phase === 'retry' ? 'Opakovat nepotvrzený krok a pokračovat'
            : approve ? 'Potvrdit schválení k proplacení' : 'Potvrdit předání COO'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function EventRoundBatchAction(props: EventRoundBatchProps) {
  const [selection, setSelection] = useState<EventRoundBatchProps | null>(null);
  return <>{props.entries.length > 0 ? <Button size="sm" className="min-h-11" disabled={props.disabled || Boolean(selection)}
    onClick={() => setSelection({ ...props, entries: structuredClone(props.entries), legacyEntries: structuredClone(props.legacyEntries) })}>
    {props.label}</Button> : !selection && props.legacyOnlyAction}
    {selection && <BatchDialog selection={selection} onClose={() => setSelection(null)} disabled={props.disabled} />}
  </>;
}
