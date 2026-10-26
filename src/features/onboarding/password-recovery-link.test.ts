import { beforeEach, describe, expect, it } from 'vitest';
import { consumeBrowserRecoveryToken, parsePasswordRecoveryLink } from './password-recovery-link';

const token = 'Opaque_URL-safe-Token_123456789';
describe('password recovery capabilities', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));
  it('accepts bounded opaque URL-safe hashes at only the unique native destination', () => {
    expect(parsePasswordRecoveryLink(`nodu-test://reset-password#token_hash=${token}`)).toBe(token);
    for (const length of [20, 512]) expect(parsePasswordRecoveryLink(`nodu-test://reset-password#token_hash=${'z'.repeat(length)}`)).toBe('z'.repeat(length));
  });
  it.each([
    'nodu://reset-password', 'nodu-test://reset-password/', 'nodu-test:reset-password',
    'nodu-test://other', 'nodu-test://user@reset-password', 'nodu-test://reset-password:123',
    'nodu-test://reset-password?redirect=/app', 'https://evil.test/reset-password',
    'http://localhost:8096/reset-password',
  ])('rejects unexpected destinations %s', (destination) => {
    expect(parsePasswordRecoveryLink(`${destination}#token_hash=${token}`)).toBeNull();
  });
  it.each(['', 'a'.repeat(19), 'a'.repeat(513), 'a'.repeat(20) + '&redirect=/app', 'a'.repeat(20) + '#other', '%61'.repeat(20), '+'.repeat(20), '='.repeat(20)])('rejects malformed or extra fragment data', (hash) => {
    expect(parsePasswordRecoveryLink(`nodu-test://reset-password#token_hash=${hash}`)).toBeNull();
  });
  it('captures same-origin browser hash and scrubs it from URL/history without persistence', () => {
    window.history.replaceState({ previous: true }, '', `/reset-password#token_hash=${token}`);
    expect(consumeBrowserRecoveryToken()).toBe(token);
    expect(window.location.pathname).toBe('/reset-password');
    expect(window.location.hash).toBe('');
    expect(window.history.state).toBeNull();
    expect(consumeBrowserRecoveryToken()).toBeNull();
  });
  it('scrubs invalid/query-bearing reset links while leaving other paths to their owner', () => {
    window.history.replaceState(null, '', `/reset-password?token_hash=${token}#token_hash=${token}`);
    expect(consumeBrowserRecoveryToken()).toBeNull();
    expect(window.location.search + window.location.hash).toBe('');
    window.history.replaceState(null, '', `/activate#token=${'a'.repeat(64)}`);
    expect(consumeBrowserRecoveryToken()).toBeNull();
    expect(window.location.hash).not.toBe('');
  });
});
