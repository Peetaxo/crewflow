import { useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Button } from '../../components/ui/button';
import EventListCard, { getListOccurrencesForEvent } from '../events/components/EventListCard';
import { getEventDetailData } from '../events/services/events.service';
import { canManageShiftWorkflows, type ShiftWorkflowScope } from './shift-workflows.contract';
import { getEventWorkflowCandidates, getWorkflowSelectionImpact, type ShiftWorkflowManagementData } from './shift-workflows.management';
import { cardTimelineOccurrences, createCardTimeline, expandCardTimelineHistory } from './shift-workflow-card-timeline';
import { useShiftWorkflowDraft, type ShiftWorkflowDraftInput, type ShiftWorkflowCrewDisplay } from './useShiftWorkflowDraft';
import { ShiftWorkflowConfirmation } from './ShiftWorkflowConfirmation';
import { useShiftWorkflowCardScroll, type CardScrollPosition } from './useShiftWorkflowCardScroll';
import { useShiftWorkflowVisualViewport } from './useShiftWorkflowVisualViewport';

export interface EventCardSelectionState {
  data: ShiftWorkflowManagementData;
  scope: ShiftWorkflowScope;
  eventIds: readonly string[];
  locked: boolean;
  busy: boolean;
  toggle: (id: string) => void;
  blockedReason: (id: string) => string | null;
  continueToSummary: () => void;
  cancel: () => void;
}

function captureCrewDisplay(data: ShiftWorkflowManagementData, scope: ShiftWorkflowScope): ShiftWorkflowCrewDisplay {
  return Object.fromEntries(getEventWorkflowCandidates(data, scope).map(({ id, event }) => {
    const matches = (assignment: ShiftWorkflowManagementData['eventCrewAssignments'][number]) => scope.source === 'supabase'
      ? assignment.eventSupabaseId === id : assignment.eventId === event.id;
    // The historic display projection preserves normal card names, but never
    // supplies authoritative assignments, times, approval state or eligibility.
    const projected = getEventDetailData(scope.source === 'supabase' ? id : event.id).crewAssignments.filter(matches);
    const names = new Map([...data.eventCrewAssignments.filter(matches), ...projected]
      .map(({ contractorProfileId, name }) => [contractorProfileId, { profileId: contractorProfileId, name }]));
    return [id, [...names.values()]];
  }));
}

function CardSelectionSession(props: ShiftWorkflowDraftInput) {
  const draft = useShiftWorkflowDraft({ ...props, captureCrewDisplay: (data) => captureCrewDisplay(data, props.scope) });
  const [summary, setSummary] = useState(false);
  const [timeline, setTimeline] = useState(() => createCardTimeline(format(new Date(), 'yyyy-MM-dd')));
  const container = useRef<HTMLDivElement>(null);
  useShiftWorkflowVisualViewport({ container, active: !summary });
  const summaryPosition = useRef<CardScrollPosition | null>(null);
  const candidates = useMemo(() => getEventWorkflowCandidates(draft.data, props.scope), [draft.data, props.scope]);
  const occurrences = useMemo(() => cardTimelineOccurrences(candidates, timeline), [candidates, timeline]);
  const allDates = useMemo(() => cardTimelineOccurrences(candidates, { anchorDate: '', startDate: '0001-01-01', query: '' })
    .map((occurrence) => occurrence.date), [candidates]);
  const presentation = useMemo(() => new Map(candidates.map(({ id, event }) => [id, new Map(getListOccurrencesForEvent(event, true)
    .map((occurrence) => [occurrence.date, occurrence]))])), [candidates]);
  const cardDetails = useMemo(() => new Map(candidates.map(({ id, event }) => [id, {
    timelogs: draft.data.timelogs.filter((timelog) => props.scope.source === 'supabase'
      ? timelog.eventSupabaseId === id : timelog.eid === event.id),
    crewAssignments: draft.data.eventCrewAssignments.filter((assignment) => props.scope.source === 'supabase'
      ? assignment.eventSupabaseId === id : assignment.eventId === event.id),
    applications: [], contractors: [],
  }])), [candidates, draft.data, props.scope.source]);
  const scroll = useShiftWorkflowCardScroll({ container, active: !summary, query: timeline.query,
    anchorDate: timeline.anchorDate, startDate: timeline.startDate, onExpand: () => {
      const expanded = expandCardTimelineHistory(timeline, allDates);
      if (expanded === timeline) return false;
      setTimeline(expanded); return true;
    } });
  const nextSelection = (id: string) => draft.eventIds.includes(id)
    ? draft.eventIds.filter((candidate) => candidate !== id) : [...draft.eventIds, id];
  const selection: EventCardSelectionState = {
    data: draft.data, scope: props.scope, eventIds: draft.eventIds, locked: draft.locked, busy: draft.busy,
    blockedReason: (id) => getWorkflowSelectionImpact(draft.data, props.scope, null, nextSelection(id)).blockedReason,
    toggle: (id) => {
      if (draft.locked) return;
      // Removing a creation draft choice does not mutate its stored source.
      // Additions and final submission still validate the whole affected group.
      if (draft.eventIds.includes(id) || !getWorkflowSelectionImpact(draft.data, props.scope, null, nextSelection(id)).blockedReason) draft.changeSelection(nextSelection(id));
    },
    continueToSummary: () => {
      if (draft.locked || draft.eventIds.length < 2 || draft.impact.blockedReason) return;
      summaryPosition.current = scroll.capture(); setSummary(true);
    },
    cancel: draft.close,
  };
  const searching = Boolean(timeline.query.trim());
  const grouped = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const group = grouped.get(occurrence.date) ?? [];
    group.push(occurrence); grouped.set(occurrence.date, group);
  }
  if (!searching && !grouped.has(timeline.anchorDate)) grouped.set(timeline.anchorDate, []);
  const dates = [...grouped.keys()].sort();
  const hasOlder = allDates.some((date) => date < timeline.startDate);
  const hasFollowingOccurrences = occurrences.some((occurrence) => occurrence.date >= timeline.anchorDate);
  const changeQuery = (query: string) => {
    if (!searching && query.trim()) scroll.rememberWindow();
    if (searching && !query.trim()) scroll.restoreWindow();
    setTimeline((current) => ({ ...current, query }));
  };
  return <div ref={container} className="nodu-workflow-selection" data-workflow-start-date={timeline.startDate}>
    <div className="nodu-workflow-selection__toolbar" data-workflow-toolbar>
      <div><h1 className="text-xl font-semibold">Propojit směny</h1><p className="text-sm text-[var(--nodu-text-soft)]">Vyberte alespoň dvě směny.</p></div>
      <label className="grid min-w-0 gap-1 text-sm">Hledat směnu nebo jobnumber
        <input type="search" value={timeline.query} disabled={selection.locked} onChange={(event) => changeQuery(event.target.value)} className="min-w-0 rounded-xl border border-[var(--nodu-border)] bg-transparent p-3" />
      </label>
      <label className="grid min-w-0 gap-1 text-sm">Přejít na datum
        <input type="date" value={timeline.anchorDate} disabled={selection.locked} onChange={(event) => {
          if (!event.target.value) return;
          scroll.jumpToAnchor(); setTimeline(createCardTimeline(event.target.value));
        }} className="min-w-0 rounded-xl border border-[var(--nodu-border)] bg-transparent p-3" />
      </label>
    </div>
    {!searching && <p className="py-3 text-xs text-[var(--nodu-text-soft)]">{hasOlder ? 'Starší směny zobrazíte posunutím nahoru.' : 'Zobrazeny všechny dostupné starší směny.'}</p>}
    <div className="space-y-6">
      {dates.map((date) => <section key={date} className="space-y-3">
        <div className="flex items-center gap-4 py-4" data-workflow-date={date}>
          <div className="h-px flex-1 bg-[color:rgb(var(--nodu-text-rgb)/0.1)]" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--nodu-text-soft)]">{format(parseISO(date), 'EEE d. MMMM yyyy', { locale: cs })}</h2>
          <div className="h-px flex-1 bg-[color:rgb(var(--nodu-text-rgb)/0.1)]" />
        </div>
        <div className="grid grid-cols-1 gap-3">
          {grouped.get(date)!.map(({ id }) => {
            const occurrence = presentation.get(id)!.get(date)!;
            const reason = selection.blockedReason(id);
            const checked = selection.eventIds.includes(id);
            return <EventListCard key={`${id}|${date}`} occurrenceKey={`${id}|${date}`} occurrence={occurrence}
              canManageEvents role={props.scope.role} detail={cardDetails.get(id)} crewDisplay={draft.crewDisplay?.[id]} selection={{ checked, disabled: selection.locked || (!checked && Boolean(reason)), reason, onToggle: () => selection.toggle(id) }} />;
          })}
          {!grouped.get(date)!.length && !hasFollowingOccurrences && <p className="nodu-workflow-selection__empty text-sm text-[var(--nodu-text-soft)]">Od zvoleného data tu zatím nejsou žádné směny.</p>}
        </div>
      </section>)}
      {searching && !occurrences.length && <p className="py-8 text-sm">Žádná směna neodpovídá hledání.</p>}
    </div>
    <div className="nodu-workflow-selection__bar" aria-label="Výběr směn">
      <p className="font-semibold" aria-live="polite">Vybráno: {selection.eventIds.length}</p>
      <Button type="button" variant="outline" disabled={selection.busy} onClick={selection.cancel}>Zrušit</Button>
      <Button type="button" disabled={selection.locked || selection.eventIds.length < 2 || Boolean(draft.impact.blockedReason)} onClick={selection.continueToSummary}>Pokračovat</Button>
    </div>
    {summary && <ShiftWorkflowConfirmation draft={draft} scope={props.scope} workflowId={null} onBack={() => {
      if (draft.locked) return;
      scroll.restore(summaryPosition.current); setSummary(false);
    }} />}
  </div>;
}

export default function EventShiftWorkflowCardSelection(props: ShiftWorkflowDraftInput) {
  if (!canManageShiftWorkflows(props.scope.role)) return null;
  return <CardSelectionSession {...props} />;
}
