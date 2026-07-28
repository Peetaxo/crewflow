import type { Timelog } from '../../../types';
import { formatShortDate } from '../../../utils';

const MINUTES_PER_DAY = 24 * 60;

type TimelogDayInterval = {
  day: Timelog['days'][number];
  index: number;
  start: number;
  end: number;
};

const parseTimelogTimeToMinutes = (time: string): number => {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    throw new Error('Čas ve výkazu nemá platný formát.');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Čas ve výkazu nemá platný formát.');
  }

  return hours * 60 + minutes;
};

const parseTimelogDateToDayIndex = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number);
  const utcTime = Date.UTC(year, month - 1, day);

  if (!Number.isFinite(utcTime)) {
    throw new Error('Datum ve výkazu nemá platný formát.');
  }

  return Math.floor(utcTime / (MINUTES_PER_DAY * 60 * 1000));
};

const toTimelogDayInterval = (day: Timelog['days'][number], index: number): TimelogDayInterval => {
  const dayStart = parseTimelogDateToDayIndex(day.d) * MINUTES_PER_DAY;
  const fromMinutes = parseTimelogTimeToMinutes(day.f);
  const toMinutes = parseTimelogTimeToMinutes(day.t);
  const endMinutes = toMinutes < fromMinutes ? toMinutes + MINUTES_PER_DAY : toMinutes;

  return {
    day,
    index,
    start: dayStart + fromMinutes,
    end: dayStart + endMinutes,
  };
};

const formatTimelogDayInterval = (day: Timelog['days'][number]) => (
  `${formatShortDate(day.d)} ${day.f}-${day.t}`
);

export const findTimelogDayOverlap = (
  days: Timelog['days'],
): { first: Timelog['days'][number]; second: Timelog['days'][number] } | null => {
  const intervals = days
    .map(toTimelogDayInterval)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index);

  for (let index = 0; index < intervals.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < intervals.length; otherIndex += 1) {
      const first = intervals[index];
      const second = intervals[otherIndex];

      if (second.start >= first.end) break;

      if (first.start < second.end && second.start < first.end) {
        return {
          first: first.day,
          second: second.day,
        };
      }
    }
  }

  return null;
};

export const assertTimelogDaysDoNotOverlap = (days: Timelog['days']): void => {
  const overlap = findTimelogDayOverlap(days);

  if (!overlap) return;

  throw new Error(`Časy ve výkazu se překrývají: ${formatTimelogDayInterval(overlap.first)} a ${formatTimelogDayInterval(overlap.second)}.`);
};
