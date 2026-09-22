import { addDays, format, isValid, parseISO } from 'date-fns';
import type { Event, TimelogType } from '../../../types';
import { parseTimeToMinutes } from '../../../utils';

export interface EventFormPhase {
  id: string;
  type: TimelogType;
  from: string;
  to: string;
  showTimes: boolean;
}

export interface EventFormDay {
  free: boolean;
  phases: EventFormPhase[];
}

export type EventFormPlan = Record<string, EventFormDay>;

const PHASE_TYPES: TimelogType[] = ['pripravy', 'instal', 'provoz', 'deinstal'];
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseCalendarDate = (value: string): Date | null => {
  if (!CALENDAR_DATE_PATTERN.test(value)) return null;
  const parsed = parseISO(value);
  if (!isValid(parsed) || format(parsed, 'yyyy-MM-dd') !== value) return null;
  return parsed;
};

export const getEventFormDates = (startDate: string, endDate: string): string[] => {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end || start > end) return [];

  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    dates.push(format(date, 'yyyy-MM-dd'));
  }
  return dates;
};

const getDraftPhaseId = (slotId: string, date: string, dateCount: number): string => (
  dateCount === 1 ? slotId : `${slotId}::${date}`
);

export const createEventFormPlan = (event: Event): EventFormPlan => {
  const plan: EventFormPlan = {};

  PHASE_TYPES.forEach((type) => {
    (event.phaseSchedules?.[type] ?? []).forEach((slot) => {
      slot.dates.forEach((date) => {
        const day = plan[date] ?? { free: false, phases: [] };
        day.phases.push({
          id: getDraftPhaseId(slot.id, date, slot.dates.length),
          type,
          from: slot.from,
          to: slot.to,
          showTimes: Boolean(slot.from || slot.to),
        });
        plan[date] = day;
      });
    });
  });

  (event.freeDays ?? []).forEach((date) => {
    const day = plan[date] ?? { free: false, phases: [] };
    day.free = true;
    plan[date] = day;
  });

  return plan;
};

export const serializeEventFormPlan = (
  event: Event,
  plan: EventFormPlan,
): Pick<Event, 'phaseSchedules' | 'dayTypes' | 'freeDays'> => {
  if (!event.showDayTypes) {
    return { phaseSchedules: {}, dayTypes: {}, freeDays: [] };
  }

  const phaseSchedules: NonNullable<Event['phaseSchedules']> = {};
  const dayTypes: Record<string, TimelogType> = {};
  const freeDays: string[] = [];

  getEventFormDates(event.startDate, event.endDate).forEach((date) => {
    const day = plan[date];
    if (!day) return;
    if (day.free) {
      freeDays.push(date);
      return;
    }

    day.phases.forEach((draftPhase) => {
      const schedules = phaseSchedules[draftPhase.type] ?? [];
      schedules.push({
        id: draftPhase.id,
        dates: [date],
        from: draftPhase.showTimes ? draftPhase.from : '',
        to: draftPhase.showTimes ? draftPhase.to : '',
      });
      phaseSchedules[draftPhase.type] = schedules;
      dayTypes[date] ??= draftPhase.type;
    });
  });

  return { phaseSchedules, dayTypes, freeDays };
};

const requireTrimmed = (value: string | undefined | null, message: string): void => {
  if (!value?.trim()) throw new Error(message);
};

const requireValidTime = (value: string | undefined, message: string): number => {
  const minutes = value ? parseTimeToMinutes(value) : null;
  if (minutes === null) throw new Error(message);
  return minutes;
};

export const validateEventForm = (event: Event, plan: EventFormPlan): void => {
  requireTrimmed(event.job, 'Vyplňte Job Number.');
  requireTrimmed(event.name, 'Vyplňte název akce.');
  requireTrimmed(event.client, 'Vyberte klienta.');

  const startDate = parseCalendarDate(event.startDate);
  if (!startDate) throw new Error('Vyplňte platné datum začátku.');
  const endDate = parseCalendarDate(event.endDate);
  if (!endDate) throw new Error('Vyplňte platné datum konce.');

  const startTime = requireValidTime(event.startTime, 'Vyplňte platný čas začátku.');
  const endTime = requireValidTime(event.endTime, 'Vyplňte platný čas konce.');
  if (endDate < startDate || (event.startDate === event.endDate && endTime <= startTime)) {
    throw new Error('Konec akce musí být později než začátek.');
  }

  if (!event.contactProfileId?.trim() && !event.contactPerson?.trim()) {
    throw new Error('Vyberte nebo doplňte kontaktní osobu.');
  }
  if (!Number.isInteger(event.needed) || event.needed < 0) {
    throw new Error('Počet Crew musí být nezáporné celé číslo.');
  }

  if (!event.showDayTypes) return;
  const activeDates = new Set(getEventFormDates(event.startDate, event.endDate));
  activeDates.forEach((date) => {
    const day = plan[date];
    if (!day || day.free) return;

    day.phases.forEach((draftPhase) => {
      if (!draftPhase.showTimes) return;
      const from = parseTimeToMinutes(draftPhase.from);
      const to = parseTimeToMinutes(draftPhase.to);
      const hasAnyTime = Boolean(draftPhase.from || draftPhase.to);
      if (hasAnyTime && (from === null || to === null || from === to)) {
        throw new Error(`Doplňte platné časy fáze pro ${date}.`);
      }
    });
  });
};
