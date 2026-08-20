import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationSql = () => readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260819144500_restore_crew_event_history_visibility.sql',
  ),
  'utf8',
).toLowerCase();

describe('Crew event history visibility migration', () => {
  it('lets Crew read published events and owned lifecycle rows without adding event writes', () => {
    const sql = migrationSql();

    expect(sql).toContain('drop policy if exists "crew can view assigned events" on public.events;');
    expect(sql).toContain('create policy "crew can view assigned events"');
    expect(sql).toContain("public.has_role((select auth.uid()), 'crew'::public.app_role)");
    expect(sql).toContain("events.status in ('upcoming'::public.event_status, 'full'::public.event_status)");
    expect(sql).toContain('assignment.event_id = events.id');
    expect(sql).toContain('assignment.profile_id = public.current_profile_id()');
    expect(sql).toContain('timelog.event_id = events.id');
    expect(sql).toContain('timelog.contractor_id = public.current_profile_id()');
    expect(sql).toContain('application.event_id = events.id');
    expect(sql).toContain('application.profile_id = public.current_profile_id()');
    expect(sql).not.toMatch(/grant\s+(?:delete|all)\s+on\s+table\s+public\.events/i);
    expect(sql).not.toMatch(/for\s+(?:insert|update|delete|all)/i);
  });
});
