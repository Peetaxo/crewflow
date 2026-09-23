import { addDays, format, parseISO } from 'date-fns';
import type { Event, TimelogDay, TimelogType } from '../../../types';
import { parseTimeToMinutes } from '../../../utils';

const phaseTypes: TimelogType[] = ['pripravy', 'instal', 'provoz', 'deinstal'];

const getScheduleDates = (event: Event): string[] => {
  const start = parseISO(event.startDate);
  const end = parseISO(event.endDate);
  const dates: string[] = [];

  // Planning dates are local calendar days, not UTC instants across DST changes.
  for (let date = start; date <= end; date = addDays(date, 1)) {
    dates.push(format(date, 'yyyy-MM-dd'));
  }

  return dates;
};

const createDay = (date: string, type: TimelogType, from = '', to = ''): TimelogDay => {
  const fromMinutes = parseTimeToMinutes(from);
  const toMinutes = parseTimeToMinutes(to);
  const hasTimes = fromMinutes !== null && toMinutes !== null && fromMinutes !== toMinutes;

  return {
    d: date,
    f: hasTimes ? from : '',
    t: hasTimes ? to : '',
    type,
    meals: [],
    meal: null,
    note: '',
  };
};

const compareDays = (a: TimelogDay, b: TimelogDay): number => (
  a.d.localeCompare(b.d)
  || (parseTimeToMinutes(a.f) ?? -1) - (parseTimeToMinutes(b.f) ?? -1)
  || (parseTimeToMinutes(a.t) ?? -1) - (parseTimeToMinutes(b.t) ?? -1)
  || phaseTypes.indexOf(a.type) - phaseTypes.indexOf(b.type)
);

const isFreeDay = (date: string, event: Event): boolean => (
  Boolean(event.showDayTypes && event.freeDays?.includes(date))
);

const getPhaseDays = (date: string, event: Event): TimelogDay[] => (
  phaseTypes.flatMap((type) => (
    (event.phaseSchedules?.[type] ?? [])
      .filter((slot) => slot.dates.includes(date))
      .map((slot) => createDay(date, type, slot.from, slot.to))
  )).sort(compareDays)
);

/** Planned defaults only: event boundaries are not recurring daily shifts in v2. */
export const resolveEventScheduleDay = (
  date: string,
  event: Event,
  preferredType?: TimelogType,
): TimelogDay => {
  if (!event.showDayTypes) {
    const type = preferredType ?? 'instal';
    const isSingleEventDay = date === event.startDate && event.startDate === event.endDate;
    return isSingleEventDay
      ? createDay(date, type, event.startTime, event.endTime)
      : createDay(date, type);
  }

  const type = preferredType ?? event.dayTypes?.[date] ?? 'instal';
  if (isFreeDay(date, event)) return createDay(date, type);

  const scheduledDays = getPhaseDays(date, event);
  const matchingDay = scheduledDays.find((day) => day.type === type);
  return matchingDay ?? (preferredType ? undefined : scheduledDays[0]) ?? createDay(date, type);
};

/** Builds assignment rows without adding shifts for explicit free days. */
export const buildEventScheduleDays = (
  event: Event,
  choices: Array<TimelogType | 'all'> = ['all'],
): TimelogDay[] => {
  const dates = getScheduleDates(event);
  if (!event.showDayTypes) return dates.map((date) => resolveEventScheduleDay(date, event));

  const includesAll = choices.includes('all');
  return dates.flatMap((date) => {
    if (isFreeDay(date, event)) return [];

    const scheduledDays = getPhaseDays(date, event);
    if (scheduledDays.length > 0) {
      return scheduledDays.filter((day) => includesAll || choices.includes(day.type));
    }

    // Unknown dates belong to an all-event assignment, not to a specific phase.
    const type = event.dayTypes?.[date];
    return includesAll || (type && choices.includes(type))
      ? [createDay(date, type ?? 'instal')]
      : [];
  }).sort(compareDays);
};
