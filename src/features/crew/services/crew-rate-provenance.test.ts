import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../../../lib/database.types';

const setup = async (source: 'local' | 'supabase', writeError: string | null = null) => {
  const eq = vi.fn().mockResolvedValue({ error: writeError ? { message: writeError } : null });
  const update = vi.fn(() => ({ eq }));
  vi.doMock('../../../lib/app-config', () => ({ appDataSource: source }));
  vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: source === 'supabase', supabase: source === 'supabase' ? { from: () => ({ update }) } : null }));
  const { getLocalAppState, updateLocalAppState } = await import('../../../lib/app-data');
  const { mapContractor } = await import('../../../lib/supabase-mappers');
  const { getProjectSummary } = await import('../../projects/services/project-summary');
  const crew = { ...mapContractor({ id: 'crew-1', first_name: 'Jana', last_name: 'Novakova', hourly_rate: null } as Database['public']['Tables']['profiles']['Row']), id: 1 };
  updateLocalAppState((state) => ({
    ...state,
    contractors: [crew], projects: [{ id: 'AK001', name: 'Projekt', client: '', createdAt: '2026-01-01' }],
    events: [{ id: 1, supabaseId: 'event-1', name: 'Realizace', job: 'AK001', client: '', startDate: '2026-04-10', endDate: '2026-04-10',
      city: 'Praha', needed: 1, filled: 1, status: 'past' }],
    timelogs: [{ id: 1, supabaseId: 'timelog-1', eid: 1, eventSupabaseId: 'event-1', contractorProfileId: 'crew-1',
      days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'provoz' }], km: 0, note: '', status: 'approved' }],
    receipts: [], invoices: [],
  }));
  const summary = () => getProjectSummary('AK001', getLocalAppState())!;
  return { crew, update, getLocalAppState, summary, ...await import('./crew.service') };
};

describe('crew save rate provenance', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it.each(['local', 'supabase'] as const)('replaces a missing rate after successful %s update using the real state clone', async (source) => {
    const { crew, updateCrew, update, summary, getLocalAppState } = await setup(source);
    expect(summary().hasMissingRates).toBe(true);
    await updateCrew({ ...crew, rate: 300, city: 'Praha', phone: '123' });
    if (source === 'supabase') expect(update).toHaveBeenCalledWith(expect.objectContaining({ hourly_rate: 300 }));
    expect(getLocalAppState().contractors[0]).toMatchObject({ rate: 300, hasKnownRate: true });
    expect(summary().costs.work).toBe(2400);
    expect(summary().hasMissingRates).toBe(false);
  });

  it('preserves the unknown rate when the Supabase update fails', async () => {
    const { crew, updateCrew, summary, getLocalAppState } = await setup('supabase', 'save failed');
    await expect(updateCrew({ ...crew, rate: 300, city: 'Praha', phone: '123' })).rejects.toThrow('save failed');
    expect(getLocalAppState().contractors[0]).toMatchObject({ rate: 0, hasKnownRate: false });
    expect(summary().costs.work).toBe(0);
    expect(summary().hasMissingRates).toBe(true);
  });

  it('clears stale unknown-rate provenance on successful LOCAL creation too', async () => {
    const { crew, createCrew, getLocalAppState } = await setup('local');
    await createCrew({ ...crew, id: 2, profileId: 'crew-2', rate: 300, city: 'Praha', phone: '123' });
    expect(getLocalAppState().contractors.find((item) => item.id === 2)).toMatchObject({ rate: 300, hasKnownRate: true });
  });
  it('retires an old owner save before a new profile reuses the same local numeric ID', async () => {
    const { crew, updateCrew, update, getLocalAppState, resetSupabaseCrewHydration } = await setup('supabase');
    let finish!: (value: unknown) => void;
    update.mockReturnValueOnce({ eq: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
    const saving = updateCrew({ ...crew, rate: 300, city: 'Private A', phone: '123', bank: 'PRIVATE A' });
    const rejected = expect(saving).rejects.toThrow(/změnil|zmenil|přístup|pristup/i);
    resetSupabaseCrewHydration();
    const { updateLocalAppState } = await import('../../../lib/app-data');
    updateLocalAppState((state) => ({ ...state, contractors: [{ ...crew, profileId: 'owner-B', bank: 'BANK B', city: 'B' }] }));
    finish({ error: null }); await rejected;
    expect(getLocalAppState().contractors[0]).toMatchObject({ profileId: 'owner-B', bank: 'BANK B', city: 'B' });
  });

});
