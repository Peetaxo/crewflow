import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('clients.service', () => {
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

  it('persists a new client to Supabase without requiring a returned row id', async () => {
    let snapshot = {
      clients: [],
      events: [],
      invoices: [],
      projects: [],
    };

    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table !== 'clients') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        insert,
      };
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { saveClient } = await import('./clients.service');

    const client = await saveClient({
      id: 1,
      name: ' Klient A ',
      city: ' Praha ',
    });

    expect(insert).toHaveBeenCalledWith({
      name: 'Klient A',
      ico: null,
      dic: null,
      street: null,
      zip: null,
      city: 'Praha',
      country: null,
    });
    expect(snapshot.clients[0]).toEqual(expect.objectContaining({
      id: 1,
      name: 'Klient A',
      city: 'Praha',
    }));
  });

  it('updates an existing client in Supabase by supabaseId', async () => {
    let snapshot = {
      clients: [{
        id: 1,
        supabaseId: 'client-uuid-1',
        name: 'Klient A',
        city: 'Praha',
      }],
      events: [],
      invoices: [],
      projects: [],
    };

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const from = vi.fn((table: string) => {
      if (table !== 'clients') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        update,
      };
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { saveClient } = await import('./clients.service');

    await saveClient({
      id: 1,
      supabaseId: 'client-uuid-1',
      name: 'Klient B',
      city: 'Brno',
    });

    expect(update).toHaveBeenCalledWith({
      name: 'Klient B',
      ico: null,
      dic: null,
      street: null,
      zip: null,
      city: 'Brno',
      country: null,
    });
    expect(updateEq).toHaveBeenCalledWith('id', 'client-uuid-1');
    expect(snapshot.clients[0]).toEqual(expect.objectContaining({
      name: 'Klient B',
      city: 'Brno',
    }));
  });

  it('deletes an existing client in Supabase by supabaseId', async () => {
    let snapshot = {
      clients: [{
        id: 1,
        supabaseId: 'client-uuid-1',
        name: 'Klient A',
      }],
      events: [],
      invoices: [],
      projects: [],
    };

    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn(() => ({ eq: deleteEq }));
    const from = vi.fn((table: string) => {
      if (table !== 'clients') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        delete: deleteMock,
      };
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { deleteClient } = await import('./clients.service');

    await deleteClient(1);

    expect(deleteEq).toHaveBeenCalledWith('id', 'client-uuid-1');
    expect(snapshot.clients).toEqual([]);
  });
});
