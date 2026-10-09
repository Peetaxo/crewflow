import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { appDataSource } from '../../lib/app-config';
import type { Event } from '../../types';
import { canManageShiftWorkflows, canonicalUuid, ShiftWorkflowError } from './shift-workflows.contract';
import { useShiftWorkflows } from './useShiftWorkflows';
import { loadEventShiftWorkflowManagementData } from './shift-workflows.management-loader';
import { getEventWorkflowCandidates, workflowEventDates, workflowEventTitle, type ShiftWorkflowManagementData } from './shift-workflows.management';
import { shiftWorkflowEventId } from './shift-workflows.selection';
import ShiftWorkflowEditor from './ShiftWorkflowEditor';

const retired = () => new ShiftWorkflowError('denied', 'Přístup k propojeným směnám se změnil.');
function ReadError({ retry, loading }: { retry: () => void; loading: boolean }) {
  return <div className="text-xs text-[var(--nodu-text-soft)]">
    <p role="alert">Propojené směny se nepodařilo načíst. Ostatní údaje zůstávají dostupné.</p>
    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={retry}>Zkusit načíst znovu</Button>
  </div>;
}

function EventManagementSession({ workflows, context, eventId, workflowId }: {
  workflows: ReturnType<typeof useShiftWorkflows>; context: string; eventId: string | null; workflowId: string | null;
}) {
  const [data, setData] = useState<ShiftWorkflowManagementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [editor, setEditor] = useState<{ workflowId: string | null; data: ShiftWorkflowManagementData } | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const openAfterRetry = useRef(false);
  const initialReadStarted = useRef(false);
  useLayoutEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    initialReadStarted.current = false;
    return () => { controller.abort(); };
  }, []);
  const load = async () => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) throw retired();
    const version = ++requestVersion.current; setLoading(true);
    try {
      const fresh = await loadEventShiftWorkflowManagementData(workflows.scope, workflows.reload, controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) throw retired();
      setData(fresh); setError(false); return fresh;
    } catch (cause) {
      if (!controller.signal.aborted && version === requestVersion.current) setError(true);
      throw cause;
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) setLoading(false);
    }
  };
  const open = async () => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || loading) return;
    openAfterRetry.current = true;
    try {
      // Every open gets fresh membership and evidence. The editor freezes this
      // opening snapshot until its own explicit conflict refresh.
      const fresh = await load();
      if (controller.signal.aborted || lifetime.current !== controller) return;
      const target = eventId ? fresh.snapshot.workflows.find((w) => w.eventIds.includes(eventId)) : null;
      if (eventId && !target) { openAfterRetry.current = false; return; }
      setEditor({ workflowId: target?.id ?? null, data: fresh }); openAfterRetry.current = false;
    } catch { /* ReadError provides the same read retry without opening stale data. */ }
  };
  const reloadQuietly = () => { void load().catch(() => undefined); };
  const initialRead = useRef(reloadQuietly);
  const queryError = Boolean(eventId && workflows.query.isError);
  useEffect(() => {
    if (eventId && workflowId && !queryError && !initialReadStarted.current) {
      initialReadStarted.current = true;
      initialRead.current();
    }
  }, [eventId, workflowId, queryError]);
  const retry = () => {
    if (openAfterRetry.current) void open();
    else if (error) reloadQuietly();
    else void workflows.reload().catch(() => undefined);
  };
  const close = () => {
    if (lifetime.current?.signal.aborted) return;
    setEditor(null); if (eventId) reloadQuietly();
  };
  const target = data?.snapshot.workflows.find((w) => w.id === workflowId);
  const members = data && target ? getEventWorkflowCandidates(data, workflows.scope).filter(({ id }) => target.eventIds.includes(id)) : [];
  const missingMembers = target ? target.eventIds.length - members.length : 0;
  return <>
    {eventId ? (data && target && !error && !queryError ? <section aria-label="Propojené směny" className="my-4 rounded-xl border border-[var(--nodu-border)] p-3 text-sm" data-mobile-event-swipe-ignore="true">
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><Link2 size={14} />Propojené směny</h2>
      <ul className="space-y-1">{members.map(({ id, event }) => <li key={id}><span className="font-medium">{workflowEventTitle(event)}</span><span className="ml-2 text-xs text-[var(--nodu-text-soft)]">{workflowEventDates(event)}</span></li>)}</ul>
      {missingMembers > 0 && <p>Některá propojená směna není dostupná. Obnovte data a zkontrolujte výběr.</p>}
      <Button type="button" variant="outline" size="sm" className="mt-3" disabled={loading} onClick={() => { void open(); }}>Upravit propojení</Button>
    </section> : null) : <Button type="button" variant="outline" size="sm" disabled={loading || error} onClick={() => { void open(); }}><Link2 size={14} />Propojit směny</Button>}
    {loading && !editor && <span role="status" className="text-xs text-[var(--nodu-text-soft)]">Načítání propojení…</span>}
    {(error || queryError) && !editor && <ReadError retry={retry} loading={loading || workflows.query.isFetching} />}
    {editor && <ShiftWorkflowEditor scope={workflows.scope} ownerContext={context} workflowId={editor.workflowId} data={editor.data} onSave={workflows.save} onReload={load} onClose={close} />}
  </>;
}

function EventOwner({ event }: { event?: Event }) {
  const workflows = useShiftWorkflows();
  if (!workflows.ready || !canManageShiftWorkflows(workflows.scope.role)) return null;
  const eventId = event ? shiftWorkflowEventId(event, workflows.scope.source) : null;
  const workflowId = eventId ? workflows.query.data?.workflows.find((w) => w.eventIds.includes(eventId))?.id ?? null : null;
  // Query publication changes the overview, not this owner's lifetime. An open
  // editor keeps its captured workflow and selection through deletion/error;
  // only a scope/context change or explicit close retires that editor.
  const context = eventId ? `event:${eventId}` : 'events-list';
  return <EventManagementSession key={JSON.stringify([workflows.scopeKey, context])} workflows={workflows} context={context} eventId={eventId} workflowId={workflowId} />;
}

export function EventShiftWorkflowCreateAction() { return <EventOwner />; }
export function EventShiftWorkflowDetails({ event }: { event: Event }) {
  if (appDataSource === 'supabase' && !canonicalUuid.safeParse(event.supabaseId).success) return null;
  return <EventOwner event={event} />;
}
