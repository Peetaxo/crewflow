import { describe, expect, it, vi } from 'vitest';
import { getLocalAppState } from '../../../lib/app-data';
import { fetchEventsSnapshot, getEventDetailData } from './events.service';

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
vi.mock('../../../lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { isSupabaseConfigured: true, supabase: createClient('http://database.test', 'test-key', {
    global: { fetch: io.fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) };
});

describe('event lifecycle pagination', () => {
  it('retains event identities and assigned people after the first capped page', async () => {
    const tables: Record<string, object[]> = {
      events: ['a', 'b'].map(id => ({ id, name: id, date_from: '2026-11-23' })),
      event_assignments: ['a', 'b'].map(id => ({ event_id: id, profile_id: 'crew-' + id, assigned_at: '2026-11-23',
        profiles: { first_name: 'Jana', last_name: 'Nová' } })),
    };
    io.fetch.mockImplementation((input: string, init: RequestInit) => {
      const url = new URL(input);
      const table = url.pathname.split('/').pop()!;
      const rows = tables[table] ?? [];
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const headers = new Headers(init.headers);
      if (tables[table] && headers.get('Prefer')?.includes('count=exact')) {
        expect(url.searchParams.get('order')).toBe(table === 'events' ? 'date_from.asc,name.asc,id.asc' : 'assigned_at.asc,id.asc');
        if (table === 'event_assignments') expect(url.searchParams.get('select')).toContain('profiles!event_assignments_profile_id_fkey(first_name,last_name)');
      }
      return Promise.resolve(new Response(JSON.stringify(rows.slice(offset, offset + 1)), {
        headers: { 'Content-Type': 'application/json', 'Content-Range': rows.length ? `${offset}-${offset}/${rows.length}` : '*/0' },
      }));
    });
    const events = await fetchEventsSnapshot();
    expect(events.map(event => event.supabaseId)).toEqual(['a', 'b']);
    const detail = getEventDetailData('b', getLocalAppState());
    expect(detail.hasExplicitRoster).toBe(true);
    expect(detail.crewAssignments.map(assignment => [assignment.contractorProfileId, assignment.name])).toEqual([['crew-b', 'Jana Nová']]);
  });
});
