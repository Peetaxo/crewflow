/// <reference types="node" />

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectory = join(process.cwd(), 'supabase', 'migrations');
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('_targeted_event_approval.sql'));

const migrationSql = () => {
  expect(migrationFiles).toHaveLength(1);
  return readFileSync(join(migrationDirectory, migrationFiles[0]), 'utf8').toLowerCase();
};

describe('targeted event approval migration DDL contract', () => {
  it('adds explicit event configuration and immutable approval identity snapshots', () => {
    const sql = migrationSql();

    expect(sql).toContain('contact_approves_hours boolean not null default true');
    expect(sql).toContain('timelog_approver_profile_id uuid references public.profiles(id) on delete restrict');
    expect(sql).toContain('create table public.timelog_approvals');
    expect(sql).toContain('approval_round_id uuid not null');
    expect(sql).toContain('timelog_id uuid not null references public.timelogs(id) on delete cascade');
    expect(sql).toContain('approver_profile_id uuid not null references public.profiles(id) on delete restrict');
    expect(sql).toContain('requested_by_profile_id uuid not null references public.profiles(id) on delete restrict');
    expect(sql).toContain('approver_user_id uuid not null references auth.users(id) on delete restrict');
    expect(sql).toContain('requested_by_user_id uuid not null references auth.users(id) on delete restrict');
    expect(sql).toMatch(/check\s*\(status in \('pending', 'approved', 'returned'\)\)/);
    expect(sql).toContain('unique (approval_round_id, timelog_id)');
    expect(sql).toMatch(/create unique index timelog_approvals_active_timelog_idx[\s\S]*where superseded_at is null/);
  });

  it('keeps approval rows read-only through authenticated RLS', () => {
    const sql = migrationSql();

    expect(sql).toContain('alter table public.timelog_approvals enable row level security');
    expect(sql).toMatch(/revoke all on table public\.timelog_approvals from public, anon, authenticated/);
    expect(sql).toContain('grant select on table public.timelog_approvals to authenticated');
    expect(sql).toContain('create policy timelog_approvals_select');
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]*public\.timelog_approvals[^;]*authenticated/);
  });

  it('exposes only invoker wrappers and protects definer implementations and trigger helpers', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/function public\.list_event_contact_options\(\)[\s\S]*security invoker[\s\S]*set search_path = ''/);
    expect(sql).toMatch(/function public\.handoff_timelogs_for_approval_atomic\(p_targets jsonb\)[\s\S]*security invoker[\s\S]*set search_path = ''/);
    expect(sql).toMatch(/function public\.resolve_timelog_approvals_atomic\([\s\S]*p_note text default ''[\s\S]*security invoker[\s\S]*set search_path = ''/);
    expect(sql).toContain('function private.handoff_timelogs_for_approval_atomic');
    expect(sql).toContain('function private.resolve_timelog_approvals_atomic');
    expect(sql).toContain('security definer');
    expect(sql).toContain('revoke all on function private.guard_targeted_timelog_approval() from public, anon, authenticated');
    expect(sql).toContain('create trigger approval_guard_targeted_timelog_update');
    expect(sql).toContain('before update on public.timelogs');
  });

  it('separates approval from invoicing and retains explicit financial functions', () => {
    const sql = migrationSql();

    expect(sql).toContain('drop trigger if exists trg_timelog_approved on public.timelogs');
    expect(sql).not.toMatch(/drop function[^;]*handle_timelog_approved/);
    expect(sql).not.toMatch(/\b(?:delete|update)\s+from?\s+public\.(?:invoices|receipts)\b/);
  });

  it('indexes every foreign key and enforces one active round per timelog', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/create index events_timelog_approver_profile_id_idx[\s\S]*on public\.events \(timelog_approver_profile_id\)[\s\S]*where timelog_approver_profile_id is not null/);
    for (const index of [
      'timelog_approvals_timelog_id_idx',
      'timelog_approvals_approver_profile_id_idx',
      'timelog_approvals_approver_user_id_idx',
      'timelog_approvals_requested_by_profile_id_idx',
      'timelog_approvals_requested_by_user_id_idx',
    ]) {
      expect(sql).toContain(`create index ${index}`);
    }
    expect(sql).toMatch(/create unique index timelog_approvals_active_timelog_idx[\s\S]*on public\.timelog_approvals \(timelog_id\)[\s\S]*where superseded_at is null/);
    expect(sql).toMatch(/create index timelog_approvals_active_approver_status_idx[\s\S]*on public\.timelog_approvals \(approver_profile_id, status, timelog_id\)[\s\S]*where superseded_at is null/);
  });

  it('pins every approval function search path and grants only the intended call surface', () => {
    const sql = migrationSql();

    for (const signature of [
      'private.list_event_contact_options()',
      'private.handoff_timelogs_for_approval_atomic(jsonb)',
      'private.resolve_timelog_approvals_atomic(jsonb, text, text)',
      'public.list_event_contact_options()',
      'public.handoff_timelogs_for_approval_atomic(jsonb)',
      'public.resolve_timelog_approvals_atomic(jsonb, text, text)',
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    }
    expect(sql).toMatch(/function private\.list_event_contact_options\(\)[\s\S]*security definer[\s\S]*set search_path = ''/);
    expect(sql).toMatch(/function private\.handoff_timelogs_for_approval_atomic\(p_targets jsonb\)[\s\S]*security definer[\s\S]*set search_path = ''/);
    expect(sql).toMatch(/function private\.resolve_timelog_approvals_atomic\([\s\S]*security definer[\s\S]*set search_path = ''/);
    expect(sql).not.toMatch(/grant execute on function (?:private|public)\.(?:list_event_contact_options|handoff_timelogs_for_approval_atomic|resolve_timelog_approvals_atomic)[^;]*\b(?:anon|public)\b/);
  });

  it('installs the targeted guard before the legacy permission trigger and removes only auto-invoicing', () => {
    const sql = migrationSql();

    expect('approval_guard_targeted_timelog_update'.localeCompare('enforce_timelog_update_permissions')).toBeLessThan(0);
    expect(sql).toMatch(/create trigger approval_guard_targeted_timelog_update\s+before update on public\.timelogs/);
    expect(sql).toContain('revoke all on function private.guard_targeted_timelog_approval() from public, anon, authenticated');
    expect(sql).toContain('drop trigger if exists trg_timelog_approved on public.timelogs');
    expect(sql).not.toMatch(/create trigger trg_timelog_approved/);
    expect(sql).not.toMatch(/drop trigger if exists enforce_timelog_update_permissions/);
  });
});
