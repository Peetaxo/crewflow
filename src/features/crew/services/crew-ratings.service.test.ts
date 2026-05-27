import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('crew-ratings.service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('validates ratings as whole numbers from 0 to 10', async () => {
    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: vi.fn(),
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { validateCrewRatingValue } = await import('./crew-ratings.service');

    expect(validateCrewRatingValue(0)).toBe(0);
    expect(validateCrewRatingValue(10)).toBe(10);
    expect(validateCrewRatingValue(7)).toBe(7);
    expect(() => validateCrewRatingValue(-1)).toThrow('Hodnoceni musi byt cele cislo od 0 do 10.');
    expect(() => validateCrewRatingValue(10.5)).toThrow('Hodnoceni musi byt cele cislo od 0 do 10.');
    expect(() => validateCrewRatingValue(11)).toThrow('Hodnoceni musi byt cele cislo od 0 do 10.');
  });

  it('upserts a local event rating and recalculates the contractor average', async () => {
    let snapshot: any = {
      events: [
        {
          id: 1,
          supabaseId: 'event-uuid-1',
          name: 'Past event',
          job: 'JOB-1',
          startDate: '2026-04-01',
          endDate: '2026-04-01',
          city: 'Praha',
          needed: 1,
          filled: 1,
          status: 'past',
          client: 'Client',
        },
      ],
      eventApplications: [],
      eventCrewAssignments: [],
      crewRatings: [
        {
          id: 'rating-initial',
          profileId: 'profile-uuid-1',
          eventId: null,
          eventSupabaseId: null,
          source: 'initial',
          rating: 8,
          note: '',
          ratedByProfileId: 'manager-profile',
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ],
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
          rating: 8,
          note: '',
        },
      ],
      timelogs: [],
      invoices: [],
      receipts: [],
      budgetPackages: [],
      budgetItems: [],
      fleetVehicles: [],
      fleetReservations: [],
      warehouseItems: [],
      warehouseReservations: [],
      candidates: [],
      projects: [],
      clients: [],
    };

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'local' }));
    vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { getCrewRatingsForEvent, upsertCrewRating } = await import('./crew-ratings.service');

    const saved = await upsertCrewRating({
      profileId: 'profile-uuid-1',
      eventId: 1,
      eventSupabaseId: 'event-uuid-1',
      source: 'event',
      rating: 10,
      note: 'Skvela prace',
      ratedByProfileId: 'manager-profile',
    });

    expect(saved).toEqual(expect.objectContaining({
      profileId: 'profile-uuid-1',
      eventId: 1,
      eventSupabaseId: 'event-uuid-1',
      source: 'event',
      rating: 10,
      note: 'Skvela prace',
    }));
    expect(getCrewRatingsForEvent(1)).toEqual([saved]);
    expect(snapshot.contractors[0].rating).toBe(9);

    await upsertCrewRating({
      profileId: 'profile-uuid-1',
      eventId: 1,
      eventSupabaseId: 'event-uuid-1',
      source: 'event',
      rating: 6,
      note: 'Oprava',
      ratedByProfileId: 'manager-profile',
    });

    expect(snapshot.crewRatings.filter((rating: any) => rating.source === 'event')).toHaveLength(1);
    expect(snapshot.contractors[0].rating).toBe(7);
  });
});
