import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('clients.service hydration guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not fetch clients from Supabase again after the first successful hydration', async () => {
    let snapshot = {
      clients: [],
      events: [],
      invoices: [],
      projects: [],
    };

    const order = vi.fn(async () => ({
      data: [
        {
          id: 'client-uuid-1',
          name: 'Klient A',
          ico: '',
          dic: '',
          street: '',
          zip: '',
          city: 'Praha',
          country: '',
          note: '',
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
      mapClient: (row: { name: string; city: string }) => ({
        name: row.name,
        city: row.city,
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

    const { getClients } = await import('./clients.service');

    expect(getClients()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getClients()).toEqual([
      {
        id: 1,
        name: 'Klient A',
        ico: '',
        dic: '',
        street: '',
        zip: '',
        city: 'Praha',
        country: '',
        note: '',
      },
    ]);

    expect(from).toHaveBeenCalledTimes(1);
  });
});
