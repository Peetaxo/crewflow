import { describe, expect, it } from 'vitest';
import { assertTimelogComplete } from './timelog-validation';

describe('assertTimelogComplete', () => {
  it('requires at least one row', () => {
    expect(() => assertTimelogComplete({ days: [] })).toThrow('Doplňte alespoň jeden záznam hodin.');
  });
  it.each([['', '17:00'], ['08:00', ''], ['25:00', '17:00'], ['8:00', '08:00']])('rejects incomplete clocks %s %s and identifies the row', (f, t) => {
    expect(() => assertTimelogComplete({ days: [
      { d: '2026-09-01', f: '8:00', t: '17:00', type: 'instal' },
      { d: '2026-09-02', f, t, type: 'provoz' },
    ] })).toThrow('Doplňte platný čas od a do: 2026-09-02, záznam 2.');
  });
  it('allows overnight and single-digit-hour actuals without mutating them', () => {
    const timelog = { days: [{ d: '2026-09-01', f: '22:00', t: '6:00', type: 'instal' as const }] };
    expect(() => assertTimelogComplete(timelog)).not.toThrow();
    expect(timelog.days[0].t).toBe('6:00');
  });
});
