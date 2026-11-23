import type { Role, Timelog, TimelogDay } from '../../../types';
import { calculateTotalHours } from '../../../utils';
import { hasSubmittedEventHours } from '../../events/services/event-hours-submission';
import { getActiveTimelogApproval, hasApprovedHours } from '../services/timelog-approval-state';

export interface RosterMember { contractorProfileId: string; name: string }

export function eventAttendance(reports: Timelog[], roster: readonly RosterMember[] | null, reportsComplete: boolean) {
  const byPerson = new Map<string, Timelog[]>();
  const members = new Map(roster?.map(person => [person.contractorProfileId, person]));
  for (const report of reports) {
    if (!report.contractorProfileId) continue;
    const previous = byPerson.get(report.contractorProfileId) ?? [];
    previous.push(report);
    byPerson.set(report.contractorProfileId, previous);
  }
  const complete = roster !== null && reportsComplete
    && reports.every(report => Boolean(report.contractorProfileId))
    && roster.every(person => Boolean(person.contractorProfileId));
  const groups = [...byPerson.values()];
  const expected = new Set([...byPerson.keys(), ...members.keys()]).size;
  const missing = complete ? [...members.values()].filter(person => !byPerson.has(person.contractorProfileId)) : [];
  const drafts = complete ? groups.filter(group => group.every(report => report.status === 'draft')).map(group => group[0]) : [];
  return { expected, complete, missing, drafts,
    submitted: groups.filter(group => group.some(hasSubmittedEventHours)).length,
    approved: groups.filter(group => group.every(hasApprovedHours)).length };
}

export type Bucket = 'mine' | 'waiting' | 'unfinished' | 'approved';
const priority: Record<Bucket, number> = { mine: 0, waiting: 1, unfinished: 2, approved: 3 };
export const queueLabel: Record<Role, string> = { crewhead: 'Ke kontrole CH', coo: 'Ke schválení COO', crew: 'Čeká na mě' };
export interface ReportRow { report: Timelog; name: string; bucket: Bucket; newInQueue: boolean }

const timestamp = (value?: string | null) => value ? Date.parse(value) : NaN;

export function eventReportRows(reports: Timelog[], visible: Timelog[], actionableIds: ReadonlySet<number>,
  name: (report: Timelog) => string, includeHistory: boolean) {
  let firstApproval = Infinity;
  for (const report of reports) {
    if (!hasApprovedHours(report)) continue;
    const active = getActiveTimelogApproval(report);
    const approvedAt = timestamp(report.approvedAt ?? (active?.status === 'approved' ? active.resolvedAt : null));
    if (Number.isFinite(approvedAt)) firstApproval = Math.min(firstApproval, approvedAt);
  }
  const selected = new Map(visible.map(report => [report.id, report]));
  if (includeHistory) {
    for (const report of reports) {
      if (hasApprovedHours(report) && !selected.has(report.id)) selected.set(report.id, report);
    }
  }
  return [...selected.values()].map((report): ReportRow => {
    const approved = hasApprovedHours(report);
    let bucket: Bucket = 'waiting';
    if (approved) bucket = 'approved';
    else if (actionableIds.has(report.id)) bucket = 'mine';
    else if (report.status === 'draft' || report.status === 'rejected') bucket = 'unfinished';
    const active = report.status === 'pending_coo' ? getActiveTimelogApproval(report) : null;
    const entered = timestamp(active?.status === 'pending' ? active.requestedAt : report.submittedAt);
    return { report, bucket, name: name(report), newInQueue: bucket === 'mine' && entered > firstApproval };
  }).sort((a, b) => priority[a.bucket] - priority[b.bucket] || Number(b.newInQueue) - Number(a.newInQueue)
    || a.name.localeCompare(b.name, 'cs', { numeric: true }) || a.report.id - b.report.id);
}

export interface DayRow extends ReportRow { shifts: TimelogDay[] }
export interface ApprovalDay {
  date: string;
  rows: DayRow[];
  totalReports: number;
  hours: number;
  pending: number;
  pendingHours: number;
  newInQueue: number;
  allApproved: boolean;
}

export function eventApprovalDays(rows: ReportRow[], reports: Timelog[]): ApprovalDay[] {
  const days = new Map<string, ApprovalDay>();
  const visible = new Map(rows.map(row => [row.report.id, row]));
  for (const report of reports) {
    const row = visible.get(report.id);
    const byDate = new Map<string, TimelogDay[]>();
    for (const shift of report.days) {
      const shifts = byDate.get(shift.d) ?? [];
      shifts.push(shift);
      byDate.set(shift.d, shifts);
    }
    // An undated legacy report can still be reviewed from the day view.
    if (!byDate.size) byDate.set('', []);
    for (const [date, shifts] of byDate) {
      const day = days.get(date) ?? {
        date, rows: [], totalReports: 0, hours: 0, pending: 0, pendingHours: 0, newInQueue: 0, allApproved: true,
      };
      const hours = calculateTotalHours(shifts);
      day.totalReports++;
      day.hours += hours;
      if (!hasApprovedHours(report)) day.allApproved = false;
      if (row) day.rows.push({ ...row, shifts });
      if (row?.bucket === 'mine') {
        day.pending++;
        day.pendingHours += hours;
        if (row.newInQueue) day.newInQueue++;
      }
      days.set(date, day);
    }
  }
  const positions = new Map(rows.map((row, index) => [row.report.id, index]));
  const visibleDays = [...days.values()].filter(day => day.rows.length > 0);
  for (const day of visibleDays) {
    day.rows.sort((a, b) => positions.get(a.report.id)! - positions.get(b.report.id)!);
  }
  return visibleDays.sort((a, b) => b.newInQueue - a.newInQueue || b.pending - a.pending
    || Number(a.allApproved) - Number(b.allApproved) || Number(!a.date) - Number(!b.date) || a.date.localeCompare(b.date));
}
