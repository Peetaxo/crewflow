import { describe, expect, it } from 'vitest';
import type { Event } from '../../types';
import {
  cardTimelineOccurrences,
  createCardTimeline,
  expandCardTimelineHistory,
  previousTimelineWeek,
  type CardTimelineCandidate,
} from './shift-workflow-card-timeline';

const eventId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const makeCandidate = (
  n: number,
  date: string,
  overrides: Partial<Event> = {},
): CardTimelineCandidate => ({
  id: eventId(n),
  event: {
    id: n,
    supabaseId: eventId(n),
    name: `Směna ${n}`,
    job: 'QA100',
    startDate: date,
    endDate: date,
    city: 'Praha',
    needed: 2,
    filled: 1,
    status: 'upcoming',
    client: 'NEXTLEVEL',
    ...overrides,
  },
});

describe('shift workflow card timeline', () => {
  it('prepares the preceding seven days while keeping today as anchor', () => {
    expect(createCardTimeline('2026-10-12')).toEqual({
      anchorDate: '2026-10-12', startDate: '2026-10-05', query: '',
    });
  });

  it('moves to the previous seven calendar days', () => {
    expect(previousTimelineWeek('2026-10-05')).toBe('2026-09-28');
  });

  it('sorts older occurrences above today and future occurrences below it', () => {
    const rows = cardTimelineOccurrences([
      makeCandidate(13, '2026-10-13'),
      makeCandidate(11, '2026-10-11'),
      makeCandidate(12, '2026-10-12'),
    ], createCardTimeline('2026-10-12'));

    expect(rows.map((row) => row.date)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
  });

  it('includes the start boundary but excludes earlier dates without a query', () => {
    const rows = cardTimelineOccurrences([
      makeCandidate(4, '2026-10-04'),
      makeCandidate(5, '2026-10-05'),
      makeCandidate(12, '2026-10-12'),
    ], createCardTimeline('2026-10-12'));

    expect(rows.map((row) => row.date)).toEqual(['2026-10-05', '2026-10-12']);
  });

  it('sorts occurrences on the same date by name then stable identity', () => {
    const rows = cardTimelineOccurrences([
      makeCandidate(3, '2026-10-12', { name: 'Beta' }),
      makeCandidate(2, '2026-10-12', { name: 'Alfa' }),
      makeCandidate(1, '2026-10-12', { name: 'Alfa' }),
    ], createCardTimeline('2026-10-12'));

    expect(rows.map((row) => row.id)).toEqual([eventId(1), eventId(2), eventId(3)]);
  });

  it('searches jobnumber across all dates outside the prepared window', () => {
    const rows = cardTimelineOccurrences([
      makeCandidate(1, '2026-02-01'),
      makeCandidate(2, '2026-10-12', { job: 'OTHER' }),
    ], { ...createCardTimeline('2026-10-12'), query: 'qa100' });

    expect(rows.map((row) => row.date)).toEqual(['2026-02-01']);
  });

  it('crosses empty weeks to reach the nearest older occurrence', () => {
    const timeline = { ...createCardTimeline('2026-10-12'), query: 'QA100' };

    expect(expandCardTimelineHistory(timeline, ['2026-09-20', '2026-10-12'])).toEqual({
      ...timeline, startDate: '2026-09-14',
    });
  });

  it('returns the unchanged timeline when no older occurrence exists', () => {
    const timeline = createCardTimeline('2026-10-12');

    expect(expandCardTimelineHistory(timeline, ['2026-10-12'])).toBe(timeline);
  });

  it.each([
    ['2026-01-03', '2025-12-27'],
    ['2024-03-03', '2024-02-25'],
    ['2026-03-31', '2026-03-24'],
    ['2026-10-27', '2026-10-20'],
  ])('subtracts calendar days across month, year, leap year or DST boundaries from %s', (date, expected) => {
    expect(previousTimelineWeek(date)).toBe(expected);
  });

  it.each([
    '', 'not-a-date', '2026-02-29', '2026-04-31', '2026-13-01',
    '2026-1-02', '2026-10', '2026-10-12T00:00:00Z',
  ])('rejects invalid or non-calendar ISO input %j', (date) => {
    expect(() => previousTimelineWeek(date)).toThrow(RangeError);
    expect(() => createCardTimeline(date)).toThrow(RangeError);
  });

  it('shows ongoing multiday cards including today with one shared event identity', () => {
    const candidate = makeCandidate(1, '2026-10-03', { endDate: '2026-10-13' });
    const timeline = createCardTimeline('2026-10-12');
    const rows = cardTimelineOccurrences([candidate], timeline);

    expect(rows.map((row) => row.date)).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09',
      '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13',
    ]);
    expect(new Set(rows.map((row) => row.id))).toEqual(new Set([candidate.id]));
    expect(rows.every((row) => row.event === candidate.event)).toBe(true);
  });

  it('retains inclusive v2 cards with sparse phase schedules and free days', () => {
    const candidate = makeCandidate(1, '2026-10-11', {
      endDate: '2026-10-14', scheduleVersion: 2, showDayTypes: true,
      freeDays: ['2026-10-12'],
      phaseSchedules: {
        instal: [{ id: 'slot-1', dates: ['2026-10-11'], from: '08:00', to: '12:00' }],
        deinstal: [{ id: 'slot-2', dates: ['2026-10-14'], from: '08:00', to: '12:00' }],
      },
    });

    expect(cardTimelineOccurrences([candidate], createCardTimeline('2026-10-12')).map((row) => row.date))
      .toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
  });

  it('does not fabricate cards in the gap between separate v2 event ranges', () => {
    const rows = cardTimelineOccurrences([
      makeCandidate(1, '2026-10-05', { endDate: '2026-10-06', scheduleVersion: 2 }),
      makeCandidate(2, '2026-10-11', { endDate: '2026-10-12', scheduleVersion: 2 }),
    ], createCardTimeline('2026-10-12'));

    expect(rows.map((row) => row.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-11', '2026-10-12']);
  });

  it('keeps all v2 calendar dates across the spring DST transition', () => {
    const candidate = makeCandidate(1, '2026-03-28', { endDate: '2026-03-31', scheduleVersion: 2 });

    expect(cardTimelineOccurrences([candidate], createCardTimeline('2026-03-31')).map((row) => row.date))
      .toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
  });

  it.each(['', '   \t\n'])('uses the date boundary with a blank query %j', (query) => {
    const rows = cardTimelineOccurrences([
      makeCandidate(1, '2026-02-01'), makeCandidate(2, '2026-10-12'),
    ], { ...createCardTimeline('2026-10-12'), query });

    expect(rows.map((row) => row.id)).toEqual([eventId(2)]);
  });

  it('matches Czech names case insensitively after trimming the global query', () => {
    const rows = cardTimelineOccurrences([
      makeCandidate(1, '2026-02-01', { name: 'ŽLUŤOUČKÁ směna', job: 'OTHER' }),
      makeCandidate(2, '2026-10-12', { name: 'Instalace', job: 'OTHER' }),
    ], { ...createCardTimeline('2026-10-12'), query: '  žluťoučká  ' });

    expect(rows.map((row) => row.id)).toEqual([eventId(1)]);
  });

  it('returns all matching multiday occurrences in chronological order during search', () => {
    const rows = cardTimelineOccurrences([
      makeCandidate(2, '2026-10-12'),
      makeCandidate(1, '2026-02-01', { endDate: '2026-02-02' }),
    ], { ...createCardTimeline('2026-10-12'), query: ' QA100 ' });

    expect(rows.map((row) => row.date)).toEqual(['2026-02-01', '2026-02-02', '2026-10-12']);
  });

  it('deduplicates repeated candidates and overlapping occurrences by identity and date', () => {
    const candidate = makeCandidate(1, '2026-10-11', { endDate: '2026-10-12' });
    const duplicate = { ...candidate, event: { ...candidate.event } };
    const overlapping = { ...candidate, event: { ...candidate.event, startDate: '2026-10-12', endDate: '2026-10-13' } };
    const distinct = makeCandidate(2, '2026-10-12', { name: candidate.event.name });
    const rows = cardTimelineOccurrences([
      candidate, duplicate, overlapping, distinct,
    ], createCardTimeline('2026-10-12'));

    expect(rows.map((row) => [row.id, row.date])).toEqual([
      [eventId(1), '2026-10-11'], [eventId(1), '2026-10-12'],
      [eventId(2), '2026-10-12'], [eventId(1), '2026-10-13'],
    ]);
  });

  it('keeps full and past candidates visible without applying eligibility rules', () => {
    const rows = cardTimelineOccurrences([
      makeCandidate(1, '2026-10-11', { status: 'past' }),
      makeCandidate(2, '2026-10-12', { status: 'full', filled: 2 }),
    ], createCardTimeline('2026-10-12'));

    expect(rows.map((row) => row.id)).toEqual([eventId(1), eventId(2)]);
  });

  it('does not mutate candidates, events or the timeline when sorting and filtering', () => {
    const candidates = [makeCandidate(2, '2026-10-13'), makeCandidate(1, '2026-10-12')];
    const timeline = createCardTimeline('2026-10-12');
    const beforeCandidates = structuredClone(candidates);
    const beforeTimeline = { ...timeline };

    cardTimelineOccurrences(candidates, timeline);

    expect(candidates).toEqual(beforeCandidates);
    expect(timeline).toEqual(beforeTimeline);
  });

  it.each([
    ['2026-10-04', '2026-09-28'],
    ['2026-09-28', '2026-09-28'],
    ['2026-09-27', '2026-09-21'],
    ['2026-09-20', '2026-09-14'],
  ])('expands whole seven-day windows to the nearest earlier date %s', (date, expected) => {
    const timeline = createCardTimeline('2026-10-12');

    expect(expandCardTimelineHistory(timeline, [date]).startDate).toBe(expected);
    expect(timeline.startDate).toBe('2026-10-05');
  });

  it('uses the nearest older occurrence rather than the oldest available date', () => {
    const timeline = createCardTimeline('2026-10-12');

    expect(expandCardTimelineHistory(timeline, ['2026-02-01', '2026-10-12', '2026-10-04']).startDate)
      .toBe('2026-09-28');
  });

  it('expands in calendar weeks across the autumn DST boundary', () => {
    const timeline = createCardTimeline('2026-11-02');

    expect(expandCardTimelineHistory(timeline, ['2026-10-24']).startDate).toBe('2026-10-19');
  });

  it('stops on empty history or when the earliest occurrence is already at the boundary', () => {
    const timeline = createCardTimeline('2026-10-12');

    expect(expandCardTimelineHistory(timeline, [])).toBe(timeline);
    expect(expandCardTimelineHistory(timeline, ['2026-10-05', '2026-10-12'])).toBe(timeline);
  });
});
