import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const directory = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(directory).filter((name) => name.endsWith('_event_schedule_version_and_blank_drafts.sql'));
const sql = readFileSync(join(directory, files[0]), 'utf8').toLowerCase();
const fixture = readFileSync(join(process.cwd(), 'supabase', 'tests', 'event-schedule-drafts.sql'), 'utf8').toLowerCase();

describe('event schedule persistence migration contract (SQL integration test is the behavioral proof)', () => {
  it('adds version 1 defaults without historical event or actual rewrites', () => {
    expect(files).toHaveLength(1);
    expect(sql).toContain('schedule_version smallint not null default 1');
    expect(sql).toContain('check (schedule_version in (1, 2))');
    expect(sql).toContain("free_days date[] not null default '{}'::date[]");
    const ddl = sql.split('create or replace function public.assign_event_crew')[0];
    expect(ddl).not.toMatch(/\bupdate\s+public\.(events|timelogs|timelog_days)/);
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it('uses the frontend time grammar, null-safe casts, and all four explicit day types', () => {
    expect(sql).toContain('^([01]?[0-9]|2[0-3]):[0-5][0-9]$');
    expect(sql).toContain("nullif(day->>'day_type', '') is null");
    expect(sql.match(/not in \('pripravy', 'instal', 'provoz', 'deinstal'\)/g)).toHaveLength(2);
    expect(sql).toContain("nullif(day->>'time_from', '')::time");
    expect(sql).toContain("nullif(source.day->>'time_from', '')::time");
    expect(sql).not.toContain('pg_catalog.coalesce');
    expect(sql).not.toContain("'08:00'");
  });

  it('indexes the parent lookup used by deferred per-day assertions', () => {
    expect(sql).toMatch(/create index timelog_days_timelog_id_idx\s+on public\.timelog_days using btree \(timelog_id\)/);
    expect(fixture).toContain('pg_catalog.pg_get_indexdef(i.indexrelid)');
    expect(fixture).toContain('i.indisvalid and i.indisready');
  });

  it('preserves audited RPC locking and restricts helper execution', () => {
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(sql).toContain('v_timelog.updated_at is distinct from p_expected_updated_at');
    expect(sql).toContain('v_application_already_approved');
    expect(sql).toContain('revoke all on function public.is_valid_timelog_time(text) from public, anon');
    expect(sql).toContain('grant execute on function public.is_valid_timelog_time(text) to authenticated');
    expect(sql).toContain('revoke all on function private.assert_timelog_complete(uuid) from public, anon, authenticated');
    expect(sql.match(/deferrable initially deferred/g)).toHaveLength(2);
    expect(sql).toContain('before insert or update or delete on public.timelog_days');
    expect(sql).toContain('public.can_edit_timelog_data');
  });

  it('ships rollback-only authenticated RLS/RPC integration coverage', () => {
    expect(fixture).toContain('insert into auth.users');
    expect(fixture).toContain('set local role authenticated');
    expect(fixture).toContain('request.jwt.claims');
    expect(fixture).toContain('set constraints all immediate');
    expect(fixture).toContain('transition_timelog_statuses_atomic');
    expect(fixture).toContain('timelog_mutation_conflict');
    expect(fixture.trim().endsWith('rollback;')).toBe(true);
  });
});
