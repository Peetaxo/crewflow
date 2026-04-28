import { describe, expect, it } from 'vitest';
import type { Database } from './database.types';
import { mapEvent, mapFleetReservation, mapFleetVehicle, mapProject } from './supabase-mappers';

type EventRow = Database['public']['Tables']['events']['Row'];
type FleetReservationRow = Database['public']['Tables']['fleet_reservations']['Row'];
type FleetVehicleRow = Database['public']['Tables']['fleet_vehicles']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];

describe('supabase mappers', () => {
  it('preserves project_id on mapped events', () => {
    const row: EventRow = {
      id: 'event-uuid-1',
      name: 'Akce',
      project_id: 'project-uuid-1',
      job_number: 'JOB-1',
      client_name: null,
      date_from: '2026-04-27',
      date_to: '2026-04-27',
      time_from: null,
      time_to: null,
      city: 'Praha',
      crew_needed: 1,
      crew_filled: 0,
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
      created_at: '2026-04-27T00:00:00Z',
      updated_at: '2026-04-27T00:00:00Z',
    };

    expect(mapEvent(row).projectId).toBe('project-uuid-1');
  });

  it('preserves client_id and supabase id on mapped projects', () => {
    const row: ProjectRow = {
      id: 'project-uuid-1',
      job_number: 'JOB-1',
      name: 'Projekt',
      client_id: 'client-uuid-1',
      note: null,
      created_at: '2026-04-27T00:00:00Z',
      updated_at: '2026-04-27T00:00:00Z',
    };

    expect(mapProject(row, 'Next Level')).toMatchObject({
      id: 'JOB-1',
      supabaseId: 'project-uuid-1',
      clientId: 'client-uuid-1',
      client: 'Next Level',
    });
  });

  it('maps Supabase fleet vehicles to app vehicles', () => {
    const row: FleetVehicleRow = {
      id: 'vehicle-uuid-1',
      slug: 'crafter-1',
      name: 'Crafter 1',
      plate: '4AK 1234',
      type: 'Dodávka 12 m3',
      status: 'available',
      capacity: '3 místa / 12 m3',
      inspection_valid_until: '2026-05-11',
      insurance_valid_until: '2026-11-30',
      service_due_at: '2026-07-15',
      note: 'Hlavní dodávka',
      created_at: '2026-04-28T00:00:00Z',
      updated_at: '2026-04-28T00:00:00Z',
    };

    expect(mapFleetVehicle(row)).toMatchObject({
      id: 'crafter-1',
      supabaseId: 'vehicle-uuid-1',
      name: 'Crafter 1',
      plate: '4AK 1234',
      inspectionValidUntil: '2026-05-11',
    });
  });

  it('maps Supabase fleet reservations to app reservations', () => {
    const row: FleetReservationRow = {
      id: 'reservation-uuid-1',
      vehicle_id: 'vehicle-uuid-1',
      project_id: 'project-uuid-1',
      event_id: 'event-uuid-1',
      responsible_profile_id: 'profile-uuid-1',
      starts_at: '2026-05-02T08:00:00+00:00',
      ends_at: '2026-05-02T18:00:00+00:00',
      note: 'Instalace',
      has_conflict: true,
      created_at: '2026-04-28T00:00:00Z',
      updated_at: '2026-04-28T00:00:00Z',
    };

    expect(mapFleetReservation(row, {
      localId: 7,
      vehicleSlug: 'crafter-1',
      projectJobNumber: 'AKV104',
      eventId: 22,
    })).toMatchObject({
      id: 7,
      supabaseId: 'reservation-uuid-1',
      vehicleId: 'crafter-1',
      projectId: 'AKV104',
      eventId: 22,
      responsibleProfileId: 'profile-uuid-1',
      startsAt: '2026-05-02T08:00:00+00:00',
      endsAt: '2026-05-02T18:00:00+00:00',
      hasConflict: true,
    });
  });
});
