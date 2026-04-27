import { describe, expect, it } from 'vitest';
import type { Database } from './database.types';
import { mapEvent, mapProject } from './supabase-mappers';

type EventRow = Database['public']['Tables']['events']['Row'];
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
});
