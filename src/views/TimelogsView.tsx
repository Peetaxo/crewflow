import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addMonths, endOfMonth, format, isValid, parseISO, startOfMonth, subMonths } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { useAuth } from '../app/providers/useAuth';
import { useAppContext } from '../context/useAppContext';
import { KM_RATE } from '../data';
import { MEAL_CONFIG } from '../constants';
import { Contractor, Event, EventId, Timelog, TimelogDay } from '../types';
import { calculateDayHours, calculateMealAllowance, calculateTotalHours, formatCurrency, formatShortDate, normalizeMealSelection } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import { TimelogSummaryCard } from '../features/timelogs/components/TimelogSummaryCard';
import { displayTimelogHours, timelogPeriod } from '../features/timelogs/components/timelog-summary-format';
import { getContractors, subscribeToCrewChanges } from '../features/crew/services/crew.service';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import { useEventListDetails } from '../features/events/queries/useEventListDetails';
import { EventHoursExportButton } from '../features/events/components/EventHoursExportButton';
import { PersonReviewTrigger, TimelogReviewDetails } from '../features/timelogs/components/TimelogReviewDialog';
import { EventApprovalPanel } from '../features/timelogs/components/EventApprovalPanel';
import { getActiveTimelogApproval } from '../features/timelogs/services/timelog-approval-state';
import {
  getTimelogDependencies,
  type TimelogAction,
} from '../features/timelogs/services/timelogs.service';
import { useTimelogApprovalActions } from '../features/timelogs/hooks/useTimelogApprovalActions';
import { EventRoundBatchAction } from '../features/shift-workflows/EventRoundBatchAction';
import { splitEventRounds } from '../features/shift-workflows/approval-inbox';
import { useSharedApprovals } from '../features/shift-workflows/useSharedApprovals';
import {
  getTimelogApprovalAssigneeName,
  isTimelogApprovalActionable,
} from '../features/timelogs/services/timelog-approval-presentation';
import { buildTimelogChangeSummary } from '../features/timelogs/services/timelog-change-summary';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import { canEditTimelog, canSeeTimelogNote, canSubmitTimelog } from '../features/timelogs/services/timelog-permissions';
import { useIsMobile } from '../hooks/use-mobile';

interface TimelogsViewProps {
  scope?: 'all' | 'mine';
}

type ViewMode = 'event' | 'people';

const getLatestTimelogDayDate = (timelogs: Array<{ days: Array<{ d: string }> }>) => {
  const latestDate = timelogs
    .flatMap((timelog) => timelog.days.map((day) => day.d))
    .filter(Boolean)
    .sort()
    .at(-1);
  const parsedDate = latestDate ? parseISO(latestDate) : new Date();

  return isValid(parsedDate) ? parsedDate : new Date();
};

const hasTimelogDayInRange = (timelog: { days: Array<{ d: string }> }, startDate: string, endDate: string) => (
  timelog.days.some((day) => day.d >= startDate && day.d <= endDate)
);

const formatTimelogCount = (count: number) => {
  if (count === 1) return '1 výkaz';
  if (count >= 2 && count <= 4) return `${count} výkazy`;
  return `${count} výkazů`;
};

const getTimelogStatusLabel = (status: Timelog['status'], isCrewMineScope: boolean) => {
  if (status === 'pending_crew_confirmation') {
    return isCrewMineScope ? 'Čeká na tvoje potvrzení' : 'Čeká na souhlas Crew';
  }

  if (status === 'rejected') return 'Vráceno k opravě';

  return undefined;
};

const TimelogsView = ({ scope = 'all' }: TimelogsViewProps) => {
  const {
    setEditingTimelog,
    role,
    searchQuery,
    timelogFilter,
    setTimelogFilter,
  } = useAppContext();
  const { currentProfileId } = useAuth();
  const isMobile = useIsMobile();
  const timelogsQuery = useTimelogsQuery();
  const eventsQuery = useEventsQuery();
  const getEventDetail = useEventListDetails();

  const [viewMode, setViewMode] = useState<ViewMode>(scope === 'mine' ? 'people' : 'event');
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [timelogPeriodMode, setTimelogPeriodMode] = useState<'all' | 'month'>('all');
  const [selectedTimelogMonth, setSelectedTimelogMonth] = useState('');

  const loadDependencies = useCallback(() => {
    const dependencies = getTimelogDependencies();
    setContractors(getContractors());
    setEvents(eventsQuery.data ?? dependencies.events);
  }, [eventsQuery.data]);

  useEffect(() => {
    loadDependencies();
  }, [eventsQuery.data, loadDependencies, timelogsQuery.data]);

  useEffect(() => (
    subscribeToCrewChanges(loadDependencies)
  ), [loadDependencies]);

  const findContractor = useCallback((contractorProfileId?: string) => (
    contractorProfileId
      ? contractors.find((contractor) => contractor.profileId === contractorProfileId) ?? null
      : null
  ), [contractors]);

  const eventsById = useMemo(() => {
    const index = new Map<EventId, Event>();
    for (const event of events) {
      index.set(event.id, event);
      if (event.supabaseId) index.set(event.supabaseId, event);
    }
    return index;
  }, [events]);
  const findEvent = useCallback((report: Timelog) => eventsById.get(report.eventSupabaseId ?? report.eid) ?? null, [eventsById]);

  const timelogs = useMemo(() => {
    const safeTimelogs = timelogsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeTimelogs;

    return safeTimelogs.filter((timelog) => {
      const event = findEvent(timelog);
      const contractor = findContractor(timelog.contractorProfileId);
      if (!event || !contractor) return false;

      return (
        event.name.toLowerCase().includes(query)
        || event.job.toLowerCase().includes(query)
        || contractor.name.toLowerCase().includes(query)
      );
    });
  }, [findContractor, findEvent, searchQuery, timelogsQuery.data]);

  const isCrew = role === 'crew';
  const isCrewMineScope = scope === 'mine' && isCrew;
  const baseTimelogs = useMemo(() => (
    scope === 'mine'
      ? timelogs.filter((timelog) => timelog.contractorProfileId === currentProfileId)
      : timelogs
  ), [currentProfileId, scope, timelogs]);
  const timelogMonthReferenceDate = useMemo(() => getLatestTimelogDayDate(baseTimelogs), [baseTimelogs]);
  const selectedTimelogMonthDate = useMemo(() => {
    const parsedDate = selectedTimelogMonth ? parseISO(selectedTimelogMonth) : timelogMonthReferenceDate;
    return isValid(parsedDate) ? parsedDate : timelogMonthReferenceDate;
  }, [selectedTimelogMonth, timelogMonthReferenceDate]);
  const selectedTimelogMonthStart = format(startOfMonth(selectedTimelogMonthDate), 'yyyy-MM-dd');
  const selectedTimelogMonthEnd = format(endOfMonth(selectedTimelogMonthDate), 'yyyy-MM-dd');
  const periodTimelogs = useMemo(() => (
    isCrewMineScope && timelogPeriodMode === 'month'
      ? baseTimelogs.filter((timelog) => hasTimelogDayInRange(timelog, selectedTimelogMonthStart, selectedTimelogMonthEnd))
      : baseTimelogs
  ), [baseTimelogs, isCrewMineScope, selectedTimelogMonthEnd, selectedTimelogMonthStart, timelogPeriodMode]);
  const sharedApprovals = useSharedApprovals(timelogsQuery.data ?? [], events, contractors);
  const showingInbox = timelogFilter === 'inbox';
  const inbox = sharedApprovals.inboxFor(baseTimelogs);
  const waitingCount = searchQuery.trim() ? sharedApprovals.inboxFor(timelogsQuery.data ?? []).count : inbox.count;
  const visibleTimelogs = showingInbox ? baseTimelogs : timelogFilter === 'all'
    ? periodTimelogs
    : periodTimelogs.filter((timelog) => timelog.status === timelogFilter);
  const filtered = showingInbox ? inbox.legacy : sharedApprovals.legacyOnly(visibleTimelogs);
  const managerEventView = scope === 'all' && viewMode === 'event' && !isCrew;
  const rounds = showingInbox ? inbox.rounds : managerEventView ? sharedApprovals.groupsFor(visibleTimelogs).rounds : undefined;
  const eventRounds = splitEventRounds(visibleTimelogs, managerEventView ? rounds ?? [] : [], sharedApprovals.scope?.source === 'local');
  const scopeKey = JSON.stringify([sharedApprovals.identityKey, currentProfileId, role, searchQuery, timelogFilter, viewMode, scope]);
  const [expandedEvents, setExpandedEvents] = useState<{ key: string; ids: EventId[] }>({ key: '', ids: [] });
  const allByEvent = useMemo(() => {
    const byEvent = new Map<EventId, Timelog[]>();
    for (const report of timelogsQuery.data ?? []) {
      const key = report.eventSupabaseId ?? findEvent(report)?.supabaseId ?? report.eid;
      const list = byEvent.get(key);
      if (list) list.push(report);
      else byEvent.set(key, [report]);
    }
    return byEvent;
  }, [findEvent, timelogsQuery.data]);
  const reportsLoaded = Boolean(timelogsQuery.data) && sharedApprovals.ready !== false;
  const empty = reportsLoaded && (showingInbox ? inbox.count === 0 : visibleTimelogs.length === 0);
  const emptyMessage = showingInbox && !searchQuery.trim()
    ? 'Žádné výkazy teď nečekají na tebe.'
    : 'Žádné záznamy pro tento filtr';
  const title = scope === 'mine' ? 'Moje výkazy' : 'Schvalování';
  const showTimelogNotes = canSeeTimelogNote(role);
  const getSubmitActionLabel = (timelog: typeof baseTimelogs[number]) => {
    if (timelog.status === 'pending_crew_confirmation') return 'Potvrdit a odeslat';
    if (timelog.status === 'rejected') return 'Odeslat znovu';
    return 'Odeslat ke kontrole CH';
  };

  const filterOptions = useMemo(() => {
    const counts = {
      all: periodTimelogs.length,
      draft: periodTimelogs.filter((timelog) => timelog.status === 'draft').length,
      pending_crew_confirmation: periodTimelogs.filter((timelog) => timelog.status === 'pending_crew_confirmation').length,
      pending_ch: periodTimelogs.filter((timelog) => timelog.status === 'pending_ch').length,
      pending_coo: periodTimelogs.filter((timelog) => timelog.status === 'pending_coo').length,
      approved: periodTimelogs.filter((timelog) => timelog.status === 'approved').length,
      invoiced: periodTimelogs.filter((timelog) => timelog.status === 'invoiced').length,
      paid: periodTimelogs.filter((timelog) => timelog.status === 'paid').length,
      rejected: periodTimelogs.filter((timelog) => timelog.status === 'rejected').length,
    };

    return [
      { id: 'all', label: 'Vše', count: counts.all },
      { id: 'draft', label: 'Koncepty', count: counts.draft },
      { id: 'pending_crew_confirmation', label: isCrewMineScope ? 'K potvrzení' : 'Čeká Crew', count: counts.pending_crew_confirmation },
      { id: 'pending_ch', label: 'Čeká na kontrolu', count: counts.pending_ch },
      { id: 'pending_coo', label: 'Čeká COO', count: counts.pending_coo },
      { id: 'approved', label: 'Schváleno', count: counts.approved },
      { id: 'invoiced', label: 'Fakturováno', count: counts.invoiced },
      { id: 'paid', label: 'Zaplaceno', count: counts.paid },
      { id: 'rejected', label: 'Vráceno', count: counts.rejected },
    ];
  }, [isCrewMineScope, periodTimelogs]);
  const activeFilter = filterOptions.find((filter) => filter.id === timelogFilter) ?? filterOptions[0];

  const selectTimelogFilter = (filterId: string) => {
    setTimelogFilter(filterId);
    setMobileFilterOpen(false);
  };

  const moveTimelogMonth = (direction: 'prev' | 'next') => {
    const nextDate = direction === 'next'
      ? addMonths(selectedTimelogMonthDate, 1)
      : subMonths(selectedTimelogMonthDate, 1);

    setSelectedTimelogMonth(format(startOfMonth(nextDate), 'yyyy-MM-dd'));
  };

  const groups = new Map<EventId, { event: Event; eventId: EventId; timelogs: Timelog[] }>();
  function groupFor(event: Event) {
    const id = event.supabaseId ?? event.id;
    let group = groups.get(id);
    if (!group) {
      group = { event, eventId: id, timelogs: [] };
      groups.set(id, group);
    }
    return group;
  }
  for (const report of [...filtered, ...eventRounds.byReport.keys()]) {
    const event = findEvent(report);
    if (event) groupFor(event).timelogs.push(report);
  }
  if (showingInbox && expandedEvents.key === scopeKey) {
    for (const event of events) {
      const key = event.supabaseId ?? event.id;
      if (expandedEvents.ids.includes(key) && allByEvent.has(key)) groupFor(event);
    }
  }
  const queueTime = (reports: Timelog[]) => reports.reduce((latest, report) => {
    const round = eventRounds.byReport.get(report);
    if (!(round?.canAct ?? isTimelogApprovalActionable(report, role, currentProfileId))) return latest;
    const queuedAt = report.status === 'pending_coo' ? getActiveTimelogApproval(report)?.requestedAt : report.submittedAt;
    return Math.max(latest, Date.parse(queuedAt ?? round?.round.updatedAt ?? '') || 1);
  }, 0);
  const groupedByEvent = [...groups.values()].sort((a, b) =>
    (showingInbox ? queueTime(b.timelogs) - queueTime(a.timelogs) : 0)
    || a.event.startDate.localeCompare(b.event.startDate) || a.event.name.localeCompare(b.event.name, 'cs'));

  const timelogActions = useTimelogApprovalActions({
    currentProfileId,
    timelogs: baseTimelogs,
    reviewSelection: sharedApprovals.reviewSelection,
    identityKey: sharedApprovals.identityKey,
  });
  const { dialog: timelogActionDialog, execute: executeTimelogAction, isPending: isTimelogActionPending } = timelogActions;

  const handleTimelogAction = useCallback((id: Timelog['id'], action: TimelogAction) => {
    executeTimelogAction([id], action);
  }, [executeTimelogAction]);

  const renderExport = (event: Event) => {
    const id = event.supabaseId ?? event.id;
    const detail = getEventDetail(id);
    return <EventHoursExportButton availabilityFromDetail detail={{ ...detail, event, timelogs: allByEvent.get(id) ?? [] }} />;
  };

  const renderApprovalAssignee = (timelog: Timelog, event: Event) => {
    if (timelog.status !== 'pending_ch' && timelog.status !== 'pending_coo') return null;
    const approverName = getTimelogApprovalAssigneeName(timelog, event, contractors);
    if (!approverName) return null;

    return (
      <div className="mt-0.5 text-[11px] font-medium text-[color:var(--nodu-text-soft)]">
        Schvaluje: {approverName}
      </div>
    );
  };

  const renderReturnedReview = (timelog: Timelog) => {
    const returnedReason = timelog.reviewNote?.trim();
    if (timelog.status !== 'rejected' || !returnedReason) return null;

    return (
      <div className="mb-3 rounded-[18px] border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] p-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-error-text)]">
          Důvod vrácení
        </div>
        <div className="mt-2 rounded-[14px] bg-[color:rgb(var(--nodu-surface-rgb)/0.76)] px-3 py-2 text-xs font-medium text-[color:var(--nodu-text)]">
          {returnedReason}
        </div>
      </div>
    );
  };

  const renderTimelogDayRow = (timelogId: EventId, day: TimelogDay, index: number, mealAllowanceEnabled: boolean) => {
    const mealLabels = mealAllowanceEnabled
      ? normalizeMealSelection(day).map((meal) => MEAL_CONFIG.find((item) => item.type === meal)?.label ?? meal)
      : [];
    const dayHours = calculateDayHours(day.f, day.t);

    return (
      <div
        key={`${timelogId}-${index}-${day.d}-${day.f}-${day.t}-${day.type}-${mealLabels.join(',')}`}
        className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:grid-cols-[3rem_minmax(0,1fr)_auto] rounded-[16px] bg-[color:rgb(var(--nodu-text-rgb)/0.035)] px-3 py-2 text-xs"
      >
        <span className="text-[color:var(--nodu-text-soft)]">{formatShortDate(day.d)}</span>
        <div className="min-w-0">
          <div className="font-mono font-semibold text-[color:var(--nodu-text)]">{day.f} - {day.t}</div>
          {mealLabels.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {mealLabels.map((mealLabel) => (
                <span key={`${timelogId}-${index}-${mealLabel}`} className="rounded-full bg-[rgba(34,139,112,0.1)] px-2 py-0.5 text-[11px] font-semibold text-[rgb(31,112,92)]">
                  {mealLabel}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
          <StatusBadge status={day.type} />
          <span className="min-w-[2.4rem] text-right font-semibold text-[color:var(--nodu-text-soft)]">{displayTimelogHours(dayHours)}</span>
        </div>
      </div>
    );
  };

  const shouldShowCrewConfirmedCorrection = (timelog: typeof filtered[number], changeSummary: string[]) => (
    role === 'crewhead'
    && timelog.status === 'pending_ch'
    && changeSummary.length > 0
  );

  const renderCrewConfirmedCorrectionNotice = (changeSummary: string[]) => (
    <div className="mb-3 rounded-[18px] border border-[color:rgb(var(--nodu-accent-rgb)/0.22)] bg-[color:rgb(var(--nodu-accent-rgb)/0.06)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-accent)]">
          Historie úpravy
        </div>
        <div className="rounded-full bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--nodu-accent)]">
          Potvrzeno Crew po úpravě
        </div>
      </div>
      <div className="mt-2 space-y-1 text-xs font-medium text-[color:var(--nodu-text)]">
        {changeSummary.slice(0, 2).map((change) => (
          <div key={change}>{change}</div>
        ))}
        {changeSummary.length > 2 && (
          <div className="text-[color:var(--nodu-text-soft)]">
            + {changeSummary.length - 2} další změny v detailu
          </div>
        )}
      </div>
    </div>
  );

  const renderRowActions = (timelog: typeof filtered[number]) => (
    <div className="flex flex-wrap items-center gap-2 [&:empty]:hidden [&_button]:min-h-11">
      {canSubmitTimelog(timelog, role) && (
        <Button
          onClick={() => handleTimelogAction(timelog.id, 'sub')}
          disabled={isTimelogActionPending}
          size="sm"
          className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
        >
          {getSubmitActionLabel(timelog)}
        </Button>
      )}
      {timelog.status === 'pending_ch' && role === 'crewhead' && (
        <>
          <Button
            onClick={() => handleTimelogAction(timelog.id, 'ch')}
            disabled={isTimelogActionPending}
            size="sm"
            className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
          >
            Schválit a poslat COO
          </Button>
          <Button
            onClick={() => handleTimelogAction(timelog.id, 'rej')}
            disabled={isTimelogActionPending}
            variant="outline"
            size="sm"
            className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]"
          >
            Vrátit k opravě
          </Button>
        </>
      )}
      {timelog.status === 'pending_coo' && isTimelogApprovalActionable(timelog, role, currentProfileId) && (
        <>
          <Button
            onClick={() => handleTimelogAction(timelog.id, 'coo')}
            disabled={isTimelogActionPending}
            size="sm"
            className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
          >
            Schválit
          </Button>
          <Button
            onClick={() => handleTimelogAction(timelog.id, 'rej')}
            disabled={isTimelogActionPending}
            variant="outline"
            size="sm"
            className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]"
          >
            Vrátit k opravě
          </Button>
        </>
      )}
      {(scope === 'mine' || !isCrew) && canEditTimelog(timelog, role) && (
        <Button
          onClick={() => setEditingTimelog(timelog)}
          variant="outline"
          size="sm"
          className="ml-auto text-[11px]"
        >
          Upravit
        </Button>
      )}
    </div>
  );

  const openRound = (report: Timelog) => {
    const rounds = sharedApprovals.groupsFor([report]).rounds;
    if (!rounds.length || !rounds.every(round => round.complete) || !sharedApprovals.ready) return false;
    try {
      return sharedApprovals.reviewSelection([report.id]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Výkaz se mezitím změnil. Obnovte data.');
      return true;
    }
  };

  const renderReview = (report: Timelog, event: Event, close: () => void) => {
    const rounds = sharedApprovals.groupsFor([report]).rounds;
    if (rounds.length) return sharedApprovals.cards([report], rounds);
    const person = findContractor(report.contractorProfileId);
    const actionable = isTimelogApprovalActionable(report, role, currentProfileId);
    const changes = buildTimelogChangeSummary(report);
    return <TimelogReviewDetails report={report} event={event} role={role} busy={isTimelogActionPending}
      rate={person?.hasKnownRate === false ? undefined : person?.rate}
      onEdit={canEditTimelog(report, role) ? () => { close(); setEditingTimelog(report); } : undefined}
      onReturn={actionable ? () => handleTimelogAction(report.id, 'rej') : undefined}
      onApprove={actionable ? () => handleTimelogAction(report.id, role === 'crewhead' ? 'ch' : 'coo') : undefined}>
      {renderApprovalAssignee(report, event)}
      {shouldShowCrewConfirmedCorrection(report, changes) && renderCrewConfirmedCorrectionNotice(changes)}
      {renderReturnedReview(report)}
    </TimelogReviewDetails>;
  };

  const renderOriginalTimelog = (timelog: Timelog, withinEvent = false) => {
    const contractor = findContractor(timelog.contractorProfileId);
    const event = findEvent(timelog);
    if (!event || !contractor) return null;
    const name = contractor.name;
    const hours = calculateTotalHours(timelog.days);
    const meals = calculateMealAllowance(timelog.days, { enabled: Boolean(event.mealAllowanceEnabled) });
    const changes = buildTimelogChangeSummary(timelog);
    const showConfirmation = isCrewMineScope && timelog.status === 'pending_crew_confirmation' && changes.length > 0;
    return <TimelogSummaryCard key={timelog.supabaseId ?? timelog.id}
      label={`Výkaz ${event.name} – ${name}`}
      person={isCrewMineScope ? undefined : { name, initials: contractor?.ii,
        nameControl: scope === 'all' && !isCrew && !withinEvent ? <PersonReviewTrigger
          key={JSON.stringify([scopeKey, timelog.supabaseId ?? timelog.id, event.supabaseId ?? event.id, timelog.contractorProfileId, timelog.status])}
          person={name} event={event} busy={isTimelogActionPending} openRound={() => openRound(timelog)}
          renderReview={close => renderReview(timelog, event, close)} /> : undefined }}
      status={<StatusBadge status={timelog.status} label={getTimelogStatusLabel(timelog.status, isCrewMineScope)} />}
      hours={hours} amount={contractor && contractor.hasKnownRate !== false ? hours * contractor.rate + timelog.km * KM_RATE + meals : null}
      entries={[{ id: String(timelog.id), name: withinEvent ? undefined : event.name,
        job: withinEvent ? undefined : event.job, period: timelogPeriod(timelog), client: withinEvent ? undefined : event.client,
        supplement: <>{renderApprovalAssignee(timelog, event)}
          {(timelog.km > 0 || meals > 0) && <p className="mt-1 text-[11px] text-[color:var(--nodu-text-soft)]">
            {timelog.km > 0 && `Cestovné ${timelog.km.toLocaleString('cs-CZ')} km`}
            {timelog.km > 0 && meals > 0 && ' · '}
            {meals > 0 && `Stravné ${formatCurrency(meals)}`}
          </p>}
        </> }]}
    >
      {showConfirmation && <div className="mt-2 rounded-xl border border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-accent-rgb)/0.07)] p-2 text-xs">
        <div className="flex flex-wrap justify-between gap-1 font-semibold text-[color:var(--nodu-accent)]"><span>Upraveno CH</span><span>Čeká na tvoje potvrzení</span></div>
        <div className="mt-1 space-y-1">{changes.slice(0, 2).map((change) => <div key={change}>{change}</div>)}
          {changes.length > 2 && <div>+ {changes.length - 2} další změny v detailu</div>}
        </div>
      </div>}
      {shouldShowCrewConfirmedCorrection(timelog, changes) && renderCrewConfirmedCorrectionNotice(changes)}
      {timelog.status === 'rejected' && !timelog.reviewNote?.trim() && isCrewMineScope && <div className="mt-2 rounded-xl bg-[color:var(--nodu-error-bg)] p-2 text-xs text-[color:var(--nodu-error-text)]"><div className="space-y-1"><div className="font-semibold">Důvod vrácení</div><p>Uprav výkaz a odešli ho znovu ke kontrole.</p></div></div>}
      {renderReturnedReview(timelog)}
      <details className="group/days mt-2 border-t border-[color:var(--nodu-border)]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-[color:var(--nodu-text-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--nodu-accent)] [&::-webkit-details-marker]:hidden">
          Dny výkazu ({timelog.days.length})<ChevronDown size={14} aria-hidden="true" className="transition-transform group-open/days:rotate-180" />
        </summary>
        <div className="space-y-2 pb-2">{timelog.days.map((day, index) => renderTimelogDayRow(timelog.id, day, index, Boolean(event.mealAllowanceEnabled)))}</div>
        {showTimelogNotes && timelog.note && <p className="pb-2 text-xs italic text-[color:var(--nodu-text-soft)]">"{timelog.note}"</p>}
      </details>
      {renderRowActions(timelog)}
    </TimelogSummaryCard>;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-6 space-y-4">
        <h1 className="pr-12 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">{title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Zobrazení výkazů" className="inline-flex max-w-full rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-1">
            {(['inbox', 'all'] as const).map(mode => {
              const active = mode === 'inbox' ? showingInbox : !showingInbox;
              return <button key={mode} type="button" aria-pressed={active} onClick={() => selectTimelogFilter(mode)}
                className={`min-h-11 rounded-[14px] px-3 text-sm font-semibold transition-colors sm:px-4 ${active
                  ? 'bg-[color:var(--nodu-accent-soft)] text-[color:var(--nodu-accent)]'
                  : 'text-[color:var(--nodu-text-soft)]'}`}>
                {mode === 'inbox' ? <>Čeká na mě <span className="ml-1 tabular-nums">{reportsLoaded ? `(${waitingCount})` : ''}</span></> : 'Všechny výkazy'}
              </button>;
            })}
          </div>

          {scope === 'all' && (
            <div className="inline-flex rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
              <button
                aria-pressed={viewMode === 'event'}
                onClick={() => setViewMode('event')}
                className={`min-h-11 rounded-[14px] px-3.5 py-2 text-[11px] font-medium transition-all ${viewMode === 'event' ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
              >
                Po akci
              </button>
              <button
                aria-pressed={viewMode === 'people'}
                onClick={() => setViewMode('people')}
                className={`min-h-11 rounded-[14px] px-3.5 py-2 text-[11px] font-medium transition-all ${viewMode === 'people' ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
              >
                Po lidech
              </button>
            </div>
          )}
        </div>

        {!showingInbox && <section aria-label="Období a stav výkazů" className="space-y-3">
          {isCrewMineScope && (
            <div className="inline-flex rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.94)] p-1">
              {(['all', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={timelogPeriodMode === mode}
                  onClick={() => setTimelogPeriodMode(mode)}
                  className={`min-h-11 rounded-[14px] px-4 py-2 text-sm font-semibold ${timelogPeriodMode === mode ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]' : 'text-[color:var(--nodu-text-soft)]'}`}
                >
                  {mode === 'all' ? 'Všechna období' : 'Po měsících'}
                </button>
              ))}
            </div>
          )}
          {isCrewMineScope && timelogPeriodMode === 'month' && (
            <div className="flex items-center justify-between rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.94)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)] sm:w-80">
              <button
                type="button"
                onClick={() => moveTimelogMonth('prev')}
                aria-label="Předchozí měsíc výkazů"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-[color:var(--nodu-text-soft)] transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.06)] hover:text-[color:var(--nodu-text)]"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <div className="text-sm font-semibold text-[color:var(--nodu-text)]">
                {format(selectedTimelogMonthDate, 'LLLL yyyy', { locale: cs })}
              </div>
              <button
                type="button"
                onClick={() => moveTimelogMonth('next')}
                aria-label="Další měsíc výkazů"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-[color:var(--nodu-text-soft)] transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.06)] hover:text-[color:var(--nodu-text)]"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}
          {isMobile ? (
            <div className="space-y-3">
              <div className="rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.94)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen((open) => !open)}
                  aria-expanded={mobileFilterOpen}
                  aria-label={`Filtr výkazů: ${activeFilter.label}, ${activeFilter.count} záznamy`}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-left transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.04)]"
                >
                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-text-soft)]">
                    <SlidersHorizontal size={15} aria-hidden="true" />
                    Filtr
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--nodu-text)]">
                    {activeFilter.label}
                    <span className="rounded-full bg-[color:rgb(var(--nodu-accent-rgb)/0.14)] px-2 py-0.5 text-xs text-[color:var(--nodu-accent)]">
                      {activeFilter.count}
                    </span>
                  </span>
                </button>

                {mobileFilterOpen && (
                  <div className="grid grid-cols-2 gap-2 px-2 pb-2 pt-1">
                    {filterOptions.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => selectTimelogFilter(filter.id)}
                        aria-label={`${filter.label} ${filter.count}`}
                        aria-pressed={timelogFilter === filter.id}
                        className={`inline-flex min-h-11 items-center justify-between rounded-[14px] px-3 py-2 text-sm font-semibold transition-all ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'bg-[color:rgb(var(--nodu-text-rgb)/0.04)] text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
                      >
                        <span>{filter.label}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-xs ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.16)]' : 'bg-[color:rgb(var(--nodu-text-rgb)/0.08)]'}`}>
                          {filter.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex w-fit flex-wrap gap-1 rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
              {filterOptions.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setTimelogFilter(filter.id)}
                  aria-label={`${filter.label} ${filter.count}`}
                  aria-pressed={timelogFilter === filter.id}
                  className={`inline-flex items-center gap-2 rounded-[14px] px-2 py-2 text-[11px] font-medium transition-all ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
                >
                  <span>{filter.label}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.16)]' : 'bg-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[color:var(--nodu-text-soft)]'}`}>
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>}
      </div>

      {!timelogsQuery.data && sharedApprovals.ready && <p role="status" className="mb-3 text-sm text-[color:var(--nodu-text-soft)]">
        {timelogsQuery.isError ? 'Výkazy se nepodařilo načíst.' : 'Načítám výkazy…'}
      </p>}
      {sharedApprovals.cards(visibleTimelogs, managerEventView ? eventRounds.separate : rounds,
        scope === 'all' && !isCrew ? renderExport : undefined)}

      {scope === 'all' && viewMode === 'event' ? (
        <div className="space-y-4">
          {groupedByEvent.map((group) => {
            if (role === 'coo' || role === 'crewhead') {
              const reports = allByEvent.get(group.eventId) ?? group.timelogs;
              const detail = getEventDetail(group.eventId);
              const roster = detail.hasExplicitRoster ? detail.crewAssignments : null;
              const ready = reportsLoaded && Boolean(eventsQuery.data) && !timelogsQuery.isError && !eventsQuery.isError;
              const personName = (report: Timelog) => findContractor(report.contractorProfileId)?.name
                ?? detail.crewAssignments.find(person => person.contractorProfileId === report.contractorProfileId)?.name ?? 'Člen crew';
              const legacyEntries = group.timelogs.filter(report => !eventRounds.byReport.has(report)
                && isTimelogApprovalActionable(report, role, currentProfileId)).map(report => ({ report, name: personName(report) }));
              const legacyIds = legacyEntries.map(entry => entry.report.id);
              const eligibleRounds = group.timelogs.flatMap(report => {
                const round = eventRounds.byReport.get(report);
                return round?.canAct ? [{ group: round, report, name: personName(report) }] : [];
              });
              const actionableIds = new Set([...legacyIds, ...eligibleRounds.map(entry => entry.report.id)]);
              const submittedPeople = new Set(reports.filter(report => report.status !== 'draft').map(report => report.contractorProfileId));
              const wholeEvent = ready && roster?.length && roster.every(person => person.contractorProfileId && submittedPeople.has(person.contractorProfileId))
                && reports.every(report => report.contractorProfileId && actionableIds.has(report.id));
              const actionLabel = (count: number) => {
                const selection = wholeEvent && count > 1 && count === actionableIds.size ? 'celou akci' : formatTimelogCount(count);
                return role === 'crewhead' ? `Předat ${selection} COO` : `Schválit ${selection} k proplacení`;
              };
              return <EventApprovalPanel key={JSON.stringify([scopeKey, group.eventId])} event={group.event} role={role}
                reports={reports} visibleReports={group.timelogs} actionableIds={actionableIds}
                roster={roster} reportsComplete={ready}
                includeHistory={showingInbox && !searchQuery.trim()}
                onExpandedChange={open => setExpandedEvents(prev => {
                  const ids = prev.key === scopeKey ? prev.ids.filter(id => id !== group.eventId) : [];
                  return { key: scopeKey, ids: open ? [...ids, group.eventId] : ids };
                })}
                personName={personName}
                assigneeName={report => getTimelogApprovalAssigneeName(report, group.event, contractors)}
                bulkAction={<EventRoundBatchAction event={group.event} entries={eligibleRounds} legacyEntries={legacyEntries}
                  label={actionLabel(actionableIds.size)} disabled={isTimelogActionPending || !ready}
                  legacyOnlyAction={legacyIds.length > 0 && <Button size="sm" className="min-h-11" disabled={isTimelogActionPending || !ready}
                    onClick={() => executeTimelogAction(legacyIds, role === 'crewhead' ? 'ch' : 'coo')}>{actionLabel(legacyIds.length)}</Button>} />}
                exportAction={renderExport(group.event)}
                onOpenReview={openRound} reviewBusy={isTimelogActionPending}
                renderReview={(report, close) => renderReview(report, group.event, close)} />;
            }
            const totalHours = group.timelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
            const totalAmount = group.timelogs.reduce((sum, timelog) => {
              const contractor = findContractor(timelog.contractorProfileId);
              if (!contractor) return sum;
              return sum + (calculateTotalHours(timelog.days) * contractor.rate) + (timelog.km * KM_RATE) + calculateMealAllowance(timelog.days, { enabled: Boolean(group.event.mealAllowanceEnabled) });
            }, 0);

            return (
              <div key={group.eventId} className="nodu-panel rounded-[20px] p-3 sm:p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="jn nodu-job-badge px-2 py-1 text-sm">{group.event.job}</span>
                      <span className="text-base font-semibold text-[color:var(--nodu-text)]">{group.event.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
                      {formatTimelogCount(group.timelogs.length)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-semibold text-[color:var(--nodu-text)]">{formatCurrency(totalAmount)}</div>
                    <div className="text-xs text-[color:var(--nodu-text-soft)]">{displayTimelogHours(totalHours)} celkem</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {group.timelogs.map((timelog) => renderOriginalTimelog(timelog, true))}
                </div>
              </div>
            );
          })}

          {empty && groupedByEvent.length === 0 && (
            <div className="nodu-panel rounded-[24px] p-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
              {emptyMessage}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((timelog) => renderOriginalTimelog(timelog))}

          {empty && (
            <div className="nodu-panel rounded-[24px] p-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
              {emptyMessage}
            </div>
          )}
        </div>
      )}
      {timelogActionDialog}
    </motion.div>
  );
};

export default TimelogsView;
