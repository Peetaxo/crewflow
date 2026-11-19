import { describe, expect, it } from 'vitest';
import type { Timelog, TimelogStatus } from '../../../types';
import { buildEventHoursReport } from './event-hours-report';

const day: Timelog['days'][number] = { d: '2026-11-14', f: '22:30', t: '02:00', type: 'instal' };
const member = { profileId: 'p1', name: 'Alex', rate: 250 };
const assignment = { contractorProfileId: 'p1', name: 'Alex' };
const event = { name: 'Veletrh', job: 'JOB01' };
const log = (status: TimelogStatus, id = 1, profileId = 'p1'): Timelog => ({
  eid: 10, id, status, contractorProfileId: profileId, days: [day], km: 0, note: '',
});
const report = (timelogs: Timelog[], crewAssignments = [assignment]) =>
  buildEventHoursReport({ event, timelogs, crewAssignments, contractors: [member], receipts: [] });

describe('approved event hours', () => {
  it('includes approved, invoiced and paid shifts and totals overnight hours once per profile', () => {
    const result = report([
      { ...log('paid', 3), days: [{ ...day, d: '2026-11-16' }] },
      log('approved'), { ...log('invoiced', 2), days: [{ ...day, d: '2026-11-15' }] },
    ]);
    expect(result.partial).toBe(false);
    expect(result.people).toHaveLength(1);
    expect(result.people[0].minutes).toBe(630);
    expect(result.people[0].estimatedBilledCosts).toBe(true);
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
    expect(result.partial).toBe(true);
    expect(result.people[1].costs.work).toBeNull();
    expect(result.people.map(p => [p.name, p.minutes])).toEqual([['Alex', 210], ['Alex', 210]]);
  });
  it('adds work, travel per report, eligible meals per shift and approved event receipts once per profile', () => {
    const shift: Timelog['days'][number] = { ...day, f: '08:00', t: '16:00', meals: ['obed'] };
    const approved = { ...log('approved'), km: 10, days: [shift, day] };
    const receipt = { contractorProfileId: 'p1', amount: 129.5, status: 'approved' as const };
    const result = buildEventHoursReport({
      event: { ...event, mealAllowanceEnabled: true }, timelogs: [approved, log('approved', 2), { ...approved, id: 3, status: 'pending_coo' }],
      contractors: [member], crewAssignments: [assignment],
      receipts: [receipt, { ...receipt, status: 'reimbursed', amount: 30 }, { ...receipt, status: 'submitted' }, { ...receipt, status: 'rejected' },
        { ...receipt, contractorProfileId: 'other' }],
    });
    expect(result.partial).toBe(true);
    expect(result.people).toHaveLength(1);
    expect(result.people[0]).toMatchObject({ minutes: 900, rate: 250, costs: { work: 3750, travel: 56, meals: 250, receipts: 159.5 } });
  });

  it('uses captured costs even if profile and event rules changed and shows multiple rates', () => {
    const result = buildEventHoursReport({ event, contractors: [member], crewAssignments: [assignment], receipts: [], timelogs: [
      { ...log('paid'), captured: { hours: 3.5, rate: 200, work: 700, km: 5, travel: 28, meals: 250 } },
      log('approved', 2),
    ] });
    expect(result.people[0]).toMatchObject({ rate: 'mixed', costs: { work: 1575, travel: 28, meals: 250, receipts: 0 } });
    expect(result.people[0].shifts.map(shift => shift.work)).toEqual([700, 875]);
  });

  it('keeps an unknown rate or distance distinct from a genuine zero', () => {
    const build = (rate: number, hasKnownRate: boolean, km: number | null) => buildEventHoursReport({
      event, crewAssignments: [assignment], receipts: [], contractors: [{ ...member, rate, hasKnownRate }],
      timelogs: [{ ...log('approved'), km }],
    }).people[0].costs;
    expect(build(0, false, null)).toEqual({ work: null, travel: null, meals: 0, receipts: 0 });
    expect(build(0, true, 0)).toEqual({ work: 0, travel: 0, meals: 0, receipts: 0 });
  });
  it('rounds work per report and does not price discarded shifts or meals disabled for the event', () => {
    const short = { ...day, f: '12:00', t: '12:01' };
    const result = buildEventHoursReport({ event, contractors: [{ ...member, rate: 100 }], crewAssignments: [assignment], receipts: [],
      timelogs: [{ ...log('approved'), days: [short, { ...day, f: '08:00', t: '16:00', meal: 'obed' }, { ...day, f: '' }] },
        { ...log('approved', 2), days: [short] }] });
    expect(result.partial).toBe(true);
    expect(result.people[0].costs).toEqual({ work: 803.34, travel: 0, meals: 0, receipts: 0 });
  });

  it('keeps displayed shifts reconciled with an authoritative captured report amount down to the cent', () => {
    const oneMinute = { ...day, f: '10:00', t: '10:01' };
    const result = buildEventHoursReport({ event, contractors: [member], crewAssignments: [assignment], receipts: [], timelogs: [
      { ...log('invoiced'), days: [oneMinute, { ...oneMinute, d: '2026-11-15' }],
        captured: { hours: 2/60, rate: 100, work: 3.33, km: 0, travel: 0, meals: 0 } },
    ] });
    expect(result.people[0].shifts.map(shift => shift.work)).toEqual([1.67, 1.66]);
    expect(result.people[0].costs.work).toBe(3.33);
  });

});
