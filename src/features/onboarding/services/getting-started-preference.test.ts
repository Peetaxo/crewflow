import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSeenCrewGettingStarted, markCrewGettingStartedSeen } from './getting-started-preference';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';

describe('non-security first-use preference', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps dismissal per Auth UUID and current guide version', () => {
    expect(hasSeenCrewGettingStarted(first)).toBe(false);
    markCrewGettingStartedSeen(first);
    expect(hasSeenCrewGettingStarted(first)).toBe(true);
    expect(hasSeenCrewGettingStarted(second)).toBe(false);
    expect(Object.entries(window.localStorage)).toEqual([[`nodu:crew-getting-started:v1:${first}`, 'dismissed']]);
  });

  it('does not treat an older guide version as current', () => {
    window.localStorage.setItem(`nodu:crew-getting-started:v0:${first}`, 'dismissed');
    expect(hasSeenCrewGettingStarted(first)).toBe(false);
  });

  it.each(['', 'email@example.cz', 'not-a-user-id'])('does not read or write a preference for invalid identity %s', (identity) => {
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(hasSeenCrewGettingStarted(identity)).toBe(true);
    markCrewGettingStartedSeen(identity);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('suppresses automatic display if the localStorage property itself is unavailable', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(hasSeenCrewGettingStarted(first)).toBe(true);
    expect(() => markCrewGettingStartedSeen(first)).not.toThrow();
  });
});
