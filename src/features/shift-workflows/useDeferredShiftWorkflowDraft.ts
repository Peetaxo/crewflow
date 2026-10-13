import { useLayoutEffect, useRef, useState } from 'react';
import { buildShiftWorkflowCommand } from './shift-workflows.selection';
import { createStableDraftUuid } from '../stable-draft-identity';
import { ShiftWorkflowError, type SaveShiftWorkflow, type ShiftWorkflowScope } from './shift-workflows.contract';
import { getWorkflowSelectionImpact, type ShiftWorkflowManagementData } from './shift-workflows.management';

/** Display-only names, never authoritative assignments or workflow evidence. */
export type ShiftWorkflowCrewDisplay = Record<string, { profileId: string; name: string }[]>;

export interface ShiftWorkflowDraftInput {
  scope: ShiftWorkflowScope;
  workflowId: string | null;
  data: ShiftWorkflowManagementData;
  onSave: (command: SaveShiftWorkflow) => Promise<unknown>;
  onReload: () => Promise<ShiftWorkflowManagementData>;
  onClose: () => void;
  captureCrewDisplay?: (data: ShiftWorkflowManagementData) => ShiftWorkflowCrewDisplay;
}

export type DeferredShiftWorkflowDraftInput = Omit<ShiftWorkflowDraftInput, 'data'> & {
  data: ShiftWorkflowManagementData | null;
};

const safeMessage = (error: unknown) => error instanceof ShiftWorkflowError
  ? error.message : 'Propojení se nepodařilo bezpečně ověřit. Zkuste to znovu.';

const captureData = (input: ShiftWorkflowManagementData, captureCrewDisplay: ShiftWorkflowDraftInput['captureCrewDisplay']) => {
  const data = structuredClone(input);
  const crewDisplay = captureCrewDisplay ? structuredClone(captureCrewDisplay(data)) : null;
  return { data, crewDisplay };
};

/** One immutable capture per opening. Selection may precede its complete evidence. */
export function useDeferredShiftWorkflowDraft(props: DeferredShiftWorkflowDraftInput) {
  const [capturedData, setCapturedData] = useState<ReturnType<typeof captureData> | null>(() => props.data
    ? captureData(props.data, props.captureCrewDisplay) : null);
  const data = capturedData?.data ?? null;
  const crewDisplay = capturedData?.crewDisplay ?? null;
  const [eventIds, setEventIds] = useState(() => [...(data?.snapshot.workflows.find((w) => w.id === props.workflowId)?.eventIds ?? [])]);
  const [cross, setCross] = useState(false);
  const [moves, setMoves] = useState(false);
  const [dissolveConfirmed, setDissolveConfirmed] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [commandError, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const error = readError ?? commandError;
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<SaveShiftWorkflow | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const activation = useRef({ active: true });
  const opening = activation.current;
  const currentEvidence = useRef(capturedData);
  const publishedData = useRef(props.data);
  const currentLocked = useRef(false);
  const openingEvidenceAllowed = useRef(true);
  const attemptedOpeningData = useRef(props.data);
  useLayoutEffect(() => {
    // StrictMode replays setup/cleanup for the same opening token.
    activation.current.active = true;
    return () => { activation.current.active = false; };
  }, []);
  useLayoutEffect(() => {
    publishedData.current = props.data;
    if (!props.data) {
      openingEvidenceAllowed.current = true;
      attemptedOpeningData.current = null;
      return;
    }
    if (!capturedData && openingEvidenceAllowed.current && attemptedOpeningData.current !== props.data) {
      attemptedOpeningData.current = props.data;
      try {
        const captured = captureData(props.data, props.captureCrewDisplay);
        currentEvidence.current = captured; setCapturedData(captured);
        setReadError(null); setError(null);
      } catch (cause) { setReadError(safeMessage(cause)); }
    }
  }, [props.data, props.captureCrewDisplay, capturedData]);
  const current = (captured: typeof activation.current) => captured?.active && activation.current === captured;
  const hasCurrentEvidence = () => current(opening) && capturedData !== null && currentEvidence.current === capturedData;
  const locked = busy || Boolean(pending) || conflict;
  useLayoutEffect(() => { currentLocked.current = locked; }, [locked]);
  const impact = data ? getWorkflowSelectionImpact(data, props.scope, props.workflowId, eventIds) : null;
  const ready = Boolean(data && impact);
  const changeSelection = (next: string[]) => {
    if (!current(opening) || currentLocked.current || inFlight.current) return;
    setEventIds(next); setCross(false); setMoves(false); setDissolveConfirmed(false); setReviewed(false); setError(null);
  };
  const send = async (command: SaveShiftWorkflow) => {
    const captured = opening;
    if (!ready || !hasCurrentEvidence() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      await props.onSave(command);
      if (current(captured)) props.onClose();
    } catch (cause) {
      if (!current(captured)) return;
      setError(safeMessage(cause));
      if (!(cause instanceof ShiftWorkflowError) || cause.kind === 'ambiguous') { currentLocked.current = true; setPending(command); }
      else if (cause.kind === 'conflict' || cause.kind === 'blocked') { currentLocked.current = true; setConflict(true); }
    } finally {
      if (current(captured)) { inFlight.current = false; setBusy(false); }
    }
  };
  const save = () => {
    if (!hasCurrentEvidence() || !data || !impact || currentLocked.current || impact.blockedReason || (props.workflowId !== null && eventIds.length === 0 && !dissolveConfirmed)) return;
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
    const captured = opening;
    if (inFlight.current || !current(captured)) return;
    inFlight.current = true; setBusy(true);
    try {
      const fresh = await props.onReload();
      if (!current(captured)) return;
      const next = captureData(fresh, props.captureCrewDisplay);
      currentEvidence.current = next; setCapturedData(next); setConflict(false); setReadError(null); setError(null); setPending(null);
      setCross(false); setMoves(false); setDissolveConfirmed(false); setReviewRequired(true); setReviewed(false);
    } catch (cause) { if (current(captured)) setReadError(safeMessage(cause)); }
    finally { if (current(captured)) { inFlight.current = false; setBusy(false); } }
  };
  const close = () => { if (!inFlight.current && current(opening)) props.onClose(); };
  const guardConfirmation = (setter: typeof setCross) => (value: Parameters<typeof setCross>[0]) => {
    if (current(opening) && currentEvidence.current === capturedData) setter(value);
  };
  /** Owner-only lifecycle reset after protected close or acknowledged success.
   * A still-published non-null prop is ignored until a null opening boundary is observed.
   * Explicit reload() can supply its own fresh evidence without that props boundary.
   */
  const reset = () => {
    if (!current(opening)) return;
    opening.active = false;
    activation.current = { active: true };
    openingEvidenceAllowed.current = publishedData.current === null;
    attemptedOpeningData.current = null;
    inFlight.current = false; currentEvidence.current = null; currentLocked.current = false;
    setCapturedData(null); setEventIds([]); setCross(false); setMoves(false); setDissolveConfirmed(false);
    setReviewRequired(false); setReviewed(false); setReadError(null); setError(null); setConflict(false); setPending(null); setBusy(false);
  };
  return { data, crewDisplay, eventIds, impact, ready, busy, locked, error, conflict, pending, reviewRequired, reviewed,
    cross, moves, dissolveConfirmed, setCross: guardConfirmation(setCross), setMoves: guardConfirmation(setMoves),
    setDissolveConfirmed: guardConfirmation(setDissolveConfirmed), setReviewed: guardConfirmation(setReviewed),
    changeSelection, save, reload, send, close, reset };
}

export type DeferredShiftWorkflowDraft = ReturnType<typeof useDeferredShiftWorkflowDraft>;
