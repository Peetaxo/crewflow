import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timelog } from '../../../types';

const createSnapshot = (timelogs: Timelog[]) => ({
  events: [],
  contractors: [],
  timelogs,
  invoices: [],
  receipts: [],
  candidates: [],
  projects: [],
  clients: [],
});

describe('timelogs.service write flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('updates timelog status in Supabase using the mapped row id', async () => {
    let snapshot = createSnapshot([
      { id: 1, eid: 1, cid: 1, contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'draft' },
    ]);

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: updateEq }));
    const selectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-uuid-1' }],
        error: null,
      })),
    }));

    const fromMock = vi.fn((table: string) => {
      if (table !== 'timelogs') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: selectMock,
        update: updateMock,
      };
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: fromMock,
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { updateTimelogStatus } = await import('./timelogs.service');

    const result = await updateTimelogStatus(1, 'sub');

    expect(selectMock).toHaveBeenCalledWith('id');
    expect(updateMock).toHaveBeenCalledWith({ status: 'pending_ch' });
    expect(updateEq).toHaveBeenCalledWith('id', 'timelog-uuid-1');
    expect(result.status).toBe('pending_ch');
    expect(snapshot.timelogs[0].contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.timelogs[0].status).toBe('pending_ch');
  });

  it('approves all matching event timelogs in Supabase and updates local state', async () => {
    let snapshot = createSnapshot([
      { id: 1, eid: 7, cid: 1, contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'pending_coo' },
      { id: 2, eid: 7, cid: 2, contractorProfileId: 'profile-uuid-2', days: [], km: 0, note: '', status: 'pending_coo' },
      { id: 3, eid: 8, cid: 3, contractorProfileId: 'profile-uuid-3', days: [], km: 0, note: '', status: 'pending_coo' },
    ]);

    const eqCalls: Array<[string, string]> = [];
    const updateMock = vi.fn(() => ({
      eq: vi.fn((field: string, value: string) => {
        eqCalls.push([field, value]);
        return Promise.resolve({ error: null });
      }),
    }));
    const selectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [
          { id: 'timelog-uuid-1' },
          { id: 'timelog-uuid-2' },
          { id: 'timelog-uuid-3' },
        ],
        error: null,
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn(() => ({
          select: selectMock,
          update: updateMock,
        })),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { approveAllTimelogsForEvent } = await import('./timelogs.service');

    const approved = await approveAllTimelogsForEvent(7);

    expect(updateMock).toHaveBeenCalledWith({ status: 'approved' });
    expect(eqCalls).toEqual([
      ['id', 'timelog-uuid-1'],
      ['id', 'timelog-uuid-2'],
    ]);
    expect(approved).toHaveLength(2);
    expect(snapshot.timelogs[0].contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.timelogs[0].status).toBe('approved');
    expect(snapshot.timelogs[1].status).toBe('approved');
    expect(snapshot.timelogs[2].status).toBe('pending_coo');
  });

  it('preserves contractor profile UUIDs during Supabase hydration', async () => {
    let snapshot = createSnapshot([]);
    const createDoubleOrderMock = <T,>(data: T[]) => {
      const secondOrder = vi.fn().mockResolvedValue({ data, error: null });
      const firstOrder = vi.fn(() => ({ order: secondOrder }));
      return { order: firstOrder };
    };

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'timelog-row-1',
                      event_id: 'event-row-1',
                      contractor_id: 'profile-uuid-1',
                      km: 12,
                      note: 'Hydrated timelog',
                      status: 'approved',
                    },
                  ],
                  error: null,
                }),
              })),
            };
          }

          if (table === 'timelog_days') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'day-row-1',
                      timelog_id: 'timelog-row-1',
                      date: '2026-04-10',
                      time_from: '08:00',
                      time_to: '16:00',
                      day_type: 'instal',
                    },
                  ],
                  error: null,
                }),
              })),
            };
          }

          if (table === 'profiles') {
            return {
              select: vi.fn(() => createDoubleOrderMock([
                { id: 'profile-uuid-1' },
              ])),
            };
          }

          if (table === 'events') {
            return {
              select: vi.fn(() => createDoubleOrderMock([
                { id: 'event-row-1' },
              ])),
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(() => ({
        id: Number.NaN,
        eid: Number.NaN,
        contractorProfileId: 'profile-uuid-1',
        days: [],
        km: 0,
        note: '',
        status: 'draft',
      })),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { getTimelogs } = await import('./timelogs.service');

    getTimelogs();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const timelogs = getTimelogs();

    expect(timelogs[0].contractorProfileId).toBe('profile-uuid-1');
    expect(timelogs[0].cid).toBeUndefined();
    expect(timelogs[0].eid).toBe(1);
  });

  it('persists timelog edits to Supabase and rewrites timelog days for the mapped row id', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        cid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
        km: 10,
        note: 'Puvodni',
        status: 'draft',
      },
    ]);

    const timelogUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const timelogUpdate = vi.fn(() => ({ eq: timelogUpdateEq }));
    const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));
    const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
    const timelogsSelectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-row-1' }],
        error: null,
      })),
    }));
    const profilesSelectMock = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'profile-uuid-1' }],
          error: null,
        })),
      })),
    }));
    const eventsSelectMock = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'event-row-1' }],
          error: null,
        })),
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return {
              select: timelogsSelectMock,
              update: timelogUpdate,
            };
          }

          if (table === 'timelog_days') {
            return {
              delete: timelogDaysDelete,
              insert: timelogDaysInsert,
            };
          }

          if (table === 'profiles') {
            return {
              select: profilesSelectMock,
            };
          }

          if (table === 'events') {
            return {
              select: eventsSelectMock,
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { saveTimelog } = await import('./timelogs.service');

    const updated = await saveTimelog({
      ...snapshot.timelogs[0],
      km: 25,
      note: 'Aktualizovano',
      days: [
        { d: '2026-04-11', f: '09:00', t: '15:00', type: 'provoz' },
        { d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal' },
      ],
    });

    expect(timelogsSelectMock).toHaveBeenCalledWith('id');
    expect(timelogUpdate).toHaveBeenCalledWith({
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      km: 25,
      note: 'Aktualizovano',
      status: 'draft',
    });
    expect(timelogUpdateEq).toHaveBeenCalledWith('id', 'timelog-row-1');
    expect(timelogDaysDeleteEq).toHaveBeenCalledWith('timelog_id', 'timelog-row-1');
    expect(timelogDaysInsert).toHaveBeenCalledWith([
      {
        timelog_id: 'timelog-row-1',
        date: '2026-04-10',
        time_from: '08:00',
        time_to: '18:00',
        day_type: 'instal',
      },
      {
        timelog_id: 'timelog-row-1',
        date: '2026-04-11',
        time_from: '09:00',
        time_to: '15:00',
        day_type: 'provoz',
      },
    ]);
    expect(updated.days).toEqual([
      { d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal' },
      { d: '2026-04-11', f: '09:00', t: '15:00', type: 'provoz' },
    ]);
    expect(snapshot.timelogs[0].days).toEqual(updated.days);
    expect(snapshot.timelogs[0].note).toBe('Aktualizovano');
    expect(snapshot.timelogs[0].km).toBe(25);
  });

  it('derives contractorProfileId from local contractor data when saving a legacy numeric timelog', async () => {
    let snapshot = {
      events: [{ id: 1 }],
      contractors: [{ id: 1, profileId: 'profile-uuid-1', name: 'Crew member' }],
      timelogs: [{
        id: 1,
        eid: 1,
        cid: 1,
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' as const }],
        km: 0,
        note: '',
        status: 'draft' as const,
      }],
      invoices: [],
      receipts: [],
      candidates: [],
      projects: [],
      clients: [],
    };

    const timelogUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const timelogUpdate = vi.fn(() => ({ eq: timelogUpdateEq }));
    const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));
    const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
    const timelogsSelectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-row-1' }],
        error: null,
      })),
    }));
    const eventsSelectMock = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [{ id: 'event-row-1' }],
          error: null,
        })),
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return {
              select: timelogsSelectMock,
              update: timelogUpdate,
            };
          }

          if (table === 'timelog_days') {
            return {
              delete: timelogDaysDelete,
              insert: timelogDaysInsert,
            };
          }

          if (table === 'events') {
            return {
              select: eventsSelectMock,
            };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapTimelog: vi.fn(),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { saveTimelog } = await import('./timelogs.service');

    const updated = await saveTimelog({
      ...snapshot.timelogs[0],
      note: 'Legacy cid only',
    });

    expect(timelogUpdate).toHaveBeenCalledWith(expect.objectContaining({
      contractor_id: 'profile-uuid-1',
    }));
    expect(updated.contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.timelogs[0].contractorProfileId).toBe('profile-uuid-1');
  });
});
