import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import { workflowEventDates, workflowEventTitle } from './shift-workflows.management';
import { shiftWorkflowEventId } from './shift-workflows.selection';
import type { ShiftWorkflowDraft } from './useShiftWorkflowDraft';

export const workflowCheckClass = 'mt-0.5 h-4 w-4 shrink-0 accent-[var(--nodu-accent)]';

export function ShiftWorkflowConfirmation({ draft, scope, workflowId, children, onBack }: {
  draft: ShiftWorkflowDraft;
  scope: ShiftWorkflowScope;
  workflowId: string | null;
  children?: ReactNode;
  onBack?: () => void;
}) {
  const { data, eventIds, impact, busy, locked, error, conflict, pending, reviewRequired, reviewed,
    cross, moves, dissolveConfirmed, setCross, setMoves, setDissolveConfirmed, setReviewed,
    save, reload, send, close } = draft;
  const events = new Map(data.events.filter((event) => scope.source === 'local' || event.supabaseId)
    .map((event) => [shiftWorkflowEventId(event, scope.source), event]));
  const title = (id: string) => events.has(id) ? workflowEventTitle(events.get(id)!) : 'Nedostupná směna';
  const dissolving = workflowId !== null && eventIds.length === 0;
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent overlayClassName="z-[100]" className="z-[101] max-h-[90dvh] w-[calc(100%_-_2rem)] min-w-0 overflow-y-auto sm:max-w-xl" data-mobile-event-swipe-ignore="true">
      <DialogHeader className="pr-8">
        <DialogTitle>{workflowId ? 'Upravit propojené směny' : 'Propojit směny'}</DialogTitle>
        <DialogDescription>Jedna evidence a společné schvalování pro všechny přiřazené lidi. Každý uvidí jen své směny. Propojení nevytváří fakturu.</DialogDescription>
      </DialogHeader>
      {children ?? <section aria-label="Vybrané směny" className="space-y-2 text-sm">
        {eventIds.map((id) => {
          const event = events.get(id);
          return event ? <div key={id} className="rounded-xl border border-[var(--nodu-border)] p-3">
            <p className="font-medium">{workflowEventTitle(event)}</p>
            <p className="text-xs text-[var(--nodu-text-soft)]">{workflowEventDates(event)}</p>
          </div> : <p key={id}>Nedostupná vybraná směna</p>;
        })}
      </section>}
      <div className="space-y-2 text-sm">
        <p className="font-medium">Vybráno směn: {eventIds.length}</p>
        {impact.removedEventIds.length > 0 && <p>Odpojí se: {impact.removedEventIds.map(title).join(', ')}.</p>}
        {dissolving && <>
          <p>Samotné směny ani jejich evidence se nesmažou. Zruší se pouze jejich propojení.</p>
          <label className="flex items-start gap-2"><input type="checkbox" className={workflowCheckClass} checked={dissolveConfirmed} disabled={locked} onChange={(e) => setDissolveConfirmed(e.target.checked)} />Potvrzuji zrušení propojení</label>
        </>}
        {impact.sources.map((source) => <div key={source.id} className="rounded-xl bg-[var(--nodu-paper-strong)] p-3">
          <p>Přesunou se: {source.eventIds.filter((id) => eventIds.includes(id)).map(title).join(', ')}.</p>
          <p>{source.eventIds.some((id) => !eventIds.includes(id))
            ? `V původním propojení zůstane: ${source.eventIds.filter((id) => !eventIds.includes(id)).map(title).join(', ')}.`
            : 'Původní propojení zůstane prázdné a zanikne.'}</p>
        </div>)}
        {impact.crossProject && <label className="flex items-start gap-2"><input type="checkbox" className={workflowCheckClass} checked={cross} disabled={locked} onChange={(e) => setCross(e.target.checked)} />Potvrzuji propojení různých projektů nebo jobnumber</label>}
        {impact.sources.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" className={workflowCheckClass} checked={moves} disabled={locked} onChange={(e) => setMoves(e.target.checked)} />Potvrzuji přesun z jiného propojení</label>}
        {reviewRequired && <label className="flex items-start gap-2"><input type="checkbox" className={workflowCheckClass} checked={reviewed} disabled={locked} onChange={(e) => setReviewed(e.target.checked)} />Zkontroloval jsem výběr po obnovení dat</label>}
        {impact.blockedReason && <p role="alert">{impact.blockedReason}</p>}
        {error && <p role="alert">{error}</p>}
        {pending && <p>Odpověď nebyla ověřena. Opakování ověří stejný požadavek; zavření okna případné uložení nevrátí zpět.</p>}
      </div>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={close}>Zavřít</Button>
        {onBack && <Button type="button" variant="outline" disabled={locked} onClick={() => { if (!locked) onBack(); }}>Zpět k výběru</Button>}
        {conflict ? <Button type="button" disabled={busy} onClick={() => { void reload(); }}>Obnovit data a ponechat výběr</Button>
          : pending ? <Button type="button" disabled={busy} onClick={() => { void send(pending); }}>Zopakovat stejný požadavek</Button>
            : <Button type="button" disabled={busy || Boolean(impact.blockedReason) || (dissolving ? !dissolveConfirmed : eventIds.length < 2)} onClick={save}>{dissolving ? 'Zrušit propojení' : onBack ? 'Propojit směny' : 'Uložit propojení'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
