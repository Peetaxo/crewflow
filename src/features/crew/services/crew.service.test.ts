import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('crew.service', () => {
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

  it('builds crew detail for legacy contractors without profileId', async () => {
    const snapshot = {
      contractors: [
        {
          id: 7,
          name: 'Legacy Contractor',
          ii: 'LC',
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
          cid: 7,
          days: [],
          km: 0,
          note: '',
          status: 'draft',
        },
      ],
      invoices: [
        {
          id: 'INV-LEGACY',
          cid: 7,
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
      receipts: [],
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

    const { getCrewDetailData } = await import('./crew.service');

    const detail = getCrewDetailData('legacy:7');

    expect(detail.contractor?.id).toBe(7);
    expect(detail.timelogs).toHaveLength(1);
    expect(detail.invoices).toHaveLength(1);
  });

  it('updates an existing crew member in Supabase by profileId', async () => {
    let snapshot = {
      contractors: [
        {
          id: 1,
          profileId: 'profile-uuid-1',
          userId: 'user-uuid-1',
          name: 'Contractor One',
          ii: 'CO',
          bg: '#000',
          fg: '#fff',
          tags: [],
          events: 1,
          rate: 250,
          phone: '111',
          email: 'one@example.com',
          ico: '',
          dic: '',
          bank: '',
          city: 'Praha',
          billingName: 'Contractor One',
          billingStreet: '',
          billingZip: '',
          billingCity: 'Praha',
          billingCountry: 'Ceska republika',
          reliable: true,
          rating: 4,
          note: '',
        },
      ],
      timelogs: [],
      invoices: [],
      receipts: [],
      events: [],
      projects: [],
      clients: [],
      candidates: [],
    };

    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table !== 'profiles') {
            throw new Error(`Unexpected table ${table}`);
          }

          return { update };
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { updateCrew } = await import('./crew.service');

    const updated = await updateCrew({
      ...snapshot.contractors[0],
      city: 'Brno',
      rate: 300,
      note: 'Aktualizovano',
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      hourly_rate: 300,
      billing_city: 'Praha',
      note: 'Aktualizovano',
      avatar_bg: '#000',
      avatar_color: '#fff',
    }));
    expect(updateEq).toHaveBeenCalledWith('id', 'profile-uuid-1');
    expect(updated.city).toBe('Brno');
    expect(snapshot.contractors[0]).toEqual(expect.objectContaining({
      city: 'Brno',
      rate: 300,
      note: 'Aktualizovano',
    }));
  });

  it('deletes a crew member in Supabase when there are no linked financial records', async () => {
    let snapshot = {
      contractors: [
        {
          id: 1,
          profileId: 'profile-uuid-1',
          name: 'Contractor One',
          ii: 'CO',
          bg: '#000',
          fg: '#fff',
          tags: [],
          events: 0,
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
      timelogs: [],
      invoices: [],
      receipts: [],
      events: [],
      projects: [],
      clients: [],
      candidates: [],
    };

    const assignmentDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const assignmentDelete = vi.fn(() => ({ eq: assignmentDeleteEq }));
    const profileDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const profileDelete = vi.fn(() => ({ eq: profileDeleteEq }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'event_assignments') {
            return { delete: assignmentDelete };
          }

          if (table === 'profiles') {
            return { delete: profileDelete };
          }

          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { deleteCrew } = await import('./crew.service');

    await deleteCrew(1);

    expect(assignmentDeleteEq).toHaveBeenCalledWith('profile_id', 'profile-uuid-1');
    expect(profileDeleteEq).toHaveBeenCalledWith('id', 'profile-uuid-1');
    expect(snapshot.contractors).toEqual([]);
  });

  it('refuses to delete a crew member with linked financial data', async () => {
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
      timelogs: [{ id: 1, eid: 1, contractorProfileId: 'profile-uuid-1', days: [], km: 0, note: '', status: 'draft' }],
      invoices: [],
      receipts: [],
      events: [],
      projects: [],
      clients: [],
      candidates: [],
    };

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from: vi.fn() },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { deleteCrew } = await import('./crew.service');

    await expect(deleteCrew(1)).rejects.toThrow('Clena crew s navazanymi vykazy, uctenkami nebo fakturami zatim nelze smazat.');
  });
});
