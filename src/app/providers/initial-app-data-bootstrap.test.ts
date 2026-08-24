import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  reset: vi.fn(async () => { mocks.order.push('reset'); }),
  events: vi.fn(async () => { mocks.order.push('events'); }),
  timelogs: vi.fn(async () => { mocks.order.push('timelogs'); }),
  crew: vi.fn(async () => { mocks.order.push('crew'); }),
  projects: vi.fn(async () => { mocks.order.push('projects'); }),
  setQueryData: vi.fn(),
  snapshot: { events: [{ id: 1 }], timelogs: [{ id: 2 }] },
}));

vi.mock('./reset-supabase-data-scope', () => ({
  resetSupabaseDataScope: mocks.reset,
}));

vi.mock('../../features/events/services/events.service', () => ({
  loadSupabaseEvents: mocks.events,
}));

vi.mock('../../features/timelogs/services/timelogs.service', () => ({
  loadSupabaseTimelogs: mocks.timelogs,
}));

vi.mock('../../features/crew/services/crew.service', () => ({
  loadSupabaseCrew: mocks.crew,
}));

vi.mock('../../features/projects/services/projects.service', () => ({
  loadSupabaseProjects: mocks.projects,
}));

vi.mock('../../lib/app-data', () => ({
  getLocalAppState: () => mocks.snapshot,
}));

vi.mock('../../lib/query-client', () => ({
  queryClient: { setQueryData: mocks.setQueryData },
}));

vi.mock('../../lib/query-keys', () => ({
  queryKeys: {
    events: { all: ['events'] },
    timelogs: { all: ['timelogs'] },
  },
}));

describe('bootstrapInitialAppData', () => {
  beforeEach(() => {
    mocks.order.length = 0;
    mocks.reset.mockReset().mockImplementation(async () => { mocks.order.push('reset'); });
    mocks.events.mockReset().mockImplementation(async () => { mocks.order.push('events'); });
    mocks.timelogs.mockReset().mockImplementation(async () => { mocks.order.push('timelogs'); });
    mocks.crew.mockReset().mockImplementation(async () => { mocks.order.push('crew'); });
    mocks.projects.mockReset().mockImplementation(async () => { mocks.order.push('projects'); });
    mocks.setQueryData.mockReset();
  });

  it('resets, loads every core dataset, and seeds query caches', async () => {
    const { bootstrapInitialAppData } = await import('./initial-app-data-bootstrap');

    await bootstrapInitialAppData();

    expect(mocks.order[0]).toBe('reset');
    expect(new Set(mocks.order.slice(1))).toEqual(new Set(['events', 'timelogs', 'crew', 'projects']));
    expect(mocks.setQueryData).toHaveBeenCalledWith(['events'], mocks.snapshot.events);
    expect(mocks.setQueryData).toHaveBeenCalledWith(['timelogs'], mocks.snapshot.timelogs);
  });

  it('does not seed caches when a required loader rejects', async () => {
    mocks.crew.mockRejectedValueOnce(new Error('offline'));
    const { bootstrapInitialAppData } = await import('./initial-app-data-bootstrap');

    await expect(bootstrapInitialAppData()).rejects.toThrow('offline');
    expect(mocks.setQueryData).not.toHaveBeenCalled();
  });
});
