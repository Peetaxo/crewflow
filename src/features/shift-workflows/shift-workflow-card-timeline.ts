import { differenceInCalendarDays, format, isValid, parseISO, subDays } from 'date-fns';
import type { Event } from '../../types';
import { getDatesBetween } from '../../utils';
import { listEventDates } from '../timelogs/services/timelog-day-ui';

export interface CardTimeline {
  anchorDate: string;
  startDate: string;
  query: string;
}

export interface CardTimelineCandidate { id: string; event: Event }
export interface CardTimelineOccurrence extends CardTimelineCandidate { date: string }

const parseCalendarDate = (date: string): Date => {
  const parsed = parseISO(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValid(parsed)) {
    throw new RangeError('Expected a valid ISO calendar date (YYYY-MM-DD).');
  }
  return parsed;
};

export const previousTimelineWeek = (date: string): string => (
  format(subDays(parseCalendarDate(date), 7), 'yyyy-MM-dd')
);

export const createCardTimeline = (anchorDate: string): CardTimeline => ({
  anchorDate, startDate: previousTimelineWeek(anchorDate), query: '',
});

export const cardTimelineOccurrences = (
  candidates: CardTimelineCandidate[],
  timeline: CardTimeline,
): CardTimelineOccurrence[] => {
  const query = timeline.query.trim().toLocaleLowerCase('cs');
  const seen = new Set<string>();

  return candidates.flatMap((candidate) => {
    const { event } = candidate;
    if (query && ![event.name, event.job].some((value) => value.toLocaleLowerCase('cs').includes(query))) {
      return [];
    }

    // Match existing Akce cards: v2 ranges include gaps in phase schedules and free days.
    const dates = event.scheduleVersion === 2
      ? listEventDates(event)
      : getDatesBetween(event.startDate, event.endDate);

    return dates.filter((date) => {
      if (!query && date < timeline.startDate) return false;
      const key = `${candidate.id}|${date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((date) => ({ ...candidate, date }));
  }).sort((a, b) => (
    a.date.localeCompare(b.date)
    || a.event.name.localeCompare(b.event.name, 'cs')
    || a.id.localeCompare(b.id)
  ));
};

export const expandCardTimelineHistory = (
  timeline: CardTimeline,
  occurrenceDates: string[],
): CardTimeline => {
  let nearestDate: string | undefined;
  for (const date of occurrenceDates) {
    if (date < timeline.startDate && (!nearestDate || date > nearestDate)) nearestDate = date;
  }
  if (!nearestDate) return timeline;

  const start = parseCalendarDate(timeline.startDate);
  const days = differenceInCalendarDays(start, parseCalendarDate(nearestDate));
  const weeks = Math.ceil(days / 7);
  return { ...timeline, startDate: format(subDays(start, weeks * 7), 'yyyy-MM-dd') };
};
