import { isMatch } from 'date-fns';
import type { Contractor, Event, EventCrewAssignment, ReceiptItem, Timelog, TimelogType } from '../../../types';
import { calculateDayHours, calculateDayMealAllowance, parseTimeToMinutes } from '../../../utils';
import { hasApprovedHours } from '../../timelogs/services/timelog-approval-state';
import { hasSubmittedEventHours } from './event-hours-submission';
import { addAmounts, addCrewCosts, emptyCrewCosts, knownAmount, priceApprovedLog, totalCrewCosts, type CapturedCosts, type EventCrewCosts } from './event-hours-costs';

export type EventHoursInput = {
  event: Pick<Event, 'name' | 'job' | 'mealAllowanceEnabled'>;
  // Both local detail and the remote snapshot scope reports and receipts to the selected event.
  timelogs: (Pick<Timelog, 'status' | 'days' | 'contractorProfileId'> & { id: string | number; km: number | null; captured?: CapturedCosts | null })[];
  crewAssignments: Pick<EventCrewAssignment, 'contractorProfileId' | 'name'>[];
  hasExplicitRoster?: boolean;
  contractors: (Pick<Contractor, 'profileId' | 'name' | 'hasKnownRate'> & { rate: number | null })[];
  receipts: Pick<ReceiptItem, 'contractorProfileId' | 'status' | 'amount'>[];
};

interface ApprovedShift {
  date: string;
  from: number;
  to: number;
  minutes: number;
  work: number | null;
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

const byDateAndStart = (a: ApprovedShift, b: ApprovedShift) => a.date.localeCompare(b.date) || a.from - b.from;

interface RosterPerson {
  name: string;
  identified: boolean;
  statuses: Timelog['status'][];
  approvedMinutes: number | null;
  unapprovedMinutes: number | null;
}

export interface EventHoursReport {
  event: EventHoursInput['event'];
  partial: boolean;
  generatedAt: string;
  hasSubmittedReports: boolean;
  progress: { expected: number; submitted: number; approved: number; missingNames: string[]; hasExplicitRoster: boolean };
  roster: RosterPerson[];
  people: PersonHours[];
}

export function buildEventHoursReport({ event, timelogs, crewAssignments, contractors, receipts,
  hasExplicitRoster = crewAssignments.length > 0 }: EventHoursInput): EventHoursReport {
  const names = new Map(crewAssignments.map(person => [person.contractorProfileId, person.name]));
  const profiles = new Map(contractors.map(person => [person.profileId, person]));
  const people = new Map<string, PersonHours>();
  const roster = new Map<string, RosterPerson>();
  let partial = !hasExplicitRoster;

  const rosterPerson = (key: string, profileId?: string, reportId?: string | number) => {
    let member = roster.get(key);
    if (!member) {
      const name = profiles.get(profileId)?.name.trim() || names.get(profileId)?.trim();
      if (!name || !profileId) partial = true;
      member = { name: name || (reportId === undefined ? `Neznámý člen (${key})` : `Neznámý člen (výkaz ${reportId})`),
        identified: Boolean(profileId), statuses: [], approvedMinutes: 0, unapprovedMinutes: 0 };
      roster.set(key, member);
    }
    return member;
  };
  for (const id of names.keys()) rosterPerson(id, id);

  for (const log of timelogs) {
    const key = log.contractorProfileId || `report:${log.id}`;
    const member = rosterPerson(key, log.contractorProfileId, log.id);
    if (!member.statuses.includes(log.status)) member.statuses.push(log.status);
    const approved = hasApprovedHours(log);
    if (!approved) partial = true;
    if (!hasSubmittedEventHours(log)) continue;
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
      shifts.push({ date: day.d, from, to, minutes: shiftMinutes, work: null, phase: day.type, note: day.note || '' });
      minutes += shiftMinutes;
      if (approved && event.mealAllowanceEnabled) meals += calculateDayMealAllowance(day);
    }
    const category = approved ? 'approvedMinutes' : 'unapprovedMinutes';
    if (!shifts.length || shifts.length !== log.days.length) {
      partial = true;
      member[category] = null;
    } else if (member[category] !== null) {
      member[category] += minutes;
    }
    if (!approved || !shifts.length) continue;

    const profile = log.contractorProfileId ? profiles.get(log.contractorProfileId) : undefined;
    const profileRate = profile?.hasKnownRate === false ? null : knownAmount(profile?.rate);
    const priced = priceApprovedLog(minutes, meals, log.km, profileRate, log.captured);
    const person: PersonHours = people.get(key) ?? {
      name: member.name,
      minutes: 0, shifts: [], rate: priced.rate, costs: emptyCrewCosts(),
    };
    if (person.rate !== priced.rate) person.rate = person.rate === null || priced.rate === null ? null : 'mixed';
    if (!log.captured && (log.status === 'invoiced' || log.status === 'paid')) person.estimatedBilledCosts = true;
    addCrewCosts(person.costs, priced.costs);
    person.minutes += minutes;
    // Divide the approved report amount across its shifts. Rounding cumulative cents
    // keeps the displayed rows reconciled, including captured and mixed-rate reports.
    let elapsed = 0;
    let allocatedCents = 0;
    for (const shift of shifts.sort(byDateAndStart)) {
      elapsed += shift.minutes;
      if (priced.costs.work !== null) {
        const cents = Math.round(Math.round(priced.costs.work * 100) * elapsed / minutes);
        shift.work = (cents - allocatedCents) / 100;
        allocatedCents = cents;
      }
      person.shifts.push(shift);
    }
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
    person.shifts.sort(byDateAndStart);
    if (totalCrewCosts(person.costs) === null) partial = true;
  }
  const sortedRoster = [...roster.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
  // Historical logs may have no assignment row. Only a stable owner can count towards headcount.
  const expected = sortedRoster.filter(person => person.identified);
  const missingNames = expected.filter(person => !person.statuses.some(status => hasSubmittedEventHours({ status })))
    .map(person => person.name);
  const approved = expected.filter(person => person.statuses.length && person.statuses.every(status => hasApprovedHours({ status }))).length;
  return { event, people: sortedPeople, roster: sortedRoster, generatedAt: new Date().toISOString(),
    hasSubmittedReports: timelogs.some(hasSubmittedEventHours), partial: partial || !expected.length || approved < expected.length,
    progress: { expected: expected.length, submitted: expected.length - missingNames.length, approved, missingNames, hasExplicitRoster } };
}
