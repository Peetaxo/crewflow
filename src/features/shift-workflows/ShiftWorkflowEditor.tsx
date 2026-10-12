import { useState } from 'react';
import { canManageShiftWorkflows } from './shift-workflows.contract';
import { getEventWorkflowCandidates, getWorkflowSelectionImpact, workflowEventDates, workflowEventTitle } from './shift-workflows.management';
import { shiftWorkflowEventId } from './shift-workflows.selection';
import { useShiftWorkflowDraft, type ShiftWorkflowDraftInput } from './useShiftWorkflowDraft';
import { ShiftWorkflowConfirmation, workflowCheckClass } from './ShiftWorkflowConfirmation';

interface Props extends ShiftWorkflowDraftInput { ownerContext: string }

function EditorSession(props: Props) {
  const draft = useShiftWorkflowDraft(props);
  const { data, eventIds, locked, changeSelection } = draft;
  const [search, setSearch] = useState('');
  const candidates = getEventWorkflowCandidates(data, props.scope);
  const events = new Map(data.events.filter((e) => props.scope.source === 'local' || e.supabaseId)
    .map((e) => [shiftWorkflowEventId(e, props.scope.source), e]));
  const missing = eventIds.filter((id) => !events.has(id));
  const query = search.trim().toLocaleLowerCase('cs-CZ');
  const displayedCandidates = candidates.filter(({ id, event }) => eventIds.includes(id)
    || workflowEventTitle(event).toLocaleLowerCase('cs-CZ').includes(query));
  return <ShiftWorkflowConfirmation draft={draft} scope={props.scope} workflowId={props.workflowId}>
    <fieldset disabled={locked} className="grid min-w-0 gap-2">
      <legend className="mb-2 text-sm font-semibold">Související směny</legend>
      <label className="grid gap-1 text-sm">Hledat směnu nebo jobnumber
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl border border-[var(--nodu-border)] bg-transparent p-3" />
      </label>
      {displayedCandidates.map(({ id, event }) => {
        const selected = eventIds.includes(id);
        const next = selected ? eventIds.filter((candidate) => candidate !== id) : [...eventIds, id];
        const reason = getWorkflowSelectionImpact(data, props.scope, props.workflowId, next).blockedReason;
        return <label key={id} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-sm ${selected ? 'border-[var(--nodu-accent)] bg-[var(--nodu-accent-soft)]' : 'border-[var(--nodu-border)]'}`}>
          <input type="checkbox" className={workflowCheckClass} checked={selected} disabled={locked || Boolean(reason)} onChange={() => changeSelection(next)} />
          <span className="min-w-0 break-words">
            <span className="block font-medium">{workflowEventTitle(event)}</span>
            <span className="block text-xs text-[var(--nodu-text-soft)]">{workflowEventDates(event)}</span>
            {reason && <span className="mt-1 block text-xs text-[var(--nodu-text-soft)]">{reason}</span>}
          </span>
        </label>;
      })}
      {missing.map((id) => <p key={id} className="text-sm text-[var(--nodu-text-soft)]">Nedostupná vybraná směna</p>)}
      {candidates.length === 0 && !missing.length && <p className="text-sm">Nejsou dostupné směny k propojení.</p>}
      {candidates.length > 0 && displayedCandidates.length === 0 && <p className="text-sm">Žádná směna neodpovídá hledání.</p>}
    </fieldset>
  </ShiftWorkflowConfirmation>;
}

export default function ShiftWorkflowEditor(props: Props) {
  if (!canManageShiftWorkflows(props.scope.role)) return null;
  return <EditorSession key={JSON.stringify([props.scope, props.ownerContext, props.workflowId])} {...props} />;
}
