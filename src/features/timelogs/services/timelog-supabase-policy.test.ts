import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  resolve(process.cwd(), 'supabase/timelog-role-workflow-policies-2026-07.sql'),
  'utf8',
);

describe('Supabase timelog role workflow policies', () => {
  it('replaces broad timelog RLS policies with role-scoped workflow policies', () => {
    const migrationSql = sql();

    expect(migrationSql).toContain('drop policy if exists "Crew can manage own timelogs" on public.timelogs;');
    expect(migrationSql).toContain('drop policy if exists "COO can manage all timelogs" on public.timelogs;');
    expect(migrationSql).toContain('drop policy if exists "CrewHead can view all timelogs" on public.timelogs;');
    expect(migrationSql).toContain('create policy "Crew can update own draft and rejected timelogs"');
    expect(migrationSql).toContain("status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status)");
    expect(migrationSql).toContain('create policy "CrewHead can update draft and CH timelogs"');
    expect(migrationSql).toContain('create policy "COO can status-update COO timelogs"');
  });

  it('blocks COO data edits and removes COO timelog-day write access', () => {
    const migrationSql = sql();

    expect(migrationSql).toContain('create or replace function public.enforce_timelog_update_permissions()');
    expect(migrationSql).toContain("old.status = 'pending_coo'::public.timelog_status");
    expect(migrationSql).toContain("new.status in ('approved'::public.timelog_status, 'rejected'::public.timelog_status)");
    expect(migrationSql).toContain('p_new.km is not distinct from p_old.km');
    expect(migrationSql).toContain('p_new.note is not distinct from p_old.note');
    expect(migrationSql).toContain('drop policy if exists "CrewHead and COO can create assignment timelog days" on public.timelog_days;');
    expect(migrationSql).not.toContain('create policy "CrewHead and COO can create assignment timelog days"');
  });
});
