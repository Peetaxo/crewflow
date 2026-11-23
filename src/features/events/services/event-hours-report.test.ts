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

describe('event submission and approval progress', () => {
  it('counts distinct people and keeps every stage of a mixed historical member visible', () => {
    const assignments = [assignment, assignment, ...['Bára', 'Cyril', 'Dana', 'Eva', 'Filip', 'Gita', 'Hana'].map((name, i) =>
      ({ contractorProfileId: 'p' + (i + 2), name }))];
    const result = report([log('approved'), log('pending_ch', 2), log('draft', 3, 'p2'),
      log('invoiced', 4, 'p3'), log('paid', 5, 'p3'), log('pending_coo', 6, 'p4'),
      log('rejected', 7, 'p5'), log('pending_crew_confirmation', 8, 'p6'), log('approved', 9, 'p8')], assignments);
    expect(result.progress).toMatchObject({ expected: 8, submitted: 6, approved: 2, missingNames: ['Bára', 'Gita'] });
    expect(result.hasSubmittedReports).toBe(true);
    expect(result.roster.find(p => p.name === 'Alex')).toMatchObject({
      approvedMinutes: 210, unapprovedMinutes: 210,
      statuses: expect.arrayContaining(['approved', 'pending_ch']),
    });
    expect(result.roster.find(p => p.name === 'Cyril')?.statuses).toEqual(expect.arrayContaining(['invoiced', 'paid']));
    expect(result.roster.find(p => p.name === 'Bára')).toMatchObject({ statuses: ['draft'], unapprovedMinutes: 0 });
    expect(result.roster.find(p => p.name === 'Gita')).toMatchObject({ statuses: [], unapprovedMinutes: 0 });
    expect(result.partial).toBe(true);
  });

  it('opens on first submission even with no payable shifts, while incomplete hours stay identifiable', () => {
    const result = report([{ ...log('pending_ch'), days: [{ ...day, t: '' }] }]);
    expect(result.hasSubmittedReports).toBe(true);
    expect(result.progress).toMatchObject({ expected: 1, submitted: 1, approved: 0 });
    expect(result.roster[0].unapprovedMinutes).toBeNull();
    expect(result.people).toEqual([]);
    expect(result.partial).toBe(true);
    expect(report([log('draft')]).hasSubmittedReports).toBe(false);
    expect(report([]).partial).toBe(true);
  });

  it('derives a legacy roster by profile and preserves separate unidentified reports', () => {
    const result = report([log('paid'), log('invoiced', 2), { ...log('approved', 3), contractorProfileId: undefined },
      { ...log('paid', 4), contractorProfileId: undefined }], []);
    expect(result.progress).toMatchObject({ expected: 1, submitted: 1, approved: 1 });
    expect(result.roster.map(person => person.name)).toEqual(['Alex', 'Neznámý člen (výkaz 3)', 'Neznámý člen (výkaz 4)']);
    expect(result.people).toHaveLength(3);
    expect(result.partial).toBe(true);
  });

  it('uses the same unique roster as the event for historical and currently assigned people', () => {
    const result = report([log('paid'), log('approved', 2, 'old')], [assignment, { contractorProfileId: 'p3', name: 'Dana' }]);
    expect(result.progress).toMatchObject({ expected: 3, submitted: 2, approved: 2, missingNames: ['Dana'] });
    expect(result.partial).toBe(true);
  });

  it('labels an inferred event roster even when every known owner is approved', () => {
    const result = buildEventHoursReport({ event, crewAssignments: [assignment], hasExplicitRoster: false, contractors: [member],
      timelogs: [log('approved')], receipts: [] });
    expect(result.progress).toMatchObject({ expected: 1, submitted: 1, approved: 1, hasExplicitRoster: false });
    expect(result.partial).toBe(true);
  });

  it('keeps completion separate from missing financial data and incomplete approved shifts', () => {
    const result = report([{ ...log('approved'), days: [day, { ...day, t: '' }] }]);
    expect(result.partial).toBe(true);
    expect(result.people[0].minutes).toBe(210);
    expect(result.roster[0].approvedMinutes).toBeNull();
    expect(result.progress.approved).toBe(1);
    expect(report([log('approved')]).partial).toBe(false);
  });
});
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
