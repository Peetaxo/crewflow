import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { cs } from 'date-fns/locale';
import { useAppContext } from '../context/AppContext';
import { Event } from '../types';
import { calculateTotalHours, eventOccursOnDate, formatDateRange, getDatesBetween, getEventStatus } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import EventDetailView from './EventDetailView';

type EventsViewMode = 'list' | 'calendar';
type CalendarMode = 'month' | 'week';
type EventFilter = 'upcoming' | 'past' | 'all';

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

const getReferenceDate = (events: Event[]) => {
  if (events.length === 0) return new Date();

  const today = new Date().toISOString().split('T')[0];
  const upcoming = [...events]
    .filter((event) => event.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  if (upcoming.length > 0) return parseISO(upcoming[0].startDate);

  const latestPast = [...events].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return parseISO(latestPast[0].startDate);
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
    selectedEventId, setSelectedEventId,
    filteredEvents, timelogs,
    setEditingEvent, setAssigningCrewToEvent, setDeleteConfirm,
    setEventTab, events,
  } = useAppContext();

  const canManageEvents = role !== 'crew';
  const [viewMode, setViewMode] = useState<EventsViewMode>('list');
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [eventFilter, setEventFilter] = useState<EventFilter>('upcoming');
  const [calendarDate, setCalendarDate] = useState<Date>(() => getReferenceDate(filteredEvents));

  const eventsWithDerivedStatus = useMemo(() => (
    filteredEvents.map((event) => ({
      ...event,
      derivedStatus: getEventStatus(event),
    }))
  ), [filteredEvents]);

  const visibleEvents = useMemo(() => (
    eventsWithDerivedStatus.filter((event) => {
      if (eventFilter === 'all') return true;
      if (eventFilter === 'past') return event.derivedStatus === 'past';
      return event.derivedStatus !== 'past';
    })
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
    setCalendarDate((prev) => {
      if (calendarMode === 'month') return direction === 'next' ? addMonths(prev, 1) : subMonths(prev, 1);
      return direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1);
    });
  };

  if (selectedEventId) {
    return <EventDetailView />;
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold">Akce</h1>
            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
              {[
                { id: 'list' as const, label: 'Seznam', icon: List },
                { id: 'calendar' as const, label: 'Kalendar', icon: CalendarDays },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setViewMode(item.id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${viewMode === item.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
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
                onClick={() => setEventFilter(item.id)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  eventFilter === item.id
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
            <span className="text-[11px] font-medium text-gray-400">
              {visibleEvents.length} akci
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'calendar' && (
            <>
              <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
                {[
                  { id: 'month' as const, label: 'Mesic' },
                  { id: 'week' as const, label: 'Tyden' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setCalendarMode(item.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${calendarMode === item.id ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                <button onClick={() => moveCalendar('prev')} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-900">
                  <ChevronLeft size={14} />
                </button>
                <div className="min-w-[160px] px-2 text-center text-xs font-semibold text-gray-700">
                  {calendarMode === 'month'
                    ? format(calendarDate, 'LLLL yyyy', { locale: cs })
                    : `${format(calendarStart, 'd. M.', { locale: cs })} - ${format(calendarEnd, 'd. M. yyyy', { locale: cs })}`}
                </div>
                <button onClick={() => moveCalendar('next')} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-900">
                  <ChevronRight size={14} />
                </button>
              </div>
            </>
          )}

          {canManageEvents && (
            <button
              onClick={() => setEditingEvent({
                id: Math.max(0, ...events.map((event) => event.id)) + 1,
                name: '',
                job: '',
                startDate: '',
                endDate: '',
                startTime: '08:00',
                endTime: '17:00',
                city: '',
                needed: 1,
                filled: 0,
                status: 'upcoming',
                client: '',
                showDayTypes: false,
              })}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
            >
              + Nova akce
            </button>
          )}
        </div>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Pro tento filtr tu zatim nejsou zadne akce.</div>
          <div className="mt-1 text-xs text-gray-500">
            Zkuste prepnout filtr nebo vytvorit novou akci.
          </div>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date} className="space-y-3">
              <div className="flex items-center gap-4 py-4">
                <div className="h-px flex-1 bg-gray-200"></div>
                <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">
                  {new Date(date).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long' })}
                </span>
                <div className="h-px flex-1 bg-gray-200"></div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {groupedEvents[date].map((event) => {
                  const eventTimelogs = timelogs.filter((timelog) => timelog.eid === event.id);
                  const totalHours = eventTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
                  const daysCount = getDatesBetween(event.startDate, event.endDate).length;

                  return (
                    <div key={event.id} className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md">
                      {canManageEvents && (
                        <button
                          onClick={() => setDeleteConfirm({ type: 'event', id: event.id, name: event.name })}
                          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-300 transition-all hover:bg-red-50 hover:text-red-600"
                          title="Smazat akci"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <div className="border-b border-gray-50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="jn px-2 py-0.5 text-[13px] font-semibold">{event.job}</span>
                          <StatusBadge status={event.derivedStatus} />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">{event.name}</h3>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                          {formatDateRange(event.startDate, event.endDate)} · {event.city} · {event.client}
                          {daysCount > 1 && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-gray-600">
                              {daysCount} dny
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-5 px-4 py-3">
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Crew obsazeni</div>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-20 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full ${event.filled >= event.needed ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                style={{ width: `${Math.min(100, Math.round((event.filled / event.needed) * 100))}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold">{event.filled}/{event.needed}</span>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">Timelogy</div>
                          <div className="text-xs font-semibold">{eventTimelogs.length} zaz. · {totalHours.toFixed(1)}h</div>
                        </div>
                        <div className="ml-auto flex gap-2">
                          {canManageEvents && (
                            <button
                              onClick={() => setAssigningCrewToEvent(event)}
                              className="rounded-md border border-gray-200 px-3 py-1 text-[11px] hover:bg-gray-50"
                            >
                              Obsadit crew →
                            </button>
                          )}
                          <button
                            onClick={() => openEventDetail(event.id)}
                            className="rounded-md border border-gray-200 px-3 py-1 text-[11px] hover:bg-gray-50"
                          >
                            Detail
                          </button>
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
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
            {['Po', 'Ut', 'St', 'Ct', 'Pa', 'So', 'Ne'].map((dayLabel) => (
              <div key={dayLabel} className="border-r border-gray-100 px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500 last:border-r-0">
                {dayLabel}
              </div>
            ))}
          </div>

          <div className="divide-y divide-gray-100">
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
                        <div key={dayKey} className={`relative border-r border-gray-100 p-3 last:border-r-0 ${isCurrentMonth || calendarMode === 'week' ? 'bg-white' : 'bg-gray-50/70'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isCurrentMonth || calendarMode === 'week' ? 'text-gray-900' : 'text-gray-400'}`}>
                              {format(day, calendarMode === 'month' ? 'd.' : 'EEE d.', { locale: cs })}
                            </span>
                            {dayEvents.length > 0 && (
                              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
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
                          className="pointer-events-auto absolute h-12 rounded-lg border text-left transition-all hover:shadow-sm overflow-hidden"
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
                                  <div
                                    className="truncate text-[11px] font-bold leading-tight"
                                    style={{ color: eventColor.textColor }}
                                  >
                                    {segment.event.name}
                                  </div>
                                  <div
                                    className="mt-0.5 flex items-center gap-2 text-[10px] font-medium"
                                    style={{ color: eventColor.metaColor }}
                                  >
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
    </motion.div>
  );
};

export default EventsView;
