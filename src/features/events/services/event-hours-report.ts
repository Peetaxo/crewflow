import { isMatch } from 'date-fns';
import type { Contractor, Event, EventCrewAssignment, ReceiptItem, Timelog, TimelogType } from '../../../types';
import { calculateDayHours, calculateDayMealAllowance, parseTimeToMinutes } from '../../../utils';
import { hasApprovedHours } from '../../timelogs/services/timelog-approval-state';
import { addAmounts, addCrewCosts, emptyCrewCosts, knownAmount, priceApprovedLog, totalCrewCosts, type CapturedCosts, type EventCrewCosts } from './event-hours-costs';

export type EventHoursInput = {
  event: Pick<Event, 'name' | 'job' | 'mealAllowanceEnabled'>;
  // Both local detail and the remote snapshot scope reports and receipts to the selected event.
  timelogs: (Pick<Timelog, 'status' | 'days' | 'contractorProfileId'> & { id: string | number; km: number | null; captured?: CapturedCosts | null })[];
  crewAssignments: Pick<EventCrewAssignment, 'contractorProfileId' | 'name'>[];
  contractors: (Pick<Contractor, 'profileId' | 'name' | 'hasKnownRate'> & { rate: number | null })[];
  receipts: Pick<ReceiptItem, 'contractorProfileId' | 'status' | 'amount'>[];
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
  estimatedBilledCosts?: boolean;
  rate: number | null | 'mixed';
  costs: EventCrewCosts;
  name: string;
  shifts: ApprovedShift[];
  minutes: number;
}

export interface EventHoursReport {
  event: EventHoursInput['event'];
  partial: boolean;
  people: PersonHours[];
}

export function buildEventHoursReport({ event, timelogs, crewAssignments, contractors, receipts }: EventHoursInput): EventHoursReport {
  const names = new Map(crewAssignments.map(person => [person.contractorProfileId, person.name]));
  const profiles = new Map(contractors.map(person => [person.profileId, person]));
  const people = new Map<string, PersonHours>();
  let partial = false;
  for (const log of timelogs) {
    if (!hasApprovedHours(log) || !log.days.length) {
      partial = true;
      continue;
    }

    const shifts: ApprovedShift[] = [];
    let minutes = 0;
    let meals = 0;
    for (const day of log.days) {
      const from = parseTimeToMinutes(day.f || '');
      const to = parseTimeToMinutes(day.t || '');
      if (from === null || to === null || from === to || !/^\d{4}-\d{2}-\d{2}$/.test(day.d) || !isMatch(day.d, 'yyyy-MM-dd')) {
        partial = true;
        continue;
      }
      const shiftMinutes = Math.round(calculateDayHours(day.f, day.t) * 60);
      shifts.push({ date: day.d, from, to, minutes: shiftMinutes, phase: day.type, note: day.note || '' });
      minutes += shiftMinutes;
      if (event.mealAllowanceEnabled) meals += calculateDayMealAllowance(day);
    }
    if (!shifts.length) continue;

    const key = log.contractorProfileId || `report:${log.id}`;
    const profile = log.contractorProfileId ? profiles.get(log.contractorProfileId) : undefined;
    const profileRate = profile?.hasKnownRate === false ? null : knownAmount(profile?.rate);
    const priced = priceApprovedLog(minutes, meals, log.km, profileRate, log.captured);
    const person: PersonHours = people.get(key) ?? {
      name: profile?.name.trim() || names.get(key) || `Neznámý člen (výkaz ${log.id})`,
      minutes: 0, shifts: [], rate: priced.rate, costs: emptyCrewCosts(),
    };
    if (person.rate !== priced.rate) person.rate = person.rate === null || priced.rate === null ? null : 'mixed';
    if (!log.captured && (log.status === 'invoiced' || log.status === 'paid')) person.estimatedBilledCosts = true;
    addCrewCosts(person.costs, priced.costs);
    person.minutes += minutes;
    for (const shift of shifts) person.shifts.push(shift);
    people.set(key, person);
  }

  // Receipts belong to an event and profile, independently of how many reports the person submitted.
  for (const receipt of receipts) {
    if (receipt.status === 'rejected') continue;
    const person = receipt.contractorProfileId ? people.get(receipt.contractorProfileId) : undefined;
    if (!person || !['approved', 'attached', 'reimbursed'].includes(receipt.status)) {
      partial = true;
      continue;
    }
    person.costs.receipts = addAmounts(person.costs.receipts, knownAmount(receipt.amount));
  }
  const sortedPeople = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  for (const person of sortedPeople) {
    person.shifts.sort((a, b) => a.date.localeCompare(b.date) || a.from - b.from);
    if (totalCrewCosts(person.costs) === null) partial = true;
  }
  return { event, people: sortedPeople, partial: partial || crewAssignments.some(person => !people.has(person.contractorProfileId)) };
}
