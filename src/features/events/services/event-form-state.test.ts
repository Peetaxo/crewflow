import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, EventPhaseSlot, TimelogType } from '../../../types';
import {
  createEventFormPlan,
  getEventFormDates,
  serializeEventFormPlan,
  validateEventForm,
  type EventFormPlan,
} from './event-form-state';

const formEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  name: 'Festival',
  job: 'EVT001',
  startDate: '2026-09-04',
  endDate: '2026-09-06',
  startTime: '08:00',
  endTime: '18:00',
  scheduleVersion: 2,
  city: 'Praha',
  needed: 3,
  filled: 0,
  status: 'planning',
  client: 'Klient',
  contactPerson: 'Jana Nováková',
  showDayTypes: true,
  ...overrides,
});

const slot = (
  id: string,
  dates: string[],
  from = '',
  to = '',
): EventPhaseSlot => ({ id, dates, from, to });

const phase = (
  id: string,
  type: TimelogType,
  from = '',
  to = '',
  showTimes = Boolean(from || to),
) => ({ id, type, from, to, showTimes });

describe('getEventFormDates', () => {
  beforeEach(() => vi.stubEnv('TZ', 'Europe/Prague'));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['', '2026-09-04'],
    ['2026-09-04', ''],
    ['invalid', '2026-09-04'],
    ['2026-02-30', '2026-03-01'],
    ['2026-09-05', '2026-09-04'],
  ])('returns no dates for incomplete, invalid or reversed range %s–%s', (startDate, endDate) => {
    expect(getEventFormDates(startDate, endDate)).toEqual([]);
  });

  it.each([
    ['spring', '2026-03-28', '2026-03-31', ['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']],
    ['autumn', '2026-10-24', '2026-10-27', ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']],
  ])('enumerates local calendar dates once across Prague $name DST', (_name, startDate, endDate, expected) => {
    expect(getEventFormDates(startDate, endDate)).toEqual(expected);
  });
});

describe('event form plan initialization', () => {
  it('leaves unknown v2 dates absent instead of inventing a phase or free day', () => {
    expect(createEventFormPlan(formEvent())).toEqual({});
  });

  it('clones every explicit phase, repeated type, preparation and free day on its actual date', () => {
    const event = formEvent({
      freeDays: ['2026-09-05', '2026-09-08'],
      phaseSchedules: {
        pripravy: [slot('prep', ['2026-09-03'], '06:00', '08:00')],
        instal: [slot('setup', ['2026-09-04', '2026-09-05'], '08:00', '11:00')],
        provoz: [
          slot('run-am', ['2026-09-04'], '11:00', '15:00'),
          slot('run-pm', ['2026-09-04'], '16:00', '23:00'),
        ],
        deinstal: [slot('break', ['2026-09-07'])],
      },
    });
    const before = structuredClone(event);

    const plan = createEventFormPlan(event);

    expect(plan['2026-09-03']).toEqual({ free: false, phases: [phase('prep', 'pripravy', '06:00', '08:00')] });
    expect(plan['2026-09-04']?.phases).toEqual([
      expect.objectContaining({ type: 'instal', from: '08:00', to: '11:00', showTimes: true }),
      phase('run-am', 'provoz', '11:00', '15:00'),
      phase('run-pm', 'provoz', '16:00', '23:00'),
    ]);
    expect(plan['2026-09-05']).toMatchObject({ free: true });
    expect(plan['2026-09-07']).toEqual({ free: false, phases: [phase('break', 'deinstal')] });
    expect(plan['2026-09-08']).toEqual({ free: true, phases: [] });
    expect(plan['2026-09-04']?.phases[0].id).not.toBe('setup');
    expect(plan['2026-09-04']?.phases[0].id).not.toBe(plan['2026-09-05']?.phases[0].id);
    expect(createEventFormPlan(event)['2026-09-04']?.phases[0].id).toBe(plan['2026-09-04']?.phases[0].id);
    expect(event).toEqual(before);
  });
});

describe('event form plan serialization', () => {
  const cachedPlan: EventFormPlan = {
    '2026-09-03': { free: false, phases: [phase('outside-before', 'pripravy', '06:00', '08:00')] },
    '2026-09-04': {
      free: false,
      phases: [
        phase('setup', 'instal', '08:00', '10:00'),
        phase('run-am', 'provoz', '10:00', '15:00'),
        phase('run-pm', 'provoz', '16:00', '23:00'),
      ],
    },
    '2026-09-05': { free: true, phases: [phase('cached-free', 'deinstal', '20:00', '22:00')] },
    '2026-09-06': { free: false, phases: [phase('untimed', 'deinstal', '20:00', '', false)] },
    '2026-09-07': { free: false, phases: [phase('outside-after', 'deinstal', '07:00', '09:00')] },
  };

  it('emits only the active range while preserving cached dates, repeated phases and hidden times', () => {
    const before = structuredClone(cachedPlan);

    const serialized = serializeEventFormPlan(formEvent(), cachedPlan);

    expect(serialized.freeDays).toEqual(['2026-09-05']);
    expect(serialized.dayTypes).toEqual({
      '2026-09-04': 'instal',
      '2026-09-06': 'deinstal',
    });
    expect(serialized.phaseSchedules).toEqual({
      instal: [slot('setup', ['2026-09-04'], '08:00', '10:00')],
      provoz: [
        slot('run-am', ['2026-09-04'], '10:00', '15:00'),
        slot('run-pm', ['2026-09-04'], '16:00', '23:00'),
      ],
      deinstal: [slot('untimed', ['2026-09-06'])],
    });
    expect(cachedPlan).toEqual(before);
  });

  it('suppresses active phases on free days without deleting their draft rows', () => {
    const before = structuredClone(cachedPlan);
    const serialized = serializeEventFormPlan(formEvent(), cachedPlan);

    expect(Object.values(serialized.phaseSchedules).flat()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'cached-free' })]),
    );
    expect(cachedPlan).toEqual(before);
  });

  it('deactivates schedules, day types and free days while the planner toggle is off and restores from the same cache', () => {
    expect(serializeEventFormPlan(formEvent({ showDayTypes: false }), cachedPlan)).toEqual({
      phaseSchedules: {},
      dayTypes: {},
      freeDays: [],
    });

    expect(serializeEventFormPlan(formEvent({ showDayTypes: true }), cachedPlan).freeDays).toEqual(['2026-09-05']);
  });

  it('keeps out-of-range draft dates available when a range is shortened and restored', () => {
    const shortened = formEvent({ endDate: '2026-09-04' });
    const restored = formEvent({ endDate: '2026-09-07' });

    expect(serializeEventFormPlan(shortened, cachedPlan).phaseSchedules).toEqual({
      instal: [slot('setup', ['2026-09-04'], '08:00', '10:00')],
      provoz: [
        slot('run-am', ['2026-09-04'], '10:00', '15:00'),
        slot('run-pm', ['2026-09-04'], '16:00', '23:00'),
      ],
    });
    expect(serializeEventFormPlan(restored, cachedPlan).phaseSchedules.deinstal).toEqual([
      slot('untimed', ['2026-09-06']),
      slot('outside-after', ['2026-09-07'], '07:00', '09:00'),
    ]);
  });
});

describe('event form validation', () => {
  const emptyPlan: EventFormPlan = {};

  it.each([
    [{ job: '   ' }, 'Job Number'],
    [{ name: '   ' }, 'název akce'],
    [{ client: '   ' }, 'klienta'],
    [{ startDate: '' }, 'datum začátku'],
    [{ endDate: '2026-02-30' }, 'datum konce'],
    [{ startTime: '' }, 'čas začátku'],
    [{ endTime: '25:00' }, 'čas konce'],
    [{ contactPerson: '  ', contactProfileId: null }, 'kontaktní osobu'],
    [{ needed: -1 }, 'Počet Crew'],
    [{ needed: 1.5 }, 'Počet Crew'],
  ])('rejects an invalid required form field %j', (override, message) => {
    expect(() => validateEventForm(formEvent(override), emptyPlan)).toThrow(message);
  });

  it('accepts a linked contact profile without a free-text snapshot or role check', () => {
    expect(() => validateEventForm(formEvent({
      contactPerson: ' ',
      contactProfileId: 'profile-without-coo-role',
      needed: 0,
    }), emptyPlan)).not.toThrow();
  });

  it('requires end after start on a one-day event', () => {
    expect(() => validateEventForm(formEvent({ endDate: '2026-09-04', endTime: '08:00' }), emptyPlan))
      .toThrow('Konec akce musí být později');
    expect(() => validateEventForm(formEvent({ endDate: '2026-09-04', endTime: '07:59' }), emptyPlan))
      .toThrow('Konec akce musí být později');
    expect(() => validateEventForm(formEvent({ endDate: '2026-09-04', endTime: '08:01' }), emptyPlan))
      .not.toThrow();
  });

  it('accepts any valid clocks across ordered dates and rejects reversed boundaries', () => {
    expect(() => validateEventForm(formEvent({ startTime: '23:30', endTime: '00:15' }), emptyPlan)).not.toThrow();
    expect(() => validateEventForm(formEvent({ startDate: '2026-09-07', endDate: '2026-09-06' }), emptyPlan))
      .toThrow('Konec akce musí být později');
  });

  it('allows blank paired phase times and overnight intervals', () => {
    const plan: EventFormPlan = {
      '2026-09-04': {
        free: false,
        phases: [phase('untimed', 'instal', '', '', true), phase('overnight', 'provoz', '22:00', '02:00')],
      },
    };
    expect(() => validateEventForm(formEvent(), plan)).not.toThrow();
  });

  it.each([
    ['', '18:00'],
    ['08:00', ''],
    ['invalid', '18:00'],
    ['08:00', '24:00'],
    ['08:00', '08:00'],
  ])('rejects an active partial, invalid or equal phase interval %s–%s', (from, to) => {
    const plan: EventFormPlan = {
      '2026-09-04': { free: false, phases: [phase('bad', 'instal', from, to, true)] },
    };
    expect(() => validateEventForm(formEvent(), plan)).toThrow('platné časy fáze Instalace (řádek 1) pro 2026-09-04');
  });

  it.each([
    ['provoz', 'pripravy', 'Přípravy'],
    ['pripravy', 'instal', 'Instalace'],
    ['instal', 'provoz', 'Provoz'],
    ['provoz', 'provoz', 'Provoz'],
    ['provoz', 'deinstal', 'Deinstalace'],
  ] as const)('identifies the invalid second same-day phase after %s when its type is %s', (firstType, invalidType, label) => {
    const plan: EventFormPlan = {
      '2026-09-04': {
        free: false,
        phases: [
          phase('first', firstType, '08:00', '10:00'),
          phase('second', invalidType, '11:00', ''),
        ],
      },
    };

    expect(() => validateEventForm(formEvent(), plan))
      .toThrow(`Doplňte platné časy fáze ${label} (řádek 2) pro 2026-09-04.`);
  });

  it('ignores hidden, out-of-range and free-day partial phase fields', () => {
    const plan: EventFormPlan = {
      '2026-09-03': { free: false, phases: [phase('outside', 'pripravy', '08:00', '', true)] },
      '2026-09-04': { free: false, phases: [phase('hidden', 'instal', '08:00', '', false)] },
      '2026-09-05': { free: true, phases: [phase('free', 'provoz', '08:00', '', true)] },
    };
    expect(() => validateEventForm(formEvent(), plan)).not.toThrow();
    expect(() => validateEventForm(formEvent({ showDayTypes: false }), {
      '2026-09-04': { free: false, phases: [phase('inactive', 'instal', '08:00', '', true)] },
    })).not.toThrow();
  });
});
