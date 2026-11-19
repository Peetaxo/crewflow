import { isMatch } from 'date-fns';
import type { Contractor, Event, EventCrewAssignment, Timelog, TimelogType } from '../../../types';
import { calculateDayHours, parseTimeToMinutes } from '../../../utils';
import { hasApprovedHours } from '../../timelogs/services/timelog-approval-state';

export type EventHoursInput = {
  event: Pick<Event, 'name' | 'job'>;
  // getEventDetailData already scopes both collections to this event, including legacy numeric IDs.
  timelogs: (Pick<Timelog, 'status' | 'days' | 'contractorProfileId'> & { id: string | number })[];
  crewAssignments: Pick<EventCrewAssignment, 'contractorProfileId' | 'name'>[];
  contractors: Pick<Contractor, 'profileId' | 'name'>[];
};

interface ApprovedShift {
  date: string;
  from: number;
  to: number;
  minutes: number;
  phase: TimelogType;
  note: string;
}

interface PersonHours {
  name: string;
  shifts: ApprovedShift[];
  minutes: number;
}

export interface EventHoursReport {
  event: EventHoursInput['event'];
  partial: boolean;
  people: PersonHours[];
}

export function buildEventHoursReport({ event, timelogs, crewAssignments, contractors }: EventHoursInput): EventHoursReport {
  const names = new Map(crewAssignments.map(person => [person.contractorProfileId, person.name]));
  for (const person of contractors) {
    if (person.profileId && person.name.trim()) names.set(person.profileId, person.name);
  }

  const people = new Map<string, PersonHours>();
  let partial = false;
  for (const log of timelogs) {
    if (!hasApprovedHours(log) || !log.days.length) {
      partial = true;
      continue;
    }

    const key = log.contractorProfileId || `report:${log.id}`;
    for (const day of log.days) {
      const from = parseTimeToMinutes(day.f || '');
      const to = parseTimeToMinutes(day.t || '');
      if (from === null || to === null || from === to || !/^\d{4}-\d{2}-\d{2}$/.test(day.d) || !isMatch(day.d, 'yyyy-MM-dd')) {
        partial = true;
        continue;
      }

      const person = people.get(key) ?? {
        name: names.get(key) || `Neznámý člen (výkaz ${log.id})`, minutes: 0, shifts: [],
      };
      const minutes = Math.round(calculateDayHours(day.f, day.t) * 60);
      person.shifts.push({ date: day.d, from, to, minutes, phase: day.type, note: day.note || '' });
      person.minutes += minutes;
      people.set(key, person);
    }
  }

  const sortedPeople = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  for (const person of sortedPeople) {
    person.shifts.sort((a, b) => a.date.localeCompare(b.date) || a.from - b.from);
  }
  return { event, people: sortedPeople, partial: partial || crewAssignments.some(person => !people.has(person.contractorProfileId)) };
}
