import { describe, expect, it } from 'vitest';
import { calculateDayHours, isOvernightTimeRange } from './utils';

describe('time calculations', () => {
  it('identifies shifts that continue over midnight', () => {
    expect(isOvernightTimeRange('20:00', '06:00')).toBe(true);
    expect(isOvernightTimeRange('08:00', '17:00')).toBe(false);
    expect(isOvernightTimeRange('08:00', '08:00')).toBe(false);
  });

  it('calculates overnight shift hours from the starting day', () => {
    expect(calculateDayHours('20:00', '06:00')).toBe(10);
  });
});
