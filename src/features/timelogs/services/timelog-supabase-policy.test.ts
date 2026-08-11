import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readWorkflowPolicySql = () => (
  readFileSync(resolve(process.cwd(), 'supabase/timelog-role-workflow-policies-2026-07.sql'), 'utf8')
);

const readCrewHeadDraftRestrictionSql = () => {
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
  const migrationFile = readdirSync(migrationsDir)
    .find((file) => file.endsWith('_restrict_crewhead_draft_timelog_edits.sql'));

  if (!migrationFile) {
    throw new Error('Missing CrewHead draft timelog restriction migration.');
  }

  return readFileSync(resolve(migrationsDir, migrationFile), 'utf8');
};

const readCrewHeadProposalSql = () => {
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
  const migrationFile = readdirSync(migrationsDir)
    .find((file) => file.endsWith('_allow_crewhead_timelog_proposals.sql'));

  if (!migrationFile) {
    throw new Error('Missing CrewHead timelog proposal migration.');
  }

  return readFileSync(resolve(migrationsDir, migrationFile), 'utf8');
};

const readTargetedApprovalsSql = () => {
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
  const migrationFile = readdirSync(migrationsDir)
    .find((file) => file.endsWith('_targeted_timelog_approvals.sql'));

  if (!migrationFile) {
    throw new Error('Missing targeted timelog approvals migration.');
  }

  return readFileSync(resolve(migrationsDir, migrationFile), 'utf8');
};

describe('timelog Supabase role workflow policy', () => {
  it('includes the Crew confirmation state in editable timelog data rules', () => {
    const sql = readWorkflowPolicySql();

    expect(sql).toContain("'pending_crew_confirmation'::public.timelog_status");
    expect(sql).toMatch(/public\.has_role\(auth\.uid\(\), 'crew'::public\.app_role\)[\s\S]+p_status in \('draft'::public\.timelog_status, 'rejected'::public\.timelog_status, 'pending_crew_confirmation'::public\.timelog_status\)/);
  });

  it('allows Crew to confirm a CrewHead correction back to CH review', () => {
    const sql = readWorkflowPolicySql();

    expect(sql).toMatch(/old\.status in \('draft'::public\.timelog_status, 'rejected'::public\.timelog_status, 'pending_crew_confirmation'::public\.timelog_status\)[\s\S]+new\.status in \('draft'::public\.timelog_status, 'rejected'::public\.timelog_status, 'pending_crew_confirmation'::public\.timelog_status, 'pending_ch'::public\.timelog_status\)/);
  });

  it('lets CrewHead corrections wait for Crew instead of approving directly to COO', () => {
    const sql = readWorkflowPolicySql();

    expect(sql).toMatch(/old\.status = 'pending_ch'::public\.timelog_status[\s\S]+new\.status = 'pending_crew_confirmation'::public\.timelog_status/);
    expect(sql).not.toMatch(/old\.status = 'pending_crew_confirmation'::public\.timelog_status[\s\S]+new\.status = 'pending_coo'::public\.timelog_status/);
  });

  it('removes CrewHead write access to unsubmitted draft timelogs', () => {
    const sql = readCrewHeadDraftRestrictionSql();

    expect(sql).toMatch(/public\.has_role\(auth\.uid\(\), 'crewhead'::public\.app_role\)[\s\S]+p_status = 'pending_ch'::public\.timelog_status/);
    expect(sql).not.toMatch(/public\.has_role\(auth\.uid\(\), 'crewhead'::public\.app_role\)[\s\S]+p_status in \('draft'::public\.timelog_status, 'pending_ch'::public\.timelog_status\)/);
    expect(sql).toContain('drop policy if exists "CrewHead can create assignment draft timelogs"');
    expect(sql).toContain('drop policy if exists "CrewHead can delete draft and CH timelogs"');
  });

  it('allows CrewHead to create only CH-review timelog proposals', () => {
    const migrationSql = readCrewHeadProposalSql();
    const workflowSql = readWorkflowPolicySql();

    for (const sql of [migrationSql, workflowSql]) {
      expect(sql).toContain('CrewHead can create timelog proposals for Crew confirmation');
      expect(sql).toMatch(/create policy "CrewHead can create timelog proposals for Crew confirmation"[^;]+public\.has_role\(auth\.uid\(\), 'crewhead'::public\.app_role\)[^;]+status = 'pending_ch'::public\.timelog_status[^;]+;/);
      expect(sql).not.toMatch(/create policy "CrewHead can create timelog proposals for Crew confirmation"[^;]+status = 'draft'::public\.timelog_status[^;]+;/);
    }
  });

  it('adds targeted timelog approval rows with active-round indexes', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('create table if not exists public.timelog_approvals');
    expect(sql).toContain('approval_round_id uuid not null');
    expect(sql).toContain("status text not null default 'pending'");
    expect(sql).toContain("check (status in ('pending', 'approved', 'returned'))");
    expect(sql).toContain('create index if not exists timelog_approvals_timelog_active_idx');
    expect(sql).toContain('create unique index if not exists timelog_approvals_active_approver_key');
  });

  it('lets selected approvers view timelogs assigned to them', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('Selected approvers can view assigned timelogs');
    expect(sql).toContain('public.can_view_assigned_timelog(timelogs.id)');
  });

  it('creates guarded RPC functions for sending and resolving approval requests', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('create or replace function public.send_timelog_to_approvers');
    expect(sql).toContain('create or replace function public.resolve_timelog_approval');
    expect(sql).toContain("public.has_role(auth.uid(), 'crewhead'::public.app_role)");
    expect(sql).toContain("public.has_role(auth.uid(), 'coo'::public.app_role)");
    expect(sql).toContain('approver_profile_id = public.current_profile_id()');
  });

  it('requires return notes to be optional and visible on the timelog review note', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('p_note text default null');
    expect(sql).toContain('review_note = nullif(trim(coalesce(p_note, \'\')), \'\')');
  });

  it('normalizes approval row notes without violating the not-null column', () => {
    const sql = readTargetedApprovalsSql();
    const approvalNoteWrites = sql.match(/note = coalesce\(nullif\(trim\(coalesce\(p_note, ''\)\), ''\), ''\)/g) ?? [];
    const approvalNoteInsertValues = sql.match(/coalesce\(nullif\(trim\(coalesce\(p_note, ''\)\), ''\), ''\)/g) ?? [];

    expect(sql).toContain("note text not null default ''");
    expect(approvalNoteWrites).toHaveLength(2);
    expect(approvalNoteInsertValues).toHaveLength(3);
  });

  it('closes returned approval rounds and approves only when every active approval is approved', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain("and status <> 'approved'");
    expect(sql).toMatch(/select count\(\*\)[\s\S]+into v_unapproved_count[\s\S]+from public\.timelog_approvals[\s\S]+where timelog_id = v_approval\.timelog_id[\s\S]+and approval_round_id = v_approval\.approval_round_id[\s\S]+and superseded_at is null[\s\S]+and status <> 'approved'/);
    expect(sql).toContain('if v_unapproved_count = 0 then');
    expect(sql).toMatch(/update public\.timelog_approvals[\s\S]+set superseded_at = now\(\)[\s\S]+where timelog_id = v_approval\.timelog_id[\s\S]+and approval_round_id = v_approval\.approval_round_id[\s\S]+and id <> p_approval_id[\s\S]+and superseded_at is null[\s\S]+and status = 'pending'/);
  });

  it('keeps approval row writes private to RPC functions', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('revoke insert, update, delete on public.timelog_approvals from anon');
    expect(sql).toContain('revoke insert, update, delete on public.timelog_approvals from authenticated');
    expect(sql).toContain('grant select on public.timelog_approvals to authenticated');
    expect(sql).not.toMatch(/create policy "CrewHead and COO can create timelog approval rows"[\s\S]+for insert/);
    expect(sql).not.toMatch(/create policy "Selected approvers can update own approval rows"[\s\S]+for update/);
    expect(sql).not.toContain('grant select, insert, update on public.timelog_approvals to authenticated');
  });

  it('extends the timelog update trigger for targeted approval status moves', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('create or replace function public.enforce_timelog_update_permissions()');
    expect(sql).toMatch(/old\.status = 'pending_ch'::public\.timelog_status[\s\S]+new\.status = 'pending_coo'::public\.timelog_status[\s\S]+from public\.timelog_approvals approval[\s\S]+approval\.timelog_id = old\.id[\s\S]+approval\.requested_by_profile_id = public\.current_profile_id\(\)[\s\S]+approval\.superseded_at is null/);
    expect(sql).toMatch(/old\.status = 'pending_ch'::public\.timelog_status[\s\S]+new\.status = 'approved'::public\.timelog_status[\s\S]+public\.has_role\(auth\.uid\(\), 'crewhead'::public\.app_role\)[\s\S]+public\.has_role\(auth\.uid\(\), 'coo'::public\.app_role\)/);
    expect(sql).toMatch(/old\.status = 'pending_coo'::public\.timelog_status[\s\S]+new\.status in \('approved'::public\.timelog_status, 'rejected'::public\.timelog_status\)[\s\S]+approval\.approver_profile_id = public\.current_profile_id\(\)[\s\S]+approval\.superseded_at is null[\s\S]+not exists \([\s\S]+status <> 'approved'/);
    expect(sql).not.toContain('current_setting(');
    expect(sql).not.toContain('set_config(');
  });

  it('removes legacy direct targeted approval status transitions from generic role branches', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).not.toMatch(/if public\.has_role\(auth\.uid\(\), 'crewhead'::public\.app_role\)[\s\S]+old\.status = 'pending_ch'::public\.timelog_status[\s\S]+new\.status = 'pending_coo'::public\.timelog_status/);
    expect(sql).not.toMatch(/if public\.has_role\(auth\.uid\(\), 'coo'::public\.app_role\)[\s\S]+old\.status = 'pending_coo'::public\.timelog_status[\s\S]+new\.status in \('approved'::public\.timelog_status, 'rejected'::public\.timelog_status\)/);
  });

  it('uses security definer visibility helpers to avoid recursive select policies', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('create or replace function public.can_view_timelog_approval');
    expect(sql).toContain('create or replace function public.can_view_assigned_timelog');
    expect(sql).toMatch(/create policy "Timelog approval rows are visible to involved users"[\s\S]+using \(\s*public\.can_view_timelog_approval\(\s*timelog_id,\s*approver_profile_id,\s*requested_by_profile_id\s*\)\s*\)/);
    expect(sql).toMatch(/create policy "Selected approvers can view assigned timelogs"[\s\S]+using \(\s*public\.can_view_assigned_timelog\(timelogs\.id\)\s*\)/);
    expect(sql).toMatch(/create or replace function public\.can_view_timelog_approval[\s\S]+security definer[\s\S]+from public\.timelogs t/);
    expect(sql).toMatch(/create or replace function public\.can_view_assigned_timelog[\s\S]+security definer[\s\S]+from public\.timelog_approvals approval/);
    expect(sql).toContain('revoke all on function public.can_view_timelog_approval(uuid, uuid, uuid) from public');
    expect(sql).toContain('grant execute on function public.can_view_timelog_approval(uuid, uuid, uuid) to authenticated');
    expect(sql).toContain('revoke all on function public.can_view_assigned_timelog(uuid) from public');
    expect(sql).toContain('grant execute on function public.can_view_assigned_timelog(uuid) to authenticated');
  });

  it('serializes approval resolution by locking the parent timelog before re-reading approval state', () => {
    const sql = readTargetedApprovalsSql();
    const readTimelogIdIndex = sql.indexOf('select approval.timelog_id');
    const lockTimelogIndex = sql.indexOf('from public.timelogs\n  where id = v_timelog_id\n  for update');
    const rereadApprovalIndex = sql.indexOf('from public.timelog_approvals\n  where id = p_approval_id\n    and superseded_at is null\n  for update');

    expect(readTimelogIdIndex).toBeGreaterThan(-1);
    expect(lockTimelogIndex).toBeGreaterThan(readTimelogIdIndex);
    expect(rereadApprovalIndex).toBeGreaterThan(lockTimelogIndex);
  });
});
