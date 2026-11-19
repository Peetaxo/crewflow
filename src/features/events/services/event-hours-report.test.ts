import { describe, expect, it } from 'vitest';
import type { Timelog, TimelogStatus } from '../../../types';
import { buildEventHoursReport } from './event-hours-report';

const day: Timelog['days'][number] = { d: '2026-11-14', f: '22:30', t: '02:00', type: 'instal' };
const member = { profileId: 'p1', name: 'Alex' };
const assignment = { contractorProfileId: 'p1', name: 'Alex' };
const event = { name: 'Veletrh', job: 'JOB01' };
const log = (status: TimelogStatus, id = 1, profileId = 'p1'): Timelog => ({
  eid: 10, id, status, contractorProfileId: profileId, days: [day], km: 0, note: '',
});
const report = (timelogs: Timelog[], crewAssignments = [assignment]) =>
  buildEventHoursReport({ event, timelogs, crewAssignments, contractors: [member] });

describe('approved event hours', () => {
  it('includes approved, invoiced and paid shifts and totals overnight hours once per profile', () => {
    const result = report([
      { ...log('paid', 3), days: [{ ...day, d: '2026-11-16' }] },
      log('approved'), { ...log('invoiced', 2), days: [{ ...day, d: '2026-11-15' }] },
    ]);
    expect(result.partial).toBe(false);
    expect(result.people).toHaveLength(1);
    expect(result.people[0].minutes).toBe(630);
    expect(result.people[0].shifts.map(s => s.date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
  });

  it.each(['draft', 'pending_ch', 'pending_crew_confirmation', 'pending_coo', 'rejected'] as const)(
    'marks the report partial and excludes %s hours even for someone with an approved shift', status => {
      const result = report([log('approved'), log(status, 2)]);
      expect(result.partial).toBe(true);
      expect(result.people[0].minutes).toBe(210);
      expect(report([log(status)]).people).toEqual([]);
    },
  );

  it('marks a missing assigned member or an incomplete approved row as partial', () => {
    expect(report([log('approved')], [assignment, { contractorProfileId: 'p2', name: 'Alex' }]).partial).toBe(true);
    const result = report([{ ...log('approved'), days: [day, { ...day, f: '' }] }]);
    expect(result.partial).toBe(true);
    expect(result.people[0].shifts).toHaveLength(1);
    expect(report([{ ...log('approved'), days: [] }]).people).toEqual([]);
  });

  it('uses assignment names when the profile is missing and keeps namesakes distinct', () => {
    const result = report([log('approved'), log('approved', 2, 'p2')],
      [assignment, { contractorProfileId: 'p2', name: 'Alex' }]);
    expect(result.partial).toBe(false);
    expect(result.people.map(p => [p.name, p.minutes])).toEqual([['Alex', 210], ['Alex', 210]]);
  });
});
