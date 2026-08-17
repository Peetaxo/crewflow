import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260817074631_timelog_assignment_lifecycle.sql',
  ),
  'utf8',
).toLowerCase();

describe('tracked Supabase timelog role workflow policies', () => {
  it('replaces every legacy broad timelog policy with authenticated workflow policies', () => {
    const migrationSql = sql();

    [
      'crew can manage own timelogs',
      'coo can manage all timelogs',
      'crewhead and coo can create assignment timelogs',
      'crewhead can submit and update ch timelogs',
      'crewhead can update pending ch timelogs',
      'crewhead can delete draft and ch timelogs',
    ].forEach((name) => {
      expect(migrationSql).toContain(
        `drop policy if exists "${name}" on public.timelogs;`,
      );
    });

    [
      ['crew can view own timelogs', 'select'],
      ['crew can create own draft timelogs', 'insert'],
      ['crew can update own editable timelogs', 'update'],
      ['crew can delete own draft and rejected timelogs', 'delete'],
      ['crewhead can view all timelogs', 'select'],
      ['crewhead can create assignment draft timelogs', 'insert'],
      ['crewhead can create proposed timelogs', 'insert'],
      ['crewhead can update draft and ch timelogs', 'update'],
      ['crewhead can delete disposable timelogs', 'delete'],
      ['coo can view all timelogs', 'select'],
      ['coo can status-update coo timelogs', 'update'],
    ].forEach(([name, command]) => {
      expect(migrationSql).toContain(
        `create policy "${name}"\non public.timelogs\nfor ${command}\nto authenticated`,
      );
    });

    expect(migrationSql).toMatch(/status in \(\s*'draft'::public\.timelog_status,\s*'rejected'::public\.timelog_status,\s*'pending_crew_confirmation'::public\.timelog_status\s*\)/);
    expect(migrationSql).toMatch(/status in \(\s*'draft'::public\.timelog_status,\s*'rejected'::public\.timelog_status,\s*'pending_crew_confirmation'::public\.timelog_status,\s*'pending_ch'::public\.timelog_status\s*\)/);
    expect(migrationSql).toContain('create policy "crewhead can delete disposable timelogs"');
    expect(migrationSql).toMatch(
      /create policy "crewhead can delete disposable timelogs"[\s\S]*?status in \(\s*'draft'::public\.timelog_status,\s*'rejected'::public\.timelog_status\s*\)[\s\S]*?;/,
    );
  });

  it('tracks exact timelog-day visibility and editable-parent policies', () => {
    const migrationSql = sql();

    [
      'users can manage timelog days via timelog',
      'crewhead and coo can create assignment timelog days',
    ].forEach((name) => {
      expect(migrationSql).toContain(
        `drop policy if exists "${name}" on public.timelog_days;`,
      );
    });

    [
      ['users can view timelog days via visible timelog', 'select'],
      ['users can insert timelog days via editable timelog', 'insert'],
      ['users can update timelog days via editable timelog', 'update'],
      ['users can delete timelog days via editable timelog', 'delete'],
    ].forEach(([name, command]) => {
      expect(migrationSql).toContain(
        `create policy "${name}"\non public.timelog_days\nfor ${command}\nto authenticated`,
      );
    });

    expect(migrationSql).toContain('public.can_edit_timelog_data(t.contractor_id, t.status)');
    expect(migrationSql).toContain("set search_path = ''");
  });

  it('revokes anonymous table access while preserving minimum authenticated invoker privileges', () => {
    const migrationSql = sql();

    ['timelogs', 'timelog_days'].forEach((table) => {
      expect(migrationSql).toContain(`revoke all on table public.${table} from public;`);
      expect(migrationSql).toContain(`revoke all on table public.${table} from anon;`);
      expect(migrationSql).toContain(
        `revoke all on table public.${table} from authenticated;`,
      );
      expect(migrationSql).toContain(
        `grant select, insert, update, delete on table public.${table} to authenticated;`,
      );
    });
  });
});
