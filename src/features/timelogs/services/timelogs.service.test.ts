import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      { id: 1, eid: 1, contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'draft' },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    const updateSelect = vi.fn().mockResolvedValue({ data: [{ id: 'timelog-uuid-1' }], error: null });
    const updateEq = vi.fn(() => ({ select: updateSelect }));
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: {
        timelogs: {
          all: ['timelogs'],
        },
      },
    }));

    const { updateTimelogStatus } = await import('./timelogs.service');

    const result = await updateTimelogStatus(1, 'sub');

    expect(selectMock).toHaveBeenCalledWith('id');
    expect(updateMock).toHaveBeenCalledWith({ status: 'pending_ch' });
    expect(updateEq).toHaveBeenCalledWith('id', 'timelog-uuid-1');
    expect(updateSelect).toHaveBeenCalledWith('id');
    expect(result.status).toBe('pending_ch');
    expect(snapshot.timelogs[0].contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.timelogs[0].status).toBe('pending_ch');
    expect(setQueryData).toHaveBeenCalledWith(['timelogs'], snapshot.timelogs);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['timelogs'] });
  });

  it('does not update local state when Supabase status update affects no rows', async () => {
    let snapshot = createSnapshot([
      { id: 1, eid: 1, contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'draft' },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    const updateSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const updateEq = vi.fn(() => ({ select: updateSelect }));
    const updateMock = vi.fn(() => ({ eq: updateEq }));
    const selectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-uuid-1' }],
        error: null,
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table !== 'timelogs') {
            throw new Error(`Unexpected table ${table}`);
          }

          return {
            select: selectMock,
            update: updateMock,
          };
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: {
        timelogs: {
          all: ['timelogs'],
        },
      },
    }));

    const { updateTimelogStatus } = await import('./timelogs.service');

    await expect(updateTimelogStatus(1, 'sub')).rejects.toThrow('Nepodarilo se aktualizovat vykaz v databazi.');

    expect(updateSelect).toHaveBeenCalledWith('id');
    expect(snapshot.timelogs[0].status).toBe('draft');
    expect(setQueryData).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('sends a CH-controlled timelog to selected final approvers through the Supabase RPC', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        supabaseId: 'timelog-uuid-1',
        eid: 'event-uuid-1',
        contractorProfileId: 'profile-contractor',
        days: [],
        km: 0,
        note: '',
        status: 'pending_ch',
      },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();
    const approvalsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'approval-uuid-1',
          approval_round_id: 'round-uuid-1',
          timelog_id: 'timelog-uuid-1',
          approver_profile_id: 'profile-approver-1',
          status: 'pending',
          requested_by_profile_id: 'profile-requester',
          requested_at: '2026-08-11T10:05:00.000Z',
          resolved_at: null,
          superseded_at: null,
          note: 'Prosím finálně schválit',
        },
      ],
      error: null,
    });
    const approvalsEq = vi.fn(() => ({ order: approvalsOrder }));
    const approvalsSelect = vi.fn(() => ({ eq: approvalsEq }));
    const fromMock = vi.fn((table: string) => {
      if (table !== 'timelog_approvals') {
        throw new Error(`Unexpected table ${table}`);
      }

      return { select: approvalsSelect };
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: 'timelog-uuid-1',
        event_id: 'event-uuid-1',
        contractor_id: 'profile-contractor',
        km: 0,
        note: '',
        review_note: 'Prosím finálně schválit',
        status: 'pending_coo',
        crew_confirmation_snapshot: null,
        submitted_at: null,
        approved_at: null,
        created_at: '2026-08-11T10:00:00.000Z',
        updated_at: '2026-08-11T10:05:00.000Z',
      },
      error: null,
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from: fromMock, rpc },
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: {
        timelogs: {
          all: ['timelogs'],
        },
      },
    }));

    const { sendTimelogToApprovers } = await import('./timelogs.service');

    const result = await sendTimelogToApprovers(1, ['profile-approver-1'], 'Prosím finálně schválit');

    expect(rpc).toHaveBeenCalledWith('send_timelog_to_approvers', {
      p_timelog_id: 'timelog-uuid-1',
      p_approver_profile_ids: ['profile-approver-1'],
      p_note: 'Prosím finálně schválit',
    });
    expect(approvalsSelect).toHaveBeenCalledWith('*');
    expect(approvalsEq).toHaveBeenCalledWith('timelog_id', 'timelog-uuid-1');
    expect(approvalsOrder).toHaveBeenCalledWith('requested_at');
    expect(result.status).toBe('pending_coo');
    expect(result.reviewNote).toBe('Prosím finálně schválit');
    expect(result.approvals).toEqual([
      expect.objectContaining({
        id: 'approval-uuid-1',
        approverProfileId: 'profile-approver-1',
        status: 'pending',
      }),
    ]);
    expect(snapshot.timelogs[0].status).toBe('pending_coo');
    expect(snapshot.timelogs[0].reviewNote).toBe('Prosím finálně schválit');
    expect(snapshot.timelogs[0].approvals).toEqual(result.approvals);
    expect(setQueryData).toHaveBeenCalledWith(['timelogs'], snapshot.timelogs);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['timelogs'] });
  });

  it('resolves the current approver row through the Supabase RPC and preserves returned notes', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        supabaseId: 'timelog-uuid-1',
        eid: 'event-uuid-1',
        contractorProfileId: 'profile-contractor',
        days: [],
        km: 0,
        note: '',
        status: 'pending_coo',
        approvals: [
          {
            id: 'approval-uuid-1',
            approvalRoundId: 'round-uuid-1',
            timelogId: 'timelog-uuid-1',
            approverProfileId: 'profile-approver-1',
            status: 'pending',
            requestedByProfileId: 'profile-requester',
            requestedAt: '2026-08-11T10:00:00.000Z',
            resolvedAt: null,
            supersededAt: null,
            note: '',
          },
        ],
      },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();
    const approvalsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'approval-uuid-1',
          approval_round_id: 'round-uuid-1',
          timelog_id: 'timelog-uuid-1',
          approver_profile_id: 'profile-approver-1',
          status: 'returned',
          requested_by_profile_id: 'profile-requester',
          requested_at: '2026-08-11T10:00:00.000Z',
          resolved_at: '2026-08-11T10:06:00.000Z',
          superseded_at: null,
          note: 'Uprav prosím čas odchodu',
        },
      ],
      error: null,
    });
    const approvalsEq = vi.fn(() => ({ order: approvalsOrder }));
    const approvalsSelect = vi.fn(() => ({ eq: approvalsEq }));
    const fromMock = vi.fn((table: string) => {
      if (table !== 'timelog_approvals') {
        throw new Error(`Unexpected table ${table}`);
      }

      return { select: approvalsSelect };
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: 'timelog-uuid-1',
        event_id: 'event-uuid-1',
        contractor_id: 'profile-contractor',
        km: 0,
        note: '',
        review_note: 'Uprav prosím čas odchodu',
        status: 'rejected',
        crew_confirmation_snapshot: null,
        submitted_at: null,
        approved_at: null,
        created_at: '2026-08-11T10:00:00.000Z',
        updated_at: '2026-08-11T10:05:00.000Z',
      },
      error: null,
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from: fromMock, rpc },
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: {
        timelogs: {
          all: ['timelogs'],
        },
      },
    }));

    const { resolveTimelogApproval } = await import('./timelogs.service');

    const result = await resolveTimelogApproval('approval-uuid-1', 'returned', 'Uprav prosím čas odchodu');

    expect(rpc).toHaveBeenCalledWith('resolve_timelog_approval', {
      p_approval_id: 'approval-uuid-1',
      p_action: 'returned',
      p_note: 'Uprav prosím čas odchodu',
    });
    expect(approvalsSelect).toHaveBeenCalledWith('*');
    expect(approvalsEq).toHaveBeenCalledWith('timelog_id', 'timelog-uuid-1');
    expect(approvalsOrder).toHaveBeenCalledWith('requested_at');
    expect(result.status).toBe('rejected');
    expect(result.reviewNote).toBe('Uprav prosím čas odchodu');
    expect(result.approvals).toEqual([
      expect.objectContaining({
        id: 'approval-uuid-1',
        approverProfileId: 'profile-approver-1',
        status: 'returned',
        resolvedAt: '2026-08-11T10:06:00.000Z',
      }),
    ]);
    expect(snapshot.timelogs[0].status).toBe('rejected');
    expect(snapshot.timelogs[0].reviewNote).toBe('Uprav prosím čas odchodu');
    expect(snapshot.timelogs[0].approvals?.some((approval) => approval.status === 'pending')).toBe(false);
    expect(setQueryData).toHaveBeenCalledWith(['timelogs'], snapshot.timelogs);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['timelogs'] });
  });

  it('approves all matching event timelogs in Supabase and updates local state', async () => {
    let snapshot = createSnapshot([
      { id: 1, eid: 7, contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'pending_coo' },
      { id: 2, eid: 7, contractorProfileId: 'profile-uuid-2', days: [], km: 0, note: '', status: 'pending_coo' },
      { id: 3, eid: 8, contractorProfileId: 'profile-uuid-3', days: [], km: 0, note: '', status: 'pending_coo' },
    ]);

    const eqCalls: Array<[string, string]> = [];
    const updateMock = vi.fn(() => ({
      eq: vi.fn((field: string, value: string) => {
        eqCalls.push([field, value]);
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id: value }], error: null }),
        };
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
    const mapTimelogMock = vi.fn(() => ({
      id: Number.NaN,
      eid: Number.NaN,
      contractorProfileId: 'profile-uuid-1',
      days: [],
      km: 0,
      note: '',
      status: 'draft',
    }));
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

          if (table === 'timelog_approvals') {
            return {
              select: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'approval-row-1',
                      approval_round_id: 'round-row-1',
                      timelog_id: 'timelog-row-1',
                      approver_profile_id: 'approver-profile-uuid',
                      status: 'pending',
                      requested_by_profile_id: 'manager-profile-uuid',
                      requested_at: '2026-08-11T10:05:00.000Z',
                      resolved_at: null,
                      superseded_at: null,
                      note: 'Prosím schválit',
                    },
                    {
                      id: 'approval-row-2',
                      approval_round_id: 'round-row-2',
                      timelog_id: 'other-timelog-row',
                      approver_profile_id: 'other-approver-profile-uuid',
                      status: 'pending',
                      requested_by_profile_id: 'manager-profile-uuid',
                      requested_at: '2026-08-11T10:06:00.000Z',
                      resolved_at: null,
                      superseded_at: null,
                      note: '',
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
      mapTimelog: mapTimelogMock,
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
    expect(timelogs[0].id).toBe('timelog-row-1');
    expect(timelogs[0].eid).toBe('event-row-1');
    expect(mapTimelogMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'timelog-row-1' }),
      [expect.objectContaining({ id: 'day-row-1' })],
      [expect.objectContaining({ id: 'approval-row-1' })],
    );
  });

  it('persists timelog edits to Supabase and rewrites timelog days for the mapped row id', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
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
        { d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal', meal: 'obed', note: 'Ranni priprava' },
      ],
    });

    expect(timelogsSelectMock).toHaveBeenCalledWith('id');
    expect(timelogUpdate).toHaveBeenCalledWith({
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      km: 25,
      note: 'Aktualizovano',
      review_note: null,
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
        meals: ['obed'],
        meal: 'obed',
        note: 'Ranni priprava',
      },
      {
        timelog_id: 'timelog-row-1',
        date: '2026-04-11',
        time_from: '09:00',
        time_to: '15:00',
        day_type: 'provoz',
        meals: [],
        meal: null,
        note: null,
      },
    ]);
    expect(updated.days).toEqual([
      { d: '2026-04-10', f: '08:00', t: '18:00', type: 'instal', meal: 'obed', note: 'Ranni priprava' },
      { d: '2026-04-11', f: '09:00', t: '15:00', type: 'provoz' },
    ]);
    expect(snapshot.timelogs[0].days).toEqual(updated.days);
    expect(snapshot.timelogs[0].note).toBe('Aktualizovano');
    expect(snapshot.timelogs[0].km).toBe(25);
  });

  it('rewrites timelog days before advancing status so RLS checks the editable parent status', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'draft',
      },
    ]);
    const operationOrder: string[] = [];
    const updatePayloads: unknown[] = [];
    const timelogUpdateSelect = vi.fn().mockImplementation(() => {
      operationOrder.push('timelog-status-select');
      return Promise.resolve({ data: [{ id: 'timelog-row-1' }], error: null });
    });
    const timelogUpdateEq = vi.fn().mockImplementation(() => {
      const payload = updatePayloads.at(-1);

      if (
        payload
        && typeof payload === 'object'
        && Object.keys(payload).length === 1
        && 'status' in payload
      ) {
        operationOrder.push('timelog-status');
        return { select: timelogUpdateSelect };
      }

      operationOrder.push(`timelog-data:${(payload as { status?: string }).status ?? 'missing'}`);
      return Promise.resolve({ error: null });
    });
    const timelogUpdate = vi.fn().mockImplementation((payload: unknown) => {
      updatePayloads.push(payload);
      return { eq: timelogUpdateEq };
    });
    const timelogDaysDeleteEq = vi.fn().mockImplementation(() => {
      operationOrder.push('timelog-days-delete');
      return Promise.resolve({ error: null });
    });
    const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));
    const timelogDaysInsert = vi.fn().mockImplementation(() => {
      operationOrder.push('timelog-days-insert');
      return Promise.resolve({ error: null });
    });
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

    await saveTimelog({
      ...snapshot.timelogs[0],
      days: [{ d: '2026-04-10', f: '09:00', t: '17:00', type: 'provoz' }],
      status: 'pending_ch',
    });

    expect(timelogUpdate).toHaveBeenNthCalledWith(1, {
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      km: 0,
      note: '',
      review_note: null,
      status: 'draft',
    });
    expect(timelogUpdate).toHaveBeenNthCalledWith(2, { status: 'pending_ch' });
    expect(operationOrder).toEqual([
      'timelog-data:draft',
      'timelog-days-delete',
      'timelog-days-insert',
      'timelog-status',
      'timelog-status-select',
    ]);
    expect(snapshot.timelogs[0].status).toBe('pending_ch');
    expect(snapshot.timelogs[0].days).toEqual([
      { d: '2026-04-10', f: '09:00', t: '17:00', type: 'provoz' },
    ]);

    operationOrder.length = 0;
    updatePayloads.length = 0;
    timelogUpdate.mockClear();

    await saveTimelog({
      ...snapshot.timelogs[0],
      days: [{ d: '2026-04-10', f: '10:00', t: '18:00', type: 'instal' }],
      note: '',
      reviewNote: 'Upraveno CH',
      status: 'pending_crew_confirmation',
    } as Timelog & { reviewNote: string });

    expect(timelogUpdate).toHaveBeenNthCalledWith(1, {
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      crew_confirmation_snapshot: expect.objectContaining({
        changedAt: expect.any(String),
        before: expect.objectContaining({
          days: [expect.objectContaining({ d: '2026-04-10', f: '09:00', t: '17:00', type: 'provoz' })],
          km: 0,
          note: '',
        }),
      }),
      km: 0,
      note: '',
      review_note: 'Upraveno CH',
      status: 'pending_ch',
    });
    expect(timelogUpdate).toHaveBeenNthCalledWith(2, { status: 'pending_crew_confirmation' });
    expect(operationOrder).toEqual([
      'timelog-data:pending_ch',
      'timelog-days-delete',
      'timelog-days-insert',
      'timelog-status',
      'timelog-status-select',
    ]);
    expect(snapshot.timelogs[0].status).toBe('pending_crew_confirmation');
    expect(snapshot.timelogs[0].note).toBe('');
    expect((snapshot.timelogs[0] as Timelog & { reviewNote?: string }).reviewNote).toBe('Upraveno CH');
    expect(snapshot.timelogs[0].crewConfirmationSnapshot).toEqual(expect.objectContaining({
      changedAt: expect.any(String),
      before: expect.objectContaining({
        days: [expect.objectContaining({ d: '2026-04-10', f: '09:00', t: '17:00', type: 'provoz' })],
      }),
    }));
    expect(snapshot.timelogs[0].days).toEqual([
      { d: '2026-04-10', f: '10:00', t: '18:00', type: 'instal' },
    ]);
  });

  it('saves a Supabase timelog by stored row ids when local ids are not positional', async () => {
    const existingTimelog = {
      id: 7,
      supabaseId: 'timelog-row-1',
      eid: 3,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' as const }],
      km: 0,
      note: '',
      status: 'draft' as const,
    } as Timelog & { supabaseId: string };
    let snapshot = {
      ...createSnapshot([existingTimelog]),
      events: [{ id: 3, supabaseId: 'event-row-1' }],
    };

    const timelogUpdatePayloads: unknown[] = [];
    const timelogStatusSelect = vi.fn().mockResolvedValue({ data: [{ id: 'timelog-row-1' }], error: null });
    const timelogUpdateEq = vi.fn().mockImplementation(() => {
      const payload = timelogUpdatePayloads.at(-1);

      if (
        payload
        && typeof payload === 'object'
        && Object.keys(payload).length === 1
        && 'status' in payload
      ) {
        return { select: timelogStatusSelect };
      }

      return Promise.resolve({ error: null });
    });
    const timelogUpdate = vi.fn().mockImplementation((payload: unknown) => {
      timelogUpdatePayloads.push(payload);
      return { eq: timelogUpdateEq };
    });
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

    const result = await saveTimelog({
      ...existingTimelog,
      days: [{ d: '2026-04-10', f: '09:00', t: '17:00', type: 'provoz' }],
      status: 'pending_ch',
    });

    expect(timelogUpdate).toHaveBeenCalledWith({
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      km: 0,
      note: '',
      review_note: null,
      status: 'draft',
    });
    expect(timelogUpdateEq).toHaveBeenCalledWith('id', 'timelog-row-1');
    expect(timelogDaysDeleteEq).toHaveBeenCalledWith('timelog_id', 'timelog-row-1');
    expect(result.status).toBe('pending_ch');
    expect(snapshot.timelogs[0]).toMatchObject({
      id: 7,
      supabaseId: 'timelog-row-1',
      eid: 3,
      status: 'pending_ch',
    });
  });

  it('creates a new timelog when saving an unsaved draft', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'approved',
      },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    const { saveTimelog } = await import('./timelogs.service');

    const created = await saveTimelog({
      id: -1,
      eid: 1,
      contractorProfileId: 'profile-uuid-2',
      days: [{ d: '2026-04-11', f: '14:00', t: '17:00', type: 'provoz' }],
      km: 0,
      note: 'Novy koncept',
      status: 'draft',
    });

    expect(created.id).toEqual(expect.stringMatching(/^local:timelog:/));
    expect(snapshot.timelogs).toHaveLength(2);
    expect(snapshot.timelogs[1]).toEqual(created);
    expect(snapshot.timelogs[1].days).toEqual([
      { d: '2026-04-11', f: '14:00', t: '17:00', type: 'provoz' },
    ]);
  });

  it('creates a CrewHead proposal in Supabase before moving it to Crew confirmation', async () => {
    let snapshot = createSnapshot([]);
    const operationOrder: string[] = [];
    const timelogInsert = vi.fn().mockImplementation((payload: unknown) => {
      operationOrder.push(`timelog-insert:${(payload as { status?: string }).status ?? 'missing'}`);
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'timelog-row-1' }, error: null }),
        })),
      };
    });
    const timelogUpdate = vi.fn().mockImplementation((payload: unknown) => {
      operationOrder.push(`timelog-update:${(payload as { status?: string }).status ?? 'missing'}`);
      return {
        eq: vi.fn(() => ({
          select: vi.fn().mockResolvedValue({ data: [{ id: 'timelog-row-1' }], error: null }),
        })),
      };
    });
    const timelogDaysInsert = vi.fn().mockImplementation(() => {
      operationOrder.push('timelog-days-insert');
      return Promise.resolve({ error: null });
    });
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
              insert: timelogInsert,
              update: timelogUpdate,
            };
          }

          if (table === 'timelog_days') {
            return {
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData: vi.fn(),
        invalidateQueries: vi.fn(),
      },
    }));

    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: {
        timelogs: {
          all: ['timelogs'],
        },
      },
    }));

    const { createTimelog } = await import('./timelogs.service');

    const created = await createTimelog({
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [
        { d: '2026-04-16', f: '14:00', t: '17:00', type: 'provoz' },
      ],
      km: 0,
      note: 'Zadano CH',
      status: 'pending_crew_confirmation',
    });

    expect(timelogInsert).toHaveBeenCalledWith({
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      crew_confirmation_snapshot: expect.objectContaining({
        changedAt: expect.any(String),
        before: {
          days: [],
          km: 0,
          note: '',
        },
      }),
      km: 0,
      note: 'Zadano CH',
      review_note: null,
      status: 'pending_ch',
    });
    expect(timelogDaysInsert).toHaveBeenCalledWith([
      {
        timelog_id: 'timelog-row-1',
        date: '2026-04-16',
        time_from: '14:00',
        time_to: '17:00',
        day_type: 'provoz',
        meals: [],
        meal: null,
        note: null,
      },
    ]);
    expect(timelogUpdate).toHaveBeenCalledWith({ status: 'pending_crew_confirmation' });
    expect(operationOrder).toEqual([
      'timelog-insert:pending_ch',
      'timelog-days-insert',
      'timelog-update:pending_crew_confirmation',
    ]);
    expect(created.supabaseId).toBe('timelog-row-1');
    expect(created.status).toBe('pending_crew_confirmation');
    expect(snapshot.timelogs[0].supabaseId).toBe('timelog-row-1');
    expect(snapshot.timelogs[0].status).toBe('pending_crew_confirmation');
  });

  it('rejects creating a second event-contractor timelog instead of overwriting the existing report', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'pending_ch',
      },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    const { saveTimelog } = await import('./timelogs.service');

    await expect(saveTimelog({
      id: -1,
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-10', f: '09:00', t: '17:00', type: 'provoz' }],
      km: 12,
      note: 'Upraveny draft',
      status: 'pending_ch',
    })).rejects.toThrow('Výkaz pro tohoto člena crew a akci už existuje.');

    expect(snapshot.timelogs).toHaveLength(1);
    expect(snapshot.timelogs[0].days).toEqual([
      { d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' },
    ]);
    expect(snapshot.timelogs[0].km).toBe(0);
    expect(snapshot.timelogs[0].note).toBe('');
    expect(setQueryData).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects direct creation of a duplicate event-contractor timelog', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'draft',
      },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    const { createTimelog } = await import('./timelogs.service');

    await expect(createTimelog({
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-11', f: '08:00', t: '17:00', type: 'provoz' }],
      km: 0,
      note: '',
      status: 'draft',
    })).rejects.toThrow('Výkaz pro tohoto člena crew a akci už existuje.');

    expect(snapshot.timelogs).toHaveLength(1);
    expect(setQueryData).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects overlapping entries in one event-contractor timelog', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-08-30', f: '08:00', t: '20:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'draft',
      },
    ]);
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    const { saveTimelog } = await import('./timelogs.service');

    await expect(saveTimelog({
      ...snapshot.timelogs[0],
      days: [
        { d: '2026-08-30', f: '08:00', t: '20:00', type: 'instal' },
        { d: '2026-08-30', f: '15:00', t: '19:00', type: 'provoz' },
      ],
    })).rejects.toThrow('Časy ve výkazu se překrývají: 30. 8. 08:00-20:00 a 30. 8. 15:00-19:00.');

    expect(snapshot.timelogs[0].days).toEqual([
      { d: '2026-08-30', f: '08:00', t: '20:00', type: 'instal' },
    ]);
    expect(setQueryData).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('rejects overlaps when an overnight entry reaches into the next day', async () => {
    let snapshot = createSnapshot([
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-08-30', f: '20:00', t: '06:00', type: 'instal' }],
        km: 0,
        note: '',
        status: 'draft',
      },
    ]);

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
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

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData: vi.fn(),
        invalidateQueries: vi.fn(),
      },
    }));

    const { saveTimelog } = await import('./timelogs.service');

    await expect(saveTimelog({
      ...snapshot.timelogs[0],
      days: [
        { d: '2026-08-30', f: '20:00', t: '06:00', type: 'instal' },
        { d: '2026-08-31', f: '02:00', t: '04:00', type: 'provoz' },
      ],
    })).rejects.toThrow('Časy ve výkazu se překrývají: 30. 8. 20:00-06:00 a 31. 8. 02:00-04:00.');
  });

  it('deletes the timelog when saving it without any days', async () => {
    let snapshot = {
      ...createSnapshot([
        {
          id: 1,
          eid: 1,
          contractorProfileId: 'profile-uuid-1',
          days: [{ d: '2026-04-10', f: '23:00', t: '01:00', type: 'provoz' as const }],
          km: 0,
          note: '',
          status: 'draft' as const,
        },
      ]),
      events: [{ id: 1 }],
      contractors: [{ id: 1, profileId: 'profile-uuid-1', name: 'Crew member' }],
    };

    const timelogDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDelete = vi.fn(() => ({ eq: timelogDeleteEq }));
    const timelogUpdate = vi.fn();
    const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));
    const timelogDaysInsert = vi.fn();
    const timelogsSelectMock = vi.fn(() => ({
      order: vi.fn(() => Promise.resolve({
        data: [{ id: 'timelog-row-1' }],
        error: null,
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
              delete: timelogDelete,
            };
          }

          if (table === 'timelog_days') {
            return {
              delete: timelogDaysDelete,
              insert: timelogDaysInsert,
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

    const result = await saveTimelog({
      ...snapshot.timelogs[0],
      days: [],
    });

    expect(timelogDaysDeleteEq).toHaveBeenCalledWith('timelog_id', 'timelog-row-1');
    expect(timelogDeleteEq).toHaveBeenCalledWith('id', 'timelog-row-1');
    expect(timelogUpdate).not.toHaveBeenCalled();
    expect(timelogDaysInsert).not.toHaveBeenCalled();
    expect(result.days).toEqual([]);
    expect(snapshot.timelogs).toEqual([]);
  });

  it('throws when saving a timelog without contractorProfileId', async () => {
    let snapshot = {
      events: [{ id: 1 }],
      contractors: [{ id: 1, profileId: 'profile-uuid-1', name: 'Crew member' }],
      timelogs: [{
        id: 1,
        eid: 1,
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

    await expect(saveTimelog({
      ...snapshot.timelogs[0],
      note: 'Legacy cid only',
    })).rejects.toThrow('Nepodarilo se dohledat UUID identitu clena crew.');
    expect(timelogUpdate).not.toHaveBeenCalled();
  });
});

describe('timelog Supabase policies', () => {
  it('allows CrewHead to update only submitted CH timelogs', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/crewhead-timelog-approval-policy.sql'), 'utf8');

    expect(sql).toContain("status = 'pending_ch'::timelog_status");
    expect(sql).not.toContain("'draft'::timelog_status");
  });
});
