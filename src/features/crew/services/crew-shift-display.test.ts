import { afterEach, describe, expect, it, vi } from 'vitest';
import { categorizeCrewTimelogs, resolveNextShiftDisplay, resolveShiftProject } from './crew-shift-display';
import type { Event, Project, Timelog } from '../../../types';

const event: Event = {
  id: 1,
  supabaseId: 'event-uuid-1',
  projectId: null,
  name: 'Prevoz tisku do Estila',
  job: '',
  startDate: '2026-04-20',
  endDate: '2026-04-20',
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'past',
  client: 'NEXT LEVEL',
};

describe('crew shift display helpers', () => {
  it('returns a fallback project for event timelogs without linked project', () => {
    expect(resolveShiftProject(event, [])).toEqual({
      id: 'Bez projektu',
      name: 'Prevoz tisku do Estila',
      client: 'NEXT LEVEL',
      createdAt: '2026-04-20',
      note: '',
    });
  });

  it('resolves linked projects by Supabase project id', () => {
    const project: Project = {
      id: 'EIT018',
      supabaseId: 'project-uuid-1',
      name: 'EIT018',
      client: 'JCHP s.r.o.',
      createdAt: '2026-04-10',
    };

    expect(resolveShiftProject({ ...event, projectId: 'project-uuid-1', job: '' }, [project])).toBe(project);
  });

  it('keeps draft shifts together while exposing future drafts for the next-shift card', () => {
    const futureEvent: Event = {
      ...event,
      id: 2,
      startDate: '2999-04-30',
      endDate: '2999-04-30',
      status: 'upcoming',
    };
    const pastDraft: Timelog = {
      id: 1,
      eid: event.id,
      contractorProfileId: 'profile-1',
      days: [],
      km: 0,
      note: '',
      status: 'draft',
    };
    const futureDraft: Timelog = {
      ...pastDraft,
      id: 2,
      eid: futureEvent.id,
    };
    const pending: Timelog = {
      ...pastDraft,
      id: 3,
      status: 'pending_ch',
    };
    const approved: Timelog = {
      ...pastDraft,
      id: 4,
      status: 'approved',
    };

    expect(categorizeCrewTimelogs([pastDraft, futureDraft, pending, approved], [event, futureEvent])).toEqual({
      drafts: [pastDraft, futureDraft],
      upcoming: [futureDraft],
      processing: [pending],
      invoiced: [approved],
    });
  });
});

describe('next crew shift display', () => {
  const scheduledEvent: Event = {
    ...event,
    startDate: '2999-04-01',
    endDate: '2999-04-30',
    startTime: '14:00',
    scheduleVersion: 2,
  };
  const timelog: Timelog = {
    id: 1,
    eid: event.id,
    contractorProfileId: 'profile-1',
    days: [],
    km: 0,
    note: '',
    status: 'draft',
  };
  const today = '2999-04-20';

  afterEach(() => vi.useRealTimers());

  it('selects the earliest remaining assignment by date and numeric clock without mutating days', () => {
    const days: Timelog['days'] = [
      { d: '2999-04-25', f: '08:00', t: '18:00', type: 'provoz' },
      { d: '2999-04-19', f: '08:00', t: '18:00', type: 'provoz' },
      { d: today, f: '', t: '', type: 'provoz' },
      { d: today, f: '10:00', t: '18:00', type: 'provoz' },
      { d: today, f: '9:00', t: '18:00', type: 'provoz' },
      { d: today, f: '09:30', t: '18:00', type: 'provoz' },
    ];
    const original = structuredClone(days);

    expect(resolveNextShiftDisplay({ ...timelog, days }, scheduledEvent, today)).toEqual({
      date: today,
      time: '9:00',
      sortKey: '2999-04-20T09:00',
    });
    expect(days).toEqual(original);
  });

  it.each(['', '25:00', 'unknown'])('does not replace an unknown assigned time (%s) with an event boundary', (f) => {
    expect(resolveNextShiftDisplay({
      ...timelog,
      days: [{ d: '2999-04-25', f, t: '', type: 'provoz' }],
    }, scheduledEvent, today)).toEqual({
      date: '2999-04-25',
      time: 'Čas zatím neurčen',
      sortKey: '2999-04-25T24:00',
    });
  });

  it('uses the local calendar day when excluding past assignments', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2999, 3, 20, 0, 30));
    const draft = {
      ...timelog,
      days: [
        { d: '2999-04-19', f: '23:00', t: '23:59', type: 'provoz' as const },
        { d: today, f: '09:00', t: '18:00', type: 'provoz' as const },
      ],
    };

    expect(resolveNextShiftDisplay(draft, scheduledEvent)?.date).toBe(today);
    expect(categorizeCrewTimelogs([{ ...draft, days: [draft.days[0]] }], [scheduledEvent]).upcoming).toEqual([]);
  });

  it('excludes v2 drafts without future dated assignments only from upcoming', () => {
    const drafts: Timelog[] = [
      { ...timelog, id: 1, days: [] },
      { ...timelog, id: 2, days: [{ d: '2020-04-01', f: '09:00', t: '18:00', type: 'provoz' }] },
      { ...timelog, id: 3, days: [{ d: '', f: '', t: '', type: 'provoz' }] },
    ];

    expect(categorizeCrewTimelogs(drafts, [scheduledEvent])).toMatchObject({ drafts, upcoming: [] });
    drafts.forEach((draft) => expect(resolveNextShiftDisplay(draft, scheduledEvent, today)).toBeNull());
  });

  it('excludes a malformed future date from upcoming while retaining its draft', () => {
    const draft: Timelog = {
      ...timelog,
      days: [{ d: '2999-4-25 ', f: '09:00', t: '18:00', type: 'provoz' }],
    };

    expect(resolveNextShiftDisplay(draft, scheduledEvent, today)).toBeNull();
    expect(categorizeCrewTimelogs([draft], [scheduledEvent])).toMatchObject({ drafts: [draft], upcoming: [] });
  });

  it('recognizes the exact UUID alias without conflating unrelated IDs', () => {
    const draft: Timelog = {
      ...timelog,
      eid: scheduledEvent.supabaseId as unknown as number,
      days: [{ d: '2999-04-25', f: '09:00', t: '18:00', type: 'provoz' }],
    };
    const unrelated = { ...draft, id: 2, eid: 'unrelated-event-uuid' as unknown as number };

    expect(categorizeCrewTimelogs([draft, unrelated], [scheduledEvent]).upcoming).toEqual([draft]);
  });

  it.each([undefined, 1] as const)('preserves legacy event boundary and first-row fallback precedence for version %s', (scheduleVersion) => {
    const legacyEvent = { ...scheduledEvent, scheduleVersion };
    const draft = { ...timelog, days: [{ d: today, f: '9:00', t: '18:00', type: 'provoz' as const }] };

    expect(resolveNextShiftDisplay(draft, legacyEvent, today)).toEqual({
      date: '2999-04-01', time: '14:00', sortKey: '2999-04-01T14:00',
    });
    expect(resolveNextShiftDisplay(draft, { ...legacyEvent, startTime: undefined }, today)).toEqual({
      date: '2999-04-01', time: '9:00', sortKey: '2999-04-01T9:00',
    });
    expect(resolveNextShiftDisplay(timelog, { ...legacyEvent, startTime: undefined }, today)).toEqual({
      date: '2999-04-01', time: undefined, sortKey: '2999-04-01T00:00',
    });
    expect(categorizeCrewTimelogs([timelog], [legacyEvent]).upcoming).toEqual([timelog]);
  });
});
