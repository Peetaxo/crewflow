import { describe, expect, it } from 'vitest';
import type { Event, EventPhaseSlot, Timelog, TimelogDay, TimelogType } from '../../../types';
import { buildEventScheduleDays, resolveEventScheduleDay } from './event-schedule';
import {
  buildTimelogDaysForEvent,
  getScheduledEventDay,
  normalizeEventSchedules,
  syncDayTypesFromSchedules,
  syncEventTimelogs,
} from './events.service';

const event: Event = {
  id: 1,
  name: 'Test',
  job: 'TEST1',
  client: '',
  city: '',
  needed: 1,
  filled: 0,
  status: 'planning',
  startDate: '2026-09-04',
  endDate: '2026-09-06',
  startTime: '14:00',
  endTime: '18:00',
  scheduleVersion: 2,
};

const day = (date: string, type: TimelogType = 'instal', from = '', to = ''): TimelogDay => ({
  d: date, f: from, t: to, type, meals: [], meal: null, note: '',
});

const slot = (id: string, dates: string[], from = '', to = ''): EventPhaseSlot => ({
  id, dates, from, to,
});

describe('v2 event schedule defaults', () => {
  it('keeps Friday–Sunday boundaries and the middle day untimed', () => {
    expect(buildEventScheduleDays(event)).toEqual([
      day('2026-09-04'), day('2026-09-05'), day('2026-09-06'),
    ]);
    for (const date of ['2026-09-04', '2026-09-05', '2026-09-06']) {
      expect(resolveEventScheduleDay(date, event)).toEqual(day(date));
    }
  });

  it('uses a single unphased event’s boundary times as editable defaults', () => {
    const singleDayEvent = { ...event, endDate: event.startDate };
    expect(resolveEventScheduleDay(event.startDate, singleDayEvent)).toEqual(day(event.startDate, 'instal', '14:00', '18:00'));
    expect(buildEventScheduleDays(singleDayEvent)).toEqual([day(event.startDate, 'instal', '14:00', '18:00')]);
  });

  it('does not apply single-day boundary defaults to an extra manual date', () => {
    expect(resolveEventScheduleDay('2026-09-07', { ...event, endDate: event.startDate })).toEqual(day('2026-09-07'));
  });

  it('keeps an explicit untimed phase blank even on a single-day event', () => {
    const phasedEvent = {
      ...event,
      endDate: event.startDate,
      showDayTypes: true,
      phaseSchedules: { provoz: [slot('untimed', [event.startDate])] },
    };
    expect(resolveEventScheduleDay(event.startDate, phasedEvent)).toEqual(day(event.startDate, 'provoz'));
    expect(buildEventScheduleDays(phasedEvent)).toEqual([day(event.startDate, 'provoz')]);
  });

  it('uses a matching timed phase slot before boundaries, day types and legacy phase times', () => {
    const phasedEvent: Event = {
      ...event,
      showDayTypes: true,
      dayTypes: { '2026-09-04': 'instal' },
      phaseTimes: { provoz: { from: '09:00', to: '17:00' } },
      phaseSchedules: { provoz: [slot('night', [event.startDate], '22:00', '02:00')] },
    };
    expect(resolveEventScheduleDay(event.startDate, phasedEvent, 'provoz')).toEqual(day(event.startDate, 'provoz', '22:00', '02:00'));
    expect(buildEventScheduleDays(phasedEvent, ['provoz'])).toEqual([day(event.startDate, 'provoz', '22:00', '02:00')]);
  });

  it.each([
    ['', '18:00'],
    ['14:00', ''],
    ['invalid', '18:00'],
    ['14:00', '24:00'],
    ['14:00', '14:00'],
    ['8:00', '08:00'],
  ])('keeps both defaults blank for incomplete or invalid phase times %s–%s', (from, to) => {
    const phasedEvent = {
      ...event,
      showDayTypes: true,
      phaseSchedules: { instal: [slot('partial', [event.startDate], from, to)] },
    };
    expect(resolveEventScheduleDay(event.startDate, phasedEvent)).toEqual(day(event.startDate));
    expect(buildEventScheduleDays(phasedEvent, ['instal'])).toEqual([day(event.startDate)]);
  });

  it('does not synthesize timed defaults from phaseTimes for a multiday event', () => {
    const phasedEvent: Event = {
      ...event,
      showDayTypes: true,
      dayTypes: { '2026-09-05': 'pripravy' },
      phaseTimes: { pripravy: { from: '08:00', to: '17:00' } },
    };
    expect(resolveEventScheduleDay('2026-09-05', phasedEvent)).toEqual(day('2026-09-05', 'pripravy'));
    expect(buildEventScheduleDays(phasedEvent, ['pripravy'])).toEqual([day('2026-09-05', 'pripravy')]);
  });

  it('excludes explicit free days but retains unknown dates for all-event assignment', () => {
    const phasedEvent = {
      ...event,
      showDayTypes: true,
      freeDays: ['2026-09-05'],
      phaseSchedules: { provoz: [slot('work', ['2026-09-04', '2026-09-05'], '09:00', '17:00')] },
    };
    expect(buildEventScheduleDays(phasedEvent)).toEqual([
      day('2026-09-04', 'provoz', '09:00', '17:00'), day('2026-09-06'),
    ]);
    expect(resolveEventScheduleDay('2026-09-05', phasedEvent, 'provoz')).toEqual(day('2026-09-05', 'provoz'));
    expect(buildEventScheduleDays(phasedEvent, ['instal'])).toEqual([]);
  });

  it('ignores stored phase and free-day settings while day types are disabled', () => {
    const unphasedEvent = {
      ...event,
      showDayTypes: false,
      freeDays: [event.startDate],
      phaseSchedules: { provoz: [slot('work', [event.startDate], '09:00', '17:00')] },
    };
    expect(buildEventScheduleDays(unphasedEvent)).toEqual([
      day('2026-09-04'), day('2026-09-05'), day('2026-09-06'),
    ]);
    expect(resolveEventScheduleDay(event.startDate, unphasedEvent, 'pripravy')).toEqual(day(event.startDate, 'pripravy'));
  });

  it('preserves every slot including repeated types and sorts dates and times chronologically', () => {
    const phasedEvent = {
      ...event,
      showDayTypes: true,
      phaseSchedules: {
        deinstal: [slot('last', ['2026-09-05'], '19:00', '22:00')],
        provoz: [slot('late', ['2026-09-04'], '18:00', '21:00'), slot('early', ['2026-09-04'], '10:00', '12:00')],
        instal: [slot('setup', ['2026-09-04'], '8:00', '10:00')],
        pripravy: [slot('prep', ['2026-09-04'], '06:00', '08:00')],
      },
    };
    const before = structuredClone(phasedEvent);
    expect(buildEventScheduleDays(phasedEvent)).toEqual([
      day('2026-09-04', 'pripravy', '06:00', '08:00'),
      day('2026-09-04', 'instal', '8:00', '10:00'),
      day('2026-09-04', 'provoz', '10:00', '12:00'),
      day('2026-09-04', 'provoz', '18:00', '21:00'),
      day('2026-09-05', 'deinstal', '19:00', '22:00'),
      day('2026-09-06'),
    ]);
    expect(resolveEventScheduleDay('2026-09-04', phasedEvent, 'provoz')).toEqual(day('2026-09-04', 'provoz', '10:00', '12:00'));
    expect(phasedEvent).toEqual(before);
  });

  it('returns only the selected phase on its matching dates and excludes out-of-range slots', () => {
    const phasedEvent = {
      ...event,
      showDayTypes: true,
      phaseSchedules: {
        pripravy: [slot('prep', ['2026-09-03', '2026-09-04'], '06:00', '08:00')],
        provoz: [slot('work', ['2026-09-05'], '10:00', '18:00')],
      },
    };
    const choices: Array<TimelogType | 'all'> = ['pripravy'];
    expect(buildEventScheduleDays(phasedEvent, choices)).toEqual([day('2026-09-04', 'pripravy', '06:00', '08:00')]);
    expect(buildEventScheduleDays(phasedEvent, [])).toEqual([]);
    expect(choices).toEqual(['pripravy']);
  });

  it.each([
    { startDate: 'not-a-date' },
    { endDate: 'not-a-date' },
    { startDate: '2026-09-07' },
  ])('returns no rows for malformed or reversed dates: %j', (override) => {
    expect(buildEventScheduleDays({ ...event, ...override })).toEqual([]);
  });
});

describe('schedule version service routing', () => {
  it('uses v2 defaults when constructing timelog days with omitted phase choices', () => {
    expect(buildTimelogDaysForEvent(event)).toEqual(buildEventScheduleDays(event));
    const phasedEvent = { ...event, showDayTypes: true };
    expect(buildTimelogDaysForEvent(phasedEvent)).toEqual(buildEventScheduleDays(phasedEvent));
    expect(buildTimelogDaysForEvent(phasedEvent, [])).toEqual([]);
  });

  it('does not synthesize schedules from v2 boundary or legacy phase times', () => {
    expect(normalizeEventSchedules(event)).toEqual({});
    const schedules = { pripravy: [slot('prep', [event.startDate])] };
    expect(normalizeEventSchedules({ ...event, phaseSchedules: schedules })).toBe(schedules);
  });

  it('includes preparation days when synchronizing v2 day types', () => {
    expect(syncDayTypesFromSchedules({
      ...event,
      phaseSchedules: {
        pripravy: [slot('prep', ['2026-09-03'])],
        instal: [slot('setup', ['2026-09-04'])],
        provoz: [slot('run', ['2026-09-05'])],
        deinstal: [slot('break', ['2026-09-06'])],
      },
    })).toEqual({
      '2026-09-03': 'pripravy', '2026-09-04': 'instal', '2026-09-05': 'provoz', '2026-09-06': 'deinstal',
    });
  });

  it.each([false, true])('preserves recorded actual days when synchronizing v2 schedules (phases %s)', (showDayTypes) => {
    const actual: TimelogDay = { ...day(event.startDate, 'pripravy', '11:00', '21:00'), id: 'actual', meals: ['obed'], note: 'Actual work' };
    const timelog: Timelog = { id: 1, eid: event.id, days: [actual], km: 12, note: 'Reported', status: 'draft' };
    const changedEvent: Event = {
      ...event,
      showDayTypes,
      dayTypes: { [event.startDate]: 'provoz' },
      phaseSchedules: { pripravy: [slot('changed', [event.startDate], '06:00', '08:00')] },
    };
    const before = structuredClone(timelog);
    expect(getScheduledEventDay(changedEvent, actual)).toBe(actual);
    expect(syncEventTimelogs([timelog], changedEvent)).toEqual([before]);
    expect(timelog).toEqual(before);
  });

  it.each([undefined, 1] as const)('keeps legacy boundary defaults and actual synchronization for version %s', (scheduleVersion) => {
    const legacy = { ...event, scheduleVersion };
    expect(buildTimelogDaysForEvent(legacy)).toEqual([
      { d: '2026-09-04', f: '14:00', t: '18:00', type: 'instal' },
      { d: '2026-09-05', f: '14:00', t: '18:00', type: 'instal' },
      { d: '2026-09-06', f: '14:00', t: '18:00', type: 'instal' },
    ]);
    expect(getScheduledEventDay(legacy, day(event.startDate, 'pripravy', '10:00', '20:00'))).toEqual(day(event.startDate, 'instal', '14:00', '18:00'));
    expect(Object.keys(normalizeEventSchedules(legacy))).toEqual(['instal', 'provoz', 'deinstal']);
    expect(syncDayTypesFromSchedules({ ...legacy, phaseSchedules: { pripravy: [slot('prep', [event.startDate])] } })).toEqual({});
  });
});
