import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAppContext } from '../../context/useAppContext';
import { canManageShiftWorkflows, ShiftWorkflowError, type ShiftWorkflowScope } from './shift-workflows.contract';
import { loadEventShiftWorkflowManagementData } from './shift-workflows.management-loader';
import { getWorkflowSelectionImpact, type ShiftWorkflowManagementData } from './shift-workflows.management';
import { ShiftWorkflowConfirmation } from './ShiftWorkflowConfirmation';
import { useDeferredShiftWorkflowDraft, type DeferredShiftWorkflowDraft } from './useDeferredShiftWorkflowDraft';
import { useShiftWorkflows } from './useShiftWorkflows';

export interface MobileWorkflowSelectionState {
  active: boolean;
  opening: boolean;
  readError: boolean;
  summary: boolean;
  scope: ShiftWorkflowScope;
  draft: DeferredShiftWorkflowDraft;
  open: () => void;
  retry: () => void;
  toggle: (id: string) => void;
  blockedReason: (id: string) => string | null;
  continueToSummary: () => void;
  close: () => void;
  confirmation: ReactNode;
}

type Props = { children: (selection: MobileWorkflowSelectionState | null) => ReactNode };
const retired = () => new ShiftWorkflowError('denied', 'Přístup k propojeným směnám se změnil.');

function MobileSelectionSession({ workflows, available, children }: Props & { workflows: ReturnType<typeof useShiftWorkflows>; available: boolean }) {
  const [active, setActive] = useState(false);
  const [opening, setOpening] = useState(false);
  const [readFailure, setReadFailure] = useState(false);
  const [data, setData] = useState<ShiftWorkflowManagementData | null>(null);
  const [summary, setSummary] = useState(false);
  const activeRef = useRef(false);
  const readingRef = useRef(false);
  const closedBoundary = useRef(true);
  const lifetime = useRef({ active: true });
  const generation = useRef({ active: true });
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const draftRef = useRef<DeferredShiftWorkflowDraft | null>(null);
  const openingToken = generation.current;
  const availableRef = useRef(available);
  const current = () => lifetime.current.active && openingToken.active && generation.current === openingToken;
  useLayoutEffect(() => {
    const ownerLifetime = lifetime.current;
    ownerLifetime.active = true;
    generation.current.active = true;
    return () => {
      ownerLifetime.active = false; generation.current.active = false;
      request.current?.abort();
    };
  }, []);
  const closeOpening = () => {
    if (!current()) return;
    activeRef.current = false; readingRef.current = false; closedBoundary.current = false;
    openingToken.active = false; generation.current = { active: true };
    ++requestVersion.current; request.current?.abort(); request.current = null;
    // reset retires retained draft callbacks; the following committed null prop
    // boundary is required before a different opening may capture evidence.
    draftRef.current?.reset();
    setData(null); setActive(false); setOpening(false); setReadFailure(false); setSummary(false);
  };
  const load = async () => {
    if (!current() || !activeRef.current || readingRef.current) throw retired();
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    const version = ++requestVersion.current; readingRef.current = true; setOpening(true);
    try {
      const fresh = await loadEventShiftWorkflowManagementData(workflows.scope, workflows.reload, controller.signal);
      if (!current() || !activeRef.current || controller.signal.aborted || version !== requestVersion.current) throw retired();
      setData(fresh); setReadFailure(false); return fresh;
    } catch (cause) {
      if (current() && activeRef.current && !controller.signal.aborted && version === requestVersion.current) setReadFailure(true);
      throw cause;
    } finally {
      if (current() && !controller.signal.aborted && version === requestVersion.current) { readingRef.current = false; setOpening(false); }
    }
  };
  const draft = useDeferredShiftWorkflowDraft({ scope: workflows.scope, workflowId: null, data,
    onSave: workflows.save, onReload: load, onClose: closeOpening });
  useLayoutEffect(() => {
    draftRef.current = draft;
    if (!active && data === null && draft.data === null) closedBoundary.current = true;
  });
  useLayoutEffect(() => {
    const wasAvailable = availableRef.current;
    availableRef.current = available;
    if (wasAvailable && !available) closeOpening();
  });
  const open = () => {
    if (!current() || !availableRef.current || activeRef.current || readingRef.current || !closedBoundary.current) return;
    activeRef.current = true; closedBoundary.current = false;
    setData(null); setActive(true); setSummary(false); setReadFailure(false);
    void load().catch(() => undefined);
  };
  const retry = () => {
    if (!current() || !activeRef.current || readingRef.current || draft.locked) return;
    void load().catch(() => undefined);
  };
  const nextSelection = (id: string) => draft.eventIds.includes(id)
    ? draft.eventIds.filter((candidate) => candidate !== id) : [...draft.eventIds, id];
  const blockedReason = (id: string) => draft.data
    ? getWorkflowSelectionImpact(draft.data, workflows.scope, null, draft.eventIds.includes(id) ? [id] : nextSelection(id)).blockedReason : null;
  const toggle = (id: string) => {
    if (!current() || !activeRef.current || draft.locked) return;
    if (draft.eventIds.includes(id) || !draft.ready || !blockedReason(id)) draft.changeSelection(nextSelection(id));
  };
  const continueToSummary = () => {
    if (current() && activeRef.current && draft.ready && !draft.locked && new Set(draft.eventIds).size >= 2 && !draft.impact?.blockedReason) setSummary(true);
  };
  // The original confirmation receives non-null real evidence only after the
  // shared draft has captured it; presentation projections never enter here.
  const confirmation = summary && draft.data && draft.impact
    ? <ShiftWorkflowConfirmation draft={{ ...draft, data: draft.data, impact: draft.impact }} scope={workflows.scope} workflowId={null}
      onBack={() => { if (current() && !draft.locked) setSummary(false); }} /> : null;
  return children({ active, opening, readError: readFailure || (!draft.ready && Boolean(draft.error)), summary, scope: workflows.scope, draft,
    open, retry, toggle, blockedReason, continueToSummary, close: draft.close, confirmation });
}

export function MobileEventShiftWorkflowSelection({ children }: Props) {
  const workflows = useShiftWorkflows();
  const { selectedEventId } = useAppContext();
  if (!workflows.ready || !canManageShiftWorkflows(workflows.scope.role)) return children(null);
  return <MobileSelectionSession key={workflows.scopeKey} workflows={workflows} available={selectedEventId == null}>{children}</MobileSelectionSession>;
}
