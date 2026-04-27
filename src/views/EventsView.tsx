import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
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
import { useAppContext } from '../context/AppContext';
import { Event, Timelog } from '../types';
import { calculateTotalHours, eventOccursOnDate, formatDateRange, getDatesBetween } from '../utils';
import { Button } from '../components/ui/button';
import StatusBadge from '../components/shared/StatusBadge';
import EventDetailView from './EventDetailView';
import EventEditModal from '../components/modals/EventEditModal';
import AssignCrewModal from '../components/modals/AssignCrewModal';
import { useEventsQuery } from '../features/events/queries/useEventsQuery';
import {
  createEmptyEvent,
  filterEventsByStatus,
  getEventDetailData,
  getEventsWithDerivedStatus,
  getReferenceDate,
} from '../features/events/services/events.service';
import { EventFilter } from '../features/events/types/events.types';

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

const EventsView = () => {
  const {
    role,
    selectedEventId,
    setSelectedEventId,
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
  const eventsQuery = useEventsQuery();
  const [didInitCalendarDate, setDidInitCalendarDate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [assigningEvent, setAssigningEvent] = useState<Event | null>(null);
  const canManageEvents = role !== 'crew';
  const viewMode = eventsViewMode as EventsViewMode;
  const calendarMode = eventsCalendarMode as CalendarMode;
  const eventFilter = eventsFilter as EventFilter;
  const selectedEvent = useMemo(
    () => (eventsQuery.data ?? []).find((event) => event.id === selectedEventId) ?? null,
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

  const eventColorMap = useMemo(() => (
    new Map(
      [...visibleEvents]
        .sort((a, b) => a.id - b.id)
        .map((event, index) => [event.id, getEventColorStyle(index, event.derivedStatus)]),
    )
  ), [visibleEvents]);

  const groupedEvents = useMemo(() => (
    visibleEvents.reduce((acc, event) => {
      const date = event.startDate;
      if (!acc[date]) acc[date] = [];
      acc[date].push(event);
      return acc;
    }, {} as Record<string, typeof visibleEvents>)
  ), [visibleEvents]);

  const sortedDates = Object.keys(groupedEvents).sort();

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

  const openEventDetail = (eventId: number) => {
    setSelectedEventId(eventId);
    setEventTab('overview');
  };

  const moveCalendar = (direction: 'prev' | 'next') => {
    const nextDate = calendarMode === 'month'
      ? (direction === 'next' ? addMonths(calendarDate, 1) : subMonths(calendarDate, 1))
      : (direction === 'next' ? addWeeks(calendarDate, 1) : subWeeks(calendarDate, 1));

    setEventsCalendarDate(format(nextDate, 'yyyy-MM-dd'));
  };

  if (selectedEventId && selectedEvent) {
    return <EventDetailView />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="nodu-dashboard-kicker">Event Planner</div>
              <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Akce</h1>
            </div>
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
              {visibleEvents.length} akci
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {visibleEvents.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] px-6 py-12 text-center shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
          <div className="text-sm font-semibold text-[color:var(--nodu-text)]">Pro tento filtr tu zatim nejsou zadne akce.</div>
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
                {groupedEvents[date].map((event) => {
                  const eventTimelogs: Timelog[] = getEventDetailData(event.id).timelogs;
                  const totalHours = eventTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
                  const daysCount = getDatesBetween(event.startDate, event.endDate).length;

                  return (
                    <div key={event.id} className="relative overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] shadow-[0_18px_42px_rgba(47,38,31,0.08)] transition-shadow hover:shadow-[0_22px_48px_rgba(47,38,31,0.12)]">
                      {canManageEvents && (
                        <button
                          onClick={() => setDeleteConfirm({ type: 'event', id: event.id, name: event.name })}
                          className="absolute right-4 top-4 rounded-lg p-1.5 text-[color:var(--nodu-text-soft)] transition-all hover:bg-[rgba(212,93,55,0.06)] hover:text-[#c45c39]"
                          title="Smazat akci"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <div className="border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="jn nodu-job-badge px-2 py-0.5 text-[13px] font-semibold">{event.job}</span>
                          <StatusBadge status={event.derivedStatus} />
                        </div>
                        <h3 className="text-base font-semibold text-[color:var(--nodu-text)]">{event.name}</h3>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--nodu-text-soft)]">
                          {formatDateRange(event.startDate, event.endDate)} - {event.city} - {event.client}
                          {daysCount > 1 && (
                            <span className="rounded bg-[color:rgb(var(--nodu-text-rgb)/0.08)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-[color:var(--nodu-text-soft)]">
                              {daysCount} dny
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-5 px-4 py-3">
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Crew obsazeni</div>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-20 overflow-hidden rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)]">
                              <div
                                className={`h-full rounded-full ${event.filled >= event.needed ? 'bg-[color:var(--nodu-accent)]' : 'bg-[#e8b05a]'}`}
                                style={{ width: `${Math.min(100, Math.round((event.filled / event.needed) * 100))}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-[color:var(--nodu-text)]">{event.filled}/{event.needed}</span>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-[color:var(--nodu-text-soft)]">Timelogy</div>
                          <div className="text-xs font-semibold text-[color:var(--nodu-text)]">{eventTimelogs.length} zaz. - {totalHours.toFixed(1)}h</div>
                        </div>
                        <div className="ml-auto flex gap-2">
                          {canManageEvents && (
                            <Button
                              onClick={() => setAssigningEvent(event)}
                              variant="outline"
                              size="sm"
                              className="text-[11px]"
                            >
                              Obsadit crew {'->'}
                            </Button>
                          )}
                          <Button
                            onClick={() => openEventDetail(event.id)}
                            variant="outline"
                            size="sm"
                            className="text-[11px]"
                          >
                            Detail
                          </Button>
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
                          onClick={() => openEventDetail(segment.event.id)}
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
