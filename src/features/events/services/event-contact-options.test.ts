import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('event contact options', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
  it('uses the reviewed RPC in remote mode', async () => {
    const list = vi.fn().mockResolvedValue([{ profileId: 'p1', name: 'Anna', phone: '123', canApproveHours: true }]);
    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../timelogs/services/timelog-approval-rpc.service', () => ({ listEventContactOptionsRpc: list }));
    const { getEventContactOptions } = await import('./events.service');
    expect(await getEventContactOptions()).toEqual([{ profileId: 'p1', name: 'Anna', phone: '123', canApproveHours: true }]);
    expect(list).toHaveBeenCalledOnce();
  });
  it('uses existing local profile data without inventing approval rights or profile IDs', async () => {
    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/app-data', () => ({ getLocalAppState: () => ({ contractors: [
      { id: 1, profileId: 'p1', userId: 'u1', name: 'Anna', phone: '123', tags: ['coo'] },
      { id: 2, name: 'Bez profilu', phone: '456' },
    ] }) }));
    const { getEventContactOptions } = await import('./events.service');
    expect(await getEventContactOptions()).toEqual([{ profileId: 'p1', name: 'Anna', phone: '123', canApproveHours: false }]);
  });
});
