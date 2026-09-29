import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAppContext } from '../../context/useAppContext';
import { Button } from '../../components/ui/button';
import type { Timelog } from '../../types';
import { useShiftWorkflows } from './useShiftWorkflows';
import { ShiftWorkflowError } from './shift-workflows.contract';
import { loadShiftEvidenceData, type ShiftEvidenceData } from './shift-evidence-loader';
import { createShiftEvidenceSession, type ShiftEvidenceSession } from './shift-evidence-session';
import { refreshShiftEvidence, writeShiftEvidenceBatch } from './shift-evidence-write';
import SharedTimelogEditor from './SharedTimelogEditor';

function EvidenceSessionHost(props: { data: ShiftEvidenceData; workflows: ReturnType<typeof useShiftWorkflows>;
  signal: AbortSignal; onClose: () => void; onReload: () => void; sessionKey: string }) {
  const [session, setSession] = useState<ShiftEvidenceSession | null>(null);
  const initial = useRef(props);
  // StrictMode's cleanup retires the probe session. Each setup creates a fresh
  // activation rather than reviving callbacks belonging to the disposed one.
  useLayoutEffect(() => {
    const { data, workflows, signal } = initial.current;
    const assertCurrent = () => { if (signal.aborted) throw new ShiftWorkflowError('denied', 'Přístup k evidenci se změnil.'); };
    const next = createShiftEvidenceSession({ context: data.context, role: workflows.scope.role, assertCurrent,
      write: (command, current) => writeShiftEvidenceBatch(workflows.scope, command, current),
      onSaved: () => refreshShiftEvidence(assertCurrent, workflows.reload),
    });
    setSession(next);
    return () => next.dispose();
  }, []);
  if (!session) return null;
  return <SharedTimelogEditor data={props.data} role={props.workflows.scope.role} session={session} editorSessionKey={props.sessionKey}
    actorProfileId={props.workflows.scope.profileId} actorUserId={props.workflows.scope.userId} onClose={props.onClose} onReload={props.onReload} />;
}

function EvidenceLoadSession({ workflows, opened, onClose, legacy }: {
  workflows: ReturnType<typeof useShiftWorkflows>; opened: Timelog; onClose: () => void; legacy: ReactNode;
}) {
  const initial = useRef({ workflows, opened });
  const [state, setState] = useState<{ data: ShiftEvidenceData; signal: AbortSignal; key: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const request = useRef<AbortController | null>(null);
  const version = useRef(0);
  useLayoutEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => { controller.abort(); request.current?.abort(); };
  }, []);
  const load = useCallback(async () => {
    if (!lifetime.current || lifetime.current.signal.aborted) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const key = ++version.current;
    setState(null); setError(null);
    try {
      const captured = initial.current;
      const data = await loadShiftEvidenceData(captured.workflows.scope, captured.opened, captured.workflows.reload, controller.signal);
      if (controller.signal.aborted || lifetime.current.signal.aborted || version.current !== key) return;
      setState({ data, signal: controller.signal, key });
    } catch (cause) {
      if (!controller.signal.aborted && !lifetime.current.signal.aborted && version.current === key) {
        setError(cause instanceof ShiftWorkflowError ? cause.message : 'Evidenci se nepodařilo načíst. Zkuste to znovu.');
      }
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (state?.data.legacy) return legacy;
  if (state) return <EvidenceSessionHost key={state.key} data={state.data} signal={state.signal} workflows={workflows}
    onClose={onClose} onReload={() => { void load(); }} sessionKey={`${workflows.scopeKey}:${state.key}`} />;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Načítání evidence">
    <div className="w-full max-w-md space-y-4 rounded-2xl bg-[rgb(var(--nodu-paper-rgb))] p-6 text-[var(--nodu-text)]">
      {error ? <><p role="alert">{error}</p><Button onClick={() => { void load(); }}>Zkusit načíst znovu</Button></> : <p role="status">Načítání společné evidence…</p>}
      <Button variant="outline" onClick={onClose}>Zavřít</Button>
    </div>
  </div>;
}

export default function SharedTimelogEntry({ legacy }: { legacy: ReactNode }) {
  const { editingTimelog, setEditingTimelog } = useAppContext();
  const workflows = useShiftWorkflows(Boolean(editingTimelog));
  if (!editingTimelog || !workflows.ready) return null;
  const identity = editingTimelog.supabaseId ?? `local:${editingTimelog.id}`;
  return <EvidenceLoadSession key={`${workflows.scopeKey}:${identity}:${editingTimelog.contractorProfileId}`} workflows={workflows}
    opened={editingTimelog} onClose={() => setEditingTimelog(null)} legacy={legacy} />;
}
