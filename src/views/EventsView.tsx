import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Link2, List } from 'lucide-react';
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
import { useIsMobile } from '../hooks/use-mobile';
import { Event } from '../types';
import type { SelectedEventId } from '../context/app-context';
import { eventOccursOnDate } from '../utils';
import { resolveEventScheduleDay } from '../features/events/services/event-schedule';
import { Button } from '../components/ui/button';
import EventDetailView from './EventDetailView';
import EventEditModal from '../components/modals/EventEditModal';
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
import EventListCard, { getListOccurrencesForEvent, getStableEventColorTone, type EventListOccurrence } from '../features/events/components/EventListCard';
import { EventShiftWorkflowCreateAction } from '../features/shift-workflows/EventShiftWorkflowManagement';
import { MobileEventShiftWorkflowSelection, type MobileWorkflowSelectionState } from '../features/shift-workflows/MobileEventShiftWorkflowSelection';
import { captureCardScrollPosition, restoreCardScrollPosition, useShiftWorkflowCardScroll, type CardScrollPosition } from '../features/shift-workflows/useShiftWorkflowCardScroll';
import { useShiftWorkflowVisualViewport } from '../features/shift-workflows/useShiftWorkflowVisualViewport';
import { cardTimelineOccurrences, previousTimelineWeek, type CardTimeline } from '../features/shift-workflows/shift-workflow-card-timeline';
import { shiftWorkflowEventId } from '../features/shift-workflows/shift-workflows.selection';

type EventsViewMode = 'list' | 'calendar';
type CalendarMode = 'month' | 'week';
type CalendarEvent = Event & {
  derivedStatus: 'upcoming' | 'full' | 'past';
};

type CalendarSegment = {
  event: CalendarEvent;
  startIndex: number;
  endIndex: number;
  lane: number;
};

type EventColorStyle = {
  backgroundColor: string;
  borderColor: string;
  stripeColor: string;
  textColor: string;
  metaColor: string;
};

type MobileCrewEventFilter = 'all' | 'open' | 'assigned' | 'pending' | 'full';

const EVENT_FILTER_OPTIONS = [
  { id: 'upcoming' as const, label: 'Nadchazejici' },
  { id: 'past' as const, label: 'Uplynule' },
  { id: 'all' as const, label: 'Vse' },
];

const MOBILE_CREW_EVENT_FILTER_OPTIONS = [
  { id: 'all' as const, label: 'Vse' },
  { id: 'open' as const, label: 'Volne' },
  { id: 'assigned' as const, label: 'Moje akce' },
  { id: 'pending' as const, label: 'Cekam' },
  { id: 'full' as const, label: 'Obsazeno' },
];

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

const getEventColorStyle = (event: Event, status: CalendarEvent['derivedStatus']): EventColorStyle => {
  const tone = getStableEventColorTone(event);

  if (status === 'past') {
    return {
      backgroundColor: '#f7f5f2',
      borderColor: '#ded8d1',
      stripeColor: tone.accentColor,
      textColor: '#4f4740',
      metaColor: '#7a6f66',
    };
  }

  return {
    backgroundColor: tone.backgroundColor,
    borderColor: tone.borderColor,
    stripeColor: tone.accentColor,
    textColor: tone.textColor,
    metaColor: tone.metaColor,
  };
};

const eventOverlapsDateRange = (event: Event, startDate: string, endDate: string) => (
  event.startDate <= endDate && event.endDate >= startDate
);

const getTodayDateKey = () => format(new Date(), 'yyyy-MM-dd');

const MOBILE_CREW_DATE_PICKER_WEEKDAYS = ['PO', 'UT', 'ST', 'CT', 'PA', 'SO', 'NE'];

const getSafeDateFromKey = (dateKey: string | null | undefined, fallback: Date) => {
  if (!dateKey) return fallback;

  const parsedDate = parseISO(dateKey);
  return isValid(parsedDate) ? parsedDate : fallback;
};

const getEventSelectionId = (event: Event): SelectedEventId => event.supabaseId ?? event.id;

const isEventFullyStaffed = (event: Event) => event.needed > 0 && event.filled >= event.needed;

const getMobileCrewEventState = (event: Event, currentProfileId?: string | null) => {
  const eventDetail = getEventDetailData(getEventSelectionId(event));
  const isAssigned = currentProfileId
    ? eventDetail.crewAssignments.some((assignment) => assignment.contractorProfileId === currentProfileId)
    : false;
  const hasPendingApplication = currentProfileId
    ? (eventDetail.applications ?? []).some((application) => (
      application.contractorProfileId === currentProfileId && application.status === 'pending'
    ))
    : false;

  return {
    hasPendingApplication,
    isAssigned,
    isFullyStaffed: isEventFullyStaffed(event),
  };
};

const isEventVisibleFromMobileDate = (
  event: Event,
  role: 'crew' | 'crewhead' | 'coo',
  currentProfileId: string | null | undefined,
  startDate: string,
) => {
  if (role !== 'crew') return event.endDate >= startDate;
  if (event.startDate >= startDate) return true;
  if (event.endDate < startDate) return false;

  const { hasPendingApplication, isAssigned } = getMobileCrewEventState(event, currentProfileId);
  return isAssigned || hasPendingApplication;
};

const matchesMobileCrewEventFilter = (
  event: Event,
  currentProfileId: string | null | undefined,
  filter: MobileCrewEventFilter,
) => {
  if (filter === 'all') return true;

  const { hasPendingApplication, isAssigned, isFullyStaffed } = getMobileCrewEventState(event, currentProfileId);

  if (filter === 'open') return !isFullyStaffed;
  if (filter === 'assigned') return isAssigned;
  if (filter === 'pending') return hasPendingApplication;
  return isFullyStaffed;
};

type CapturedEventsPresentation = {
  events: Event[];
  details: Map<SelectedEventId, ReturnType<typeof getEventDetailData>>;
};

const EventsOverview = ({ selection = null }: { selection?: MobileWorkflowSelectionState | null }) => {
  const {
    role,
    setCurrentTab,
    selectedEventId,
    setSelectedEventId,
    setSelectedContractorProfileId,
    searchQuery,
    setSearchQuery,
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
  const isMobile = useIsMobile();
  const eventsQuery = useEventsQuery();
  const timelogsQuery = useTimelogsQuery();
  void timelogsQuery.data;
  const [didInitCalendarDate, setDidInitCalendarDate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [applicationDraftTimes, setApplicationDraftTimes] = useState<Record<string, { from: string; to: string }>>({});
  const canManageEvents = role !== 'crew';
  const viewMode = eventsViewMode as EventsViewMode;
  const canUseCalendarView = !isMobile;
  const effectiveViewMode: EventsViewMode = isMobile ? 'list' : viewMode;
  const isMobileEventFeed = isMobile && effectiveViewMode === 'list';
  const isMobileCrewEventFeed = isMobileEventFeed && role === 'crew';
  const calendarMode = eventsCalendarMode as CalendarMode;
  const selectionActive = Boolean(selection?.active);
  const [selectionFilter, setSelectionFilter] = useState<EventFilter>('all');
  const eventFilter = selectionActive ? selectionFilter : eventsFilter as EventFilter;
  const todayDateKey = getTodayDateKey();
  const [showMobileDatePicker, setShowMobileDatePicker] = useState(false);
  const [showMobileCrewFilters, setShowMobileCrewFilters] = useState(false);
  const [mobileListStartDate, setMobileListStartDate] = useState(() => getTodayDateKey());
  const [mobilePickerMonthDate, setMobilePickerMonthDate] = useState(() => getTodayDateKey());
  const [mobileCrewFilter, setMobileCrewFilter] = useState<MobileCrewEventFilter>('all');
  const [presentation, setPresentation] = useState<CapturedEventsPresentation | null>(null);
  const [selectionTimeline, setSelectionTimeline] = useState<CardTimeline>(() => ({ anchorDate: todayDateKey, startDate: todayDateKey, query: '' }));
  const [searchAllPresentation, setSearchAllPresentation] = useState(false);
  const mobileViewDate = selectionActive ? selectionTimeline.anchorDate : mobileListStartDate;
  const overview = useRef<HTMLDivElement>(null);
  const entryPosition = useRef<CardScrollPosition | null>(null);
  const entryPreferences = useRef<{ date: string; filter: EventFilter; query: string; calendarDate: string } | null>(null);
  const restoreEntry = useRef(false);
  const summaryPosition = useRef<CardScrollPosition | null>(null);
  const previousSelection = useRef({ active: false, summary: false });
  const displayEvents = useMemo(() => selectionActive && presentation ? presentation.events : eventsQuery.data ?? [], [selectionActive, presentation, eventsQuery.data]);
  const displayQuery = selectionActive ? selectionTimeline.query : searchQuery;
  const allPresentationDates = useMemo(() => selectionActive ? cardTimelineOccurrences(displayEvents.map((event) => ({ id: String(getEventSelectionId(event)), event })),
    { anchorDate: '', startDate: '0001-01-01', query: '' }).map(({ date }) => date) : [], [displayEvents, selectionActive]);
  const cardScroll = useShiftWorkflowCardScroll({ container: overview, active: selectionActive && !selection?.summary, entryMode: 'preserve', preserveLayout: true,
    query: selectionTimeline.query, anchorDate: selectionTimeline.anchorDate, startDate: selectionTimeline.startDate,
    onExpand: () => {
      if (!allPresentationDates.some((date) => date < selectionTimeline.startDate)) return false;
      setSelectionTimeline((current) => ({ ...current, startDate: previousTimelineWeek(current.startDate) })); return true;
    } });
  useShiftWorkflowVisualViewport({ container: overview, active: selectionActive && !selection?.summary });
  const { rememberLayout } = cardScroll;
  useLayoutEffect(() => {
    const before = previousSelection.current;
    const frame = overview.current?.closest<HTMLElement>('.nodu-page-frame');
    if (!before.active && selectionActive && frame && entryPosition.current && overview.current) {
      restoreCardScrollPosition(frame, entryPosition.current, overview.current);
      rememberLayout();
    } else if (before.active && !selectionActive) {
      restoreEntry.current = true;
      const entry = entryPreferences.current;
      if (entry) {
        setMobileListStartDate(entry.date); setMobilePickerMonthDate(entry.date);
        if (eventsFilter !== entry.filter) setEventsFilter(entry.filter);
        if (searchQuery !== entry.query) setSearchQuery(entry.query);
        if (eventsCalendarDate !== entry.calendarDate) setEventsCalendarDate(entry.calendarDate);
      }
      setPresentation(null); setShowMobileDatePicker(false);
    } else if (before.summary && !selection?.summary && selectionActive && frame && summaryPosition.current && overview.current) {
      restoreCardScrollPosition(frame, summaryPosition.current, overview.current);
      rememberLayout();
    }
    const entry = entryPreferences.current;
    if (!selectionActive && restoreEntry.current && entry && mobileListStartDate === entry.date
      && eventsFilter === entry.filter && searchQuery === entry.query && eventsCalendarDate === entry.calendarDate) {
      if (frame && entryPosition.current && overview.current) restoreCardScrollPosition(frame, entryPosition.current, overview.current);
      restoreEntry.current = false;
    }
    previousSelection.current = { active: selectionActive, summary: Boolean(selection?.summary) };
  }, [selectionActive, selection?.summary, mobileListStartDate, eventsFilter, searchQuery, eventsCalendarDate, setEventsFilter, setEventsCalendarDate, setSearchQuery, rememberLayout]);
  const openSelection = () => {
    if (!selection || selection.active) return;
    const frame = overview.current?.closest<HTMLElement>('.nodu-page-frame');
    entryPosition.current = frame && overview.current ? captureCardScrollPosition(frame, overview.current) : null;
    entryPreferences.current = { date: mobileListStartDate, filter: eventsFilter as EventFilter, query: searchQuery, calendarDate: eventsCalendarDate };
    const capturedEvents = structuredClone(eventsQuery.data ?? []);
    const details = new Map(capturedEvents.map((event) => [getEventSelectionId(event), structuredClone(getEventDetailData(getEventSelectionId(event)))]));
    setPresentation({ events: capturedEvents, details });
    setSelectionFilter(eventsFilter as EventFilter);
    setSelectionTimeline({ anchorDate: mobileListStartDate, startDate: mobileListStartDate, query: searchQuery });
    setSearchAllPresentation(false); cardScroll.rememberWindow();
    setShowMobileDatePicker(false); selection.open();
  };
  const changeSelectionQuery = (query: string) => {
    if (!searchAllPresentation && query.trim()) cardScroll.rememberWindow();
    if (selectionTimeline.query.trim() && !query.trim()) cardScroll.restoreWindow();
    setSearchAllPresentation(Boolean(query.trim()));
    setSelectionTimeline((current) => ({ ...current, query }));
  };
  const selectedEvent = useMemo(
    () => (eventsQuery.data ?? []).find((event) => (
      selectedEventId == null
        ? false
        : getEventSelectionId(event) === selectedEventId || event.id === selectedEventId
    )) ?? null,
    [eventsQuery.data, selectedEventId],
  );
  const isMobileEventDetailOpen = Boolean(isMobile && selectedEventId && selectedEvent);
  const events = useMemo(() => {
    const safeEvents = displayEvents;
    const query = displayQuery.trim().toLowerCase();

    if (!query) return safeEvents;

    return safeEvents.filter((event) => (
      event.name.toLowerCase().includes(query) || event.job.toLowerCase().includes(query)
    ));
  }, [displayEvents, displayQuery]);

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

  const effectiveEventFilter: EventFilter = isMobileCrewEventFeed ? 'all' : eventFilter;
  const visibleEvents = useMemo(() => (
    filterEventsByStatus(eventsWithDerivedStatus, effectiveEventFilter)
  ), [effectiveEventFilter, eventsWithDerivedStatus]);

  const selectedMonthStart = format(startOfMonth(calendarDate), 'yyyy-MM-dd');
  const selectedMonthEnd = format(endOfMonth(calendarDate), 'yyyy-MM-dd');
  const monthVisibleEvents = useMemo(() => (
    visibleEvents.filter((event) => eventOverlapsDateRange(event, selectedMonthStart, selectedMonthEnd))
  ), [selectedMonthEnd, selectedMonthStart, visibleEvents]);
  const listVisibleEvents = useMemo(() => {
    if (effectiveViewMode !== 'list') return visibleEvents;

    if (isMobileEventFeed) {
      return visibleEvents
        .filter((event) => (
          isEventVisibleFromMobileDate(event, role, currentProfileId, selectionActive ? (searchAllPresentation ? '0001-01-01' : selectionTimeline.startDate) : mobileListStartDate)
          || (isMobileEventDetailOpen && selectedEventId != null && getEventSelectionId(event) === selectedEventId)
        ))
        .filter((event) => (
          !isMobileCrewEventFeed
          || matchesMobileCrewEventFilter(event, currentProfileId, mobileCrewFilter)
        ))
        .sort((a, b) => (
          a.startDate.localeCompare(b.startDate)
          || a.name.localeCompare(b.name)
        ));
    }

    return monthVisibleEvents;
  }, [currentProfileId, effectiveViewMode, isMobileCrewEventFeed, isMobileEventDetailOpen, isMobileEventFeed, mobileCrewFilter, mobileListStartDate, monthVisibleEvents, role, selectedEventId, visibleEvents, selectionActive, selectionTimeline, searchAllPresentation]);
  const listRangeStart = isMobileEventFeed ? (selectionActive ? (searchAllPresentation ? '0001-01-01' : selectionTimeline.startDate) : mobileListStartDate) : selectedMonthStart;
  const listRangeEnd = isMobileEventFeed ? '9999-12-31' : selectedMonthEnd;
  const mobilePickerDate = useMemo(
    () => getSafeDateFromKey(mobilePickerMonthDate, getSafeDateFromKey(mobileViewDate, new Date())),
    [mobileViewDate, mobilePickerMonthDate],
  );
  const mobilePickerStart = startOfWeek(startOfMonth(mobilePickerDate), { weekStartsOn: 1 });
  const mobilePickerEnd = endOfWeek(endOfMonth(mobilePickerDate), { weekStartsOn: 1 });
  const mobilePickerDays = useMemo(
    () => eachDayOfInterval({ start: mobilePickerStart, end: mobilePickerEnd }),
    [mobilePickerStart, mobilePickerEnd],
  );

  const eventColorMap = useMemo(() => (
    new Map(
      visibleEvents.map((event) => [
        getEventSelectionId(event),
        getEventColorStyle(event, event.derivedStatus),
      ]),
    )
  ), [visibleEvents]);

  const groupedEventOccurrences = useMemo(() => (
    listVisibleEvents.reduce((acc, event) => {
      getListOccurrencesForEvent(
        event,
        canManageEvents,
        isMobileEventFeed ? mobileListStartDate : undefined,
      ).forEach((occurrence) => {
        const isSelectedOccurrence = isMobileEventDetailOpen
          && selectedEventId != null
          && getEventSelectionId(occurrence.event) === selectedEventId;
        if (!isSelectedOccurrence && (occurrence.date < listRangeStart || occurrence.date > listRangeEnd)) return;
        if (!acc[occurrence.date]) acc[occurrence.date] = [];
        acc[occurrence.date].push(occurrence);
      });
      return acc;
    }, {} as Record<string, EventListOccurrence[]>)
  ), [canManageEvents, isMobileEventDetailOpen, isMobileEventFeed, listRangeEnd, listRangeStart, listVisibleEvents, mobileListStartDate, selectedEventId]);

  const sortedDates = Object.keys(groupedEventOccurrences).sort();
  const historyStart = selectionActive && !selectionTimeline.query.trim() && selectionTimeline.startDate < selectionTimeline.anchorDate ? selectionTimeline.startDate : null;
  if (historyStart && !sortedDates.includes(historyStart)) sortedDates.unshift(historyStart);
  const hasNoVisibleEventsForView = effectiveViewMode === 'list'
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
    if (event.scheduleVersion === 2) {
      const day = resolveEventScheduleDay(event.startDate, event);
      return applicationDraftTimes[key] ?? { from: day.f, to: day.t };
    }
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

  const toggleMobileDatePicker = () => {
    setShowMobileCrewFilters(false);
    setMobilePickerMonthDate(mobileViewDate);
    setShowMobileDatePicker((isOpen) => !isOpen);
  };

  const updateMobileStartDate = (value: string) => {
    if (!value) return;

    if (selectionActive) {
      cardScroll.jumpToAnchor(); setSelectionTimeline((current) => ({ ...current, anchorDate: value, startDate: value }));
      setMobilePickerMonthDate(value); setShowMobileDatePicker(false); return;
    }
    setMobileListStartDate(value);
    setMobilePickerMonthDate(value);
    setShowMobileDatePicker(false);
    setEventsCalendarDate(value);
  };

  const resetMobileStartDate = () => {
    if (selectionActive) { updateMobileStartDate(todayDateKey); return; }
    setMobileListStartDate(todayDateKey);
    setMobilePickerMonthDate(todayDateKey);
    setShowMobileDatePicker(false);
    setEventsCalendarDate(todayDateKey);
  };

  if (selectedEventId && selectedEvent && !isMobile) {
    return <EventDetailView />;
  }

  const normalView = (createAction: React.ReactNode) => (
    <motion.div ref={overview} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={selectionActive ? 'nodu-workflow-selection nodu-mobile-workflow-selection' : undefined} data-workflow-start-date={selectionActive ? selectionTimeline.startDate : undefined}>
      <div data-workflow-toolbar-space={selectionActive ? '' : undefined} className={selectionActive ? 'nodu-workflow-selection__toolbar-space' : undefined}>
      <div data-workflow-toolbar={selectionActive ? '' : undefined} className={isMobileEventFeed ? `nodu-mobile-events-toolbar${selectionActive ? ' nodu-mobile-workflow-selection__toolbar' : ''}` : 'mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start'}>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {isMobileEventFeed ? (
            <div className="nodu-mobile-events-header">
              <button
                type="button"
                aria-label="Vybrat datum akci"
                className={`nodu-mobile-events-header__action nodu-mobile-events-header__action--left ${showMobileDatePicker ? 'nodu-mobile-events-header__action--active' : ''}`}
                aria-pressed={showMobileDatePicker}
                onClick={toggleMobileDatePicker}
              >
                <CalendarDays size={18} />
              </button>
              <h1 className="nodu-mobile-events-header__title">Akce</h1>
              {isMobileCrewEventFeed ? <button
                type="button"
                aria-label="Filtrovat akce"
                aria-pressed={showMobileCrewFilters}
                className={`nodu-mobile-events-header__action nodu-mobile-events-header__action--right ${showMobileCrewFilters ? 'nodu-mobile-events-header__action--active' : ''}`}
                onClick={() => {
                  setShowMobileDatePicker(false);
                  setShowMobileCrewFilters((isOpen) => !isOpen);
                }}
              >
                <Filter size={18} />
              </button> : selection && !selectedEventId ? <button type="button" aria-label="Propojit směny" aria-pressed={selectionActive}
                className={`nodu-mobile-events-header__action nodu-mobile-events-header__action--right ${selectionActive ? 'nodu-mobile-events-header__action--active' : ''}`}
                disabled={selection.draft.busy} onClick={selectionActive ? selection.close : openSelection}><Link2 size={18} /></button> : <span className="nodu-mobile-events-header__action--right" />}
            </div>
          ) : (
            <div>
              <div className="nodu-dashboard-kicker">Event Planner</div>
              <div className="mt-1 flex flex-wrap items-center gap-4">
                {isMobileEventFeed && (
                  <button
                    type="button"
                    aria-label="Vybrat datum akci"
                    aria-pressed={showMobileDatePicker}
                    onClick={toggleMobileDatePicker}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.96)] text-[color:var(--nodu-text-soft)] shadow-[0_12px_28px_rgba(47,38,31,0.08)] ${
                      showMobileDatePicker
                        ? 'border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]'
                        : ''
                    }`}
                  >
                    <CalendarDays size={18} />
                  </button>
                )}
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Akce</h1>
                {canUseCalendarView && <div className="flex items-center rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgba(47,38,31,0.08)]">
                  {[
                    { id: 'list' as const, label: 'Seznam', icon: List },
                    ...(canUseCalendarView ? [{ id: 'calendar' as const, label: 'Kalendar', icon: CalendarDays }] : []),
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setEventsViewMode(item.id)}
                      className={`flex items-center gap-1.5 rounded-[14px] px-3 py-2 text-xs font-medium transition-all ${effectiveViewMode === item.id ? 'bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)] shadow-[inset_0_0_0_1px_rgba(255,128,13,0.16)]' : 'text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)]'}`}
                    >
                      <item.icon size={14} />
                      {item.label}
                    </button>
                  ))}
                </div>}
              </div>
            </div>
          )}

          {isMobileEventFeed && showMobileDatePicker && (
            <div
              className="nodu-mobile-events-date-panel"
              role="dialog"
              aria-label="Vyber data od kdy zobrazit akce"
            >
              <div className="nodu-mobile-events-date-panel__bar">
                <button
                  type="button"
                  aria-label="Predchozi mesic vyberu akci"
                  className="nodu-mobile-events-date-panel__nav"
                  onClick={() => setMobilePickerMonthDate(format(subMonths(mobilePickerDate, 1), 'yyyy-MM-dd'))}
                >
                  <ChevronLeft size={15} />
                </button>
                <div className="nodu-mobile-events-date-panel__month">
                  {format(mobilePickerDate, 'LLLL yyyy', { locale: cs })}
                </div>
                <button
                  type="button"
                  aria-label="Dalsi mesic vyberu akci"
                  className="nodu-mobile-events-date-panel__nav"
                  onClick={() => setMobilePickerMonthDate(format(addMonths(mobilePickerDate, 1), 'yyyy-MM-dd'))}
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <button
                type="button"
                className="mb-3 w-full rounded-xl border border-[color:rgb(var(--nodu-accent-rgb)/0.2)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] px-3 py-2 text-xs font-bold text-[color:var(--nodu-accent)]"
                onClick={resetMobileStartDate}
              >
                Dnes a dál
              </button>

              <div className="nodu-mobile-events-date-panel__weekdays" aria-hidden="true">
                {MOBILE_CREW_DATE_PICKER_WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>

              <div className="nodu-mobile-events-date-panel__grid">
                {mobilePickerDays.map((day) => {
                  const dayKey = format(day, 'yyyy-MM-dd');
                  const isSelectedDay = Boolean(mobileViewDate) && dayKey === mobileViewDate;
                  const isToday = dayKey === todayDateKey;

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      aria-label={`Zobrazit akce od ${format(day, 'd. MMMM yyyy', { locale: cs })}`}
                      className={`nodu-mobile-events-date-panel__day ${
                        isSelectedDay ? 'nodu-mobile-events-date-panel__day--selected' : ''
                      } ${isToday ? 'nodu-mobile-events-date-panel__day--today' : ''} ${
                        isSameMonth(day, mobilePickerDate) ? '' : 'nodu-mobile-events-date-panel__day--outside'
                      }`}
                      onClick={() => updateMobileStartDate(dayKey)}
                    >
                      {format(day, 'd.')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isMobileCrewEventFeed && showMobileCrewFilters && (
            <div className="nodu-mobile-events-filter-panel">
              {MOBILE_CREW_EVENT_FILTER_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setMobileCrewFilter(item.id)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                    mobileCrewFilter === item.id
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
          )}

          {!isMobileCrewEventFeed && (
            <div className="flex flex-wrap items-center gap-2">
              {EVENT_FILTER_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => selectionActive ? setSelectionFilter(item.id) : setEventsFilter(item.id)}
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
          )}
          {selectionActive && <label className="nodu-mobile-workflow-selection__search">Hledat směnu nebo jobnumber
            <input type="search" value={selectionTimeline.query} disabled={selection?.draft.locked} onChange={(event) => changeSelectionQuery(event.target.value)} />
          </label>}
        </div>

        <div className="justify-self-center lg:mt-[38px]">
          {effectiveViewMode === 'list' && !isMobileEventFeed && (
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
          {effectiveViewMode === 'calendar' && (
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

          {!isMobile && !selectedEventId && createAction}
          {canManageEvents && !selectionActive && (
            <Button
              onClick={() => setEditingEvent(createEmptyEvent())}
              size="sm"
              className="hidden text-xs md:inline-flex"
            >
              + Nova akce
            </Button>
          )}
        </div>
      </div>
      </div>

      {canManageEvents && !isMobileEventDetailOpen && !selectionActive && (
        <Button
          aria-label="Nova akce"
          title="Nova akce"
          onClick={() => setEditingEvent(createEmptyEvent())}
          size="icon"
          className="nodu-event-mobile-create-fab h-10 w-10 rounded-full text-2xl font-semibold shadow-[0_14px_32px_rgba(255,128,13,0.24)] md:hidden"
        >
          +
        </Button>
      )}

      {hasNoVisibleEventsForView ? (
        <div className="rounded-[28px] border border-dashed border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] px-6 py-12 text-center shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
          <div className="text-sm font-semibold text-[color:var(--nodu-text)]">
            {isMobileEventFeed
              ? 'Od zvoleného data tu zatím nejsou žádné akce.'
              : 'Pro tento mesic a filtr tu zatim nejsou zadne akce.'}
          </div>
          <div className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
            {isMobileCrewEventFeed
              ? 'Chceš zobrazit i starší akce? Klepni na ikonu kalendáře vlevo nahoře a vyber datum, od kterého je chceš vidět.'
              : isMobileEventFeed
              ? 'Nove moznosti se tu objevi automaticky.'
              : 'Zkuste prepnout filtr nebo vytvorit novou akci.'}
          </div>
        </div>
      ) : effectiveViewMode === 'list' ? (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date} className="space-y-3">
              <div className="flex items-center gap-4 py-4" data-workflow-date={date}>
                <div className="h-px flex-1 bg-[color:rgb(var(--nodu-text-rgb)/0.1)]"></div>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[color:var(--nodu-text-soft)]">
                  {new Date(date).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                </span>
                <div className="h-px flex-1 bg-[color:rgb(var(--nodu-text-rgb)/0.1)]"></div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {(groupedEventOccurrences[date] ?? []).map((occurrence) => {
                  const workflowEventId = selectionActive && selection ? (selection.scope.source === 'local'
                    ? shiftWorkflowEventId(occurrence.event, 'local') : occurrence.event.supabaseId ?? `missing:${occurrence.event.id}`) : '';
                  const checked = selection?.draft.eventIds.includes(workflowEventId) ?? false;
                  const reason = selectionActive ? selection?.blockedReason(workflowEventId) ?? null : null;
                  return <EventListCard
                    key={`${occurrence.event.supabaseId ?? occurrence.event.id}-${occurrence.date}`}
                    occurrence={occurrence}
                    canManageEvents={canManageEvents}
                    role={role}
                    currentProfileId={currentProfileId}
                    detail={selectionActive ? presentation?.details.get(getEventSelectionId(occurrence.event)) : undefined}
                    selection={selectionActive && selection ? { checked, disabled: selection.draft.locked || (!checked && Boolean(reason)), reason, onToggle: () => selection.toggle(workflowEventId) } : undefined}
                    onOpen={openEventDetail}
                    onDelete={(event) => setDeleteConfirm({ type: 'event', id: event.supabaseId ?? event.id, name: event.name })}
                    onCopy={(event) => setEditingEvent(createEventCopy(event))}
                    onProfile={(profileId) => { setSelectedContractorProfileId(profileId); setCurrentTab('crew'); }}
                    getApplicationDraftTimes={getApplicationDraftTimes}
                    updateApplicationDraftTime={updateApplicationDraftTime}
                    handleApplyForEvent={handleApplyForEvent}
                    handleWithdrawApplication={handleWithdrawApplication}
                    handleRequestEventWithdrawal={handleRequestEventWithdrawal}
                  />;
                })}
                {historyStart === date && !groupedEventOccurrences[date]?.length && <div className="nodu-mobile-workflow-selection__history-space" aria-hidden="true" />}
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
                      const eventColor = eventColorMap.get(getEventSelectionId(segment.event)) || getEventColorStyle(segment.event, segment.event.derivedStatus);

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

      {selectionActive && selection && <>
        {!selection.summary && <div className="nodu-workflow-selection__bar" aria-label="Výběr směn" data-workflow-bar>
          {selection.readError && <div className="nodu-mobile-workflow-selection__error"><p role="alert">{selection.draft.error ?? 'Propojené směny se nepodařilo načíst. Zkuste načíst data znovu.'}</p>
            <Button type="button" variant="outline" size="sm" disabled={selection.opening || selection.draft.locked} onClick={selection.retry}>Zkusit načíst znovu</Button></div>}
          {selection.draft.impact?.blockedReason && <div className="nodu-mobile-workflow-selection__error"><p role="alert">{selection.draft.impact.blockedReason}</p></div>}
          <p className="font-semibold" aria-live="polite">Vybráno: {selection.draft.eventIds.length}</p>
          <Button type="button" variant="outline" disabled={selection.draft.busy} onClick={selection.close}>Zrušit</Button>
          <Button type="button" disabled={!selection.draft.ready || selection.draft.locked || selection.draft.eventIds.length < 2 || Boolean(selection.draft.impact?.blockedReason)} onClick={() => {
            summaryPosition.current = cardScroll.capture(); selection.continueToSummary();
          }}>Pokračovat</Button>
        </div>}
        {selection.confirmation}
      </>}

      <EventEditModal
        editingEvent={editingEvent}
        onClose={() => setEditingEvent(null)}
        onChange={setEditingEvent}
      />
      {selectedEventId && selectedEvent && isMobile && <EventDetailView />}
    </motion.div>
  );
  if (isMobile) return normalView(null);
  if (selectedEventId) return normalView(null);
  return <EventShiftWorkflowCreateAction>{({ action, selection }) => selection || normalView(action)}</EventShiftWorkflowCreateAction>;
};

const EventsView = () => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileEventShiftWorkflowSelection>{(selection) => <EventsOverview selection={selection} />}</MobileEventShiftWorkflowSelection> : <EventsOverview />;
};

export default EventsView;
