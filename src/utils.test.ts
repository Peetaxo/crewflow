import { describe, expect, it } from 'vitest';
import { calculateDayHours, getDatesBetween, isOvernightTimeRange } from './utils';

describe('time calculations', () => {
  it('identifies shifts that continue over midnight', () => {
    expect(isOvernightTimeRange('20:00', '06:00')).toBe(true);
    expect(isOvernightTimeRange('08:00', '17:00')).toBe(false);
    expect(isOvernightTimeRange('08:00', '08:00')).toBe(false);
  });

  it('calculates overnight shift hours from the starting day', () => {
    expect(calculateDayHours('20:00', '06:00')).toBe(10);
    expect(calculateDayHours('22:00', '02:00')).toBe(4);
  });

  it.each([
    ['', '18:00'],
    ['14:00', ''],
    ['', ''],
    ['invalid', '18:00'],
    ['14:00', '24:00'],
    ['12:60', '18:00'],
  ])('counts incomplete or invalid time range %s–%s as zero hours', (from, to) => {
    expect(calculateDayHours(from, to)).toBe(0);
  });
});

describe('event date enumeration', () => {
  it.each([
    ['not-a-date', '2026-09-06'],
    ['2026-09-04', 'not-a-date'],
    ['', ''],
    ['2026-09-06', '2026-09-04'],
  ])('safely returns no dates for an invalid range %s–%s', (start, end) => {
    expect(getDatesBetween(start, end)).toEqual([]);
  });
});
