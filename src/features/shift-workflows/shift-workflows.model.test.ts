import { describe, expect, it } from 'vitest';
import type { Event, EventCrewAssignment, Timelog, TimelogDay } from '../../types';
import {
  formatShiftWorkflowLabel,
  resolveShiftWorkflowContext,
  validateShiftWorkflowSubmission,
  type ShiftWorkflow,
  type ShiftWorkflowContext,
  type ShiftWorkflowRound,
} from './shift-workflows.model';

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const crewId = uuid(1);
const otherCrewId = uuid(2);
const updatedAt = '2026-09-23T12:00:00Z';

const event = (id: number, overrides: Partial<Event> = {}): Event => ({
  id,
  supabaseId: uuid(100 + id),
  name: ['Přípravy', 'Instalace', 'Deinstalace'][id - 1] ?? 'Jiná akce',
  job: 'JOB-101',
  startDate: `2026-09-${22 + id}`,
  endDate: `2026-09-${22 + id}`,
  startTime: '08:00',
  city: 'Praha',
  needed: 3,
  filled: 2,
  status: 'upcoming',
  client: 'Klient',
  ...overrides,
});

const assignment = (item: Event, contractorProfileId = crewId): EventCrewAssignment => ({
  eventId: item.id,
  eventSupabaseId: item.supabaseId,
  contractorProfileId,
  name: 'Crew',
});

const timelog = (item: Event, overrides: Partial<Timelog> = {}): Timelog => ({
  id: item.id,
  supabaseId: uuid(200 + item.id),
  eid: item.id,
  eventSupabaseId: item.supabaseId,
  contractorProfileId: crewId,
  days: [{ d: item.startDate, f: '08:00', t: '17:00', type: 'instal' }],
  km: 0,
  note: '',
  status: 'draft',
  ...overrides,
});

const fixture = () => {
  const events = [event(1), event(2), event(3)];
  const workflow: ShiftWorkflow = { id: uuid(300), eventIds: events.map((item) => item.supabaseId!), updatedAt };
  return {
    anchorEventId: events[0].supabaseId!,
    contractorProfileId: crewId,
    events,
    workflows: [workflow],
    assignments: events.map((item) => assignment(item)),
    timelogs: events.map((item) => timelog(item)),
    rounds: [] as ShiftWorkflowRound[],
  };
};

const round = (overrides: Partial<ShiftWorkflowRound> = {}): ShiftWorkflowRound => ({
  id: uuid(400),
  workflowId: uuid(300),
  contractorProfileId: crewId,
  status: 'pending_coo',
  eventIds: [uuid(101), uuid(102)],
  timelogIds: [uuid(201), uuid(202)],
  note: 'Ke schválení',
  updatedAt,
  ...overrides,
});

const context = (overrides: Partial<ShiftWorkflowContext> = {}): ShiftWorkflowContext => ({
  workflowId: uuid(300),
  contractorProfileId: crewId,
  anchorEventId: uuid(101),
  eventIds: [uuid(101)],
  timelogs: [timelog(event(1))],
  activeRound: null,
  ...overrides,
});

describe('resolveShiftWorkflowContext', () => {
  it('opens the same canonical context from every linked assigned event', () => {
    const input = fixture();
    const resolved = input.events.map((item) => resolveShiftWorkflowContext({ ...input, anchorEventId: item.supabaseId! }));

    expect(resolved[0]).toEqual({
      workflowId: uuid(300), contractorProfileId: crewId, anchorEventId: uuid(101),
      eventIds: [uuid(101), uuid(102), uuid(103)], timelogs: input.timelogs, activeRound: null,
    });
    expect(resolved[1]).toEqual(resolved[0]);
    expect(resolved[2]).toEqual(resolved[0]);
    expect(resolved[0]!.timelogs[0]).toBe(input.timelogs[0]);
  });

  it('exposes only two of three linked events when the crew member has two assignments', () => {
    const input = fixture();
    input.assignments = [assignment(input.events[0]), assignment(input.events[2]), assignment(input.events[1], otherCrewId)];
    input.timelogs.push(timelog(input.events[0], { supabaseId: uuid(290), contractorProfileId: otherCrewId }));

    expect(resolveShiftWorkflowContext(input)?.eventIds).toEqual([uuid(101), uuid(103)]);
    expect(resolveShiftWorkflowContext(input)?.timelogs).toEqual([input.timelogs[0], input.timelogs[2]]);
    expect(resolveShiftWorkflowContext({ ...input, anchorEventId: uuid(102) })).toBeNull();
  });

  it('keeps an unlinked event as a singleton even when another assigned event has the same name, job and date', () => {
    const input = fixture();
    input.events[1] = { ...input.events[0], id: 2, supabaseId: uuid(102) };
    input.workflows = [];

    expect(resolveShiftWorkflowContext(input)).toEqual(context({ workflowId: null, timelogs: [input.timelogs[0]] }));
  });

  it('sorts sections by start date, clock time, then UUID independently of input order and numeric IDs', () => {
    const input = fixture();
    input.events = [
      event(3, { id: 1, startDate: '2026-09-23', startTime: '9:00' }),
      event(2, { id: 1, startDate: '2026-09-23', startTime: '08:00' }),
      event(1, { id: 1, startDate: '2026-09-23', startTime: '8:00' }),
    ];
    input.workflows[0].eventIds.reverse();
    input.assignments.reverse();
    input.timelogs.reverse();
    const before = structuredClone(input);

    expect(resolveShiftWorkflowContext(input)?.eventIds).toEqual([uuid(101), uuid(102), uuid(103)]);
    expect(resolveShiftWorkflowContext(input)?.timelogs.map((item) => item.supabaseId)).toEqual([uuid(201), uuid(202), uuid(203)]);
    expect(input).toEqual(before);
  });

  it('preserves a section whose canonical timelog has not loaded without synthesizing a report', () => {
    const input = fixture();
    input.timelogs.splice(1, 1);
    const resolved = resolveShiftWorkflowContext(input)!;

    expect(resolved.eventIds).toEqual([uuid(101), uuid(102), uuid(103)]);
    expect(resolved.timelogs).toEqual(input.timelogs);
    expect(validateShiftWorkflowSubmission(resolved)).toEqual([{ eventId: uuid(102), message: 'Chybí výkaz pro tuto část směny.' }]);
  });

  it('never resolves remote identities through numeric event IDs', () => {
    const input = fixture();
    input.assignments[0].eventSupabaseId = undefined;
    expect(resolveShiftWorkflowContext(input)).toBeNull();

    const missingLogEventId = fixture();
    missingLogEventId.timelogs[0].eventSupabaseId = undefined;
    expect(resolveShiftWorkflowContext(missingLogEventId)?.timelogs.map((item) => item.supabaseId)).toEqual([uuid(202), uuid(203)]);
    expect(resolveShiftWorkflowContext({ ...fixture(), anchorEventId: '1' })).toBeNull();
    expect(resolveShiftWorkflowContext({ ...fixture(), contractorProfileId: '1' })).toBeNull();
  });

  it.each([
    ['missing event UUID', (input: ReturnType<typeof fixture>) => { input.events[0].supabaseId = undefined; }],
    ['duplicate event UUID', (input: ReturnType<typeof fixture>) => { input.events.push({ ...input.events[0], id: 99 }); }],
    ['duplicate canonical log UUID', (input: ReturnType<typeof fixture>) => { input.timelogs[1].supabaseId = input.timelogs[0].supabaseId; }],
    ['duplicate event reports', (input: ReturnType<typeof fixture>) => { input.timelogs.push(timelog(input.events[0], { supabaseId: uuid(299) })); }],
    ['missing canonical log UUID', (input: ReturnType<typeof fixture>) => { input.timelogs[0].supabaseId = undefined; }],
    ['duplicate assignment', (input: ReturnType<typeof fixture>) => { input.assignments.push({ ...input.assignments[0] }); }],
    ['duplicate workflow member', (input: ReturnType<typeof fixture>) => { input.workflows[0].eventIds.push(uuid(101)); }],
    ['overlapping workflow membership on a different anchor', (input: ReturnType<typeof fixture>) => { input.workflows.push({ id: uuid(301), eventIds: [uuid(102)], updatedAt }); }],
    ['duplicate workflow identity', (input: ReturnType<typeof fixture>) => { input.workflows.push({ id: uuid(300), eventIds: [uuid(999)], updatedAt }); }],
    ['a UUID also owned by another crew member', (input: ReturnType<typeof fixture>) => { input.timelogs.push(timelog(input.events[0], { contractorProfileId: otherCrewId })); }],
  ])('fails closed on %s', (_name, corrupt) => {
    const input = fixture();
    corrupt(input);
    expect(resolveShiftWorkflowContext(input)).toBeNull();
  });

  it('retains the exact frozen submission set when a later assignment adds a draft section', () => {
    const input = fixture();
    const activeRound = round({ timelogIds: [uuid(202), uuid(201)] });
    input.rounds = [activeRound];

    const resolved = resolveShiftWorkflowContext(input)!;
    expect(resolved.eventIds).toEqual([uuid(101), uuid(102), uuid(103)]);
    expect(resolved.activeRound).toBe(activeRound);
    expect(resolved.activeRound!.timelogIds).toEqual([uuid(202), uuid(201)]);
    expect(resolveShiftWorkflowContext({ ...input, anchorEventId: uuid(103) })).toEqual(resolved);
  });

  it.each(['pending_ch', 'pending_crew_confirmation', 'pending_coo'] as const)('recognizes a %s round as active', (status) => {
    expect(resolveShiftWorkflowContext({ ...fixture(), rounds: [round({ status })] })?.activeRound?.status).toBe(status);
  });

  it('ignores terminal rounds, unrelated singleton rounds and other crew members’ rounds', () => {
    const input = fixture();
    input.rounds = [
      round({ status: 'approved' }), round({ id: uuid(401), status: 'rejected' }),
      round({ id: uuid(402), contractorProfileId: otherCrewId }),
      round({ id: uuid(403), workflowId: null, eventIds: [uuid(199)], timelogIds: [uuid(999)] }),
    ];
    expect(resolveShiftWorkflowContext(input)?.activeRound).toBeNull();
    expect(resolveShiftWorkflowContext(input)?.eventIds).toHaveLength(3);
  });

  it('resolves a singleton round by matching its frozen event and canonical report membership', () => {
    const input = fixture();
    input.workflows = [];
    input.rounds = [round({ workflowId: null, eventIds: [uuid(101)], timelogIds: [uuid(201)] })];
    expect(resolveShiftWorkflowContext(input)?.activeRound).toBe(input.rounds[0]);
    expect(resolveShiftWorkflowContext({ ...input, anchorEventId: uuid(102) })?.activeRound).toBeNull();
  });

  it.each([
    ['missing canonical report', (input: ReturnType<typeof fixture>) => { input.timelogs.shift(); }],
    ['replaced canonical report', (input: ReturnType<typeof fixture>) => { input.timelogs[0].supabaseId = uuid(299); }],
    ['foreign canonical report', (input: ReturnType<typeof fixture>) => { input.timelogs[0].contractorProfileId = otherCrewId; }],
    ['stale frozen report ID', (input: ReturnType<typeof fixture>) => { input.rounds[0].timelogIds = [uuid(299)]; }],
  ])('fails closed for an active singleton round with a %s', (_name, corrupt) => {
    const input = fixture();
    input.workflows = [];
    input.rounds = [round({ workflowId: null, eventIds: [uuid(101)], timelogIds: [uuid(201)] })];
    corrupt(input);

    expect(resolveShiftWorkflowContext(input)).toBeNull();
  });

  it('fails closed when a relevant singleton round contains a removed frozen event assignment', () => {
    const input = fixture();
    input.workflows = [];
    input.assignments.splice(1, 1);
    input.timelogs.splice(1, 1);
    input.rounds = [round({ workflowId: null, timelogIds: [uuid(299), uuid(202)] })];

    expect(resolveShiftWorkflowContext(input)).toBeNull();
  });

  it('ignores an unrelated singleton round even if its frozen report is unavailable', () => {
    const input = fixture();
    input.workflows = [];
    input.rounds = [round({ workflowId: null, eventIds: [uuid(102)], timelogIds: [uuid(299)] })];

    const resolved = resolveShiftWorkflowContext(input)!;
    expect(resolved.activeRound).toBeNull();
    expect(resolved.eventIds).toEqual([uuid(101)]);
    expect(validateShiftWorkflowSubmission(resolved)).toEqual([]);
  });

  it.each([
    ['empty frozen event set', []],
    ['duplicate frozen event', [uuid(101), uuid(101)]],
    ['invalid frozen event UUID', ['1', uuid(102)]],
    ['missing frozen event', [uuid(101)]],
    ['extra frozen event without a report', [uuid(101), uuid(102), uuid(103)]],
    ['frozen event inconsistent with its canonical report', [uuid(101), uuid(103)]],
  ])('fails closed on %s', (_name, eventIds) => {
    const input = fixture();
    input.rounds = [round({ eventIds })];
    expect(resolveShiftWorkflowContext(input)).toBeNull();
  });

  it.each([
    ['multiple active rounds', (input: ReturnType<typeof fixture>) => { input.rounds.push(round({ id: uuid(401) })); }],
    ['missing frozen timelog', (input: ReturnType<typeof fixture>) => { input.timelogs.shift(); }],
    ['removed assignment in a frozen set', (input: ReturnType<typeof fixture>) => { input.assignments.splice(1, 1); }],
    ['foreign crew report in a frozen set', (input: ReturnType<typeof fixture>) => { input.timelogs[1].contractorProfileId = otherCrewId; }],
    ['duplicate frozen member', (input: ReturnType<typeof fixture>) => { input.rounds[0].timelogIds = [uuid(201), uuid(201)]; }],
    ['wrong workflow identity on an overlapping round', (input: ReturnType<typeof fixture>) => { input.rounds[0].workflowId = uuid(301); }],
    ['empty frozen set', (input: ReturnType<typeof fixture>) => { input.rounds[0].timelogIds = []; }],
  ])('fails closed on %s', (_name, corrupt) => {
    const input = fixture();
    input.rounds = [round()];
    corrupt(input);
    expect(resolveShiftWorkflowContext(input)).toBeNull();
  });
});

describe('formatShiftWorkflowLabel', () => {
  it('combines distinct section names with one shared job and date range', () => {
    const input = fixture();
    expect(formatShiftWorkflowLabel(resolveShiftWorkflowContext(input)!, input.events)).toBe('Přípravy / Instalace / Deinstalace · JOB-101 · 23. 9. – 25. 9. 2026');
  });

  it('deduplicates names, jobs and a shared date without including an unassigned section', () => {
    const input = fixture();
    input.events[0] = event(1, { name: 'JOB-101' });
    input.events[1] = event(2, { name: 'JOB-101', startDate: '2026-09-23', endDate: '2026-09-23' });
    input.assignments.pop();
    expect(formatShiftWorkflowLabel(resolveShiftWorkflowContext(input)!, input.events)).toBe('JOB-101 · 23. 9. 2026');
  });

  it('formats singleton labels and date ranges across calendar years', () => {
    expect(formatShiftWorkflowLabel(context(), [event(1)])).toBe('Přípravy · JOB-101 · 23. 9. 2026');
    expect(formatShiftWorkflowLabel(context(), [event(1, { startDate: '2026-12-31', endDate: '2027-01-01' })])).toBe('Přípravy · JOB-101 · 31. 12. 2026 – 1. 1. 2027');
  });
});

describe('validateShiftWorkflowSubmission', () => {
  it('accepts complete reports with zero travel, valid dates and overnight single-digit clocks', () => {
    const report = timelog(event(1), { days: [{ d: '2028-02-29', f: '22:00', t: '6:00', type: 'pripravy' }] });
    const input = context({ timelogs: [report] });
    const before = structuredClone(input);
    expect(validateShiftWorkflowSubmission(input)).toEqual([]);
    expect(input).toEqual(before);
  });

  it('identifies all sections missing a report or hours', () => {
    const input = context({ eventIds: [uuid(101), uuid(102)], timelogs: [timelog(event(1), { days: [] })] });
    expect(validateShiftWorkflowSubmission(input)).toEqual([
      { eventId: uuid(101), message: 'Doplňte alespoň jeden záznam hodin.' },
      { eventId: uuid(102), message: 'Chybí výkaz pro tuto část směny.' },
    ]);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects invalid km %s for the correct section', (km) => {
    expect(validateShiftWorkflowSubmission(context({ timelogs: [timelog(event(1), { km })] }))).toEqual([
      { eventId: uuid(101), message: 'Kilometry musí být konečné nezáporné číslo.' },
    ]);
  });

  it.each(['', '2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-1-01', '0000-01-01', '2026-09-23T00:00:00Z'])('rejects invalid calendar date %s', (d) => {
    const report = timelog(event(1));
    report.days[0].d = d;
    expect(validateShiftWorkflowSubmission(context({ timelogs: [report] }))).toEqual([
      { eventId: uuid(101), message: 'Doplňte platné datum: záznam 1.' },
    ]);
  });

  it.each([['', '17:00'], ['08:00', ''], ['24:00', '06:00'], ['08:60', '17:00'], ['8:00', '08:00']])('uses existing clock validation for %s – %s', (f, t) => {
    const report = timelog(event(1));
    report.days[0] = { ...report.days[0], f, t };
    expect(validateShiftWorkflowSubmission(context({ timelogs: [report] }))).toEqual([
      { eventId: uuid(101), message: 'Doplňte platný čas od a do: 2026-09-23, záznam 1.' },
    ]);
  });

  it('rejects an unknown day type', () => {
    const report = timelog(event(1));
    report.days[0].type = 'other' as TimelogDay['type'];
    expect(validateShiftWorkflowSubmission(context({ timelogs: [report] }))).toEqual([
      { eventId: uuid(101), message: 'Vyberte platný typ práce: záznam 1.' },
    ]);
  });

  it.each([
    ['empty sections', context({ eventIds: [], timelogs: [] })],
    ['duplicate section identity', context({ eventIds: [uuid(101), uuid(101)] })],
    ['missing contractor UUID', context({ contractorProfileId: '' })],
    ['missing workflow UUID', context({ workflowId: '300' })],
    ['anchor outside sections', context({ anchorEventId: uuid(999) })],
    ['missing canonical log UUID', context({ timelogs: [timelog(event(1), { supabaseId: undefined })] })],
    ['missing event UUID', context({ timelogs: [timelog(event(1), { eventSupabaseId: undefined })] })],
    ['another person’s report', context({ timelogs: [timelog(event(1), { contractorProfileId: otherCrewId })] })],
    ['report outside sections', context({ timelogs: [timelog(event(2))] })],
    ['two reports for one event', context({ timelogs: [timelog(event(1)), timelog(event(1), { supabaseId: uuid(299) })] })],
    ['one UUID for two reports', context({ eventIds: [uuid(101), uuid(102)], timelogs: [timelog(event(1)), timelog(event(2), { supabaseId: uuid(201) })] })],
  ])('blocks submission on %s even for a manually constructed context', (_name, input) => {
    expect(validateShiftWorkflowSubmission(input).length).toBeGreaterThan(0);
  });

  it('does not allow an active frozen round and later draft parts to be submitted together', () => {
    const input = fixture();
    input.rounds = [round()];
    expect(validateShiftWorkflowSubmission(resolveShiftWorkflowContext(input)!)).toContainEqual({
      eventId: uuid(101), message: 'Pro tuto směnu již probíhá schvalování.',
    });
  });
});
