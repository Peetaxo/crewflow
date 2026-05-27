import { describe, expect, it } from 'vitest';
import { resolveAppDataSource } from './app-config';

describe('app-config data source selection', () => {
  it('defaults to Supabase when no explicit data source is provided', async () => {
    expect(resolveAppDataSource(undefined)).toBe('supabase');
    expect(resolveAppDataSource('')).toBe('supabase');
    expect(resolveAppDataSource('invalid')).toBe('supabase');
  });

  it('only enables local backup data when local mode is explicitly requested', async () => {
    expect(resolveAppDataSource('local')).toBe('local');
    expect(resolveAppDataSource(' local ')).toBe('local');
  });
});
