import { format, isMatch } from 'date-fns';
import type { Event, Project, Timelog, TimelogDay } from '../../../types';
import { parseTimeToMinutes } from '../../../utils';

export const resolveShiftProject = (event: Event | undefined, projects: Project[]): Project | null => {
  if (!event) return null;

  const project = projects.find((item) => (
    item.id === event.job || (event.projectId != null && item.supabaseId === event.projectId)
  ));

  if (project) return project;

  return {
    id: event.job || 'Bez projektu',
    name: event.job || event.name,
    client: event.client || 'Bez klienta',
    createdAt: event.startDate,
    note: '',
  };
};

const isPastEvent = (event: Event | undefined, today = new Date().toISOString().split('T')[0]) => (
  !event || event.endDate < today
);

export const resolveNextShiftDisplay = (timelog: Timelog, event: Event, today = format(new Date(), 'yyyy-MM-dd')) => {
  if (event.scheduleVersion !== 2) {
    const time = event.startTime ?? timelog.days[0]?.f;
    return { date: event.startDate, time, sortKey: `${event.startDate}T${time ?? '00:00'}` };
  }

  let nextDay: TimelogDay | undefined;
  for (const day of timelog.days) {
    if (day.d < today || day.d.length !== 10 || !isMatch(day.d, 'yyyy-MM-dd')) continue;
    if (!nextDay || day.d < nextDay.d || (
      day.d === nextDay.d
      && (parseTimeToMinutes(day.f) ?? 1440) < (parseTimeToMinutes(nextDay.f) ?? 1440)
    )) nextDay = day;
  }
  if (!nextDay) return null;

  const minutes = parseTimeToMinutes(nextDay.f);
  // Unknown clocks follow timed assignments on the same date, without borrowing an event boundary.
  const sortTime = minutes === null
    ? '24:00'
    : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  return {
    date: nextDay.d,
    time: minutes === null ? 'Čas zatím neurčen' : nextDay.f,
    sortKey: `${nextDay.d}T${sortTime}`,
  };
};

export const categorizeCrewTimelogs = (timelogs: Timelog[], events: Event[]) => {
  const eventById = new Map<number | string, Event>(events.map((event) => [event.id, event]));
  events.forEach((event) => {
    if (event.scheduleVersion === 2 && event.supabaseId) eventById.set(event.supabaseId, event);
  });
  const today = format(new Date(), 'yyyy-MM-dd');

  return {
    drafts: timelogs.filter((timelog) => timelog.status === 'draft'),
    upcoming: timelogs.filter((timelog) => {
      if (timelog.status !== 'draft') return false;
      const event = eventById.get(timelog.eid);
      if (event?.scheduleVersion === 2) {
        return !isPastEvent(event, today) && resolveNextShiftDisplay(timelog, event, today) !== null;
      }
      return !isPastEvent(event);
    }),
    processing: timelogs.filter((timelog) => (
      timelog.status === 'pending_ch'
      || timelog.status === 'pending_coo'
      || timelog.status === 'pending_crew_confirmation'
      || timelog.status === 'rejected'
    )),
    invoiced: timelogs.filter((timelog) => (
      timelog.status === 'approved'
      || timelog.status === 'invoiced'
      || timelog.status === 'paid'
    )),
  };
};
