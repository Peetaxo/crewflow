import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { createStableDraftUuid } from '../stable-draft-identity';
import { canManageShiftWorkflows, ShiftWorkflowError, type SaveShiftWorkflow, type ShiftWorkflowScope } from './shift-workflows.contract';
import { getWorkflowCandidates, getWorkflowSelectionImpact, workflowEventDates, workflowEventTitle, type ShiftWorkflowManagementData } from './shift-workflows.management';
import { buildShiftWorkflowCommand, shiftWorkflowEventId } from './shift-workflows.selection';

interface Props {
  scope: ShiftWorkflowScope;
  data: ShiftWorkflowManagementData;
  profileId: string;
  workflowId: string | null;
  onSave: (command: SaveShiftWorkflow) => Promise<unknown>;
  onReload: () => Promise<ShiftWorkflowManagementData>;
  onClose: () => void;
}

const safeMessage = (error: unknown) => error instanceof ShiftWorkflowError
  ? error.message : 'Propojení se nepodařilo bezpečně ověřit. Zkuste to znovu.';
const checkClass = 'mt-0.5 h-4 w-4 shrink-0 accent-[var(--nodu-accent)]';

function EditorSession(props: Props) {
  // Explicit refresh is the only way to replace the versions reviewed by the user.
  const [data, setData] = useState(() => structuredClone(props.data));
  const [eventIds, setEventIds] = useState(() => [...(data.snapshot.workflows.find((w) => w.id === props.workflowId)?.eventIds ?? [])]);
  const [cross, setCross] = useState(false);
  const [moves, setMoves] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<SaveShiftWorkflow | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const activation = useRef<{ active: boolean } | null>(null);
  useLayoutEffect(() => {
    const current = { active: true };
    activation.current = current;
    return () => { current.active = false; };
  }, []);
  const current = (captured: typeof activation.current) => captured?.active && activation.current === captured;
  const locked = busy || Boolean(pending) || conflict;
  const impact = getWorkflowSelectionImpact(data, props.scope, props.workflowId, eventIds);
  const candidates = getWorkflowCandidates(data, props.scope, props.profileId, props.workflowId);
  const events = new Map(data.events.filter((e) => props.scope.source === 'local' || e.supabaseId)
    .map((e) => [shiftWorkflowEventId(e, props.scope.source), e]));
  const candidateIds = new Set(candidates.map((c) => c.id));
  // Preserve a previously selected item even if assignment or visibility changed.
  for (const id of eventIds) {
    const event = events.get(id);
    if (event && !candidateIds.has(id)) candidates.push({ id, event });
  }
  const missing = eventIds.filter((id) => !events.has(id));
  const title = (id: string) => events.has(id) ? workflowEventTitle(events.get(id)!) : 'Nedostupná směna';

  const changeSelection = (next: string[]) => {
    setEventIds(next); setCross(false); setMoves(false); setReviewed(false); setError(null);
  };
  const send = async (command: SaveShiftWorkflow) => {
    const captured = activation.current;
    if (inFlight.current || !current(captured)) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      await props.onSave(command);
      if (current(captured)) props.onClose();
    } catch (cause) {
      if (!current(captured)) return;
      setError(safeMessage(cause));
      if (!(cause instanceof ShiftWorkflowError) || cause.kind === 'ambiguous') setPending(command);
      else if (cause.kind === 'conflict' || cause.kind === 'blocked') setConflict(true);
    } finally {
      if (current(captured)) { inFlight.current = false; setBusy(false); }
    }
  };
  const save = () => {
    if (locked || impact.blockedReason) return;
    if (reviewRequired && !reviewed) { setError('Zkontrolujte výběr po obnovení dat a potvrďte ho.'); return; }
    try {
      const command = buildShiftWorkflowCommand({
        scope: props.scope, snapshot: data.snapshot, workflowId: props.workflowId,
        eventIds, events: data.events, requestId: createStableDraftUuid(),
        confirmCrossProject: cross, confirmMoves: moves, deleteWorkflow: props.workflowId !== null && eventIds.length === 0,
      });
      void send(command);
    } catch (cause) { setError(safeMessage(cause)); }
  };
  const reload = async () => {
    const captured = activation.current;
    if (inFlight.current || !current(captured)) return;
    inFlight.current = true; setBusy(true);
    try {
      const fresh = await props.onReload();
      if (!current(captured)) return;
      setData(structuredClone(fresh)); setConflict(false); setError(null); setPending(null);
      setCross(false); setMoves(false); setReviewRequired(true); setReviewed(false);
    } catch (cause) { if (current(captured)) setError(safeMessage(cause)); }
    finally { if (current(captured)) { inFlight.current = false; setBusy(false); } }
  };
  const close = () => { if (!inFlight.current) props.onClose(); };
  const dissolving = props.workflowId !== null && eventIds.length === 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent overlayClassName="z-[100]" className="z-[101] max-h-[90dvh] w-[calc(100%_-_2rem)] min-w-0 overflow-y-auto sm:max-w-xl" data-mobile-event-swipe-ignore="true">
        <DialogHeader className="pr-8">
          <DialogTitle>{props.workflowId ? 'Upravit propojené směny' : 'Propojit směny'}</DialogTitle>
          <DialogDescription>
            Jedna evidence a společné schvalování pro všechny přiřazené lidi. Každý uvidí jen své směny. Propojení nevytváří fakturu.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={locked} className="grid min-w-0 gap-2">
          <legend className="mb-2 text-sm font-semibold">Související směny</legend>
          {candidates.map(({ id, event }) => {
            const selected = eventIds.includes(id);
            const next = selected ? eventIds.filter((candidate) => candidate !== id) : [...eventIds, id];
            const reason = getWorkflowSelectionImpact(data, props.scope, props.workflowId, next).blockedReason;
            return (
              <label key={id} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-sm ${selected ? 'border-[var(--nodu-accent)] bg-[var(--nodu-accent-soft)]' : 'border-[var(--nodu-border)]'}`}>
                <input type="checkbox" className={checkClass} checked={selected} disabled={locked || Boolean(reason)} onChange={() => changeSelection(next)} />
                <span className="min-w-0 break-words">
                  <span className="block font-medium">{workflowEventTitle(event)}</span>
                  <span className="block text-xs text-[var(--nodu-text-soft)]">{workflowEventDates(event)}</span>
                  {reason && <span className="mt-1 block text-xs text-[var(--nodu-text-soft)]">{reason}</span>}
                </span>
              </label>
            );
          })}
          {missing.map((id) => <p key={id} className="text-sm text-[var(--nodu-text-soft)]">Nedostupná vybraná směna</p>)}
          {candidates.length === 0 && !missing.length && <p className="text-sm">Tento člověk nemá přiřazené směny k propojení.</p>}
        </fieldset>
        <div className="space-y-2 text-sm">
          <p className="font-medium">Vybráno směn: {eventIds.length}</p>
          {impact.removedEventIds.length > 0 && <p>Odpojí se: {impact.removedEventIds.map(title).join(', ')}.</p>}
          {dissolving && <p>Samotné směny ani jejich evidence se nesmažou. Zruší se pouze jejich propojení.</p>}
          {impact.sources.map((source) => (
            <div key={source.id} className="rounded-xl bg-[var(--nodu-paper-strong)] p-3">
              <p>Přesunou se: {source.eventIds.filter((id) => eventIds.includes(id)).map(title).join(', ')}.</p>
              <p>{source.eventIds.some((id) => !eventIds.includes(id))
                ? `V původním propojení zůstane: ${source.eventIds.filter((id) => !eventIds.includes(id)).map(title).join(', ')}.`
                : 'Původní propojení zůstane prázdné a zanikne.'}</p>
            </div>
          ))}
          {impact.crossProject && <label className="flex items-start gap-2"><input type="checkbox" className={checkClass} checked={cross} disabled={locked} onChange={(e) => setCross(e.target.checked)} />Potvrzuji propojení různých projektů nebo jobnumber</label>}
          {impact.sources.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" className={checkClass} checked={moves} disabled={locked} onChange={(e) => setMoves(e.target.checked)} />Potvrzuji přesun z jiného propojení</label>}
          {reviewRequired && <label className="flex items-start gap-2"><input type="checkbox" className={checkClass} checked={reviewed} disabled={locked} onChange={(e) => setReviewed(e.target.checked)} />Zkontroloval jsem výběr po obnovení dat</label>}
          {impact.blockedReason && <p role="alert">{impact.blockedReason}</p>}
          {error && <p role="alert">{error}</p>}
          {pending && <p>Odpověď nebyla ověřena. Opakování ověří stejný požadavek; zavření okna případné uložení nevrátí zpět.</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>Zavřít</Button>
          {conflict ? <Button type="button" disabled={busy} onClick={() => { void reload(); }}>Obnovit data a ponechat výběr</Button>
            : pending ? <Button type="button" disabled={busy} onClick={() => { void send(pending); }}>Zopakovat stejný požadavek</Button>
              : <Button type="button" disabled={busy || Boolean(impact.blockedReason) || (!props.workflowId && eventIds.length < 2)} onClick={save}>{dissolving ? 'Zrušit propojení' : 'Uložit propojení'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ShiftWorkflowEditor(props: Props) {
  if (!canManageShiftWorkflows(props.scope.role)) return null;
  return <EditorSession key={JSON.stringify([props.scope, props.profileId, props.workflowId])} {...props} />;
}
