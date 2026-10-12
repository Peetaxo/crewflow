import { useLayoutEffect, useRef, useState } from 'react';
import { buildShiftWorkflowCommand } from './shift-workflows.selection';
import { createStableDraftUuid } from '../stable-draft-identity';
import { ShiftWorkflowError, type SaveShiftWorkflow, type ShiftWorkflowScope } from './shift-workflows.contract';
import { getWorkflowSelectionImpact, type ShiftWorkflowManagementData } from './shift-workflows.management';

export interface ShiftWorkflowDraftInput {
  scope: ShiftWorkflowScope;
  workflowId: string | null;
  data: ShiftWorkflowManagementData;
  onSave: (command: SaveShiftWorkflow) => Promise<unknown>;
  onReload: () => Promise<ShiftWorkflowManagementData>;
  onClose: () => void;
}

const safeMessage = (error: unknown) => error instanceof ShiftWorkflowError
  ? error.message : 'Propojení se nepodařilo bezpečně ověřit. Zkuste to znovu.';

/** One captured draft per mounted owner. Only an explicit refresh replaces versions. */
export function useShiftWorkflowDraft(props: ShiftWorkflowDraftInput) {
  const [data, setData] = useState(() => structuredClone(props.data));
  const [eventIds, setEventIds] = useState(() => [...(data.snapshot.workflows.find((w) => w.id === props.workflowId)?.eventIds ?? [])]);
  const [cross, setCross] = useState(false);
  const [moves, setMoves] = useState(false);
  const [dissolveConfirmed, setDissolveConfirmed] = useState(false);
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
  const changeSelection = (next: string[]) => {
    if (locked || inFlight.current) return;
    setEventIds(next); setCross(false); setMoves(false); setDissolveConfirmed(false); setReviewed(false); setError(null);
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
    if (locked || impact.blockedReason || (props.workflowId !== null && eventIds.length === 0 && !dissolveConfirmed)) return;
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
      setCross(false); setMoves(false); setDissolveConfirmed(false); setReviewRequired(true); setReviewed(false);
    } catch (cause) { if (current(captured)) setError(safeMessage(cause)); }
    finally { if (current(captured)) { inFlight.current = false; setBusy(false); } }
  };
  const close = () => { if (!inFlight.current && current(activation.current)) props.onClose(); };
  return { data, eventIds, impact, busy, locked, error, conflict, pending, reviewRequired, reviewed,
    cross, moves, dissolveConfirmed, setCross, setMoves, setDissolveConfirmed, setReviewed,
    changeSelection, save, reload, send, close };
}

export type ShiftWorkflowDraft = ReturnType<typeof useShiftWorkflowDraft>;
