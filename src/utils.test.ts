import { describe, expect, it } from 'vitest';
import { calculateDayHours, calculateMealAllowance, isOvernightTimeRange } from './utils';

describe('time calculations', () => {
  it('identifies shifts that continue over midnight', () => {
    expect(isOvernightTimeRange('20:00', '06:00')).toBe(true);
    expect(isOvernightTimeRange('08:00', '17:00')).toBe(false);
    expect(isOvernightTimeRange('08:00', '08:00')).toBe(false);
  });

  it('calculates overnight shift hours from the starting day', () => {
    expect(calculateDayHours('20:00', '06:00')).toBe(10);
  });

  it('calculates meal allowance by shift duration and selected meals', () => {
    expect(calculateMealAllowance([
      { f: '08:00', t: '13:45', meals: ['obed'] },
      { f: '08:00', t: '16:00', meals: ['obed'] },
      { f: '08:00', t: '18:30', meals: ['vecere'] },
      { f: '08:00', t: '21:00', meals: ['obed'] },
      { f: '08:00', t: '21:00', meals: ['obed', 'vecere'] },
    ])).toBe(0 + 250 + 350 + 250 + 500);
  });
});
