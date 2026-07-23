import { describe, expect, it } from 'vitest';
import type { Event, TimelogDay } from '../../../types';
import {
  buildQuarterHourOptions,
  buildTimelogCalendarDates,
  getTimelogDayEntryKey,
  isDateInEventRange,
  removeTimelogDayEntry,
  resolveTimelogDayDefaults,
  upsertTimelogDay,
} from './timelog-day-ui';

const event: Event = {
  id: 1,
  name: 'TEST',
  job: 'JOB-1',
  startDate: '2026-07-13',
  endDate: '2026-07-15',
  startTime: '08:00',
  endTime: '17:00',
  city: 'Praha',
  needed: 2,
  filled: 1,
  status: 'upcoming',
  client: 'NEXTLEVEL',
  showDayTypes: true,
  dayTypes: {
    '2026-07-13': 'instal',
    '2026-07-14': 'provoz',
    '2026-07-15': 'deinstal',
  },
  phaseTimes: {
    instal: { from: '07:00', to: '16:00' },
    provoz: { from: '09:00', to: '18:00' },
    deinstal: { from: '10:00', to: '15:00' },
  },
};

describe('timelog day UI helpers', () => {
  it('builds 15-minute time options for mobile selectors', () => {
    const options = buildQuarterHourOptions();

    expect(options).toHaveLength(96);
    expect(options.slice(0, 4)).toEqual(['00:00', '00:15', '00:30', '00:45']);
    expect(options.at(-1)).toBe('23:45');
  });

  it('builds calendar dates from event dates and extra reported days only', () => {
    expect(buildTimelogCalendarDates(event, [
      { d: '2026-07-11', f: '10:00', t: '12:00', type: 'instal' },
      { d: '2026-07-18', f: '08:00', t: '10:00', type: 'deinstal' },
    ])).toEqual([
      '2026-07-11',
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-18',
    ]);
  });

  it('detects whether a date belongs to the planned event range', () => {
    expect(isDateInEventRange('2026-07-13', event)).toBe(true);
    expect(isDateInEventRange('2026-07-15', event)).toBe(true);
    expect(isDateInEventRange('2026-07-16', event)).toBe(false);
  });

  it('resolves default day type and times from event phase settings', () => {
    expect(resolveTimelogDayDefaults('2026-07-14', event)).toEqual({
      d: '2026-07-14',
      f: '09:00',
      t: '18:00',
      type: 'provoz',
      note: '',
    });
  });

  it('lets a manually selected phase override the event day type', () => {
    expect(resolveTimelogDayDefaults('2026-07-14', event, 'instal')).toEqual({
      d: '2026-07-14',
      f: '07:00',
      t: '16:00',
      type: 'instal',
      note: '',
    });
  });

  it('replaces only the selected entry when a date has multiple records', () => {
    const days: TimelogDay[] = [
      { id: 'entry-2', d: '2026-07-14', f: '18:00', t: '23:00', type: 'provoz' },
      { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
      { id: 'entry-0', d: '2026-07-13', f: '07:00', t: '16:00', type: 'instal' },
    ];

    expect(upsertTimelogDay(days, {
      id: 'entry-2',
      d: '2026-07-14',
      f: '18:15',
      t: '23:15',
      type: 'provoz',
      note: 'Telefonicky domluveno',
    }, 'entry-2')).toEqual([
      { id: 'entry-0', d: '2026-07-13', f: '07:00', t: '16:00', type: 'instal' },
      { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
      {
        id: 'entry-2',
        d: '2026-07-14',
        f: '18:15',
        t: '23:15',
        type: 'provoz',
        note: 'Telefonicky domluveno',
      },
    ]);
  });

  it('appends a new entry even when the same date already exists', () => {
    const days: TimelogDay[] = [
      { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
    ];

    expect(upsertTimelogDay(days, {
      id: 'entry-2',
      d: '2026-07-14',
      f: '18:00',
      t: '23:00',
      type: 'provoz',
    }, 'entry-2')).toEqual([
      { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
      { id: 'entry-2', d: '2026-07-14', f: '18:00', t: '23:00', type: 'provoz' },
    ]);
  });

  it('removes only one selected entry from a duplicated date', () => {
    const days: TimelogDay[] = [
      { id: 'entry-1', d: '2026-07-14', f: '09:00', t: '12:00', type: 'provoz' },
      { id: 'entry-2', d: '2026-07-14', f: '18:00', t: '23:00', type: 'provoz' },
    ];

    expect(removeTimelogDayEntry(days, 'entry-1')).toEqual([
      { id: 'entry-2', d: '2026-07-14', f: '18:00', t: '23:00', type: 'provoz' },
    ]);
  });

  it('builds a stable fallback key for entries without a database id', () => {
    expect(getTimelogDayEntryKey({
      d: '2026-07-14',
      f: '09:00',
      t: '12:00',
      type: 'provoz',
      note: 'Ranni blok',
    }, 1)).toBe('2026-07-14|09:00|12:00|provoz|Ranni blok|1');
  });
});
