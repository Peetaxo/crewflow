import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('crew.service UUID detail lookups', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('builds crew detail and receipts by contractorProfileId', async () => {
    const snapshot = {
      contractors: [
        {
          id: 1,
          profileId: 'profile-uuid-1',
          name: 'Contractor One',
          ii: 'CO',
          bg: '#000',
          fg: '#fff',
          tags: [],
          events: 1,
          rate: 250,
          phone: '',
          email: '',
          ico: '',
          dic: '',
          bank: '',
          city: 'Praha',
          reliable: true,
          note: '',
        },
      ],
      timelogs: [
        {
          id: 1,
          eid: 1,
          contractorProfileId: 'profile-uuid-1',
          days: [],
          km: 0,
          note: '',
          status: 'draft',
        },
      ],
      invoices: [
        {
          id: 'INV-1',
          contractorProfileId: 'profile-uuid-1',
          eid: 1,
          hours: 4,
          hAmt: 1000,
          km: 0,
          kAmt: 0,
          total: 1000,
          job: 'JOB-1',
          status: 'draft',
          sentAt: null,
        },
      ],
      receipts: [
        {
          id: 1,
          contractorProfileId: 'profile-uuid-1',
          eid: 1,
          job: 'JOB-1',
          title: 'Receipt',
          vendor: 'Vendor',
          amount: 100,
          paidAt: '2026-04-24',
          note: '',
          status: 'draft',
        },
      ],
      events: [],
      projects: [],
      clients: [],
      candidates: [],
    };

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { getCrewDetailData, getCrewReceipts } = await import('./crew.service');

    const detail = getCrewDetailData('profile-uuid-1');

    expect(detail.contractor?.profileId).toBe('profile-uuid-1');
    expect(detail.timelogs).toHaveLength(1);
    expect(detail.invoices).toHaveLength(1);
    expect(getCrewReceipts('profile-uuid-1')).toHaveLength(1);
  });
});
