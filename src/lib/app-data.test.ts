import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('app-data Supabase loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('loads fleet vehicles and reservations from Supabase app data', async () => {
    const rowsByTable = {
      clients: [],
      projects: [{
        id: 'project-uuid-1',
        job_number: 'AKV104',
        name: 'BTL Mattoni',
        client_id: null,
        note: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      profiles: [{
        id: 'profile-uuid-1',
        user_id: 'user-uuid-1',
        first_name: 'Petr',
        last_name: 'Heitzer',
        phone: null,
        email: null,
        ico: null,
        dic: null,
        bank_account: null,
        iban: null,
        billing_street: null,
        billing_zip: null,
        billing_city: null,
        billing_country: null,
        hourly_rate: null,
        tags: null,
        avatar_color: null,
        avatar_bg: null,
        note: null,
        reliable: null,
        rating: null,
        reliability: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      events: [{
        id: 'event-uuid-1',
        name: 'BTL Mattoni',
        project_id: 'project-uuid-1',
        job_number: 'AKV104',
        client_name: null,
        date_from: '2026-05-02',
        date_to: '2026-05-02',
        time_from: null,
        time_to: null,
        city: null,
        crew_needed: null,
        crew_filled: null,
        status: 'upcoming',
        description: null,
        contact_person: null,
        contact_phone: null,
        contact_email: null,
        dresscode: null,
        meeting_point: null,
        show_day_types: null,
        day_types: null,
        phase_times: null,
        phase_schedules: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      timelogs: [],
      timelog_days: [],
      invoices: [],
      receipts: [],
      candidates: [],
      fleet_vehicles: [{
        id: 'vehicle-uuid-1',
        slug: 'crafter-1',
        name: 'Crafter 1',
        plate: '4AK 1234',
        type: 'Dodávka 12 m3',
        status: 'available',
        capacity: '3 místa / 12 m3',
        inspection_valid_until: '2026-05-11',
        insurance_valid_until: null,
        service_due_at: null,
        note: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      fleet_reservations: [{
        id: 'reservation-uuid-1',
        vehicle_id: 'vehicle-uuid-1',
        project_id: 'project-uuid-1',
        event_id: 'event-uuid-1',
        responsible_profile_id: 'profile-uuid-1',
        starts_at: '2026-05-02T08:00:00+00:00',
        ends_at: '2026-05-02T18:00:00+00:00',
        note: 'Instalace',
        has_conflict: false,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      budget_packages: [{
        id: 'package-uuid-1',
        project_id: 'project-uuid-1',
        name: 'Majales',
        note: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      budget_package_events: [{
        budget_package_id: 'package-uuid-1',
        event_id: 'event-uuid-1',
        created_at: '2026-04-28T00:00:00Z',
      }],
      budget_items: [{
        id: 'item-uuid-1',
        project_id: 'project-uuid-1',
        budget_package_id: 'package-uuid-1',
        event_id: 'event-uuid-1',
        section: 'TRANSPORTATION',
        name: 'Van',
        units: 'km/action/czk',
        amount: 10,
        quantity: 2,
        unit_price: 100,
        note: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
    };

    const from = vi.fn((table: keyof typeof rowsByTable) => ({
      select: vi.fn(() => {
        const result = { data: rowsByTable[table], error: null };
        const order = vi.fn(() => ({ ...result, order }));
        return { order };
      }),
    }));

    vi.doMock('./supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));

    const { getSupabaseAppData } = await import('./app-data');
    const snapshot = await getSupabaseAppData();

    expect(snapshot.fleetVehicles).toEqual([
      expect.objectContaining({
        id: 'crafter-1',
        supabaseId: 'vehicle-uuid-1',
      }),
    ]);
    expect(snapshot.fleetReservations).toEqual([
      expect.objectContaining({
        id: 1,
        supabaseId: 'reservation-uuid-1',
        vehicleId: 'crafter-1',
        projectId: 'AKV104',
        eventId: 1,
        responsibleProfileId: 'profile-uuid-1',
      }),
    ]);
    expect(snapshot.budgetPackages).toEqual([
      expect.objectContaining({
        id: 1,
        supabaseId: 'package-uuid-1',
        projectId: 'AKV104',
        eventIds: [1],
      }),
    ]);
    expect(snapshot.budgetItems).toEqual([
      expect.objectContaining({
        id: 1,
        supabaseId: 'item-uuid-1',
        projectId: 'AKV104',
        budgetPackageId: 1,
        eventId: 1,
        unitPrice: 100,
      }),
    ]);
  });
});
