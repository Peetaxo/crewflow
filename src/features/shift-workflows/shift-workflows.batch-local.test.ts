import { describe, expect, it } from 'vitest';
import type { AppDataSnapshot } from '../../lib/app-data';
import type { Contractor, Event, Timelog } from '../../types';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import { canonicalizeLocalShiftData, createLocalShiftWorkflowStore, localShiftEventVersion, localShiftWorkflowId } from './shift-workflows.local';
import { parseShiftBatchResult } from './shift-workflows.batch-contract';
import { serializeShiftReports, type ShiftDraftCommand, type ShiftTransitionCommand, type ShiftRoundAction } from './shift-workflows.batch-commands';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const crew: ShiftWorkflowScope = { source: 'local', userId: uuid(101), profileId: 'crew-profile', role: 'crew' };
const ch: ShiftWorkflowScope = { source: 'local', userId: uuid(102), profileId: 'ch-profile', role: 'crewhead' };
const coo: ShiftWorkflowScope = { source: 'local', userId: uuid(103), profileId: 'coo-profile', role: 'coo' };
const profile = localShiftWorkflowId('profile', crew.profileId!);
const workflowId = uuid(1);
const eventId = (id: number) => localShiftWorkflowId('event', id);
const reportId = (id: number) => localShiftWorkflowId('timelog', id);

function fixture() {
  const data = {
    events: [1, 2, 3, 4].map((id) => ({ id, name: `Shift ${id}`, job: 'A01', startDate: '2026-09-23', endDate: '2026-09-23',
      city: '', needed: 2, filled: 1, status: 'upcoming', client: '', contactProfileId: coo.profileId }) as Event),
    timelogs: [1, 2, 3, 4].map((id) => ({ id, eid: id, contractorProfileId: crew.profileId!, status: 'draft',
      days: [{ d: '2026-09-23', f: '08:00', t: '16:00', type: 'pripravy', meals: ['obed', 'vecere'], note: 'day note' }],
      km: id, note: 'report note' }) as Timelog),
    eventCrewAssignments: [1, 2].map((id) => ({ eventId: id, contractorProfileId: crew.profileId!, name: 'Crew' })),
    invoices: [], contractors: [crew, ch, coo].map((scope, i) => ({ id: i, profileId: scope.profileId, userId: scope.userId }) as Contractor),
  } as Pick<AppDataSnapshot, 'events' | 'timelogs' | 'eventCrewAssignments' | 'invoices' | 'contractors'>;
  let commits = 0;
  let observer: (() => void) | undefined;
  let failBeforeCommit = false;
  const store = createLocalShiftWorkflowStore(() => data, {
    workflows: [{ id: workflowId, eventIds: [1, 2, 3].map(eventId), updatedAt: '2026-09-23T10:00:00.000Z' }],
  }, { now: () => Date.parse('2026-09-23T10:00:00Z'), commitTimelogs: (timelogs) => {
    if (failBeforeCommit) throw new Error('storage failed');
    data.timelogs = timelogs;
    commits++;
    observer?.();
  } });
  let request = 1000;
  const draft = (kind: 'save' | 'submit' = 'save', overrides: Partial<ShiftDraftCommand> = {}): ShiftDraftCommand => ({
    kind, requestId: uuid(request++), workflowId, contractorProfileId: profile, roundId: kind === 'submit' ? uuid(request++) : null,
    anchorEventId: eventId(1), timelogs: serializeShiftReports(canonicalizeLocalShiftData(data).timelogs.filter((t) =>
      [1, 2, 3].includes(t.eid) && data.eventCrewAssignments.some((a) => a.eventId === t.eid)
      && ['draft', 'rejected'].includes(t.status))), ...overrides,
  });
  const transition = (action: ShiftRoundAction, overrides: Partial<ShiftTransitionCommand> = {}): ShiftTransitionCommand => {
    const round = store.read(ch).rounds.find((r) => ['pending_ch', 'pending_coo', 'pending_crew_confirmation'].includes(r.status))!;
    const frozen = canonicalizeLocalShiftData(data).timelogs.filter((t) => round.timelogIds.includes(t.supabaseId!));
    return { kind: 'transition', requestId: uuid(request++), workflowId, contractorProfileId: profile, roundId: round.id,
      expectedRoundUpdatedAt: round.updatedAt, action, note: ['correct', 'return'].includes(action) ? 'Review reason' : '',
      affectedEventId: ['correct', 'return'].includes(action) ? eventId(1) : null,
      targets: frozen.map((t) => ({ id: t.supabaseId!, expected_updated_at: t.updatedAt!, expected_status: t.status })),
      corrections: action === 'correct' ? serializeShiftReports(frozen) : null, ...overrides };
  };
  return { data, store, draft, transition, commits: () => commits, observe: (callback: () => void) => { observer = callback; },
    failCommit: (value: boolean) => { failBeforeCommit = value; } };
}

describe('atomic local shared shift drafts', () => {
  it('saves every assigned eligible section once and returns the validated SQL-shaped receipt', () => {
    const f = fixture();
    const input = f.draft();
    input.timelogs[0].note = 'changed note';
    const untouched = structuredClone({ assignments: f.data.eventCrewAssignments, invoices: f.data.invoices, events: f.data.events });
    const result = parseShiftBatchResult(f.store.executeBatch(crew, input), input);
    expect(result.timelogs).toHaveLength(2);
    expect(f.commits()).toBe(1);
    expect(result.timelogs.find((t) => t.id === input.timelogs[0].id)?.note).toBe('changed note');
    expect(canonicalizeLocalShiftData(f.data).timelogs.find((t) => t.supabaseId === input.timelogs[0].id)?.updatedAt)
      .toBe(result.timelogs.find((t) => t.id === input.timelogs[0].id)?.updated_at);
    expect({ assignments: f.data.eventCrewAssignments, invoices: f.data.invoices, events: f.data.events }).toEqual(untouched);
    expect(result.timelogs[0].days[0]).toMatchObject({ meals: ['obed', 'vecere'], meal: 'obed', note: 'day note' });
    expect(f.data.timelogs[0].supabaseId).toBeUndefined();
    expect(f.data.timelogs[0].eventSupabaseId).toBeUndefined();
  });

  it('rejects omitted, extra, missing and stale sections without partial writes', () => {
    const f = fixture();
    const input = f.draft();
    const before = structuredClone(f.data);
    expect(() => f.store.executeBatch(crew, { ...input, timelogs: input.timelogs.slice(0, 1) })).toThrow();
    expect(() => f.store.executeBatch(crew, { ...input, timelogs: [...input.timelogs,
      ...serializeShiftReports(canonicalizeLocalShiftData(f.data).timelogs.filter((t) => t.eid === 3))] })).toThrow();
    expect(() => f.store.executeBatch(crew, { ...input, timelogs: input.timelogs.map((t, i) => i ? t : { ...t, expected_updated_at: '2000-01-01T00:00:00Z' }) })).toThrow();
    expect(f.data).toEqual(before);
    f.data.timelogs = f.data.timelogs.filter((t) => t.id !== 2);
    expect(() => f.store.executeBatch(crew, { ...input, timelogs: input.timelogs.filter((t) => t.id !== reportId(2)) })).toThrow();
    expect(f.commits()).toBe(0);
  });

  it('excludes completed sections and never derives assignments from report presence', () => {
    const f = fixture();
    f.data.timelogs[1].status = 'approved';
    const input = f.draft();
    expect(parseShiftBatchResult(f.store.executeBatch(crew, input), input).timelogs.map((t) => t.id)).toEqual([reportId(1)]);
    expect(f.data.timelogs[2].status).toBe('draft');
  });

  it('uses immutable actor/payload replay while rechecking current identity and role', () => {
    const f = fixture();
    const input = f.draft();
    const receipt = f.store.executeBatch(crew, input);
    f.store.executeBatch(crew, f.draft());
    expect(f.store.executeBatch({ ...crew, profileId: profile }, input)).toEqual(receipt);
    expect(f.commits()).toBe(2);
    expect(() => f.store.executeBatch(crew, { ...input, timelogs: input.timelogs.map((t) => ({ ...t, note: 'altered' })) })).toThrow();
    expect(() => f.store.executeBatch({ ...crew, role: 'coo' }, input)).toThrow();
    f.data.contractors[0].userId = uuid(999);
    expect(() => f.store.executeBatch(crew, input)).toThrow();
  });

  it('denies remote, absent, duplicated and foreign actor bindings', () => {
    const f = fixture();
    const input = f.draft();
    for (const scope of [{ ...crew, source: 'supabase' as const }, { ...crew, userId: null }, ch, { ...crew, profileId: coo.profileId }]) {
      expect(() => f.store.executeBatch(scope, input)).toThrow();
    }
    f.data.contractors.push({ ...f.data.contractors[0], profileId: 'duplicate' });
    expect(() => f.store.executeBatch(crew, input)).toThrow();
    expect(f.commits()).toBe(0);
  });

  it('rejects day identity stealing from another report without any write', () => {
    const f = fixture();
    const input = f.draft();
    input.timelogs[0].days[0].id = canonicalizeLocalShiftData(f.data).timelogs[3].days[0].id!;
    expect(() => f.store.executeBatch(crew, input)).toThrow();
    expect(f.commits()).toBe(0);
  });

  it('handles only the own assigned single anchor when there is no workflow', () => {
    const f = fixture();
    f.data.eventCrewAssignments.push({ eventId: 4, contractorProfileId: crew.profileId!, name: 'Crew' });
    const single = f.draft('submit', { workflowId: null, anchorEventId: eventId(4),
      timelogs: serializeShiftReports(canonicalizeLocalShiftData(f.data).timelogs.filter((t) => t.eid === 4)) });
    expect(parseShiftBatchResult(f.store.executeBatch(crew, single), single).round?.eventIds).toEqual([eventId(4)]);
    const linked = f.draft('save', { workflowId: null, timelogs: serializeShiftReports(canonicalizeLocalShiftData(f.data).timelogs.filter((t) => t.eid === 1)) });
    expect(() => f.store.executeBatch(crew, linked)).toThrow();
  });
});

describe('frozen local rounds and approval lifecycle', () => {
  it('freezes submission, permits later draft saves, and exposes coherent round/report state to subscribers', () => {
    const f = fixture();
    const input = f.draft('submit');
    const observations: { roundStatus: string; reportStatus: string; count: number }[] = [];
    f.observe(() => {
      const round = f.store.read(crew).rounds[0];
      observations.push({ roundStatus: round.status, reportStatus: f.data.timelogs[0].status, count: round.timelogIds.length });
    });
    const receipt = parseShiftBatchResult(f.store.executeBatch(crew, input), input);
    f.data.eventCrewAssignments.push({ eventId: 3, contractorProfileId: crew.profileId!, name: 'Crew' });
    f.store.executeBatch(crew, f.draft());
    expect(observations).toEqual([
      { roundStatus: 'pending_ch', reportStatus: 'pending_ch', count: 2 },
      { roundStatus: 'pending_ch', reportStatus: 'pending_ch', count: 2 },
    ]);
    expect(() => f.store.executeBatch(crew, f.draft('submit'))).toThrow();
    expect(f.store.read(crew).rounds[0].timelogIds).toEqual(receipt.round!.timelogIds);
    expect(() => f.store.read({ ...crew, userId: uuid(999) }).rounds).not.toThrow();
    expect(f.store.read({ ...crew, userId: uuid(999) }).rounds).toEqual([]);
    f.data.timelogs = f.data.timelogs.filter((t) => t.id !== 2);
    expect(() => f.store.read(crew)).toThrow();
  });

  it('rolls back failed commits, and preserves completed commits when a subscriber throws', () => {
    const f = fixture();
    const input = f.draft('submit');
    f.failCommit(true);
    expect(() => f.store.executeBatch(crew, input)).toThrow('storage failed');
    expect(f.store.read(crew).rounds).toEqual([]);
    expect(f.data.timelogs[0].status).toBe('draft');
    f.failCommit(false);
    f.observe(() => { throw new Error('subscriber failed'); });
    const result = f.store.executeBatch(crew, input);
    expect(parseShiftBatchResult(result, input).round?.status).toBe('pending_ch');
    expect(f.store.executeBatch(crew, input)).toEqual(result);
    expect(f.commits()).toBe(1);
  });

  it('requires complete submission and exact frozen transition/version targets', () => {
    const f = fixture();
    const input = f.draft('submit');
    input.timelogs[1].days[0].time_to = '';
    expect(() => f.store.executeBatch(crew, input)).toThrow();
    f.store.executeBatch(crew, f.draft('submit'));
    const next = f.transition('handoff');
    expect(() => f.store.executeBatch(ch, { ...next, targets: next.targets.slice(0, 1) })).toThrow();
    expect(() => f.store.executeBatch(ch, { ...next, expectedRoundUpdatedAt: '2000-01-01T00:00:00Z' })).toThrow();
    expect(f.commits()).toBe(1);
  });

  it('keeps the full before image and original report note through correction/save/confirmation', () => {
    const f = fixture();
    f.store.executeBatch(crew, f.draft('submit'));
    const correction = f.transition('correct');
    correction.corrections![0].km = 42;
    correction.corrections![0].days[0].note = 'corrected day';
    correction.corrections![0].days[0].meals = ['vecere'];
    correction.corrections![0].days[0].meal = 'vecere';
    const result = parseShiftBatchResult(f.store.executeBatch(ch, correction), correction);
    const changed = result.timelogs.find((t) => t.id === correction.corrections![0].id)!;
    expect(changed).toMatchObject({ review_note: 'Review reason', note: 'report note', km: 42,
      crew_confirmation_snapshot: { id: changed.id, status: 'pending_ch', note: 'report note', review_note: null,
        days: [expect.objectContaining({ meals: ['obed', 'vecere'], note: 'day note' })] } });
    const frozen = canonicalizeLocalShiftData(f.data).timelogs.filter((t) => result.round!.timelogIds.includes(t.supabaseId!));
    const save: ShiftDraftCommand = { kind: 'save', requestId: uuid(4000), workflowId, contractorProfileId: profile,
      roundId: result.round!.id, anchorEventId: eventId(1), timelogs: serializeShiftReports(frozen) };
    save.timelogs[0].days[0].time_to = '';
    expect(() => f.store.executeBatch(crew, { ...save, timelogs: save.timelogs.slice(0, 1) })).toThrow();
    parseShiftBatchResult(f.store.executeBatch(crew, save), save);
    expect(() => f.store.executeBatch(crew, f.transition('confirm'))).toThrow();
    const fixed = { ...save, requestId: uuid(4001), timelogs: serializeShiftReports(canonicalizeLocalShiftData(f.data).timelogs.filter((t) => result.round!.timelogIds.includes(t.supabaseId!))) };
    fixed.timelogs[0].days[0].time_to = '17:00';
    f.store.executeBatch(crew, fixed);
    const confirmation = f.transition('confirm');
    expect(parseShiftBatchResult(f.store.executeBatch(crew, confirmation), confirmation).round?.status).toBe('pending_ch');
    expect(f.data.timelogs[0].crewConfirmationSnapshot?.before.note).toBe('report note');
  });

  it('hands off to one configured approver and resolves every frozen report without invoicing', () => {
    const f = fixture();
    f.store.executeBatch(crew, f.draft('submit'));
    const handoff = f.transition('handoff');
    const pending = parseShiftBatchResult(f.store.executeBatch(ch, handoff), handoff);
    expect(pending.timelogs.every((t) => t.approval?.approver_profile_id === localShiftWorkflowId('profile', coo.profileId!))).toBe(true);
    const decision = f.transition('approve');
    expect(() => f.store.executeBatch(ch, decision)).toThrow();
    const result = parseShiftBatchResult(f.store.executeBatch(coo, decision), decision);
    expect(result.timelogs.every((t) => t.approval?.status === 'approved')).toBe(true);
    expect(f.data.invoices).toEqual([]);
    expect(f.store.executeBatch(ch, handoff)).toEqual(f.store.executeBatch({ ...ch, role: 'coo' }, handoff));
    expect(() => f.store.executeBatch({ ...ch, role: 'crew' }, handoff)).toThrow();
  });

  it('rejects incompatible/missing approvers, self approval and rebound frozen identities', () => {
    const f = fixture();
    f.store.executeBatch(crew, f.draft('submit'));
    const handoff = f.transition('handoff');
    f.data.events[1].contactProfileId = ch.profileId!;
    expect(() => f.store.executeBatch(ch, handoff)).toThrow();
    f.data.events[1].contactProfileId = coo.profileId!;
    f.data.contractors[2].userId = null;
    expect(() => f.store.executeBatch(ch, handoff)).toThrow();
    f.data.contractors[2].userId = coo.userId;
    f.data.events[0].contactProfileId = ch.profileId!;
    f.data.events[1].contactProfileId = ch.profileId!;
    expect(() => f.store.executeBatch(ch, handoff)).toThrow();
    f.data.events[0].contactProfileId = coo.profileId!;
    f.data.events[1].contactProfileId = coo.profileId!;
    f.data.contractors[0].userId = uuid(999);
    expect(() => f.store.executeBatch(ch, handoff)).toThrow();
    expect(f.commits()).toBe(1);
  });

  it('rejects changed approver/sender bindings and another COO at resolution', () => {
    const f = fixture();
    f.store.executeBatch(crew, f.draft('submit'));
    f.store.executeBatch(ch, f.transition('handoff'));
    const decision = f.transition('approve');
    expect(() => f.store.executeBatch({ ...ch, role: 'coo' }, decision)).toThrow();
    f.data.contractors[1].userId = uuid(999);
    expect(() => f.store.executeBatch(coo, decision)).toThrow();
    f.data.contractors[1].userId = ch.userId;
    f.data.contractors[2].userId = uuid(999);
    expect(() => f.store.executeBatch({ ...coo, userId: uuid(999) }, decision)).toThrow();
    expect(f.commits()).toBe(2);
  });

  it('replays owner confirmation only with current frozen access and keeps membership locked by history', () => {
    const f = fixture();
    f.store.executeBatch(crew, f.draft('submit'));
    f.store.executeBatch(ch, f.transition('correct'));
    const confirmation = f.transition('confirm');
    const first = f.store.executeBatch(crew, confirmation);
    f.store.executeBatch(ch, f.transition('return'));
    expect(f.store.executeBatch(crew, confirmation)).toEqual(first);
    const events = [1, 2, 3].map(eventId);
    expect(() => f.store.save(ch, { requestId: uuid(4001), workflowId, eventIds: events, expectedRevision: 0,
      eventVersions: Object.fromEntries(f.data.events.filter((e) => e.id <= 3).map((e) => [eventId(e.id), localShiftEventVersion(e)])),
      deleteWorkflow: false, confirmMoves: false, confirmCrossProject: false })).toThrow(expect.objectContaining({ kind: 'blocked' }));
    f.data.contractors[0].userId = uuid(999);
    expect(() => f.store.executeBatch(crew, confirmation)).toThrow();
    const replay = { ...crew, userId: uuid(999) };
    expect(() => f.store.executeBatch(replay, { ...confirmation, requestId: uuid(4002) })).toThrow();
  });

  it.each(['crewhead', 'coo'] as const)('returns the whole round from %s and resubmits under a new frozen identity', (role) => {
    const f = fixture();
    f.store.executeBatch(crew, f.draft('submit'));
    if (role === 'coo') f.store.executeBatch(ch, f.transition('handoff'));
    const command = f.transition('return');
    const result = parseShiftBatchResult(f.store.executeBatch(role === 'coo' ? coo : ch, command), command);
    expect(result.timelogs.every((t) => t.status === 'rejected' && t.note === 'report note')).toBe(true);
    const submit = f.draft('submit');
    expect(parseShiftBatchResult(f.store.executeBatch(crew, submit), submit).round?.id).not.toBe(result.round?.id);
    expect(f.store.read(crew).rounds).toHaveLength(2);
  });
});
