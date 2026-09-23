import { describe, expect, it } from 'vitest';
import type { AppDataSnapshot } from '../../lib/app-data';
import type { Event, Timelog } from '../../types';
import type { SaveShiftWorkflow, ShiftWorkflowScope } from './shift-workflows.contract';
import { createLocalShiftWorkflowStore, localShiftWorkflowId, localShiftEventVersion, canonicalizeLocalShiftData } from './shift-workflows.local';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const manager: ShiftWorkflowScope = { source: 'local', userId: 'manager', profileId: 'manager-profile', role: 'crewhead' };
const crew: ShiftWorkflowScope = { source: 'local', userId: 'crew', profileId: 'crew-profile', role: 'crew' };
const event = (id: number): Event => ({ id, name: `Směna ${id}`, job: 'A01', projectId: 'project',
  startDate: '2026-09-23', endDate: '2026-09-23', city: '', needed: 2, filled: 1, status: 'upcoming', client: '' });
const report = (id: number): Timelog => ({ id, eid: id, contractorProfileId: crew.profileId!,
  status: 'draft', days: [], km: 0, note: '' });
function fixture() {
  const data = { events: [1, 2, 3, 4].map(event), timelogs: [1, 2, 3, 4].map(report),
    eventCrewAssignments: [1, 2].map((id) => ({ eventId: id, contractorProfileId: crew.profileId!, name: 'Crew' })),
    invoices: [],
  } as Pick<AppDataSnapshot, 'events' | 'timelogs' | 'eventCrewAssignments' | 'invoices'>;
  const store = createLocalShiftWorkflowStore(() => data);
  let request = 30;
  const command = (ids: number[], overrides: Partial<SaveShiftWorkflow> = {}): SaveShiftWorkflow => ({
    requestId: uuid(request++), workflowId: null, eventIds: ids.map((id) => localShiftWorkflowId('event', id)),
    expectedRevision: store.read(manager).revision!,
    eventVersions: Object.fromEntries(data.events.filter((e) => ids.includes(e.id)).map((e) => [localShiftWorkflowId('event', e.id), localShiftEventVersion(e)])),
    confirmCrossProject: false, confirmMoves: false, deleteWorkflow: false, ...overrides,
  });
  return { data, store, command };
}

describe('explicit local identity adapter', () => {
  it('maps local event, report and profile identities consistently without changing app state', () => {
    const { data } = fixture();
    const before = structuredClone(data);
    const mapped = canonicalizeLocalShiftData(data);
    expect(mapped.events[0].supabaseId).toBe(localShiftWorkflowId('event', 1));
    expect(mapped.timelogs[0].eventSupabaseId).toBe(mapped.events[0].supabaseId);
    expect(mapped.timelogs[0].contractorProfileId).toBe(mapped.eventCrewAssignments[0].contractorProfileId);
    expect(mapped.timelogs[0].supabaseId).not.toBe(mapped.events[0].supabaseId);
    expect(canonicalizeLocalShiftData(data)).toEqual(mapped);
    expect(data).toEqual(before);
  });
});

describe('local shared workflow membership', () => {
  it('never links matching names or jobnumbers automatically', () => {
    const { store } = fixture();
    expect(store.read(manager).workflows).toEqual([]);
  });

  it('shows only assigned events to crew, not advertised shifts or another person’s assignments', () => {
    const { store, command } = fixture();
    store.save(manager, command([1, 2, 3]));
    expect(store.read(crew)).toMatchObject({ revision: null, assignedEventIds: [1, 2].map((id) => localShiftWorkflowId('event', id)) });
    expect(store.read(crew).workflows[0].eventIds).toEqual([1, 2].map((id) => localShiftWorkflowId('event', id)));
    expect(store.read({ ...crew, profileId: 'someone-else' }).workflows).toEqual([]);
  });

  it('keeps only the owner’s frozen history, even after assignments change', () => {
    const { data } = fixture();
    data.timelogs.push({ ...report(5), eid: 1, contractorProfileId: 'other' });
    const ownRound = { id: uuid(80), workflowId: null, contractorProfileId: localShiftWorkflowId('profile', crew.profileId!),
      contractorUserId: crew.userId!, expectedItemCount: 1, status: 'approved' as const,
      eventIds: [localShiftWorkflowId('event', 1)], timelogIds: [localShiftWorkflowId('timelog', 1)],
      note: 'own history', updatedAt: '2026-09-23T10:00:00Z' };
    const store = createLocalShiftWorkflowStore(() => data, { rounds: [ownRound,
      { ...ownRound, id: uuid(81), contractorProfileId: localShiftWorkflowId('profile', 'other'), contractorUserId: 'other',
        timelogIds: [localShiftWorkflowId('timelog', 5)], note: 'private' },
      { ...ownRound, id: uuid(82), contractorUserId: 'old-profile-owner', note: 'old private' },
    ] });
    data.eventCrewAssignments = [];
    expect(store.read(crew).rounds.map((r) => r.note)).toEqual(['own history']);
    expect(store.read(manager).rounds).toHaveLength(3);
    expect(store.read(crew).rounds[0]).not.toHaveProperty('contractorUserId');
  });

  it('blocks relinking historical rounds and refuses partially missing frozen history', () => {
    const { data, command } = fixture();
    const round = { id: uuid(80), workflowId: null, contractorProfileId: localShiftWorkflowId('profile', crew.profileId!),
      contractorUserId: crew.userId!, expectedItemCount: 2, status: 'approved' as const,
      eventIds: [1, 2].map((id) => localShiftWorkflowId('event', id)),
      timelogIds: [1, 2].map((id) => localShiftWorkflowId('timelog', id)),
      note: '', updatedAt: '2026-09-23T10:00:00Z' };
    const store = createLocalShiftWorkflowStore(() => data, { rounds: [round] });
    expect(() => store.save(manager, command([1, 2]))).toThrow(expect.objectContaining({ kind: 'blocked' }));
    const damaged = createLocalShiftWorkflowStore(() => data, {
      rounds: [{ ...round, eventIds: round.eventIds.slice(0, 1), timelogIds: round.timelogIds.slice(0, 1) }],
    });
    expect(() => damaged.read(manager)).toThrow();
    expect(() => damaged.read(crew)).toThrow();
  });

  it('rejects crew writes and accidental remote use', () => {
    const { store, command } = fixture();
    expect(() => store.save(crew, command([1, 2]))).toThrow(expect.objectContaining({ kind: 'denied' }));
    expect(() => store.save({ ...manager, source: 'supabase' }, command([1, 2]))).toThrow();
  });

  it('returns detached snapshots and replays exact requests after revision changes', () => {
    const { store, command } = fixture();
    const input = command([1, 2]);
    const first = store.save(manager, input);
    store.save(manager, command([3, 4]));
    const changed = store.read(manager);
    changed.workflows[0].eventIds.length = 0;
    expect(store.read(manager).workflows[0].eventIds).toHaveLength(2);
    expect(store.save(manager, input)).toEqual(first);
    expect(store.read(manager).revision).toBe(2);
    expect(() => store.save(manager, { ...input, confirmMoves: true })).toThrow();
    expect(() => store.save({ ...manager, userId: 'other-manager' }, input)).toThrow();
  });

  it('rejects stale revisions, missing/extra versions and changed event data without writes', () => {
    const { data, store, command } = fixture();
    const input = command([1, 2]);
    expect(() => store.save(manager, { ...input, expectedRevision: 99 })).toThrow();
    expect(() => store.save(manager, { ...input, eventVersions: {} })).toThrow();
    expect(() => store.save(manager, { ...input, eventVersions: { ...input.eventVersions, [uuid(9)]: 'extra' } })).toThrow();
    data.events[1].name = 'Changed';
    expect(() => store.save(manager, input)).toThrow();
    expect(store.read(manager)).toMatchObject({ revision: 0, workflows: [] });
  });

  it('requires explicit confirmation across projects or jobnumbers', () => {
    const { data, store, command } = fixture();
    data.events[1].job = 'B01';
    expect(() => store.save(manager, command([1, 2]))).toThrow(/projektů|jobnumber/);
    expect(store.save(manager, command([1, 2], { confirmCrossProject: true })).revision).toBe(1);
  });

  it.each(['pending_ch', 'pending_coo', 'pending_crew_confirmation', 'approved', 'invoiced', 'paid', 'rejected'] as const)(
    'blocks membership for %s hours belonging to anyone affected', (status) => {
      const { data, store, command } = fixture();
      data.timelogs[1] = { ...data.timelogs[1], contractorProfileId: 'other-crew', status };
      expect(() => store.save(manager, command([1, 2]))).toThrow(expect.objectContaining({ kind: 'blocked' }));
      expect(store.read(manager).revision).toBe(0);
    },
  );

  it('blocks invoice links and targeted approval history even on a draft', () => {
    const { data, store, command } = fixture();
    data.timelogs[1].approvals = [{ id: uuid(90) } as NonNullable<Timelog['approvals']>[number]];
    expect(() => store.save(manager, command([1, 2]))).toThrow(expect.objectContaining({ kind: 'blocked' }));
    data.timelogs[1].approvals = [];
    data.invoices = [{ id: 'INV', timelogIds: [2] } as AppDataSnapshot['invoices'][number]];
    expect(() => store.save(manager, command([1, 2]))).toThrow(expect.objectContaining({ kind: 'blocked' }));
  });

  it('includes every remaining source-group member in move versions and guards', () => {
    const { data, store, command } = fixture();
    const source = store.save(manager, command([1, 2]));
    const target = store.save(manager, command([3, 4]));
    const incomplete = command([2, 3, 4], { workflowId: target.workflowId, confirmMoves: true });
    expect(() => store.save(manager, incomplete)).toThrow();
    const complete = { ...incomplete, eventVersions: { ...incomplete.eventVersions,
      [localShiftWorkflowId('event', 1)]: localShiftEventVersion(data.events[0]) } };
    data.timelogs[0].status = 'approved';
    expect(() => store.save(manager, complete)).toThrow(expect.objectContaining({ kind: 'blocked' }));
    data.timelogs[0].status = 'draft';
    expect(() => store.save(manager, { ...complete, confirmMoves: false })).toThrow(/přesun/);
    store.save(manager, complete);
    expect(store.read(manager).workflows.find((w) => w.id === source.workflowId)?.eventIds)
      .toEqual([localShiftWorkflowId('event', 1)]);
  });

  it('deletes only after version-checking all old members and leaves app records intact', () => {
    const { data, store, command } = fixture();
    const before = structuredClone(data);
    const saved = store.save(manager, command([1, 2]));
    const input = command([1, 2], { workflowId: saved.workflowId, eventIds: [], deleteWorkflow: true });
    expect(() => store.save(manager, { ...input, eventVersions: {} })).toThrow();
    store.save(manager, input);
    expect(store.read(manager).workflows).toEqual([]);
    expect(data).toEqual(before);
  });
});
