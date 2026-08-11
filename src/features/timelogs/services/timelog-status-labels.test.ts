import { describe, expect, it } from 'vitest';
import { getTimelogStatusLabel } from './timelog-status-labels';

describe('getTimelogStatusLabel', () => {
  it('uses neutral review labels instead of role-specific COO wording', () => {
    expect(getTimelogStatusLabel('pending_ch')).toBe('Čeká na kontrolu');
    expect(getTimelogStatusLabel('pending_coo')).toBe('Čeká na schválení');
  });

  it('uses crew-facing confirmation wording when the current user owns the timelog', () => {
    expect(getTimelogStatusLabel('pending_crew_confirmation')).toBe('Čeká na souhlas Crew');
    expect(getTimelogStatusLabel('pending_crew_confirmation', { isCrewOwner: true })).toBe('Čeká na tvoje potvrzení');
  });

  it('renames rejected timelogs to returned corrections', () => {
    expect(getTimelogStatusLabel('rejected')).toBe('Vráceno k opravě');
  });

  it('keeps final accounting states readable', () => {
    expect(getTimelogStatusLabel('approved')).toBe('Schváleno');
    expect(getTimelogStatusLabel('invoiced')).toBe('Vyúčtováno');
    expect(getTimelogStatusLabel('paid')).toBe('Zaplaceno');
  });
});
