import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { appDataSource } from '../../lib/app-config';
import type { Event } from '../../types';
import { canManageShiftWorkflows, canonicalUuid, ShiftWorkflowError, type ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { useShiftWorkflows } from './useShiftWorkflows';
import { loadEventShiftWorkflowManagementData } from './shift-workflows.management-loader';
import { getEventWorkflowCandidates, workflowEventDates, workflowEventTitle, type ShiftWorkflowManagementData } from './shift-workflows.management';
import { shiftWorkflowEventId } from './shift-workflows.selection';
import ShiftWorkflowEditor from './ShiftWorkflowEditor';

const retired = () => new ShiftWorkflowError('denied', 'Přístup k propojeným směnám se změnil.');
const overviewKey = (workflow: ShiftWorkflowSnapshot['workflows'][number] | undefined) => workflow
  ? JSON.stringify([workflow.id, workflow.updatedAt, [...workflow.eventIds].sort()]) : null;
function ReadError({ retry, loading }: { retry: () => void; loading: boolean }) {
  return <div className="text-xs text-[var(--nodu-text-soft)]">
    <p role="alert">Propojené směny se nepodařilo načíst. Ostatní údaje zůstávají dostupné.</p>
    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={retry}>Zkusit načíst znovu</Button>
  </div>;
}

function EventManagementSession({ workflows, context, eventId, workflowId, workflowKey }: {
  workflows: ReturnType<typeof useShiftWorkflows>; context: string; eventId: string | null; workflowId: string | null; workflowKey: string | null;
}) {
  const [data, setData] = useState<ShiftWorkflowManagementData | null>(null);
  const [dataOverviewKey, setDataOverviewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [manualReading, setManualReading] = useState(false);
  const [error, setError] = useState(false);
  const [editor, setEditor] = useState<{ workflowId: string | null; data: ShiftWorkflowManagementData } | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const openAfterRetry = useRef(false);
  const lastOverviewRead = useRef<string | null>(null);
  useLayoutEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    lastOverviewRead.current = null;
    return () => { controller.abort(); };
  }, []);
  const load = async (isOverviewRead = false) => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) throw retired();
    const version = ++requestVersion.current; setLoading(true);
    if (!isOverviewRead) setManualReading(true);
    try {
      const fresh = await loadEventShiftWorkflowManagementData(workflows.scope, workflows.reload, controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) throw retired();
      const freshOverviewKey = overviewKey(eventId ? fresh.snapshot.workflows.find((w) => w.eventIds.includes(eventId)) : undefined);
      lastOverviewRead.current = freshOverviewKey;
      setData(fresh); setDataOverviewKey(freshOverviewKey);
      setError(false); return fresh;
    } catch (cause) {
      if (!controller.signal.aborted && version === requestVersion.current) setError(true);
      throw cause;
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) { setLoading(false); setManualReading(false); }
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
  const readOverview = useRef(() => { void load(true).catch(() => undefined); });
  const queryError = Boolean(eventId && workflows.query.isError);
  useEffect(() => {
    // Manual open/refresh owns its full read even if reload publishes a new
    // membership before the other reads finish. Active editors stay frozen.
    if (!eventId || editor || manualReading || openAfterRetry.current || queryError) return;
    if (!workflowKey) {
      lastOverviewRead.current = null;
      ++requestVersion.current;
      setData(null); setDataOverviewKey(null); setLoading(false); setError(false);
      return;
    }
    if (lastOverviewRead.current !== workflowKey) {
      lastOverviewRead.current = workflowKey;
      readOverview.current();
    }
  }, [eventId, workflowKey, queryError, editor, manualReading]);
  const retry = () => {
    if (openAfterRetry.current) void open();
    else if (error) reloadQuietly();
    else void workflows.reload().catch(() => undefined);
  };
  const close = () => {
    if (lifetime.current?.signal.aborted) return;
    lastOverviewRead.current = null;
    setEditor(null);
  };
  const target = data?.snapshot.workflows.find((w) => w.id === workflowId);
  const members = data && target ? getEventWorkflowCandidates(data, workflows.scope).filter(({ id }) => target.eventIds.includes(id)) : [];
  const missingMembers = target ? target.eventIds.length - members.length : 0;
  return <>
    {eventId ? (data && target && dataOverviewKey === workflowKey && !error && !queryError ? <section aria-label="Propojené směny" className="my-4 rounded-xl border border-[var(--nodu-border)] p-3 text-sm" data-mobile-event-swipe-ignore="true">
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
  const workflow = eventId ? workflows.query.data?.workflows.find((w) => w.eventIds.includes(eventId)) : undefined;
  // Query publication changes the overview, not this owner's lifetime. An open
  // editor keeps its captured workflow and selection through deletion/error;
  // only a scope/context change or explicit close retires that editor.
  const context = eventId ? `event:${eventId}` : 'events-list';
  return <EventManagementSession key={JSON.stringify([workflows.scopeKey, context])} workflows={workflows} context={context} eventId={eventId} workflowId={workflow?.id ?? null} workflowKey={overviewKey(workflow)} />;
}

export function EventShiftWorkflowCreateAction() { return <EventOwner />; }
export function EventShiftWorkflowDetails({ event }: { event: Event }) {
  if (appDataSource === 'supabase' && !canonicalUuid.safeParse(event.supabaseId).success) return null;
  return <EventOwner event={event} />;
}
