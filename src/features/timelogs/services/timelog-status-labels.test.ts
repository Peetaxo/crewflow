import { describe, expect, it } from 'vitest';
import { getTimelogStatusLabel } from './timelog-status-labels';

describe('getTimelogStatusLabel', () => {
  it('uses a Crew-specific label while waiting for corrected report confirmation', () => {
    expect(getTimelogStatusLabel('pending_crew_confirmation')).toBe('Čeká na souhlas Crew');
    expect(getTimelogStatusLabel('pending_crew_confirmation', { isCrewOwner: true })).toBe('Čeká na tvoje potvrzení');
  });
});
