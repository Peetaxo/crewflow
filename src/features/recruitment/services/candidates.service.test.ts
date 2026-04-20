import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('candidates.service hydration guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not fetch candidates from Supabase again after the first successful hydration', async () => {
    let snapshot = {
      candidates: [],
    };

    const order = vi.fn(async () => ({
      data: [
        {
          id: 'candidate-uuid-1',
          name: 'Jan Novak',
          stage: 'new',
        },
      ],
      error: null,
    }));

    const select = vi.fn(() => ({
      order,
    }));

    const from = vi.fn(() => ({
      select,
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from,
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapCandidate: (row: { name: string; stage: string }) => ({
        name: row.name,
        stage: row.stage,
      }),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { getCandidates } = await import('./candidates.service');

    expect(getCandidates()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getCandidates()).toEqual([
      {
        id: 1,
        name: 'Jan Novak',
        stage: 'new',
      },
    ]);

    expect(from).toHaveBeenCalledTimes(1);
  });
});
