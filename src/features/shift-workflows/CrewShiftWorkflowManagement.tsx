import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { canManageShiftWorkflows, ShiftWorkflowError } from './shift-workflows.contract';
import { useShiftWorkflows } from './useShiftWorkflows';
import { ShiftWorkflowManagementContext } from './ShiftWorkflowManagementContext';
import { loadShiftWorkflowManagementData } from './shift-workflows.management-loader';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import ShiftWorkflowEditor from './ShiftWorkflowEditor';

function ManagementSession({ workflows, profileId, children }: {
  workflows: ReturnType<typeof useShiftWorkflows>; profileId: string; children: ReactNode;
}) {
  const [data, setData] = useState<ShiftWorkflowManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editor, setEditor] = useState<{ workflowId: string | null; data: ShiftWorkflowManagementData } | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => { controller.abort(); };
  }, []);

  const load = async () => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) throw new ShiftWorkflowError('denied', 'Přístup se změnil.');
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const fresh = await loadShiftWorkflowManagementData(workflows.scope, workflows.reload, controller.signal, profileId);
      if (controller.signal.aborted || version !== requestVersion.current) throw new ShiftWorkflowError('denied', 'Přístup se změnil.');
      setData(fresh); setError(false);
      return fresh;
    } catch (cause) {
      if (!controller.signal.aborted && version === requestVersion.current) setError(true);
      throw cause;
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) setLoading(false);
    }
  };
  // The keyed session captures one identity and one person. A reload is explicit,
  // not triggered by a new object returned from the underlying query observer.
  const initialLoad = useRef(load);
  useEffect(() => { void initialLoad.current().catch(() => undefined); }, []);
  const reloadQuietly = () => { void load().catch(() => undefined); };
  const open = (workflowId: string | null) => {
    if (data && !loading && !error && !lifetime.current?.signal.aborted) setEditor({ workflowId, data });
  };
  const close = () => { setEditor(null); reloadQuietly(); };

  return (
    <ShiftWorkflowManagementContext.Provider value={{ scope: workflows.scope, data: error ? null : data, loading, error, open, reload: reloadQuietly }}>
      {children}
      {editor && <ShiftWorkflowEditor scope={workflows.scope} profileId={profileId} workflowId={editor.workflowId}
        data={editor.data} onSave={workflows.save} onReload={load} onClose={close} />}
    </ShiftWorkflowManagementContext.Provider>
  );
}

export default function CrewShiftWorkflowManagement({ profileId, children }: { profileId: string | null; children: ReactNode }) {
  const workflows = useShiftWorkflows(Boolean(profileId));
  if (!profileId || !workflows.ready || !canManageShiftWorkflows(workflows.scope.role)) {
    return <ShiftWorkflowManagementContext.Provider value={null}>{children}</ShiftWorkflowManagementContext.Provider>;
  }
  return <ManagementSession key={`${workflows.scopeKey}:${profileId}`} workflows={workflows} profileId={profileId}>{children}</ManagementSession>;
}

export function CrewShiftWorkflowActions() {
  const context = useContext(ShiftWorkflowManagementContext);
  if (!context) return null;
  if (context.loading) return <span role="status" className="text-xs text-[var(--nodu-text-soft)]">Načítání propojení…</span>;
  if (context.error) return <div className="text-xs text-[var(--nodu-text-soft)]">
    <p role="alert">Propojené směny se nepodařilo načíst. Ostatní údaje zůstávají dostupné.</p>
    <Button type="button" variant="outline" size="sm" onClick={context.reload}>Zkusit načíst znovu</Button>
  </div>;
  return <Button type="button" variant="outline" size="sm" onClick={() => context.open(null)}><Link2 size={14} />Propojit směny</Button>;
}
