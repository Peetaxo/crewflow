import { beforeEach, describe, expect, it } from 'vitest';
import { consumeBrowserActivationToken, parseActivationLink } from './activation-link';

const token = 'a'.repeat(64);
const trusted = ['https://crew.example.test'];

describe('activation link validation', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('accepts only the exact pilot destination and a strict fragment token', () => {
    expect(parseActivationLink(`nodu://activate#token=${token}`, trusted)).toBe(token);
    expect(parseActivationLink(`https://crew.example.test/activate#token=${token}`, trusted)).toBe(token);
  });

  it.each([
    'https://evil.example/activate', 'https://crew.example.test.evil.example/activate',
    'http://crew.example.test/activate', 'https://crew.example.test:444/activate',
    'https://user@crew.example.test/activate', 'https://crew.example.test/other',
    'https://crew.example.test/activate/', 'nodu://other', 'nodu://activate/other',
    'nodu:activate', 'nodu://activate/', 'nodu://activate?redirect=https://evil.example',
    'https://crew.example.test/activate?redirect=https://evil.example',
  ])('rejects untrusted or unexpected destination %s', (destination) => {
    expect(parseActivationLink(`${destination}#token=${token}`, trusted)).toBeNull();
  });

  it.each([`token=${token}&token=${token}`, `token=${token}&redirect=/app`, `token=${'A'.repeat(64)}`, `token=${'a'.repeat(63)}`, `access_token=${token}`, `token=%61${'a'.repeat(63)}`])('rejects malformed or extra fragment content', (hash) => {
    expect(parseActivationLink(`nodu://activate#${hash}`, trusted)).toBeNull();
  });

  it('requires an explicitly configured exact HTTPS origin', () => {
    expect(parseActivationLink(`https://crew.example.test/activate#token=${token}`, [])).toBeNull();
    expect(parseActivationLink(`https://crew.example.test/activate#token=${token}`, ['https://crew.example.test/path'])).toBeNull();
  });

  it('takes the current browser fragment into memory and immediately removes it from history', () => {
    window.history.replaceState(null, '', `/activate#token=${token}`);
    expect(consumeBrowserActivationToken()).toBe(token);
    expect(window.location.pathname).toBe('/activate');
    expect(window.location.hash).toBe('');
    expect(JSON.stringify(window.history.state)).not.toContain(token);
    expect(consumeBrowserActivationToken()).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('scrubs invalid activation fragments and rejects query secrets', () => {
    window.history.replaceState(null, '', `/activate?token=${token}#token=${token}`);
    expect(consumeBrowserActivationToken()).toBeNull();
    expect(window.location.href).not.toContain(token);
  });
});
