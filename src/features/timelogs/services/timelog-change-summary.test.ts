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
});
