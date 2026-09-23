import { describe, expect, it } from 'vitest';
import type { Event, Timelog } from '../../types';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import { getWorkflowCandidates, getWorkflowSelectionImpact, type ShiftWorkflowManagementData } from './shift-workflows.management';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const scope: ShiftWorkflowScope = { source: 'supabase', userId: id(1), profileId: id(2), role: 'crewhead' };
const profile = id(3);
const data = (): ShiftWorkflowManagementData => ({
  snapshot: { revision: 1, assignedEventIds: [], rounds: [], workflows: [
    { id: id(10), eventIds: [id(21), id(22)], updatedAt: time },
    { id: id(11), eventIds: [id(23), id(24)], updatedAt: time },
  ] },
  events: [21, 22, 23, 24, 25].map((n) => ({ id: n, supabaseId: id(n), name: `Směna ${n}`, job: 'JOB',
    startDate: '2026-09-23', endDate: '2026-09-24', projectId: 'P', updatedAt: time } as Event)),
  timelogs: [21, 22, 23, 24].map((n) => ({ id: n + 100, supabaseId: id(n + 100), eid: n,
    eventSupabaseId: id(n), contractorProfileId: profile, status: 'draft', days: [], km: 0, note: '' } as Timelog)),
  eventCrewAssignments: [21, 23].map((n) => ({ eventId: n, eventSupabaseId: id(n), contractorProfileId: profile, name: 'Petr' })),
  invoices: [],
});

describe('crew shift management presentation', () => {
  it('offers only actual assignments plus every existing linked member, not unrelated advertised events', () => {
    expect(getWorkflowCandidates(data(), scope, profile, null).map((e) => e.id)).toEqual([id(21), id(23)]);
    expect(getWorkflowCandidates(data(), scope, profile, id(10)).map((e) => e.id)).toEqual([id(21), id(22), id(23)]);
  });

  it('never infers assignment from someone else’s timelog or a numeric ID remotely', () => {
    const input = data();
    input.eventCrewAssignments = [{ eventId: 25, contractorProfileId: profile, name: 'Petr' }];
    expect(getWorkflowCandidates(input, scope, profile, null)).toEqual([]);
  });

  it('includes removed target members and all remaining source members in the impact', () => {
    const impact = getWorkflowSelectionImpact(data(), scope, id(10), [id(21), id(23)]);
    expect(impact.affectedEventIds).toEqual([id(21), id(22), id(23), id(24)]);
    expect(impact.sources.map((w) => w.id)).toEqual([id(11)]);
    expect(impact.removedEventIds).toEqual([id(22)]);
    expect(impact.crossProject).toBe(false);
    expect(impact.blockedReason).toBeNull();
  });

  it('requires a separate acknowledgement for another project or job', () => {
    const input = data();
    input.events[2].job = 'OTHER';
    expect(getWorkflowSelectionImpact(input, scope, id(10), [id(21), id(23)]).crossProject).toBe(true);
  });

  it.each(['pending_ch', 'pending_coo', 'rejected', 'approved', 'invoiced', 'paid'] as const)('blocks %s even for another person on a remaining source member', (status) => {
    const input = data();
    input.timelogs[3] = { ...input.timelogs[3], contractorProfileId: id(9), status };
    expect(getWorkflowSelectionImpact(input, scope, id(10), [id(21), id(23)]).blockedReason).toMatch(/Směna 24.*schvalování/);
  });

  it('blocks historical targeted approvals even on a draft', () => {
    const input = data();
    input.timelogs[1].approvals = [{ id: id(90) } as NonNullable<Timelog['approvals']>[number]];
    expect(getWorkflowSelectionImpact(input, scope, id(10), [id(21)]).blockedReason).toMatch(/schvalování/);
  });

  it('blocks frozen history, even when its reports are no longer in this read', () => {
    const input = data();
    input.snapshot.rounds = [{ id: id(90), workflowId: id(11), contractorProfileId: id(9), status: 'approved',
      eventIds: [id(23)], timelogIds: [id(123)], note: '', updatedAt: time }];
    expect(getWorkflowSelectionImpact(input, scope, id(10), [id(21), id(23)]).blockedReason).toMatch(/schvalování/);
  });

  it('blocks exact invoice links without relying on an invoice anchor event', () => {
    const input = data();
    input.invoices = [{ id: 'I', eid: 999, timelogSupabaseIds: [id(124)] } as ShiftWorkflowManagementData['invoices'][number]];
    expect(getWorkflowSelectionImpact(input, scope, id(10), [id(21), id(23)]).blockedReason).toMatch(/fakturu/);
  });

  it('fails closed when a selected or existing affected member is absent', () => {
    const input = data();
    input.events = input.events.filter((e) => e.id !== 24);
    expect(getWorkflowSelectionImpact(input, scope, id(10), [id(21), id(23)]).blockedReason).toMatch(/Obnovte/);
    expect(getWorkflowSelectionImpact(input, scope, id(99), [id(21)]).blockedReason).toMatch(/Obnovte/);
  });
});
