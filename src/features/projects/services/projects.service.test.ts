import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('projects.service write flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('persists a new project to Supabase with resolved client UUID', async () => {
    let snapshot = {
      projects: [],
      clients: [{
        id: 1,
        supabaseId: 'client-uuid-1',
        name: 'Klient A',
      }],
      events: [],
      invoices: [],
    };

    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === 'projects') {
        return { insert };
      }

      throw new Error(`Unexpected table ${table}`);
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

    const { saveProject } = await import('./projects.service');

    const project = await saveProject({
      id: ' ak001 ',
      name: ' Pilot ',
      client: 'Klient A',
      note: ' Poznamka ',
      createdAt: '2026-04-24',
    });

    expect(insert).toHaveBeenCalledWith({
      job_number: 'AK001',
      name: 'Pilot',
      client_id: 'client-uuid-1',
      note: 'Poznamka',
    });
    expect(project).toEqual(expect.objectContaining({
      id: 'AK001',
      name: 'Pilot',
      client: 'Klient A',
      note: 'Poznamka',
    }));
    expect(snapshot.projects[0]).toEqual(project);
  });

  it('updates an existing project in Supabase by job_number', async () => {
    let snapshot = {
      projects: [{
        id: 'AK001',
        name: 'Pilot',
        client: 'Klient A',
        note: '',
        createdAt: '2026-04-24',
      }],
      clients: [{
        id: 1,
        supabaseId: 'client-uuid-2',
        name: 'Klient B',
      }],
      events: [],
      invoices: [],
    };

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const from = vi.fn((table: string) => {
      if (table === 'projects') {
        return { update };
      }

      throw new Error(`Unexpected table ${table}`);
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

    const { saveProject } = await import('./projects.service');

    await saveProject({
      id: 'AK001',
      name: 'Pilot 2',
      client: 'Klient B',
      note: 'Updated',
      createdAt: '2026-04-24',
    });

    expect(update).toHaveBeenCalledWith({
      job_number: 'AK001',
      name: 'Pilot 2',
      client_id: 'client-uuid-2',
      note: 'Updated',
    });
    expect(updateEq).toHaveBeenCalledWith('job_number', 'AK001');
    expect(snapshot.projects[0]).toEqual(expect.objectContaining({
      name: 'Pilot 2',
      client: 'Klient B',
      note: 'Updated',
    }));
  });

  it('deletes an existing project in Supabase by job_number', async () => {
    let snapshot = {
      projects: [{
        id: 'AK001',
        name: 'Pilot',
        client: 'Klient A',
        note: '',
        createdAt: '2026-04-24',
      }],
      clients: [],
      events: [],
      invoices: [],
    };

    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn(() => ({ eq: deleteEq }));
    const from = vi.fn((table: string) => {
      if (table === 'projects') {
        return { delete: deleteMock };
      }

      throw new Error(`Unexpected table ${table}`);
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

    const { deleteProject } = await import('./projects.service');

    await deleteProject('AK001');

    expect(deleteEq).toHaveBeenCalledWith('job_number', 'AK001');
    expect(snapshot.projects).toEqual([]);
  });

  it('starts loading Supabase events when project rows are read first', async () => {
    const ensureSupabaseEventsLoaded = vi.fn();
    let snapshot = {
      projects: [{
        id: 'JTI001',
        name: 'JTI',
        client: 'JTI',
        note: '',
        createdAt: '2026-04-29',
      }],
      clients: [],
      events: [],
      invoices: [],
    };

    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));

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

    vi.doMock('../../events/services/events.service', () => ({
      ensureSupabaseEventsLoaded,
    }));

    const { getProjectRows } = await import('./projects.service');

    getProjectRows('', 'all');

    expect(ensureSupabaseEventsLoaded).toHaveBeenCalledOnce();
  });

  it('calculates crew cost from project timelogs and contractor rates', async () => {
    const snapshot = {
      projects: [{
        id: 'JTI001',
        name: 'JTI',
        client: 'JTI',
        note: '',
        createdAt: '2026-04-29',
      }],
      clients: [],
      events: [{
        id: 1,
        name: 'Ploom PopUp',
        job: 'JTI001',
        startDate: '2026-04-20',
        endDate: '2026-04-20',
        city: 'Praha',
        needed: 1,
        filled: 1,
        status: 'upcoming' as const,
        client: 'JTI',
      }],
      timelogs: [{
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
        km: 0,
        note: '',
        status: 'draft' as const,
      }],
      contractors: [{
        id: 1,
        profileId: 'profile-uuid-1',
        name: 'Crew Member',
        ii: 'CM',
        bg: '#000',
        fg: '#fff',
        tags: [],
        events: 1,
        rate: 300,
        phone: '',
        email: '',
        ico: '',
        dic: '',
        bank: '',
        city: 'Praha',
        reliable: true,
        note: '',
      }],
      invoices: [],
    };

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../events/services/events.service', () => ({
      ensureSupabaseEventsLoaded: vi.fn(),
    }));

    const { getProjectRows } = await import('./projects.service');

    expect(getProjectRows('', 'all')[0].crewCost).toBe(1500);
  });
});
