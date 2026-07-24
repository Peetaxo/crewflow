import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, List, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { cs } from 'date-fns/locale';
import { useAppContext } from '../context/useAppContext';
import { useAuth } from '../app/providers/useAuth';
import { Event, Timelog } from '../types';
import type { SelectedEventId } from '../context/app-context';
import { calculateTotalHours, eventOccursOnDate, formatDateRange, getDatesBetween } from '../utils';
import { Button } from '../components/ui/button';
import EventDetailView from './EventDetailView';
import EventEditModal from '../components/modals/EventEditModal';
import AssignCrewModal from '../components/modals/AssignCrewModal';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import { useTimelogsQuery } from '../features/timelogs/queries/useTimelogsQuery';
import {
  createEmptyEvent,
  createEventCopy,
  filterEventsByStatus,
  applyForEvent,
  getEventDetailData,
  getEventsWithDerivedStatus,
  getReferenceDate,
  requestEventWithdrawal,
  withdrawEventApplication,
} from '../features/events/services/events.service';
import { EventFilter } from '../features/events/types/events.types';

type EventsViewMode = 'list' | 'calendar';
type CalendarMode = 'month' | 'week';
type EventTimelogApprovalMeta = {
  label: string;
  className: string;
  dotClassName: string;
};

type CalendarEvent = Event & {
  derivedStatus: 'upcoming' | 'full' | 'past';
};

type CalendarSegment = {
  event: CalendarEvent;
  startIndex: number;
  endIndex: number;
  lane: number;
};

type EventListOccurrenceKind = 'single' | 'start' | 'continuation' | 'end';

type EventListOccurrence = {
  event: CalendarEvent;
  date: string;
  kind: EventListOccurrenceKind;
  dayIndex: number;
  dayCount: number;
};

type EventColorStyle = {
  backgroundColor: string;
  borderColor: string;
  stripeColor: string;
  textColor: string;
  metaColor: string;
};

const buildWeekSegments = (weekDays: Date[], events: CalendarEvent[]): CalendarSegment[] => {
  const weekKeys = weekDays.map((day) => format(day, 'yyyy-MM-dd'));
  const weekStart = weekKeys[0];
  const weekEnd = weekKeys[6];

  const relevantEvents = events
    .filter((event) => event.startDate <= weekEnd && event.endDate >= weekStart)
    .map((event) => {
      const visibleStart = event.startDate > weekStart ? event.startDate : weekStart;
      const visibleEnd = event.endDate < weekEnd ? event.endDate : weekEnd;

      return {
        event,
        startIndex: weekKeys.indexOf(visibleStart),
        endIndex: weekKeys.indexOf(visibleEnd),
      };
    })
    .filter((segment) => segment.startIndex >= 0 && segment.endIndex >= 0)
    .sort((a, b) => {
      if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
      if (a.endIndex !== b.endIndex) return b.endIndex - a.endIndex;
      return a.event.name.localeCompare(b.event.name);
    });

  const laneEndIndexes: number[] = [];

  return relevantEvents.map((segment) => {
    let lane = laneEndIndexes.findIndex((lastEndIndex) => segment.startIndex > lastEndIndex);

    if (lane === -1) {
      lane = laneEndIndexes.length;
      laneEndIndexes.push(segment.endIndex);
    } else {
      laneEndIndexes[lane] = segment.endIndex;
    }

    return {
      ...segment,
      lane,
    };
  });
};

const getWeekRowHeight = (segments: CalendarSegment[]) => {
  const laneCount = segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
  return 56 + Math.max(1, laneCount) * 58;
};

const getEventColorStyle = (index: number, status: CalendarEvent['derivedStatus']): EventColorStyle => {
  const hue = Math.round((index * 137.508) % 360);
  const saturation = status === 'past' ? 12 : 65;
  const backgroundLightness = status === 'past' ? 96 : 97;
  const borderLightness = status === 'past' ? 86 : 82;
  const stripeLightness = status === 'past' ? 58 : 46;
  const textLightness = status === 'past' ? 24 : 28;
  const metaLightness = status === 'past' ? 36 : 38;

  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${backgroundLightness}%)`,
    borderColor: `hsl(${hue} ${Math.max(18, saturation - 18)}% ${borderLightness}%)`,
    stripeColor: `hsl(${hue} ${Math.max(24, saturation)}% ${stripeLightness}%)`,
    textColor: `hsl(${hue} ${Math.max(18, saturation - 20)}% ${textLightness}%)`,
    metaColor: `hsl(${hue} ${Math.max(14, saturation - 28)}% ${metaLightness}%)`,
  };
};

const eventOverlapsDateRange = (event: Event, startDate: string, endDate: string) => (
  event.startDate <= endDate && event.endDate >= startDate
);

const formatOccurrenceDate = (date: string) => format(parseISO(date), 'd. M. yyyy', { locale: cs });
const formatShortOccurrenceDate = (date: string) => format(parseISO(date), 'd. M.', { locale: cs });

const formatEventDayCount = (dayCount: number) => {
  if (dayCount === 1) return '1 den';
  if (dayCount >= 2 && dayCount <= 4) return `${dayCount} dny`;
  return `${dayCount} dní`;
};

const getListOccurrencesForEvent = (event: CalendarEvent, canManageEvents: boolean): EventListOccurrence[] => {
  const dates = getDatesBetween(event.startDate, event.endDate);
  const dayCount = dates.length || 1;

  if (dayCount === 1 || !dates[0]) {
    return [{
      event,
      date: dates[0] ?? event.startDate,
      kind: 'single',
      dayIndex: 1,
      dayCount,
    }];
  }

  if (!canManageEvents) {
    return [{
      event,
      date: dates[0],
      kind: 'start',
      dayIndex: 1,
      dayCount,
    }];
  }

  return dates.map((date, index) => ({
    event,
    date,
    kind: index === 0 ? 'start' : (index === dates.length - 1 ? 'end' : 'continuation'),
    dayIndex: index + 1,
    dayCount,
  }));
};

const getOccurrenceStatusLabel = (occurrence: EventListOccurrence) => {
  if (occurrence.kind === 'single') return null;
  if (occurrence.kind === 'start') return 'Začíná dnes';
  if (occurrence.kind === 'end') return 'Končí dnes';
  return `Probíhá od ${formatShortOccurrenceDate(occurrence.event.startDate)}`;
};

const formatTimelogShift = (from: string, to: string) => `${from} - ${to}`;

const getTimeSortValue = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.MAX_SAFE_INTEGER;
  return hours * 60 + minutes;
};

const getEventOccurrenceTimeLabel = (event: Event, date: string, timelogs: Timelog[] = []) => {
  const timelogTimes = timelogs.flatMap((timelog) => (
    timelog.days
      .filter((day) => day.d === date)
      .map((day) => ({ from: day.f, label: formatTimelogShift(day.f, day.t) }))
  ));
  const uniqueTimelogTimes = Array.from(
    timelogTimes.reduce((acc, shift) => (
      acc.has(shift.label) ? acc : acc.set(shift.label, shift)
    ), new Map<string, { from: string; label: string }>()),
  )
    .map(([, shift]) => shift)
    .sort((a, b) => getTimeSortValue(a.from) - getTimeSortValue(b.from))
    .map((shift) => shift.label);

  if (uniqueTimelogTimes.length > 0) {
    if (uniqueTimelogTimes.length <= 2) return uniqueTimelogTimes.join(', ');
    return `${uniqueTimelogTimes[0]} + ${uniqueTimelogTimes.length - 1} smeny`;
  }

  const phaseTimes = event.showDayTypes
    ? Object.values(event.phaseSchedules ?? {})
      .flat()
      .filter((slot) => slot.dates.includes(date))
      .map((slot) => formatTimelogShift(slot.from, slot.to))
    : [];

  const uniquePhaseTimes = [...new Set(phaseTimes)];
  if (uniquePhaseTimes.length > 0) return uniquePhaseTimes.join(', ');
  if (event.startTime && event.endTime) return `${event.startTime} - ${event.endTime}`;
  if (event.startTime) return `od ${event.startTime}`;
  if (event.endTime) return `do ${event.endTime}`;
  return 'Cas neurcen';
};

const getEventTimelogApprovalMeta = (timelogs: Timelog[]): EventTimelogApprovalMeta => {
  if (timelogs.length === 0) {
    return {
      label: 'Casy nezadane',
      className: 'border-[color:rgb(var(--nodu-text-rgb)/0.12)] bg-[color:rgb(var(--nodu-text-rgb)/0.06)] text-[color:var(--nodu-text-soft)]',
      dotClassName: 'bg-[color:rgb(var(--nodu-text-rgb)/0.34)]',
    };
  }

  const statuses = new Set(timelogs.map((timelog) => timelog.status));
  const allApproved = timelogs.every((timelog) => ['approved', 'invoiced', 'paid'].includes(timelog.status));
  if (allApproved) {
    return {
      label: 'Casy schvalene',
      className: 'border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]',
      dotClassName: 'bg-[color:var(--nodu-success-text)]',
    };
  }

  if (statuses.has('rejected')) {
    return {
      label: 'Casy k oprave',
      className: 'border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] text-[color:var(--nodu-error-text)]',
      dotClassName: 'bg-[color:var(--nodu-error-text)]',
    };
  }

  if (statuses.has('pending_ch')) {
    return {
      label: 'Ceka CH',
      className: 'border-[color:var(--nodu-warning-border)] bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]',
      dotClassName: 'bg-[#f59e0b]',
    };
  }

  if (statuses.has('pending_coo')) {
    return {
      label: 'Ceka COO',
      className: 'border-[color:var(--nodu-info-border)] bg-[color:var(--nodu-info-bg)] text-[color:var(--nodu-info-text)]',
      dotClassName: 'bg-[#2563eb]',
    };
  }

  return {
    label: 'Casy rozepsane',
    className: 'border-[color:rgb(var(--nodu-text-rgb)/0.12)] bg-[color:rgb(var(--nodu-text-rgb)/0.06)] text-[color:var(--nodu-text-soft)]',
    dotClassName: 'bg-[color:rgb(var(--nodu-text-rgb)/0.42)]',
  };
};

const getEventSelectionId = (event: Event): SelectedEventId => event.supabaseId ?? event.id;

const EventsView = () => {
  const {
    role,
    setCurrentTab,
    selectedEventId,
    setSelectedEventId,
    setSelectedContractorProfileId,
    searchQuery,
    setDeleteConfirm,
    setEventTab,
    eventsViewMode,
    setEventsViewMode,
    eventsCalendarMode,
    setEventsCalendarMode,
    eventsFilter,
    setEventsFilter,
    eventsCalendarDate,
    setEventsCalendarDate,
  } = useAppContext();
  const { currentProfileId } = useAuth();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  void timelogsQuery.data;
  const [didInitCalendarDate, setDidInitCalendarDate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [assigningEvent, setAssigningEvent] = useState<Event | null>(null);
  const [applicationDraftTimes, setApplicationDraftTimes] = useState<Record<string, { from: string; to: string }>>({});
  const canManageEvents = role !== 'crew';
  const viewMode = eventsViewMode as EventsViewMode;
  const calendarMode = eventsCalendarMode as CalendarMode;
  const eventFilter = eventsFilter as EventFilter;
  const selectedEvent = useMemo(
    () => (eventsQuery.data ?? []).find((event) => (
      selectedEventId == null
        ? false
        : getEventSelectionId(event) === selectedEventId || event.id === selectedEventId
    )) ?? null,
    [eventsQuery.data, selectedEventId],
  );
  const events = useMemo(() => {
    const safeEvents = eventsQuery.data ?? [];
    const query = searchQuery.trim().toLowerCase();

    if (!query) return safeEvents;

    return safeEvents.filter((event) => (
      event.name.toLowerCase().includes(query) || event.job.toLowerCase().includes(query)
    ));
  }, [eventsQuery.data, searchQuery]);

  useEffect(() => {
    if (selectedEventId && !selectedEvent) {
      setSelectedEventId(null);
    }
  }, [selectedEventId, selectedEvent, setSelectedEventId]);

  const calendarDate = useMemo(() => {
    if (!eventsCalendarDate) {
      return getReferenceDate(events);
    }

    const parsedCalendarDate = parseISO(eventsCalendarDate);
    return isValid(parsedCalendarDate) ? parsedCalendarDate : getReferenceDate(events);
  }, [eventsCalendarDate, events]);

  useEffect(() => {
    if (didInitCalendarDate) return;
    if (eventsCalendarDate) {
      setDidInitCalendarDate(true);
      return;
    }

    const referenceDate = getReferenceDate(events);
    setEventsCalendarDate(format(referenceDate, 'yyyy-MM-dd'));
    setDidInitCalendarDate(true);
  }, [didInitCalendarDate, eventsCalendarDate, events, setEventsCalendarDate]);

  const eventsWithDerivedStatus = useMemo(() => (
    getEventsWithDerivedStatus(events)
  ), [events]);

  const visibleEvents = useMemo(() => (
    filterEventsByStatus(eventsWithDerivedStatus, eventFilter)
  ), [eventFilter, eventsWithDerivedStatus]);

  const selectedMonthStart = format(startOfMonth(calendarDate), 'yyyy-MM-dd');
  const selectedMonthEnd = format(endOfMonth(calendarDate), 'yyyy-MM-dd');
  const monthVisibleEvents = useMemo(() => (
    visibleEvents.filter((event) => eventOverlapsDateRange(event, selectedMonthStart, selectedMonthEnd))
  ), [selectedMonthEnd, selectedMonthStart, visibleEvents]);
  const listVisibleEvents = viewMode === 'list' ? monthVisibleEvents : visibleEvents;

  const eventColorMap = useMemo(() => (
    new Map(
      [...visibleEvents]
        .sort((a, b) => a.id - b.id)
        .map((event, index) => [event.id, getEventColorStyle(index, event.derivedStatus)]),
    )
  ), [visibleEvents]);

  const groupedEventOccurrences = useMemo(() => (
    listVisibleEvents.reduce((acc, event) => {
      getListOccurrencesForEvent(event, canManageEvents).forEach((occurrence) => {
        if (occurrence.date < selectedMonthStart || occurrence.date > selectedMonthEnd) return;
        if (!acc[occurrence.date]) acc[occurrence.date] = [];
        acc[occurrence.date].push(occurrence);
      });
      return acc;
    }, {} as Record<string, EventListOccurrence[]>)
  ), [canManageEvents, listVisibleEvents, selectedMonthEnd, selectedMonthStart]);

  const sortedDates = Object.keys(groupedEventOccurrences).sort();
  const hasNoVisibleEventsForView = viewMode === 'list'
    ? sortedDates.length === 0
    : visibleEvents.length === 0;

  const calendarStart = calendarMode === 'month'
    ? startOfWeek(startOfMonth(calendarDate), { weekStartsOn: 1 })
    : startOfWeek(calendarDate, { weekStartsOn: 1 });
  const calendarEnd = calendarMode === 'month'
    ? endOfWeek(endOfMonth(calendarDate), { weekStartsOn: 1 })
    : endOfWeek(calendarDate, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const calendarWeeks = useMemo(() => {
    const weeks: Date[][] = [];
    for (let index = 0; index < calendarDays.length; index += 7) {
      weeks.push(calendarDays.slice(index, index + 7));
    }
    return weeks;
  }, [calendarDays]);

  const openEventDetail = (event: Event) => {
    setSelectedEventId(getEventSelectionId(event));
    setEventTab('overview');
  };

  const getApplicationDraftKey = (event: Event) => String(getEventSelectionId(event));
  const getApplicationDraftTimes = (event: Event) => {
    const key = getApplicationDraftKey(event);
    return applicationDraftTimes[key] ?? {
      from: event.startTime || '08:00',
      to: event.endTime || '17:00',
    };
  };
  const updateApplicationDraftTime = (event: Event, field: 'from' | 'to', value: string) => {
    const key = getApplicationDraftKey(event);
    setApplicationDraftTimes((current) => ({
      ...current,
      [key]: {
        ...getApplicationDraftTimes(event),
        [field]: value,
      },
    }));
  };

  const handleApplyForEvent = (event: Event) => {
    if (!currentProfileId) {
      toast.error('Nepodarilo se dohledat prihlaseneho clena crew.');
      return;
    }

    const plannedTimes = event.allowCrewTimeProposal ? getApplicationDraftTimes(event) : undefined;
    void applyForEvent(getEventSelectionId(event), currentProfileId, plannedTimes)
      .then(() => toast.success('Prihlaska na akci byla odeslana ke schvaleni.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Prihlaseni na akci se nepodarilo.');
      });
  };

  const handleWithdrawApplication = (event: Event) => {
    if (!currentProfileId) {
      toast.error('Nepodarilo se dohledat prihlaseneho clena crew.');
      return;
    }

    void withdrawEventApplication(getEventSelectionId(event), currentProfileId)
      .then(() => toast.success('Odhlaseni z akce bylo ulozeno.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Odhlaseni z akce se nepodarilo.');
      });
  };

  const handleRequestEventWithdrawal = (event: Event) => {
    if (!currentProfileId) {
      toast.error('Nepodarilo se dohledat prihlaseneho clena crew.');
      return;
    }

    void requestEventWithdrawal(getEventSelectionId(event), currentProfileId)
      .then(() => toast.success('Zadost o odhlaseni byla odeslana ke schvaleni.'))
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Zadost o odhlaseni se nepodarila.');
      });
  };

  const revealAllEventsForDateNavigation = useCallback(() => {
    if (eventFilter === 'upcoming') {
      setEventsFilter('all');
    }
  }, [eventFilter, setEventsFilter]);

  const moveCalendar = (direction: 'prev' | 'next') => {
    const nextDate = calendarMode === 'month'
      ? (direction === 'next' ? addMonths(calendarDate, 1) : subMonths(calendarDate, 1))
      : (direction === 'next' ? addWeeks(calendarDate, 1) : subWeeks(calendarDate, 1));

    revealAllEventsForDateNavigation();
    setEventsCalendarDate(format(nextDate, 'yyyy-MM-dd'));
  };

  const moveSelectedMonth = (direction: 'prev' | 'next') => {
    const nextDate = direction === 'next' ? addMonths(calendarDate, 1) : subMonths(calendarDate, 1);
    revealAllEventsForDateNavigation();
    setEventsCalendarDate(format(startOfMonth(nextDate), 'yyyy-MM-dd'));
  };

  if (selectedEventId && selectedEvent) {
    return <EventDetailView />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="nodu-dashboard-kicker">Event Planner</div>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Akce</h1>
              <div className="flex items-center rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
                {[
                  { id: 'list' as const, label: 'Seznam', icon: List },
                  { id: 'calendar' as const, label: 'Kalendar', icon: CalendarDays },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setEventsViewMode(item.id)}
                    className={`flex items-center gap-1.5 rounded-[14px] px-3 py-2 text-xs font-medium transition-all ${viewMode === item.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
                  >
                    <item.icon size={14} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'upcoming' as const, label: 'Nadchazejici' },
              { id: 'past' as const, label: 'Uplynule' },
              { id: 'all' as const, label: 'Vse' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setEventsFilter(item.id)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  eventFilter === item.id
                    ? 'border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]'
                    : 'border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] text-[color:var(--nodu-text-soft)] hover:border-[color:rgb(var(--nodu-accent-rgb)/0.18)] hover:text-[color:var(--nodu-text)]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <span className="text-[11px] font-medium text-[color:var(--nodu-text-soft)]">
              {listVisibleEvents.length} akci
            </span>
          </div>
        </div>

        <div className="justify-self-center lg:mt-[38px]">
          {viewMode === 'list' && (
            <div className="flex w-fit items-center rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.96)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.06)]">
              <button
                aria-label="Predchozi mesic"
                onClick={() => moveSelectedMonth('prev')}
                className="rounded-[14px] p-1.5 text-[color:var(--nodu-text-soft)] hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] hover:text-[color:var(--nodu-accent)]"
              >
                <ChevronLeft size={13} />
              </button>
              <div className="min-w-[132px] px-2 text-center text-[11px] font-semibold text-[color:var(--nodu-text)]">
                {format(calendarDate, 'LLLL yyyy', { locale: cs })}
              </div>
              <button
                aria-label="Dalsi mesic"
                onClick={() => moveSelectedMonth('next')}
                className="rounded-[14px] p-1.5 text-[color:var(--nodu-text-soft)] hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] hover:text-[color:var(--nodu-accent)]"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 lg:mt-[38px]">
          {viewMode === 'calendar' && (
            <>
              <div className="flex items-center rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
                {[
                  { id: 'month' as const, label: 'Mesic' },
                  { id: 'week' as const, label: 'Tyden' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setEventsCalendarMode(item.id)}
                    className={`rounded-[14px] px-3 py-2 text-xs font-medium transition-all ${calendarMode === item.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.96)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
                <button onClick={() => moveCalendar('prev')} className="rounded-[14px] p-2 text-[color:var(--nodu-text-soft)] hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] hover:text-[color:var(--nodu-accent)]">
                  <ChevronLeft size={14} />
                </button>
                <div className="min-w-[160px] px-2 text-center text-xs font-semibold text-[color:var(--nodu-text)]">
                  {calendarMode === 'month'
                    ? format(calendarDate, 'LLLL yyyy', { locale: cs })
                    : `${format(calendarStart, 'd. M.', { locale: cs })} - ${format(calendarEnd, 'd. M. yyyy', { locale: cs })}`}
                </div>
                <button onClick={() => moveCalendar('next')} className="rounded-[14px] p-2 text-[color:var(--nodu-text-soft)] hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] hover:text-[color:var(--nodu-accent)]">
                  <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}

          {canManageEvents && (
            <Button
              onClick={() => setEditingEvent(createEmptyEvent())}
              size="sm"
              className="text-xs"
            >
              + Nova akce
            </Button>
          )}
        </div>
      </div>

      {hasNoVisibleEventsForView ? (
        <div className="rounded-[28px] border border-dashed border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] px-6 py-12 text-center shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
          <div className="text-sm font-semibold text-[color:var(--nodu-text)]">Pro tento mesic a filtr tu zatim nejsou zadne akce.</div>
          <div className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
            Zkuste prepnout filtr nebo vytvorit novou akci.
          </div>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date} className="space-y-3">
              <div className="flex items-center gap-4 py-4">
                <div className="h-px flex-1 bg-[color:rgb(var(--nodu-text-rgb)/0.1)]"></div>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--nodu-text-soft)]">
                  {new Date(date).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                </span>
                <div className="h-px flex-1 bg-[color:rgb(var(--nodu-text-rgb)/0.1)]"></div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {groupedEventOccurrences[date].map((occurrence) => {
                  const { event, date: occurrenceDate } = occurrence;
                  const eventDetail = getEventDetailData(getEventSelectionId(event));
                  const eventTimelogs: Timelog[] = eventDetail.timelogs;
                  const assignedCrew = eventDetail.crewAssignments.map((assignment) => ({
                    profileId: assignment.contractorProfileId,
                    name: assignment.name,
                    approvalMeta: getEventTimelogApprovalMeta(
                      eventTimelogs.filter((timelog) => timelog.contractorProfileId === assignment.contractorProfileId),
                    ),
                  }));
                  const pendingApplications = (eventDetail.applications ?? [])
                    .filter((application) => application.status === 'pending')
                    .map((application) => {
                      const contractor = eventDetail.contractors.find((item) => item.profileId === application.contractorProfileId);
                      return contractor ? {
                        applicationId: application.id,
                        profileId: application.contractorProfileId,
                        name: contractor.name,
                        plannedFrom: application.plannedFrom,
                        plannedTo: application.plannedTo,
                      } : null;
                    })
                    .filter((item): item is { applicationId: number; profileId: string; name: string; plannedFrom?: string | null; plannedTo?: string | null } => Boolean(item));
                  const withdrawalRequests = (eventDetail.applications ?? [])
                    .filter((application) => application.status === 'withdrawal_requested')
                    .map((application) => {
                      const contractor = eventDetail.contractors.find((item) => item.profileId === application.contractorProfileId);
                      return contractor ? { applicationId: application.id, profileId: application.contractorProfileId, name: contractor.name } : null;
                    })
                    .filter((item): item is { applicationId: number; profileId: string; name: string } => Boolean(item));
                  const visiblePendingApplications = canManageEvents
                    ? pendingApplications
                    : pendingApplications.filter((application) => application.profileId === currentProfileId);
                  const visibleWithdrawalRequests = canManageEvents
                    ? withdrawalRequests
                    : withdrawalRequests.filter((application) => application.profileId === currentProfileId);
                  const hasMyPendingApplication = currentProfileId
                    ? pendingApplications.some((application) => application.profileId === currentProfileId)
                    : false;
                  const hasMyWithdrawalRequest = currentProfileId
                    ? withdrawalRequests.some((application) => application.profileId === currentProfileId)
                    : false;
                  const isMeAssigned = currentProfileId
                    ? assignedCrew.some((contractor) => contractor.profileId === currentProfileId)
                    : false;
                  const totalHours = eventTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
                  const isFullyStaffed = event.needed > 0 && event.filled >= event.needed;
                  const occurrenceTimeLabel = getEventOccurrenceTimeLabel(event, occurrenceDate, eventTimelogs);
                  const occurrenceDateLabel = occurrence.dayCount > 1
                    ? formatDateRange(event.startDate, event.endDate)
                    : formatOccurrenceDate(occurrenceDate);
                  const occurrenceStatusLabel = getOccurrenceStatusLabel(occurrence);
                  const isContinuationOccurrence = occurrence.kind === 'continuation' || occurrence.kind === 'end';
                  const approvalMeta = getEventTimelogApprovalMeta(eventTimelogs);

                  return (
                    <div
                      key={`${event.supabaseId ?? event.id}-${occurrenceDate}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEventDetail(event)}
                      onKeyDown={(keyboardEvent) => {
                        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                          keyboardEvent.preventDefault();
                          openEventDetail(event);
                        }
                      }}
                      className={`relative cursor-pointer overflow-hidden rounded-[28px] border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(var(--nodu-accent-rgb)/0.22)] ${
                        isContinuationOccurrence
                          ? 'border-dashed border-[color:rgb(var(--nodu-text-rgb)/0.16)] bg-[color:rgb(var(--nodu-text-rgb)/0.035)] shadow-none hover:shadow-[0_12px_28px_rgba(47,38,31,0.06)]'
                          : 'border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)] hover:shadow-[0_22px_48px_rgba(47,38,31,0.12)]'
                      }`}
                    >
                      {canManageEvents && (
                        <button
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            setDeleteConfirm({ type: 'event', id: event.supabaseId ?? event.id, name: event.name });
                          }}
                          className="absolute right-4 top-4 rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] transition-all hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]"
                          title="Smazat akci"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <div className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-4">
                        <div className="grid gap-4 pr-10 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.92fr)]">
                          <div className="min-w-0">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="jn nodu-job-badge px-2 py-0.5 text-[13px] font-semibold">{event.job}</span>
                              {canManageEvents && (
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${approvalMeta.className}`}>
                                  {approvalMeta.label}
                                </span>
                              )}
                              {occurrenceStatusLabel && (
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                  isContinuationOccurrence
                                    ? 'border-[color:rgb(var(--nodu-text-rgb)/0.14)] bg-[color:rgb(var(--nodu-text-rgb)/0.06)] text-[color:var(--nodu-text-soft)]'
                                    : 'border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.1)] text-[color:var(--nodu-accent)]'
                                }`}
                                >
                                  {occurrenceStatusLabel}
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-semibold text-[color:var(--nodu-text)]">{event.name}</h3>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--nodu-text-soft)]">
                              {occurrenceDateLabel} - {occurrenceTimeLabel} - {event.client}
                              {occurrence.dayCount > 1 && (
                                <span className="rounded bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-[color:var(--nodu-text-soft)]">
                                  {formatEventDayCount(occurrence.dayCount)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="hidden min-h-[72px] border-l border-[color:rgb(var(--nodu-text-rgb)/0.1)] pl-6 md:block">
                            {(assignedCrew.length > 0 || visiblePendingApplications.length > 0 || visibleWithdrawalRequests.length > 0) && (
                              <div className="flex min-w-0 flex-wrap content-start items-start justify-start gap-1.5 pt-1">
                                {assignedCrew.map((contractor) => (
                                  <button
                                    key={`${event.id}-${contractor.profileId}`}
                                    type="button"
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation();
                                      setSelectedContractorProfileId(contractor.profileId);
                                      setCurrentTab('crew');
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--nodu-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition hover:bg-[color:var(--nodu-success-bg-hover)]"
                                    title={`Casy: ${contractor.approvalMeta.label}`}
                                  >
                                    {contractor.name}
                                    <span className={`h-2 w-2 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(47,38,31,0.08)] ${contractor.approvalMeta.dotClassName}`} />
                                  </button>
                                ))}
                                {visiblePendingApplications.map((application) => (
                                  <button
                                    key={`${event.id}-application-${application.applicationId}`}
                                    type="button"
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation();
                                      setSelectedContractorProfileId(application.profileId);
                                      setCurrentTab('crew');
                                    }}
                                    className="rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.16)] bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--nodu-text)] transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.12)]"
                                    title={application.plannedFrom && application.plannedTo ? `Ceka na schvaleni, plan ${application.plannedFrom} - ${application.plannedTo}` : 'Ceka na schvaleni'}
                                  >
                                    {application.name}
                                    {application.plannedFrom && application.plannedTo ? ` · ${application.plannedFrom}-${application.plannedTo}` : ''}
                                  </button>
                                ))}
                                {visibleWithdrawalRequests.map((application) => (
                                  <button
                                    key={`${event.id}-withdrawal-${application.applicationId}`}
                                    type="button"
                                    onClick={(clickEvent) => {
                                      clickEvent.stopPropagation();
                                      setSelectedContractorProfileId(application.profileId);
                                      setCurrentTab('crew');
                                    }}
                                    className="rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.16)] bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--nodu-text-soft)] transition hover:bg-[color:rgb(var(--nodu-text-rgb)/0.12)]"
                                    title="Zadost o odhlaseni"
                                  >
                                    {application.name} · odhlaseni
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-5 px-4 py-3">
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Crew obsazeni</div>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-20 overflow-hidden rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)]">
                              <div
                                className={`h-full rounded-full ${isFullyStaffed ? 'bg-[color:var(--nodu-success-text)]' : 'bg-[color:var(--nodu-accent)]'}`}
                                style={{ width: `${Math.min(100, Math.round((event.filled / event.needed) * 100))}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-[color:var(--nodu-text)]">{event.filled}/{event.needed}</span>
                          </div>
                        </div>
                        {canManageEvents && (
                          <div>
                            <div className="mb-1 text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Crew hodiny celkem</div>
                            <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{eventTimelogs.length} timelogy · {totalHours.toFixed(1)} h</div>
                          </div>
                        )}
                        <div className="ml-auto flex gap-2">
                          {canManageEvents && (
                            <>
                              <Button
                                aria-label="Kopirovat akci na jiny den"
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  setEditingEvent(createEventCopy(event));
                                }}
                                variant="outline"
                                size="sm"
                                className="text-[11px]"
                              >
                                <Copy size={13} />
                                Kopirovat
                              </Button>
                              <Button
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  setAssigningEvent(event);
                                }}
                                variant="outline"
                                size="sm"
                                className="text-[11px]"
                              >
                                Obsadit crew {'->'}
                              </Button>
                            </>
                          )}
                          {role === 'crew' && !isMeAssigned && !hasMyPendingApplication && (
                            event.allowCrewTimeProposal ? (
                              <div
                                className="flex items-center gap-1 rounded-xl border border-[color:var(--nodu-border)] bg-white px-2 py-1"
                                onClick={(clickEvent) => clickEvent.stopPropagation()}
                              >
                                <input
                                  type="time"
                                  value={getApplicationDraftTimes(event).from}
                                  onChange={(changeEvent) => updateApplicationDraftTime(event, 'from', changeEvent.target.value)}
                                  className="w-20 bg-transparent text-[11px] font-semibold text-[color:var(--nodu-text)] outline-none"
                                  aria-label="Planovany prichod"
                                />
                                <span className="text-[color:var(--nodu-text-soft)]">-</span>
                                <input
                                  type="time"
                                  value={getApplicationDraftTimes(event).to}
                                  onChange={(changeEvent) => updateApplicationDraftTime(event, 'to', changeEvent.target.value)}
                                  className="w-20 bg-transparent text-[11px] font-semibold text-[color:var(--nodu-text)] outline-none"
                                  aria-label="Planovany odchod"
                                />
                              </div>
                            ) : null
                          )}
                          {role === 'crew' && !isMeAssigned && !hasMyPendingApplication && (
                            <Button
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                handleApplyForEvent(event);
                              }}
                              variant="outline"
                              size="sm"
                              className="text-[11px]"
                            >
                              Prihlasit na akci
                            </Button>
                          )}
                          {role === 'crew' && hasMyPendingApplication && (
                            <Button
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                handleWithdrawApplication(event);
                              }}
                              variant="outline"
                              size="sm"
                              className="text-[11px]"
                            >
                              Odhlasit se z akce
                            </Button>
                          )}
                          {role === 'crew' && isMeAssigned && !hasMyWithdrawalRequest && (
                            <Button
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                handleRequestEventWithdrawal(event);
                              }}
                              variant="outline"
                              size="sm"
                              className="text-[11px]"
                            >
                              Pozadat o odhlaseni
                            </Button>
                          )}
                          {role === 'crew' && hasMyWithdrawalRequest && (
                            <span className="rounded-full border border-[color:rgb(var(--nodu-text-rgb)/0.14)] bg-[color:rgb(var(--nodu-text-rgb)/0.07)] px-3 py-2 text-[11px] font-semibold text-[color:var(--nodu-text-soft)]">
                              Odhlaseni ceka na schvaleni
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
          <div className="grid grid-cols-7 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.94)]">
            {['Po', 'Ut', 'St', 'Ct', 'Pa', 'So', 'Ne'].map((dayLabel) => (
              <div key={dayLabel} className="border-r border-[color:rgb(var(--nodu-text-rgb)/0.08)] px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-[color:var(--nodu-text-soft)] last:border-r-0">
                {dayLabel}
              </div>
            ))}
          </div>

          <div className="divide-y divide-[color:rgb(var(--nodu-text-rgb)/0.08)]">
            {calendarWeeks.map((weekDays, weekIndex) => {
              const segments = buildWeekSegments(weekDays, visibleEvents);
              const rowHeight = getWeekRowHeight(segments);

              return (
                <div key={`${calendarMode}-${weekIndex}`} className="relative" style={{ height: `${rowHeight}px` }}>
                  <div className="grid h-full grid-cols-7">
                    {weekDays.map((day) => {
                      const dayKey = format(day, 'yyyy-MM-dd');
                      const dayEvents = visibleEvents.filter((event) => eventOccursOnDate(event, dayKey));
                      const isCurrentMonth = isSameMonth(day, calendarDate);

                      return (
                        <div key={dayKey} className={`relative border-r border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-3 last:border-r-0 ${isCurrentMonth || calendarMode === 'week' ? 'bg-[color:rgb(var(--nodu-surface-rgb)/0.98)]' : 'bg-[color:rgb(var(--nodu-text-rgb)/0.03)]'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isCurrentMonth || calendarMode === 'week' ? 'text-[color:var(--nodu-text)]' : 'text-[color:rgb(var(--nodu-text-rgb)/0.4)]'}`}>
                              {format(day, calendarMode === 'month' ? 'd.' : 'EEE d.', { locale: cs })}
                            </span>
                            {dayEvents.length > 0 && (
                              <span className="rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--nodu-text-soft)]">
                                {dayEvents.length}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 top-11 bottom-0 px-2 pb-2">
                    {segments.map((segment) => {
                      const width = ((segment.endIndex - segment.startIndex + 1) / 7) * 100;
                      const left = (segment.startIndex / 7) * 100;
                      const spanDays = segment.endIndex - segment.startIndex + 1;
                      const eventColor = eventColorMap.get(segment.event.id) || getEventColorStyle(segment.event.id, segment.event.derivedStatus);

                      return (
                        <button
                          key={`${segment.event.id}-${segment.startIndex}-${segment.endIndex}`}
                          onClick={() => openEventDetail(segment.event)}
                          className="pointer-events-auto absolute h-12 overflow-hidden rounded-lg border text-left transition-all hover:shadow-sm"
                          style={{
                            left: `calc(${left}% + 6px)`,
                            width: `calc(${width}% - 12px)`,
                            top: `${segment.lane * 58}px`,
                            backgroundColor: eventColor.backgroundColor,
                            borderColor: eventColor.borderColor,
                          }}
                        >
                          <div
                            className="grid h-full w-full"
                            style={{ gridTemplateColumns: `repeat(${spanDays}, minmax(0, 1fr))` }}
                          >
                            {Array.from({ length: spanDays }).map((_, dayOffset) => (
                              <div
                                key={`${segment.event.id}-${dayOffset}`}
                                className="flex min-w-0 items-start gap-2 px-2 py-2"
                                style={{
                                  borderRight: dayOffset < spanDays - 1 ? `1px solid ${eventColor.borderColor}` : 'none',
                                }}
                              >
                                <span
                                  className="mt-0.5 h-7 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: eventColor.stripeColor }}
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-[11px] font-bold leading-tight" style={{ color: eventColor.textColor }}>
                                    {segment.event.name}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-2 text-[10px] font-medium" style={{ color: eventColor.metaColor }}>
                                    <span>{segment.event.job}</span>
                                    <span className="font-semibold">{segment.event.filled}/{segment.event.needed}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EventEditModal
        editingEvent={editingEvent}
        onClose={() => setEditingEvent(null)}
        onChange={setEditingEvent}
      />
      <AssignCrewModal
        event={assigningEvent}
        onClose={() => setAssigningEvent(null)}
      />
    </motion.div>
  );
};

export default EventsView;
