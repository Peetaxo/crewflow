import { describe, expect, it } from 'vitest';
import type { Timelog } from '../../../types';
import { buildTimelogChangeSummary } from './timelog-change-summary';

describe('buildTimelogChangeSummary', () => {
  it('summarizes changes made by CrewHead before Crew confirmation', () => {
    const timelog: Timelog = {
      id: 'timelog-1',
      eid: 'event-1',
      contractorProfileId: 'profile-1',
      status: 'pending_crew_confirmation',
      km: 12,
      note: '',
      reviewNote: 'Telefonicky upraveno',
      days: [
        { d: '2026-07-29', f: '08:00', t: '19:00', type: 'instal' },
        { d: '2026-07-30', f: '09:00', t: '17:00', type: 'provoz' },
      ],
      crewConfirmationSnapshot: {
        changedAt: '2026-07-30T10:00:00.000Z',
        before: {
          km: 0,
          note: '',
          days: [
            { d: '2026-07-29', f: '08:00', t: '17:00', type: 'instal' },
          ],
        },
      },
    };

    expect(buildTimelogChangeSummary(timelog)).toEqual([
      '29. 7. Čas 08:00–17:00 -> 08:00–19:00',
      'Přidán den 30. 7. 09:00–17:00',
      'Cestovné 0 km -> 12 km',
    ]);
  });

  it('reports only an inserted earlier day without changing the unchanged later day', () => {
    const timelog: Timelog = {
      id: 'timelog-2',
      eid: 'event-1',
      contractorProfileId: 'profile-1',
      status: 'pending_crew_confirmation',
      km: 0,
      note: '',
      days: [
        { d: '2026-07-28', f: '10:00', t: '12:00', type: 'pripravy' },
        { d: '2026-07-29', f: '08:00', t: '17:00', type: 'instal' },
      ],
      crewConfirmationSnapshot: {
        changedAt: '2026-07-30T10:00:00.000Z',
        before: {
          km: 0,
          note: '',
          days: [
            { d: '2026-07-29', f: '08:00', t: '17:00', type: 'instal' },
          ],
        },
      },
    };

    expect(buildTimelogChangeSummary(timelog)).toEqual([
      'Přidán den 28. 7. 10:00–12:00',
    ]);
  });

  it('reports only a removed earlier day without changing the unchanged later day', () => {
    const timelog: Timelog = {
      id: 'timelog-3',
      eid: 'event-1',
      contractorProfileId: 'profile-1',
      status: 'pending_crew_confirmation',
      km: 0,
      note: '',
      days: [
        { d: '2026-07-29', f: '08:00', t: '17:00', type: 'instal' },
      ],
      crewConfirmationSnapshot: {
        changedAt: '2026-07-30T10:00:00.000Z',
        before: {
          km: 0,
          note: '',
          days: [
            { d: '2026-07-28', f: '10:00', t: '12:00', type: 'pripravy' },
            { d: '2026-07-29', f: '08:00', t: '17:00', type: 'instal' },
          ],
        },
      },
    };

    expect(buildTimelogChangeSummary(timelog)).toEqual([
      'Odebrán den 28. 7. 10:00–12:00',
    ]);
  });

  it('still reports a time change on the same day', () => {
    const timelog: Timelog = {
      id: 'timelog-4',
      eid: 'event-1',
      contractorProfileId: 'profile-1',
      status: 'pending_crew_confirmation',
      km: 0,
      note: '',
      days: [
        { d: '2026-07-29', f: '08:00', t: '19:00', type: 'instal' },
      ],
      crewConfirmationSnapshot: {
        changedAt: '2026-07-30T10:00:00.000Z',
        before: {
          km: 0,
          note: '',
          days: [
            { d: '2026-07-29', f: '08:00', t: '17:00', type: 'instal' },
          ],
        },
      },
    };

    expect(buildTimelogChangeSummary(timelog)).toEqual([
      '29. 7. Čas 08:00–17:00 -> 08:00–19:00',
    ]);
  });

  it('reports a date change for the same row id instead of added and removed days', () => {
    const timelog: Timelog = {
      id: 'timelog-5',
      eid: 'event-1',
      contractorProfileId: 'profile-1',
      status: 'pending_crew_confirmation',
      km: 0,
      note: '',
      days: [
        { id: 'day-1', d: '2026-07-30', f: '08:00', t: '17:00', type: 'instal' },
      ],
      crewConfirmationSnapshot: {
        changedAt: '2026-07-30T10:00:00.000Z',
        before: {
          km: 0,
          note: '',
          days: [
            { id: 'day-1', d: '2026-07-29', f: '08:00', t: '17:00', type: 'instal' },
          ],
        },
      },
    };

    expect(buildTimelogChangeSummary(timelog)).toEqual([
      '29. 7. 08:00–17:00 -> 30. 7. 08:00–17:00',
    ]);
  });

  it('handles multiple rows on the same day without reporting the unchanged row', () => {
    const timelog: Timelog = {
      id: 'timelog-6',
      eid: 'event-1',
      contractorProfileId: 'profile-1',
      status: 'pending_crew_confirmation',
      km: 0,
      note: '',
      days: [
        { d: '2026-07-29', f: '08:00', t: '12:00', type: 'instal' },
        { d: '2026-07-29', f: '13:00', t: '18:00', type: 'provoz' },
      ],
      crewConfirmationSnapshot: {
        changedAt: '2026-07-30T10:00:00.000Z',
        before: {
          km: 0,
          note: '',
          days: [
            { d: '2026-07-29', f: '08:00', t: '12:00', type: 'instal' },
            { d: '2026-07-29', f: '13:00', t: '17:00', type: 'provoz' },
          ],
        },
      },
    };

    expect(buildTimelogChangeSummary(timelog)).toEqual([
      '29. 7. Čas 13:00–17:00 -> 13:00–18:00',
    ]);
  });
});
