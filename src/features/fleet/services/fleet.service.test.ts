import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyFleetReservation,
  findFleetReservationConflicts,
  getFleetVehicleDetail,
  getFleetOverviewRows,
  saveFleetReservation,
} from './fleet.service';

describe('fleet service', () => {
  it('shows STK warning only when a vehicle needs attention', () => {
    const rows = getFleetOverviewRows('2026-04-28');

    expect(rows.find((row) => row.vehicle.id === 'crafter-1')?.inspectionAlert?.label).toBe('STK za 13 dní');
    expect(rows.find((row) => row.vehicle.id === 'octavia-1')?.inspectionAlert).toBeNull();
  });

  it('returns the nearest future reservation for each vehicle', () => {
    const rows = getFleetOverviewRows('2026-04-28');

    expect(rows.find((row) => row.vehicle.id === 'crafter-1')?.nextReservation?.projectId).toBe('AKV104');
    expect(rows.find((row) => row.vehicle.id === 'transit-1')?.nextReservation?.projectId).toBe('BNZ003');
  });

  it('splits vehicle reservations into upcoming and history', () => {
    const detail = getFleetVehicleDetail('crafter-1', '2026-04-28');

    expect(detail?.upcomingReservations.map((reservation) => reservation.projectId)).toContain('AKV104');
    expect(detail?.historyReservations.map((reservation) => reservation.projectId)).toContain('TEST001');
  });

  it('defaults a new reservation to the selected vehicle and signed-in profile', () => {
    const reservation = createEmptyFleetReservation('crafter-1', 'profile-local-1');

    expect(reservation.vehicleId).toBe('crafter-1');
    expect(reservation.responsibleProfileId).toBe('profile-local-1');
    expect(reservation.projectId).toBe('');
    expect(reservation.eventId).toBeNull();
  });

  it('marks overlapping reservations as conflicts without blocking save', async () => {
    const draft = {
      vehicleId: 'crafter-1',
      projectId: 'TEST001',
      eventId: 1,
      responsibleProfileId: 'profile-local-1',
      startsAt: '2026-05-02T09:00',
      endsAt: '2026-05-02T12:00',
      note: 'Prekryv pro test konfliktu',
    };

    expect(findFleetReservationConflicts(draft).map((item) => item.id)).toContain(1);

    const saved = await saveFleetReservation(draft);

    expect(saved.hasConflict).toBe(true);
    expect(saved.id).toBeGreaterThan(0);
  });
});

describe('fleet service Supabase writes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('persists reservations to Supabase using UUID relationships', async () => {
    let snapshot = {
      fleetVehicles: [{
        id: 'crafter-1',
        supabaseId: 'vehicle-uuid-1',
        name: 'Crafter 1',
        plate: '4AK 1234',
        type: 'Dodávka',
        status: 'available',
        capacity: '3 místa',
        inspectionValidUntil: '2026-05-11',
        note: '',
      }],
      fleetReservations: [],
      projects: [{
        id: 'AKV104',
        supabaseId: 'project-uuid-1',
        name: 'BTL Mattoni',
        client: 'Next Level',
        createdAt: '2026-04-28',
      }],
      events: [{
        id: 22,
        supabaseId: 'event-uuid-1',
        projectId: 'project-uuid-1',
        name: 'BTL Mattoni',
        job: 'AKV104',
        startDate: '2026-05-02',
        endDate: '2026-05-02',
        city: 'Praha',
        needed: 1,
        filled: 0,
        status: 'upcoming',
        client: 'Next Level',
      }],
      contractors: [],
    };

    const insert = vi.fn().mockResolvedValue({ data: { id: 'reservation-uuid-1' }, error: null });
    const select = vi.fn(() => ({ single: insert }));
    const insertMock = vi.fn(() => ({ select }));
    const from = vi.fn((table: string) => {
      if (table === 'fleet_vehicles') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [{
                id: 'vehicle-uuid-1',
                slug: 'crafter-1',
                name: 'Crafter 1',
                plate: '4AK 1234',
                type: 'Dodávka',
                status: 'available',
                capacity: '3 místa',
                inspection_valid_until: '2026-05-11',
                insurance_valid_until: null,
                service_due_at: null,
                note: null,
                created_at: '2026-04-28T00:00:00Z',
                updated_at: '2026-04-28T00:00:00Z',
              }],
              error: null,
            })),
          })),
        };
      }
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [{
                id: 'project-uuid-1',
                job_number: 'AKV104',
                name: 'BTL Mattoni',
                client_id: null,
                note: null,
                created_at: '2026-04-28T00:00:00Z',
                updated_at: '2026-04-28T00:00:00Z',
              }],
              error: null,
            })),
          })),
        };
      }
      if (table === 'events') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [{
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
              error: null,
            })),
          })),
        };
      }
      if (table !== 'fleet_reservations') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        insert: insertMock,
        select: vi.fn(() => ({ order: vi.fn(() => ({ data: [], error: null })) })),
      };
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { saveFleetReservation } = await import('./fleet.service');

    const saved = await saveFleetReservation({
      vehicleId: 'crafter-1',
      projectId: 'AKV104',
      eventId: 22,
      responsibleProfileId: 'profile-uuid-1',
      startsAt: '2026-05-02T08:00',
      endsAt: '2026-05-02T18:00',
      note: 'Instalace',
    });

    expect(insertMock).toHaveBeenCalledWith({
      vehicle_id: 'vehicle-uuid-1',
      project_id: 'project-uuid-1',
      event_id: 'event-uuid-1',
      responsible_profile_id: 'profile-uuid-1',
      starts_at: '2026-05-02T08:00',
      ends_at: '2026-05-02T18:00',
      note: 'Instalace',
      has_conflict: false,
    });
    expect(select).toHaveBeenCalledWith('id');
    expect(saved.supabaseId).toBe('reservation-uuid-1');
    expect(snapshot.fleetReservations[0]).toEqual(expect.objectContaining({
      supabaseId: 'reservation-uuid-1',
      vehicleId: 'crafter-1',
      projectId: 'AKV104',
    }));
  });

  it('hydrates fleet dependencies from Supabase once', async () => {
    let snapshot = {
      fleetVehicles: [],
      fleetReservations: [],
      projects: [],
      events: [],
      contractors: [],
    };

    const rowsByTable = {
      fleet_vehicles: [{
        id: 'vehicle-uuid-1',
        slug: 'crafter-1',
        name: 'Crafter 1',
        plate: '4AK 1234',
        type: 'Dodávka',
        status: 'available',
        capacity: '3 místa',
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
        event_id: null,
        responsible_profile_id: 'profile-uuid-1',
        starts_at: '2026-05-02T08:00:00+00:00',
        ends_at: '2026-05-02T18:00:00+00:00',
        note: null,
        has_conflict: false,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      projects: [{
        id: 'project-uuid-1',
        job_number: 'AKV104',
        name: 'BTL Mattoni',
        client_id: null,
        note: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      events: [],
    };

    const from = vi.fn((table: keyof typeof rowsByTable) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({ data: rowsByTable[table], error: null })),
      })),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { getFleetDependencies } = await import('./fleet.service');

    expect(getFleetDependencies().vehicles).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getFleetDependencies().vehicles).toEqual([
      expect.objectContaining({ id: 'crafter-1', supabaseId: 'vehicle-uuid-1' }),
    ]);
    expect(getFleetDependencies().reservations).toEqual([
      expect.objectContaining({ vehicleId: 'crafter-1', projectId: 'AKV104' }),
    ]);
    expect(from).toHaveBeenCalledTimes(4);
  });
});
