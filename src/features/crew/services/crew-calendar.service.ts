import { getLocalAppState, subscribeToLocalAppState } from '../../../lib/app-data';
import type { Contractor, Event, EventCrewAssignment, Timelog, TimelogDay } from '../../../types';
import { getEvents } from '../../events/services/events.service';
import { getTimelogs } from '../../timelogs/services/timelogs.service';
import { getCrew } from './crew.service';

export interface CrewCalendarAssignment {
  id: string;
  source: 'timelog' | 'assignment';
  contractorProfileId: string;
  contractorName: string;
  contractorInitials: string;
  contractorBg: string;
  contractorFg: string;
  eventId: number;
  eventSelectionId: number | string;
  eventName: string;
  eventJob: string;
  eventCity: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string | null;
  timeTo: string | null;
  dayCount: number;
  days: TimelogDay[];
}

interface BuildCrewCalendarAssignmentsInput {
  contractors: Contractor[];
  events: Event[];
  timelogs: Timelog[];
  eventCrewAssignments: EventCrewAssignment[];
  search?: string;
}

type AppStateWithCrewAssignments = ReturnType<typeof getLocalAppState> & {
  eventCrewAssignments?: EventCrewAssignment[];
};

const DEFAULT_CREW_BG = '#E5E7EB';
const DEFAULT_CREW_FG = '#111827';

const normalizeSearchText = (value: string) => (
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
);

const fallbackInitials = (name: string) => (
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
);

const addDays = (date: string, amount: number) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
};

const countInclusiveDays = (dateFrom: string, dateTo: string) => {
  const start = new Date(`${dateFrom}T00:00:00Z`).getTime();
  const end = new Date(`${dateTo}T00:00:00Z`).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.floor((end - start) / 86_400_000) + 1;
};

const isNextDate = (previous: string, next: string) => addDays(previous, 1) === next;

const splitTimelogDaysIntoRanges = (days: TimelogDay[]) => {
  const sortedDays = [...days].sort((a, b) => `${a.d}${a.f}${a.t}`.localeCompare(`${b.d}${b.f}${b.t}`));
  const ranges: TimelogDay[][] = [];

  for (const day of sortedDays) {
    const currentRange = ranges[ranges.length - 1];
    const previousDay = currentRange?.[currentRange.length - 1];
    const canJoinPrevious =
      previousDay
      && isNextDate(previousDay.d, day.d)
      && previousDay.f === day.f
      && previousDay.t === day.t;

    if (canJoinPrevious) {
      currentRange.push(day);
    } else {
      ranges.push([day]);
    }
  }

  return ranges;
};

const mapContractorMeta = (contractor: Contractor | undefined, fallbackName: string) => {
  const name = contractor?.name?.trim() || fallbackName.trim() || 'Neznamy clen';
  const initials = contractor?.ii?.trim() || fallbackInitials(name);

  return {
    name,
    initials,
    bg: contractor?.bg || DEFAULT_CREW_BG,
    fg: contractor?.fg || DEFAULT_CREW_FG,
  };
};

const getContractorProfileKeys = (contractor: Contractor) => ([
  contractor.profileId,
  `profile-local-${contractor.id}`,
  `legacy:${contractor.id}`,
].filter(Boolean) as string[]);

const matchesSearch = (assignment: CrewCalendarAssignment, search: string) => {
  const query = normalizeSearchText(search.trim());
  if (!query) return true;

  return [
    assignment.contractorName,
    assignment.eventName,
    assignment.eventJob,
  ].some((value) => normalizeSearchText(value).includes(query));
};

export const buildCrewCalendarAssignments = ({
  contractors,
  events,
  timelogs,
  eventCrewAssignments,
  search = '',
}: BuildCrewCalendarAssignmentsInput): CrewCalendarAssignment[] => {
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const eventsBySupabaseId = new Map(
    events
      .filter((event) => event.supabaseId)
      .map((event) => [event.supabaseId as string, event]),
  );
  const contractorsByProfileId = new Map<string, Contractor>();
  contractors.forEach((contractor) => {
    getContractorProfileKeys(contractor).forEach((profileKey) => {
      contractorsByProfileId.set(profileKey, contractor);
    });
  });
  const timelogAssignmentKeys = new Set<string>();
  const assignments: CrewCalendarAssignment[] = [];

  for (const timelog of timelogs) {
    if (!timelog.contractorProfileId || timelog.days.length === 0) continue;

    const event = eventsById.get(timelog.eid);
    if (!event) continue;

    timelogAssignmentKeys.add(`${event.id}:${timelog.contractorProfileId}`);
    const contractor = contractorsByProfileId.get(timelog.contractorProfileId);
    const contractorMeta = mapContractorMeta(contractor, timelog.contractorProfileId);

    splitTimelogDaysIntoRanges(timelog.days).forEach((range, rangeIndex) => {
      const firstDay = range[0];
      const lastDay = range[range.length - 1];

      assignments.push({
        id: `timelog-${timelog.id}-${rangeIndex}`,
        source: 'timelog',
        contractorProfileId: timelog.contractorProfileId as string,
        contractorName: contractorMeta.name,
        contractorInitials: contractorMeta.initials,
        contractorBg: contractorMeta.bg,
        contractorFg: contractorMeta.fg,
        eventId: event.id,
        eventSelectionId: event.supabaseId ?? event.id,
        eventName: event.name,
        eventJob: event.job,
        eventCity: event.city,
        dateFrom: firstDay.d,
        dateTo: lastDay.d,
        timeFrom: firstDay.f,
        timeTo: firstDay.t,
        dayCount: range.length,
        days: range,
      });
    });
  }

  for (const eventCrewAssignment of eventCrewAssignments) {
    const event = eventsById.get(eventCrewAssignment.eventId)
      ?? (eventCrewAssignment.eventSupabaseId ? eventsBySupabaseId.get(eventCrewAssignment.eventSupabaseId) : undefined);
    if (!event) continue;
    if (timelogAssignmentKeys.has(`${event.id}:${eventCrewAssignment.contractorProfileId}`)) continue;

    const contractor = contractorsByProfileId.get(eventCrewAssignment.contractorProfileId);
    const contractorMeta = mapContractorMeta(contractor, eventCrewAssignment.name);

    assignments.push({
      id: `assignment-${event.id}-${eventCrewAssignment.contractorProfileId}`,
      source: 'assignment',
      contractorProfileId: eventCrewAssignment.contractorProfileId,
      contractorName: contractorMeta.name,
      contractorInitials: contractorMeta.initials,
      contractorBg: contractorMeta.bg,
      contractorFg: contractorMeta.fg,
      eventId: event.id,
      eventSelectionId: event.supabaseId ?? event.id,
      eventName: event.name,
      eventJob: event.job,
      eventCity: event.city,
      dateFrom: event.startDate,
      dateTo: event.endDate,
      timeFrom: null,
      timeTo: null,
      dayCount: countInclusiveDays(event.startDate, event.endDate),
      days: [],
    });
  }

  return assignments
    .filter((assignment) => matchesSearch(assignment, search))
    .sort((a, b) => (
      a.dateFrom.localeCompare(b.dateFrom)
      || a.dateTo.localeCompare(b.dateTo)
      || a.contractorName.localeCompare(b.contractorName)
      || a.eventName.localeCompare(b.eventName)
    ));
};

export const getCrewCalendarAssignments = (search = ''): CrewCalendarAssignment[] => {
  getCrew();
  getEvents();
  getTimelogs();

  const snapshot = getLocalAppState() as AppStateWithCrewAssignments;

  return buildCrewCalendarAssignments({
    contractors: snapshot.contractors ?? [],
    events: snapshot.events ?? [],
    timelogs: snapshot.timelogs ?? [],
    eventCrewAssignments: snapshot.eventCrewAssignments ?? [],
    search,
  });
};

export const subscribeToCrewCalendarChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);
