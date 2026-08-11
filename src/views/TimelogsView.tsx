import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addMonths, endOfMonth, format, isValid, parseISO, startOfMonth, subMonths } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
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
import { getContractors, subscribeToCrewChanges } from '../features/crew/services/crew.service';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import {
  fetchEligibleTimelogFinalApprovers,
  getTimelogDependencies,
  resolveTimelogApproval,
  returnTimelogToCrewCorrection,
  sendTimelogToApprovers,
  updateTimelogStatus,
} from '../features/timelogs/services/timelogs.service';
import {
  getCurrentPendingTimelogApproval,
  getDefaultTimelogFinalApproverIds,
  hasActiveTimelogApprovals,
  TimelogFinalApprover,
} from '../features/timelogs/services/timelog-final-approvers';
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

  const [viewMode, setViewMode] = useState<ViewMode>(scope === 'mine' ? 'people' : 'event');
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [selectedTimelogMonth, setSelectedTimelogMonth] = useState('');
  const [approvalDialogTimelog, setApprovalDialogTimelog] = useState<Timelog | null>(null);
  const [eligibleFinalApprovers, setEligibleFinalApprovers] = useState<TimelogFinalApprover[]>([]);
  const [selectedFinalApproverIds, setSelectedFinalApproverIds] = useState<string[]>([]);
  const [finalApprovalNote, setFinalApprovalNote] = useState('');
  const [isLoadingFinalApprovers, setIsLoadingFinalApprovers] = useState(false);
  const [isSubmittingFinalApproval, setIsSubmittingFinalApproval] = useState(false);
  const [returnDialogTimelog, setReturnDialogTimelog] = useState<Timelog | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [isReturningTimelog, setIsReturningTimelog] = useState(false);

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

  const findEvent = useCallback((id: EventId) => (
    events.find((event) => event.id === id || event.supabaseId === id) ?? null
  ), [events]);

  const timelogs = useMemo(() => {
    const safeTimelogs = timelogsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeTimelogs;

    return safeTimelogs.filter((timelog) => {
      const event = findEvent(timelog.eid);
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
  const findCurrentPendingApproval = useCallback((timelog: Timelog) => (
    getCurrentPendingTimelogApproval(timelog, currentProfileId)
  ), [currentProfileId]);
  const canUseLegacyFinalApprovalAction = useCallback((timelog: Timelog) => (
    role === 'coo'
    && timelog.status === 'pending_coo'
    && !hasActiveTimelogApprovals(timelog)
  ), [role]);
  const canResolveFinalTimelog = useCallback((timelog: Timelog) => (
    timelog.status === 'pending_coo'
    && (Boolean(findCurrentPendingApproval(timelog)) || canUseLegacyFinalApprovalAction(timelog))
  ), [canUseLegacyFinalApprovalAction, findCurrentPendingApproval]);
  const canSeeManagementTimelog = useCallback((timelog: Timelog) => {
    if (timelog.status !== 'pending_coo') return true;
    if (hasActiveTimelogApprovals(timelog)) return Boolean(findCurrentPendingApproval(timelog));
    return role === 'coo';
  }, [findCurrentPendingApproval, role]);
  const baseTimelogs = useMemo(() => (
    scope === 'mine'
      ? timelogs.filter((timelog) => timelog.contractorProfileId === currentProfileId)
      : timelogs.filter(canSeeManagementTimelog)
  ), [canSeeManagementTimelog, currentProfileId, scope, timelogs]);
  const isMobileMineView = scope === 'mine' && isCrew && isMobile;
  const timelogMonthReferenceDate = useMemo(() => getLatestTimelogDayDate(baseTimelogs), [baseTimelogs]);
  const selectedTimelogMonthDate = useMemo(() => {
    const parsedDate = selectedTimelogMonth ? parseISO(selectedTimelogMonth) : timelogMonthReferenceDate;
    return isValid(parsedDate) ? parsedDate : timelogMonthReferenceDate;
  }, [selectedTimelogMonth, timelogMonthReferenceDate]);
  const selectedTimelogMonthStart = format(startOfMonth(selectedTimelogMonthDate), 'yyyy-MM-dd');
  const selectedTimelogMonthEnd = format(endOfMonth(selectedTimelogMonthDate), 'yyyy-MM-dd');
  const periodTimelogs = useMemo(() => (
    isMobileMineView
      ? baseTimelogs.filter((timelog) => hasTimelogDayInRange(timelog, selectedTimelogMonthStart, selectedTimelogMonthEnd))
      : baseTimelogs
  ), [baseTimelogs, isMobileMineView, selectedTimelogMonthEnd, selectedTimelogMonthStart]);
  const filtered = timelogFilter === 'all'
    ? periodTimelogs
    : periodTimelogs.filter((timelog) => timelog.status === timelogFilter);
  const title = scope === 'mine' ? 'Schvalování' : 'Timelogy';
  const showTimelogNotes = canSeeTimelogNote(role);
  const getSubmitActionLabel = (timelog: typeof baseTimelogs[number]) => {
    if (timelog.status === 'pending_crew_confirmation') return 'Potvrdit a odeslat';
    if (timelog.status === 'rejected') return 'Odeslat znovu';
    return 'Odeslat ke kontrole CH';
  };

  useEffect(() => {
    if (selectedTimelogMonth) return;
    setSelectedTimelogMonth(format(startOfMonth(timelogMonthReferenceDate), 'yyyy-MM-dd'));
  }, [selectedTimelogMonth, timelogMonthReferenceDate]);

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

  const groupedByEvent = useMemo(() => {
    const groups = new Map<EventId, { eventId: EventId; job: string; eventName: string; startDate: string; mealAllowanceEnabled: boolean; timelogs: typeof filtered }>();

    filtered.forEach((timelog) => {
      const event = findEvent(timelog.eid);
      if (!event) return;

      const existing = groups.get(event.id) || {
        eventId: event.id,
        job: event.job,
        eventName: event.name,
        startDate: event.startDate,
        mealAllowanceEnabled: Boolean(event.mealAllowanceEnabled),
        timelogs: [],
      };

      existing.timelogs.push(timelog);
      groups.set(event.id, existing);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const dateDiff = a.startDate.localeCompare(b.startDate);
      if (dateDiff !== 0) return dateDiff;
      return a.eventName.localeCompare(b.eventName);
    });
  }, [filtered, findEvent]);

  const openFinalApprovalDialog = useCallback((timelog: Timelog) => {
    const stateEvent = findEvent(timelog.eid);
    const dependencyEvent = getTimelogDependencies().events.find((item) => item.id === timelog.eid || item.supabaseId === timelog.eid) ?? null;
    const event = stateEvent?.contactProfileId ? stateEvent : dependencyEvent ?? stateEvent ?? null;
    setApprovalDialogTimelog(timelog);
    setEligibleFinalApprovers([]);
    setSelectedFinalApproverIds([]);
    setFinalApprovalNote('');
    setIsLoadingFinalApprovers(true);

    void fetchEligibleTimelogFinalApprovers(timelog, currentProfileId)
      .then((approvers) => {
        setEligibleFinalApprovers(approvers);
        setSelectedFinalApproverIds(getDefaultTimelogFinalApproverIds(event, approvers));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodařilo se načíst schvalovatele.');
      })
      .finally(() => setIsLoadingFinalApprovers(false));
  }, [currentProfileId, findEvent]);

  const closeFinalApprovalDialog = () => {
    if (isSubmittingFinalApproval) return;
    setApprovalDialogTimelog(null);
    setEligibleFinalApprovers([]);
    setSelectedFinalApproverIds([]);
    setFinalApprovalNote('');
  };

  const toggleFinalApprover = (profileId: string) => {
    setSelectedFinalApproverIds((current) => (
      current.includes(profileId)
        ? current.filter((item) => item !== profileId)
        : [...current, profileId]
    ));
  };

  const confirmFinalApproval = () => {
    if (!approvalDialogTimelog || selectedFinalApproverIds.length === 0) return;

    setIsSubmittingFinalApproval(true);
    void sendTimelogToApprovers(approvalDialogTimelog.id, selectedFinalApproverIds, finalApprovalNote)
      .then(() => {
        setApprovalDialogTimelog(null);
        setEligibleFinalApprovers([]);
        setSelectedFinalApproverIds([]);
        setFinalApprovalNote('');
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodařilo se odeslat výkaz ke schválení.');
      })
      .finally(() => setIsSubmittingFinalApproval(false));
  };

  const openReturnDialog = (timelog: Timelog) => {
    setReturnDialogTimelog(timelog);
    setReturnNote('');
  };

  const closeReturnDialog = () => {
    if (isReturningTimelog) return;
    setReturnDialogTimelog(null);
    setReturnNote('');
  };

  const confirmReturnToCrew = () => {
    if (!returnDialogTimelog) return;

    const pendingApproval = findCurrentPendingApproval(returnDialogTimelog);
    let action: Promise<unknown>;

    if (pendingApproval) {
      action = resolveTimelogApproval(pendingApproval.id, 'returned', returnNote);
    } else if (returnDialogTimelog.status === 'pending_coo' && !canUseLegacyFinalApprovalAction(returnDialogTimelog)) {
      return;
    } else {
      action = returnTimelogToCrewCorrection(returnDialogTimelog.id, returnNote);
    }

    setIsReturningTimelog(true);
    void action
      .then(() => {
        setReturnDialogTimelog(null);
        setReturnNote('');
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodařilo se vrátit výkaz k opravě.');
      })
      .finally(() => setIsReturningTimelog(false));
  };

  const handleTimelogAction = useCallback((id: Timelog['id'], action: 'sub' | 'ch' | 'coo' | 'rej') => {
    void updateTimelogStatus(id, action).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se aktualizovat výkaz.');
    });
  }, []);

  const approveFinalTimelog = useCallback((timelog: Timelog) => {
    const pendingApproval = findCurrentPendingApproval(timelog);

    if (pendingApproval) {
      void resolveTimelogApproval(pendingApproval.id, 'approved').catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Nepodařilo se schválit výkaz.');
      });
      return;
    }

    if (canUseLegacyFinalApprovalAction(timelog)) {
      handleTimelogAction(timelog.id, 'coo');
      return;
    }
  }, [canUseLegacyFinalApprovalAction, findCurrentPendingApproval, handleTimelogAction]);

  const runBulkFinalApproval = (timelogsToApprove: Timelog[]) => {
    void Promise.all(timelogsToApprove.map((timelog) => {
      const pendingApproval = findCurrentPendingApproval(timelog);
      if (pendingApproval) return resolveTimelogApproval(pendingApproval.id, 'approved');
      if (canUseLegacyFinalApprovalAction(timelog)) return updateTimelogStatus(timelog.id, 'coo');
      return Promise.resolve(null);
    })).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Nepodařilo se aktualizovat výkazy.');
    });
  };

  const getBulkActionMeta = (timelogsInGroup: typeof filtered) => {
    const actionableTimelogs = timelogsInGroup
      .filter((timelog) => canResolveFinalTimelog(timelog));

    if (actionableTimelogs.length === 0 || role === 'crew' || scope === 'mine') return null;

    if (role === 'crewhead' && actionableTimelogs.some((timelog) => canUseLegacyFinalApprovalAction(timelog))) return null;

    return {
      timelogs: actionableTimelogs,
      label: `Schválit vše (${actionableTimelogs.length})`,
    };
  };

  const renderTimelogDayRow = (timelogId: EventId, day: TimelogDay, index: number, mealAllowanceEnabled: boolean) => {
    const mealLabels = mealAllowanceEnabled
      ? normalizeMealSelection(day).map((meal) => MEAL_CONFIG.find((item) => item.type === meal)?.label ?? meal)
      : [];
    const dayHours = calculateDayHours(day.f, day.t);

    return (
      <div
        key={`${timelogId}-${index}-${day.d}-${day.f}-${day.t}-${day.type}-${mealLabels.join(',')}`}
        className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] bg-[color:rgb(var(--nodu-text-rgb)/0.035)] px-3 py-2 text-xs"
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
        <div className="flex items-center justify-end gap-2">
          <StatusBadge status={day.type} />
          <span className="min-w-[2.4rem] text-right font-semibold text-[color:var(--nodu-text-soft)]">{dayHours.toFixed(1)}h</span>
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
    <div className="flex gap-2">
      {canSubmitTimelog(timelog, role) && (
        <Button
          onClick={() => handleTimelogAction(timelog.id, 'sub')}
          size="sm"
          className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
        >
          {getSubmitActionLabel(timelog)}
        </Button>
      )}
      {timelog.status === 'pending_ch' && role === 'crewhead' && (
        <>
          <Button
            onClick={() => openFinalApprovalDialog(timelog)}
            size="sm"
            className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
          >
            Schválit a vybrat schvalovatele
          </Button>
          <Button
            onClick={() => openReturnDialog(timelog)}
            variant="outline"
            size="sm"
            className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]"
          >
            Vrátit
          </Button>
        </>
      )}
      {canResolveFinalTimelog(timelog) && (
        <>
          <Button
            onClick={() => approveFinalTimelog(timelog)}
            size="sm"
            className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[11px] text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
          >
            Schválit
          </Button>
          <Button
            onClick={() => openReturnDialog(timelog)}
            variant="outline"
            size="sm"
            className="border-[#e8b4a3] text-[#c45c39] hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39] text-[11px]"
          >
            Vrátit
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="nodu-dashboard-kicker">Timesheets</div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">{title}</h1>
            {scope === 'all' && (
              <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">
                Schvalování i detail výkazů na jednom místě.
              </p>
            )}
          </div>

          {scope === 'all' && (
            <div className="inline-flex rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
              <button
                onClick={() => setViewMode('event')}
                className={`rounded-[14px] px-3.5 py-2 text-[11px] font-medium transition-all ${viewMode === 'event' ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
              >
                Po akci
              </button>
              <button
                onClick={() => setViewMode('people')}
                className={`rounded-[14px] px-3.5 py-2 text-[11px] font-medium transition-all ${viewMode === 'people' ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
              >
                Po lidech
              </button>
            </div>
          )}
        </div>

        {isMobile ? (
          <div className="space-y-3">
            {isMobileMineView && (
              <div className="flex items-center justify-between rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.94)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
                <button
                  type="button"
                  onClick={() => moveTimelogMonth('prev')}
                  aria-label="Předchozí měsíc výkazů"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-[color:var(--nodu-text-soft)] transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.06)] hover:text-[color:var(--nodu-text)]"
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] text-[color:var(--nodu-text-soft)] transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.06)] hover:text-[color:var(--nodu-text)]"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            )}

            <div className="rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.94)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
              <button
                type="button"
                onClick={() => setMobileFilterOpen((open) => !open)}
                aria-expanded={mobileFilterOpen}
                aria-label={`Filtr výkazů: ${activeFilter.label}, ${activeFilter.count} záznamy`}
                className="flex w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-left transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.04)]"
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
                      className={`inline-flex items-center justify-between rounded-[14px] px-3 py-2 text-sm font-semibold transition-all ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'bg-[color:rgb(var(--nodu-text-rgb)/0.04)] text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
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
                className={`inline-flex items-center gap-2 rounded-[14px] px-3 py-2 text-[11px] font-medium transition-all ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
              >
                <span>{filter.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${timelogFilter === filter.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.16)]' : 'bg-[color:rgb(var(--nodu-text-rgb)/0.08)] text-[color:var(--nodu-text-soft)]'}`}>
                  {filter.count}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {scope === 'all' && viewMode === 'event' ? (
        <div className="space-y-4">
          {groupedByEvent.map((group) => {
            const totalHours = group.timelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
            const totalAmount = group.timelogs.reduce((sum, timelog) => {
              const contractor = findContractor(timelog.contractorProfileId);
              if (!contractor) return sum;
              return sum + (calculateTotalHours(timelog.days) * contractor.rate) + (timelog.km * KM_RATE) + calculateMealAllowance(timelog.days, { enabled: group.mealAllowanceEnabled });
            }, 0);
            const bulkAction = getBulkActionMeta(group.timelogs);

            return (
              <div key={group.eventId} className="nodu-panel rounded-[28px] p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="jn nodu-job-badge px-2 py-1 text-sm">{group.job}</span>
                      <span className="text-base font-semibold text-[color:var(--nodu-text)]">{group.eventName}</span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
                      {formatTimelogCount(group.timelogs.length)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-semibold text-[color:var(--nodu-text)]">{formatCurrency(totalAmount)}</div>
                    <div className="text-xs text-[color:var(--nodu-text-soft)]">{totalHours.toFixed(1)}h celkem</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {group.timelogs.map((timelog) => {
                    const contractor = findContractor(timelog.contractorProfileId);
                    const event = findEvent(timelog.eid);
                    if (!contractor || !event) return null;

                    const hours = calculateTotalHours(timelog.days);
                    const changeSummary = buildTimelogChangeSummary(timelog);
                    const showCrewConfirmedCorrection = shouldShowCrewConfirmedCorrection(timelog, changeSummary);

                    return (
                      <div key={timelog.id} className="rounded-[22px] border border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.9)] p-4 shadow-[0_12px_28px_rgba(47,38,31,0.06)]">
                        <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
                          <div className="av w-8 h-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                            {contractor.ii}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{contractor.name}</div>
                          </div>
                          <StatusBadge status={timelog.status} label={getTimelogStatusLabel(timelog.status, isCrewMineScope)} />
                          <div className="text-right">
                            <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{hours.toFixed(1)}h</div>
                            <div className="text-[11px] text-[color:var(--nodu-text-soft)]">
                              {formatCurrency(hours * contractor.rate + calculateMealAllowance(timelog.days, { enabled: Boolean(event.mealAllowanceEnabled) }))}
                              {timelog.km > 0 ? ` + ${formatCurrency(timelog.km * KM_RATE)}` : ''}
                            </div>
                          </div>
                        </div>

                        {showCrewConfirmedCorrection && renderCrewConfirmedCorrectionNotice(changeSummary)}

                        <div className="mb-3 space-y-2">
                          {timelog.days.map((day, index) => renderTimelogDayRow(
                            timelog.id,
                            day,
                            index,
                            Boolean(event.mealAllowanceEnabled),
                          ))}
                        </div>

                        <div className="mb-3 flex items-center gap-3">
                          {showTimelogNotes && timelog.note && (
                            <p className="min-w-0 flex-1 text-xs italic text-[color:var(--nodu-text-soft)]">"{timelog.note}"</p>
                          )}
                          {(scope === 'mine' || !isCrew) && canEditTimelog(timelog, role) && (
                            <button
                              onClick={() => setEditingTimelog(timelog)}
                              className="ml-auto rounded-xl border border-[color:var(--nodu-border)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--nodu-text)] transition hover:bg-[color:var(--nodu-accent-soft)]"
                            >
                              Upravit
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {canSubmitTimelog(timelog, role) && (
                            <button
                              onClick={() => handleTimelogAction(timelog.id, 'sub')}
                              className="rounded-xl border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] transition hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)]"
                            >
                              {getSubmitActionLabel(timelog)}
                            </button>
                          )}
                          {timelog.status === 'pending_ch' && role === 'crewhead' && (
                            <>
                              <button
                                onClick={() => openFinalApprovalDialog(timelog)}
                                className="rounded-xl border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] transition hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)]"
                              >
                                Schválit a vybrat schvalovatele
                              </button>
                              <button
                                onClick={() => openReturnDialog(timelog)}
                                className="rounded-xl border border-[color:var(--nodu-error-border)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--nodu-error-text)] transition hover:bg-[color:var(--nodu-error-bg)]"
                              >
                                Vrátit
                              </button>
                            </>
                          )}
                          {canResolveFinalTimelog(timelog) && (
                            <>
                              <button
                                onClick={() => approveFinalTimelog(timelog)}
                                className="rounded-xl border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--nodu-success-text)] shadow-[0_12px_24px_rgba(47,125,79,0.10)] transition hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)]"
                              >
                                Schválit
                              </button>
                              <button
                                onClick={() => openReturnDialog(timelog)}
                                className="rounded-xl border border-[color:var(--nodu-error-border)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--nodu-error-text)] transition hover:bg-[color:var(--nodu-error-bg)]"
                              >
                                Vrátit
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {bulkAction && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => runBulkFinalApproval(bulkAction.timelogs)}
                      size="sm"
                      className="border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-xs text-[color:var(--nodu-success-text)] shadow-[0_14px_28px_rgba(47,125,79,0.10)] hover:bg-[color:var(--nodu-success-bg-hover)] hover:shadow-[0_14px_28px_rgba(47,125,79,0.14)] hover:text-[color:var(--nodu-success-text)]"
                    >
                      {bulkAction.label}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {groupedByEvent.length === 0 && (
            <div className="nodu-panel rounded-[24px] p-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
              Žádné záznamy pro tento filtr
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((timelog) => {
            const contractor = findContractor(timelog.contractorProfileId);
            const event = findEvent(timelog.eid);
            if (!contractor || !event) return null;

            const totalHours = calculateTotalHours(timelog.days);
            const changeSummary = buildTimelogChangeSummary(timelog);
            const showCrewConfirmationChanges = isCrewMineScope
              && timelog.status === 'pending_crew_confirmation'
              && changeSummary.length > 0;
            const showCrewConfirmedCorrection = shouldShowCrewConfirmedCorrection(timelog, changeSummary);
            const showReturnedNotice = isCrewMineScope && timelog.status === 'rejected';
            const returnedReason = timelog.reviewNote?.trim() || '';

            return (
              <div key={timelog.id} className="nodu-panel rounded-[28px] p-5">
                {isMobileMineView ? (
                  <div className="mb-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <span className="jn nodu-job-badge">{event.job}</span>
                          <StatusBadge status={timelog.status} label={getTimelogStatusLabel(timelog.status, isCrewMineScope)} />
                        </div>
                        <div className="text-base font-semibold leading-tight text-[color:var(--nodu-text)]">{event.name}</div>
                        <div className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">{event.client}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-semibold text-[color:var(--nodu-text)]">{totalHours.toFixed(1)}h</div>
                        {timelog.km > 0 && <div className="text-[10px] text-[color:var(--nodu-text-soft)]">+ {timelog.km} km</div>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 flex items-center gap-3 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
                    <div className="av w-8 h-8 text-[10px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
                      {contractor.ii}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{contractor.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="jn nodu-job-badge">{event.job}</span>
                        <span className="text-xs text-[color:var(--nodu-text-soft)]">{event.name}</span>
                      </div>
                    </div>
                    <StatusBadge status={timelog.status} label={getTimelogStatusLabel(timelog.status, isCrewMineScope)} />
                    <div className="text-right">
                      <div className="text-base font-semibold text-[color:var(--nodu-text)]">{totalHours.toFixed(1)}h</div>
                      {timelog.km > 0 && <div className="text-[10px] text-[color:var(--nodu-text-soft)]">+ {timelog.km} km</div>}
                    </div>
                  </div>
                )}

                {showCrewConfirmationChanges && (
                  <div className="mb-3 rounded-[18px] border border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-accent-rgb)/0.07)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-accent)]">
                        Upraveno CH
                      </div>
                      <div className="text-[11px] font-semibold text-[color:var(--nodu-text-soft)]">
                        Čeká na tvoje potvrzení
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
                )}

                {showCrewConfirmedCorrection && renderCrewConfirmedCorrectionNotice(changeSummary)}

                {showReturnedNotice && (
                  <div className="mb-3 rounded-[18px] border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--nodu-error-text)]">
                        Důvod vrácení
                      </div>
                      <div className="text-[11px] font-semibold text-[color:var(--nodu-text-soft)]">
                        Uprav výkaz a odešli ho znovu ke kontrole.
                      </div>
                    </div>
                    {returnedReason && (
                      <div className="mt-2 rounded-[14px] bg-[color:rgb(var(--nodu-surface-rgb)/0.76)] px-3 py-2 text-xs font-medium text-[color:var(--nodu-text)]">
                        {returnedReason}
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-3 space-y-2">
                  {timelog.days.map((day, index) => renderTimelogDayRow(
                    timelog.id,
                    day,
                    index,
                    Boolean(event.mealAllowanceEnabled),
                  ))}
                </div>

                {showTimelogNotes && timelog.note && <p className="mb-3 text-xs italic text-[color:var(--nodu-text-soft)]">"{timelog.note}"</p>}
                {renderRowActions(timelog)}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="nodu-panel rounded-[24px] p-10 text-center text-sm text-[color:var(--nodu-text-soft)]">
              Žádné záznamy pro tento filtr
            </div>
          )}
        </div>
      )}
      {approvalDialogTimelog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="timelog-final-approval-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
        >
          <div className="w-full max-w-lg rounded-[22px] border border-[color:var(--nodu-border)] bg-white p-5 shadow-[0_24px_72px_rgba(47,38,31,0.22)]">
            <div className="mb-4 flex items-start gap-3">
              <div>
                <h2 id="timelog-final-approval-title" className="text-lg font-semibold text-[color:var(--nodu-text)]">Finální schválení výkazu</h2>
                <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">Vyber konkrétní Nodu profil, který má výkaz finálně schválit.</p>
              </div>
              <button
                type="button"
                aria-label="Zavřít finální schválení"
                onClick={closeFinalApprovalDialog}
                className="ml-auto rounded-full p-1.5 text-[color:var(--nodu-text-soft)] transition hover:bg-[color:var(--nodu-accent-soft)] hover:text-[color:var(--nodu-text)]"
              >
                <X size={17} />
              </button>
            </div>

            <div className="space-y-2">
              {isLoadingFinalApprovers && (
                <div className="rounded-[16px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] px-3 py-2 text-sm text-[color:var(--nodu-text-soft)]">
                  Načítám schvalovatele...
                </div>
              )}
              {!isLoadingFinalApprovers && eligibleFinalApprovers.length === 0 && (
                <div className="rounded-[16px] border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] px-3 py-2 text-sm text-[color:var(--nodu-error-text)]">
                  Není dostupný žádný interní schvalovatel.
                </div>
              )}
              {eligibleFinalApprovers.map((approver) => (
                <label
                  key={approver.profileId}
                  className="flex cursor-pointer items-center gap-3 rounded-[16px] border border-[color:var(--nodu-border)] px-3 py-2 text-sm font-medium text-[color:var(--nodu-text)] transition hover:bg-[color:var(--nodu-accent-soft)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedFinalApproverIds.includes(approver.profileId)}
                    onChange={() => toggleFinalApprover(approver.profileId)}
                    className="h-4 w-4 accent-[color:var(--nodu-accent)]"
                  />
                  <span>{approver.name}</span>
                </label>
              ))}
            </div>

            <label className="mt-4 block text-sm font-medium text-[color:var(--nodu-text)]">
              Poznámka pro schvalovatele
              <textarea
                value={finalApprovalNote}
                onChange={(event) => setFinalApprovalNote(event.target.value)}
                className="mt-2 min-h-20 w-full rounded-[16px] border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[color:var(--nodu-accent)]"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeFinalApprovalDialog}>Zrušit</Button>
              <Button
                type="button"
                onClick={confirmFinalApproval}
                disabled={selectedFinalApproverIds.length === 0 || isLoadingFinalApprovers || isSubmittingFinalApproval}
              >
                Odeslat ke schválení
              </Button>
            </div>
          </div>
        </div>
      )}

      {returnDialogTimelog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="timelog-return-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
        >
          <div className="w-full max-w-md rounded-[22px] border border-[color:var(--nodu-border)] bg-white p-5 shadow-[0_24px_72px_rgba(47,38,31,0.22)]">
            <div className="mb-4 flex items-start gap-3">
              <div>
                <h2 id="timelog-return-title" className="text-lg font-semibold text-[color:var(--nodu-text)]">Vrátit výkaz k opravě</h2>
                <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">Poznámka je volitelná, když jste se domluvili jinak.</p>
              </div>
              <button
                type="button"
                aria-label="Zavřít vrácení výkazu"
                onClick={closeReturnDialog}
                className="ml-auto rounded-full p-1.5 text-[color:var(--nodu-text-soft)] transition hover:bg-[color:var(--nodu-accent-soft)] hover:text-[color:var(--nodu-text)]"
              >
                <X size={17} />
              </button>
            </div>

            <label htmlFor="timelog-return-note" className="block text-sm font-medium text-[color:var(--nodu-text)]">
              Poznámka pro Crew
            </label>
            <textarea
              id="timelog-return-note"
              value={returnNote}
              onChange={(event) => setReturnNote(event.target.value)}
              className="mt-2 min-h-24 w-full rounded-[16px] border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[color:var(--nodu-accent)]"
            />

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeReturnDialog}>Zrušit</Button>
              <Button type="button" onClick={confirmReturnToCrew} disabled={isReturningTimelog}>
                Vrátit k opravě
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default TimelogsView;
