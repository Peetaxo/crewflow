import { beforeEach, describe, expect, it, vi } from 'vitest';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('project list search and filters', () => {
  const snapshot = {
    projects: [
      { id: 'AK001', name: 'Letní přehlídka', client: 'Škoda Auto', note: '', createdAt: '2026-01-01' },
      { id: 'AK002', name: 'Jarní roadshow', client: 'Škoda Auto', note: '', createdAt: '2026-01-01' },
      { id: 'BR003', name: 'Letní festival', client: 'Česká spořitelna', note: '', createdAt: '2026-01-01' },
      { id: 'NO004', name: 'Letní příprava', client: 'Škoda Auto', note: '', createdAt: '2026-01-01' },
    ],
    events: [
      { id: 1, job: 'AK001', startDate: '2026-04-01', endDate: '2026-04-10', needed: 1, filled: 0 },
      { id: 2, job: 'AK001', startDate: '2026-04-20', endDate: '2026-04-25', needed: 1, filled: 0 },
      { id: 3, job: 'AK002', startDate: '2026-04-10', endDate: '2026-04-20', needed: 1, filled: 0 },
      { id: 4, job: 'BR003', startDate: '2026-05-01', endDate: '2026-05-10', needed: 1, filled: 0 },
    ],
    contractors: [], timelogs: [], receipts: [], invoices: [], clients: [],
  };
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/app-data', () => ({ getLocalAppState: () => snapshot, subscribeToLocalAppState: vi.fn(), updateLocalAppState: vi.fn() }));
  });

  it.each([
    ['  ak001  ', ['AK001']],
    ['PREHLIDKA', ['AK001']],
    ['cEsKa sPoRiTeLnA', ['BR003']],
    ['LETNI', ['AK001', 'BR003', 'NO004']],
    ['ŠKODA', ['AK001', 'AK002', 'NO004']],
    ['přehlídka', ['AK001']],
  ])('matches a trimmed query %s across job number, name and client without case or diacritics', async (query, ids) => {
    const { getProjectRows } = await import('./projects.service');
    expect(getProjectRows(query, {}).map((row) => row.id).sort()).toEqual(ids);
  });

  it('requires search, client and date period to match together', async () => {
    const { getProjectRows } = await import('./projects.service');
    expect(getProjectRows('letni', { client: 'Škoda Auto', startDate: '2026-04-15', endDate: '2026-04-15' }).map((row) => row.id)).toEqual(['AK001']);
  });

  it('includes both period boundaries and one-sided ranges', async () => {
    const { getProjectRows } = await import('./projects.service');
    expect(getProjectRows('', { startDate: '2026-04-25', endDate: '2026-05-01' }).map((row) => row.id)).toEqual(['AK001', 'BR003']);
    expect(getProjectRows('', { startDate: '2026-04-25' }).map((row) => row.id)).toEqual(['AK001', 'BR003']);
    expect(getProjectRows('', { endDate: '2026-04-01' }).map((row) => row.id)).toEqual(['AK001']);
  });

  it('keeps projects without events until a date bound is applied', async () => {
    const { getProjectRows } = await import('./projects.service');
    expect(getProjectRows('', { client: 'Škoda Auto' }).map((row) => row.id).sort()).toEqual(['AK001', 'AK002', 'NO004']);
    expect(getProjectRows('', { client: 'Škoda Auto', endDate: '2026-12-31' }).map((row) => row.id)).toEqual(['AK001', 'AK002']);
  });

  it('matches gaps inside the overall realization period between multiple events', async () => {
    const { getProjectRows } = await import('./projects.service');
    const rows = getProjectRows('', { startDate: '2026-04-15', endDate: '2026-04-15' });
    expect(rows.map((row) => row.id)).toEqual(['AK001', 'AK002']);
    expect(rows[0].period).toEqual({ startDate: '2026-04-01', endDate: '2026-04-25' });
  });
});

describe('projects.service write flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('filters by client and inclusive event-period overlap, excluding projects without events', async () => {
    const snapshot = {
      projects: [
        { id: 'A', name: 'A', client: 'Klient A', createdAt: '2026-01-01' },
        { id: 'B', name: 'B', client: 'Klient B', createdAt: '2026-01-01' },
        { id: 'C', name: 'C', client: 'Klient A', createdAt: '2026-01-01' },
      ],
      events: [
        { id: 1, job: 'A', startDate: '2026-04-01', endDate: '2026-04-10', needed: 1, filled: 0 },
        { id: 2, job: 'B', startDate: '2026-04-10', endDate: '2026-04-20', needed: 1, filled: 0 },
      ],
      contractors: [], timelogs: [], receipts: [], invoices: [], clients: [],
    };
    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/app-data', () => ({ getLocalAppState: () => snapshot, subscribeToLocalAppState: vi.fn(), updateLocalAppState: vi.fn() }));
    const { getProjectRows } = await import('./projects.service');
    expect(getProjectRows('', { client: 'Klient A' }).map((row) => row.id).sort()).toEqual(['A', 'C']);
    expect(getProjectRows('', { startDate: '2026-04-10', endDate: '2026-04-10' }).map((row) => row.id)).toEqual(['A', 'B']);
    expect(getProjectRows('', { client: 'Klient A', startDate: '2026-04-10', endDate: '2026-04-10' }).map((row) => row.id)).toEqual(['A']);
    expect(getProjectRows('', { startDate: '2026-04-11' }).map((row) => row.id)).toEqual(['B']);
    expect(getProjectRows('', { endDate: '2026-03-31' })).toEqual([]);
    expect(getProjectRows('', 'all').find((row) => row.id === 'A')?.period).toEqual({ startDate: '2026-04-01', endDate: '2026-04-10' });
  });

  it('takes project row snapshot after dependency loading triggers', async () => {
    let snapshot = { projects: [{ id: 'A', name: 'A', client: '', createdAt: '2026-01-01' }], events: [], timelogs: [], contractors: [], invoices: [] };
    const ensureSupabaseEventsLoaded = vi.fn(() => {
      snapshot = { ...snapshot, events: [{ id: 1, job: 'A', startDate: '2026-04-01', endDate: '2026-04-10', needed: 1, filled: 0 }] };
    });
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: () => ({ select: () => ({ order }) }) } }));
    vi.doMock('../../../lib/app-data', () => ({ getLocalAppState: () => snapshot, subscribeToLocalAppState: vi.fn(), updateLocalAppState: vi.fn() }));
    vi.doMock('../../events/services/events.service', () => ({ ensureSupabaseEventsLoaded }));
    vi.doMock('../../timelogs/services/timelogs.service', () => ({ ensureSupabaseTimelogsLoaded: vi.fn() }));
    vi.doMock('../../crew/services/crew.service', () => ({ ensureSupabaseCrewLoaded: vi.fn() }));
    const { getProjectRows } = await import('./projects.service');
    expect(getProjectRows()[0].eventCount).toBe(1);
    expect(getProjectRows()[0].period).toEqual({ startDate: '2026-04-01', endDate: '2026-04-10' });
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

  it('discards an in-flight project snapshot after reset and loads retry', async () => {
    const firstProjects = createDeferred<{ data: []; error: null }>();
    const projectsOrder = vi.fn()
      .mockReturnValueOnce(firstProjects.promise)
      .mockResolvedValueOnce({ data: [], error: null });
    const clientsOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        order: table === 'projects' ? projectsOrder : clientsOrder,
      })),
    }));
    const updateLocalAppState = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => ({ projects: [], clients: [] }),
      updateLocalAppState,
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { loadSupabaseProjects, resetSupabaseProjectsHydration } = await import('./projects.service');

    const staleLoad = loadSupabaseProjects();
    resetSupabaseProjectsHydration();
    firstProjects.resolve({ data: [], error: null });

    await expect(staleLoad).rejects.toThrow('Project hydration scope changed.');
    expect(updateLocalAppState).not.toHaveBeenCalled();

    await expect(loadSupabaseProjects()).resolves.toBeUndefined();
    expect(updateLocalAppState).toHaveBeenCalledTimes(1);
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
