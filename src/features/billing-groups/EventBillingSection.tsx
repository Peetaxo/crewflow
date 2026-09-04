import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Event, Timelog } from '../../types';
import { calculateTotalHours } from '../../utils';
import { Button } from '../../components/ui/button';
import BillingGroupEditor from './BillingGroupEditor';
import { billingEventKey, canManageBillingGroups, type BillingGroup, type BillingScope } from './billing-groups.model';
import { useBillingGroups } from './useBillingGroups';

type BillingGroupSummaryProps = {
  scope: BillingScope;
  group: BillingGroup;
  events: readonly Event[];
  timelogs: readonly Timelog[];
};

function eventKey(event: Event, scope: BillingScope): string | null {
  if (scope.source === 'supabase' && !event.supabaseId) return null;
  return billingEventKey(event, scope.source);
}

function eventDateRange(event: Event): string {
  return event.startDate === event.endDate
    ? event.startDate
    : `${event.startDate} – ${event.endDate}`;
}

function matchesEvent(timelog: Timelog, event: Event, scope: BillingScope): boolean {
  return scope.source === 'supabase'
    ? timelog.eventSupabaseId === event.supabaseId
    : timelog.eid === event.id;
}

export function BillingGroupSummary({ scope, group, events, timelogs }: BillingGroupSummaryProps) {
  const eventIds = useMemo(() => new Set(group.eventIds), [group.eventIds]);
  const members = events.flatMap((event) => {
    const id = eventKey(event, scope);
    return id && eventIds.has(id) ? [event] : [];
  });
  const ownTimelogs = scope.role === 'crew' && scope.profileId
    ? timelogs.filter((timelog) => timelog.contractorProfileId === scope.profileId)
    : [];

  return (
    <div className="min-w-0 space-y-2">
      <h3 className="break-words text-base font-semibold">{group.name}</h3>
      {members.map((event) => {
        const visibleTimelogs = scope.role === 'crew'
          ? ownTimelogs.filter((timelog) => matchesEvent(timelog, event, scope))
          : [];
        return (
          <div key={eventKey(event, scope)!} className="min-w-0 break-words text-sm">
            <p>{event.name} · {eventDateRange(event)} · {event.job || 'Bez Job Number'}</p>
            {visibleTimelogs.map((timelog) => (
              <p key={timelog.supabaseId ?? timelog.id} className="text-[color:var(--nodu-text-soft)]">
                Výkaz #{timelog.id} · {calculateTotalHours(timelog.days)} h
              </p>
            ))}
          </div>
        );
      })}
      {scope.role === 'crew' && (
        <p className="break-words text-sm text-[color:var(--nodu-text-soft)]">
          Zobrazují se pouze vaše dostupné výkazy. Propojení samo nevytváří fakturu.
        </p>
      )}
    </div>
  );
}

type BillingSectionBodyProps = {
  billing: ReturnType<typeof useBillingGroups>;
  event: Event;
  anchorId: string;
};

type BillingData = NonNullable<ReturnType<typeof useBillingGroups>['query']['data']>;

type EditorSession = {
  scope: BillingScope;
  snapshot: BillingData['snapshot'];
  events: BillingData['events'];
  projects: BillingData['projects'];
  anchor: Event;
};

function createEditorSession(
  data: BillingData,
  scope: BillingScope,
  event: Event,
  anchorId: string,
): EditorSession {
  return {
    scope: { ...scope },
    snapshot: data.snapshot,
    events: data.events,
    projects: data.projects,
    anchor: data.events.find((candidate) => eventKey(candidate, scope) === anchorId) ?? event,
  };
}

function BillingSectionBody({ billing, event, anchorId }: BillingSectionBodyProps) {
  const [open, setOpen] = useState(false);
  const [editorSession, setEditorSession] = useState<EditorSession | null>(null);
  const [reloading, setReloading] = useState(false);
  const activeRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  const data = billing.query.data;
  // A refetch error must not tear down an editor that deliberately froze its review inputs.
  // Once it closes, the same error becomes retry-only until fresh data arrives.
  const queryUnavailable = !data || (billing.query.isError && !open);
  const currentGroup = data?.snapshot.groups.find((group) => group.eventIds.includes(anchorId));
  const manageable = canManageBillingGroups(billing.scope.role);

  const reload = useCallback(async (reopen: boolean) => {
    setReloading(true);
    try {
      const result = await billing.reload();
      if (activeRef.current && reopen && result.isSuccess && result.data) {
        setEditorSession(createEditorSession(result.data, billing.scope, event, anchorId));
        setOpen(true);
      }
    } catch {
      // The query state exposes the retryable error; an interaction must not leak a rejected promise.
    } finally {
      if (activeRef.current) setReloading(false);
    }
  }, [anchorId, billing, event]);

  const openEditor = useCallback(() => {
    if (!data) return;
    setEditorSession(createEditorSession(data, billing.scope, event, anchorId));
    setOpen(true);
  }, [anchorId, billing.scope, data, event]);

  const closeEditor = useCallback(() => {
    setOpen(false);
    setEditorSession(null);
    void reload(false);
  }, [reload]);

  const reloadAfterConflict = useCallback(() => {
    setOpen(false);
    setEditorSession(null);
    void reload(true);
  }, [reload]);

  if (!billing.ready) return null;
  if (billing.query.isPending) {
    return (
      <section aria-label="Společná fakturace" className="min-w-0 space-y-3 rounded-2xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
        <p role="status" className="break-words text-sm text-[color:var(--nodu-text-soft)]">Načítání společné fakturace…</p>
      </section>
    );
  }
  if (queryUnavailable) {
    return (
      <section aria-label="Společná fakturace" className="min-w-0 space-y-3 rounded-2xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
        <h2 className="text-base font-semibold">Společná fakturace</h2>
        <p role="alert" className="break-words text-sm text-[color:var(--nodu-text-soft)]">Společnou fakturaci nelze načíst. Akce zůstává dostupná.</p>
        <Button type="button" variant="outline" disabled={reloading} onClick={() => { void reload(false); }}>Zkusit načíst znovu</Button>
      </section>
    );
  }
  if (!currentGroup && !manageable) return null;

  return (
    <section aria-label="Společná fakturace" className="min-w-0 space-y-3 rounded-2xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-4">
      <h2 className="text-base font-semibold">Společná fakturace</h2>
      {billing.query.isError && (
        <div className="min-w-0 space-y-2">
          <p role="alert" className="break-words text-sm text-[color:var(--nodu-text-soft)]">Společnou fakturaci nelze načíst. Akce zůstává dostupná.</p>
          <Button type="button" variant="outline" disabled={reloading} onClick={() => { void reload(false); }}>Zkusit načíst znovu</Button>
        </div>
      )}
      {currentGroup ? (
        <BillingGroupSummary scope={billing.scope} group={currentGroup} events={data.events} timelogs={data.timelogs} />
      ) : (
        <p className="break-words text-sm text-[color:var(--nodu-text-soft)]">Tato akce se fakturuje samostatně.</p>
      )}
      {manageable && (
        <Button type="button" disabled={reloading} onClick={openEditor}>
          {currentGroup ? 'Upravit propojení' : 'Nastavit společnou fakturaci'}
        </Button>
      )}
      {manageable && open && editorSession && (
        <BillingGroupEditor
          scope={editorSession.scope}
          snapshot={editorSession.snapshot}
          events={editorSession.events}
          projects={editorSession.projects}
          anchor={editorSession.anchor}
          onSave={billing.save}
          onClose={closeEditor}
          onReload={reloadAfterConflict}
        />
      )}
    </section>
  );
}

export default function EventBillingSection({ event }: { event: Event }) {
  const billing = useBillingGroups();
  const anchorId = eventKey(event, billing.scope);
  const stableIdentity = anchorId ?? `unidentified:${event.id}`;

  if (!anchorId) return null;

  return (
    <BillingSectionBody
      key={`${billing.scopeKey}:${stableIdentity}:${billing.ready ? 'ready' : 'not-ready'}`}
      billing={billing}
      event={event}
      anchorId={anchorId}
    />
  );
}
