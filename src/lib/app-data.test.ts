import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('app-data Supabase loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('starts from an empty in-memory snapshot when local backup data is disabled', async () => {
    vi.doMock('./app-config', () => ({
      appDataSource: 'supabase',
      isLocalDataEnabled: false,
    }));

    const { getLocalAppData, getLocalAppState } = await import('./app-data');

    expect(getLocalAppData().events).toEqual([]);
    expect(getLocalAppState().events).toEqual([]);
    expect(getLocalAppState().contractors).toEqual([]);
    expect(getLocalAppState().warehouseItems).toEqual([]);
  });

  it('keeps local seed data available without local event clutter', async () => {
    vi.doMock('./app-config', () => ({
      appDataSource: 'local',
      isLocalDataEnabled: true,
    }));

    const { getLocalAppData } = await import('./app-data');
    const localAppData = getLocalAppData();

    expect(localAppData.events).toEqual([]);
    expect(localAppData.projects).toEqual([]);
    expect(localAppData.timelogs).toEqual([]);
    expect(localAppData.invoices).toEqual([]);
    expect(localAppData.receipts).toEqual([]);
    expect(localAppData.fleetReservations).toEqual([]);
    expect(localAppData.eventApplications).toEqual([]);
    expect(localAppData.eventCrewAssignments).toEqual([]);
    expect(localAppData.crewRatings).toEqual([]);
    expect(localAppData.contractors.length).toBeGreaterThan(0);
    expect(localAppData.contractors.every((contractor) => contractor.events === 0)).toBe(true);
    expect(localAppData.warehouseItems.length).toBeGreaterThan(0);
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
        contact_profile_id: null,
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
      timelogs: [{
        id: 'timelog-uuid-1',
        event_id: 'event-uuid-1',
        contractor_id: 'profile-uuid-1',
        km: 12,
        note: 'Poznamka k vykazu',
        status: 'draft',
        submitted_at: null,
        approved_at: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      timelog_days: [{
        id: 'timelog-day-uuid-1',
        timelog_id: 'timelog-uuid-1',
        date: '2026-05-02',
        time_from: '08:00',
        time_to: '17:00',
        day_type: 'instal',
        meal: null,
        note: null,
        created_at: '2026-04-28T00:00:00Z',
      }],
      crew_ratings: [{
        id: 'rating-uuid-1',
        profile_id: 'profile-uuid-1',
        event_id: 'event-uuid-1',
        source: 'event',
        rating: 9,
        note: 'Skvela prace',
        rated_by_profile_id: 'profile-uuid-1',
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      invoices: [{
        id: 'invoice-uuid-1',
        contractor_id: 'profile-uuid-1',
        event_id: 'event-uuid-1',
        timelog_id: 'timelog-uuid-1',
        job_number: 'AKV104',
        total_hours: 9,
        amount_hours: 2700,
        amount_km: 60,
        amount_receipts: 250,
        total_amount: 3010,
        invoice_number: null,
        issue_date: null,
        taxable_supply_date: null,
        due_date: null,
        currency: 'CZK',
        supplier_snapshot: null,
        customer_snapshot: null,
        pdf_path: null,
        pdf_generated_at: null,
        status: 'draft',
        sent_at: null,
        paid_at: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      receipts: [{
        id: 'receipt-uuid-1',
        contractor_id: 'profile-uuid-1',
        event_id: 'event-uuid-1',
        job_number: 'AKV104',
        name: 'Parkovne',
        supplier: 'Garage',
        amount: 250,
        paid_at: '2026-05-02',
        note: null,
        status: 'draft',
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
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
    const rpc = vi.fn((fn: string) => {
      if (fn !== 'list_event_crew_assignments') {
        throw new Error(`Unexpected rpc ${fn}`);
      }
      return Promise.resolve({
        data: [
          {
            event_id: 'event-uuid-1',
            profile_id: 'profile-uuid-1',
            first_name: 'Petr',
            last_name: 'Heitzer',
          },
        ],
        error: null,
      });
    });

    vi.doMock('./supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from, rpc },
    }));

    const { getSupabaseAppData } = await import('./app-data');
    const snapshot = await getSupabaseAppData();

    expect(snapshot.events).toEqual([
      expect.objectContaining({
        id: 'event-uuid-1',
        supabaseId: 'event-uuid-1',
      }),
    ]);
    expect(snapshot.timelogs).toEqual([
      expect.objectContaining({
        id: 'timelog-uuid-1',
        supabaseId: 'timelog-uuid-1',
        eid: 'event-uuid-1',
      }),
    ]);
    expect(snapshot.invoices).toEqual([
      expect.objectContaining({
        id: 'invoice-uuid-1',
        eid: 'event-uuid-1',
      }),
    ]);
    expect(snapshot.receipts).toEqual([
      expect.objectContaining({
        id: 'receipt-uuid-1',
        supabaseId: 'receipt-uuid-1',
        eventSupabaseId: 'event-uuid-1',
        eid: 'event-uuid-1',
      }),
    ]);
    expect(snapshot.fleetVehicles).toEqual([
      expect.objectContaining({
        id: 'crafter-1',
        supabaseId: 'vehicle-uuid-1',
      }),
    ]);
    expect(snapshot.crewRatings).toEqual([
      expect.objectContaining({
        id: 'rating-uuid-1',
        profileId: 'profile-uuid-1',
        eventId: 'event-uuid-1',
        eventSupabaseId: 'event-uuid-1',
        source: 'event',
        rating: 9,
        note: 'Skvela prace',
      }),
    ]);
    expect(snapshot.fleetReservations).toEqual([
      expect.objectContaining({
        id: 1,
        supabaseId: 'reservation-uuid-1',
        vehicleId: 'crafter-1',
        projectId: 'AKV104',
        eventId: 'event-uuid-1',
        responsibleProfileId: 'profile-uuid-1',
      }),
    ]);
    expect(snapshot.budgetPackages).toEqual([
      expect.objectContaining({
        id: 1,
        supabaseId: 'package-uuid-1',
        projectId: 'AKV104',
        eventIds: ['event-uuid-1'],
      }),
    ]);
    expect(snapshot.budgetItems).toEqual([
      expect.objectContaining({
        id: 1,
        supabaseId: 'item-uuid-1',
        projectId: 'AKV104',
        budgetPackageId: 1,
        eventId: 'event-uuid-1',
        unitPrice: 100,
      }),
    ]);
    expect(snapshot.eventCrewAssignments).toEqual([
      {
        eventId: 'event-uuid-1',
        eventSupabaseId: 'event-uuid-1',
        contractorProfileId: 'profile-uuid-1',
        name: 'Petr Heitzer',
      },
    ]);
  });
});
