import { addDays, format, isAfter, parseISO } from 'date-fns';
import type { Event, Timelog, TimelogDay, TimelogType } from '../../../types';

const defaultType: TimelogType = 'provoz';
const fallbackFrom = '08:00';
const fallbackTo = '17:00';

const sortDays = (days: Timelog['days']) => (
  [...days].sort((a, b) => (
    `${a.d}${a.f}${a.t}${a.type}${a.id ?? ''}`.localeCompare(`${b.d}${b.f}${b.t}${b.type}${b.id ?? ''}`)
  ))
);

export const createTimelogDayEntryId = (): string => (
  `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);

export const getTimelogDayEntryKey = (day: TimelogDay, index = 0): string => (
  day.id ?? [
    day.d,
    day.f,
    day.t,
    day.type,
    day.note ?? '',
    index,
  ].join('|')
);

export const buildQuarterHourOptions = (): string[] => (
  Array.from({ length: 24 * 4 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  })
);

export const listEventDates = (event: Pick<Event, 'startDate' | 'endDate'>): string[] => {
  const start = parseISO(event.startDate);
  const end = parseISO(event.endDate || event.startDate);
  const dates: string[] = [];

  for (let day = start; !isAfter(day, end); day = addDays(day, 1)) {
    dates.push(format(day, 'yyyy-MM-dd'));
  }

  return dates;
};

export const isDateInEventRange = (
  date: string,
  event: Pick<Event, 'startDate' | 'endDate'>,
): boolean => listEventDates(event).includes(date);

export const buildTimelogCalendarDates = (
  event: Pick<Event, 'startDate' | 'endDate'>,
  days: TimelogDay[] = [],
): string[] => {
  const dates = new Set(listEventDates(event));

  for (const day of days) {
    dates.add(day.d);
  }

  return [...dates].sort();
};

export const resolveTimelogDayDefaults = (
  date: string,
  event: Event,
  preferredType?: TimelogType,
): TimelogDay => {
  if (!event.showDayTypes) {
    return {
      d: date,
      f: event.startTime || fallbackFrom,
      t: event.endTime || fallbackTo,
      type: 'instal',
      note: '',
    };
  }

  const eventType = preferredType ?? event.dayTypes?.[date] ?? defaultType;
  const preferredSlot = preferredType
    ? event.phaseSchedules?.[preferredType]?.find((slot) => slot.dates.includes(date))
    : undefined;
  const eventSlot = event.phaseSchedules?.[eventType]?.find((slot) => slot.dates.includes(date));
  const resolvedType = preferredSlot ? preferredType : eventType;
  const resolvedSlot = preferredSlot ?? eventSlot;

  return {
    d: date,
    f: resolvedSlot?.from ?? event.phaseTimes?.[resolvedType]?.from ?? event.startTime ?? fallbackFrom,
    t: resolvedSlot?.to ?? event.phaseTimes?.[resolvedType]?.to ?? event.endTime ?? fallbackTo,
    type: resolvedType,
    note: '',
  };
};

export const upsertTimelogDay = (
  days: TimelogDay[],
  nextDay: TimelogDay,
  entryKey?: string,
): TimelogDay[] => {
  const selectedEntryKey = entryKey ?? nextDay.id;

  if (!selectedEntryKey) {
    return sortDays([
      ...days.filter((day) => day.d !== nextDay.d),
      nextDay,
    ]);
  }

  let hasReplacedEntry = false;
  const updatedDays = days.map((day, index) => {
    if (getTimelogDayEntryKey(day, index) !== selectedEntryKey) {
      return day;
    }

    hasReplacedEntry = true;
    return {
      ...nextDay,
      id: nextDay.id ?? day.id,
    };
  });

  return sortDays(hasReplacedEntry ? updatedDays : [...days, nextDay]);
};

export const removeTimelogDay = (
  days: TimelogDay[],
  date: string,
): TimelogDay[] => sortDays(days.filter((day) => day.d !== date));

export const removeTimelogDayEntry = (
  days: TimelogDay[],
  entryKey: string,
): TimelogDay[] => sortDays(days.filter((day, index) => getTimelogDayEntryKey(day, index) !== entryKey));
