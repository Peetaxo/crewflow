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
    expect(sql).toMatch(/v_actor_profile_id uuid := public\.current_profile_id\(\);[\s\S]+if v_actor_profile_id is null then[\s\S]+User must have a profile to send timelog approvals/);
    expect(sql).toMatch(/v_actor_profile_id uuid := public\.current_profile_id\(\);[\s\S]+if v_actor_profile_id is null then[\s\S]+User must have a profile to resolve timelog approvals/);
    expect(sql).toContain("public.has_role(auth.uid(), 'crewhead'::public.app_role)");
    expect(sql).toContain("public.has_role(auth.uid(), 'coo'::public.app_role)");
    expect(sql).toContain('approver_profile_id = public.current_profile_id()');
    expect(sql).toContain('v_approval.approver_profile_id is distinct from v_actor_profile_id');
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

  it('neutralizes legacy auto-invoicing when targeted approvals move timelogs to approved', () => {
    const sql = readTargetedApprovalsSql();
    const triggerReplacement = sql.slice(sql.indexOf('create or replace function public.handle_timelog_approved()'));

    expect(sql).toContain('drop trigger if exists trg_timelog_approved on public.timelogs');
    expect(sql).toContain('create or replace function public.handle_timelog_approved()');
    expect(triggerReplacement).toMatch(/returns trigger[\s\S]+begin[\s\S]+return new;[\s\S]+end;/);
    expect(triggerReplacement).not.toContain("NEW.status := 'invoiced'");
    expect(triggerReplacement).not.toMatch(/insert into public\.invoices/i);
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
    expect(sql).toMatch(/public\.timelog_update_is_approval_status_change\(old, new\)[\s\S]+old\.status = 'pending_ch'::public\.timelog_status[\s\S]+new\.status = 'pending_coo'::public\.timelog_status[\s\S]+from public\.timelog_approvals approval[\s\S]+approval\.timelog_id = old\.id[\s\S]+approval\.requested_by_profile_id = public\.current_profile_id\(\)[\s\S]+approval\.superseded_at is null/);
    expect(sql).toMatch(/public\.timelog_update_is_approval_status_change\(old, new\)[\s\S]+old\.status = 'pending_coo'::public\.timelog_status[\s\S]+new\.status in \('approved'::public\.timelog_status, 'rejected'::public\.timelog_status\)[\s\S]+approval\.approver_profile_id = public\.current_profile_id\(\)[\s\S]+approval\.superseded_at is null[\s\S]+not exists \([\s\S]+status <> 'approved'/);
    expect(sql).not.toMatch(/old\.status = 'pending_ch'::public\.timelog_status[\s\S]{0,300}new\.status = 'approved'::public\.timelog_status/);
    expect(sql).not.toContain('current_setting(');
    expect(sql).not.toContain('set_config(');
  });

  it('rejects empty targeted approval selections instead of auto-approving', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toMatch(/if cardinality\(v_approver_ids\) = 0 then[\s\S]+raise exception 'At least one valid management approver must be selected\.' using errcode = '42501'[\s\S]+end if;/);
    expect(sql).not.toMatch(/if cardinality\(v_approver_ids\) = 0 then[\s\S]{0,500}status = 'approved'::public\.timelog_status/);
    expect(sql).not.toContain('Only the event contact person can approve without another approver.');
    expect(sql).not.toContain('event.contact_profile_id = v_actor_profile_id');
  });

  it('limits selected approvers to management profiles that are not the requester or contractor', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('create or replace function public.is_valid_timelog_approval_approver');
    expect(sql).toMatch(/from public\.profiles profile[\s\S]+join public\.user_roles user_role[\s\S]+user_role\.user_id = profile\.user_id[\s\S]+user_role\.role in \('crewhead'::public\.app_role, 'coo'::public\.app_role\)/);
    expect(sql).toContain('p_profile_id is distinct from p_contractor_profile_id');
    expect(sql).toMatch(/from unnest\(coalesce\(p_approver_profile_ids, '\{\}'::uuid\[\]\)\) as profile_id[\s\S]+profile_id is distinct from v_actor_profile_id[\s\S]+public\.is_valid_timelog_approval_approver\(profile_id, v_timelog\.contractor_id\)/);
    expect(sql).toMatch(/if not public\.is_valid_timelog_approval_approver\(v_approval\.approver_profile_id, v_timelog\.contractor_id\) then[\s\S]+raise exception 'Only selected management approvers can resolve this approval request\.' using errcode = '42501'/);
    expect(sql).toMatch(/if v_approval\.requested_by_profile_id is not null[\s\S]+and v_approval\.requested_by_profile_id = v_actor_profile_id then[\s\S]+raise exception 'Requesters cannot resolve their own approval request\.' using errcode = '42501'/);
    expect(sql).toMatch(/old\.status = 'pending_coo'::public\.timelog_status[\s\S]+public\.is_valid_timelog_approval_approver\(public\.current_profile_id\(\), old\.contractor_id\)/);
    expect(sql).toContain('approval.requested_by_profile_id is distinct from public.current_profile_id()');
    expect(sql).toMatch(/create or replace function public\.can_view_assigned_timelog[\s\S]+join public\.timelogs t[\s\S]+public\.is_valid_timelog_approval_approver\(\s*public\.current_profile_id\(\),\s*t\.contractor_id\s*\)/);
    expect(sql).toContain('revoke all on function public.is_valid_timelog_approval_approver(uuid, uuid) from public');
  });

  it('lets selected approvers view assigned timelog days without write access', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toMatch(/drop policy if exists "Users can view timelog days via visible timelog" on public\.timelog_days/);
    expect(sql).toMatch(/create policy "Users can view timelog days via visible timelog"[\s\S]+on public\.timelog_days[\s\S]+for select[\s\S]+to authenticated[\s\S]+public\.can_view_assigned_timelog\(timelog_days\.timelog_id\)/);
    expect(sql).not.toMatch(/create policy "Selected approvers can (insert|update|delete|manage) timelog days"/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[\s\S]+on public\.timelog_days[\s\S]+to authenticated/);
  });

  it('uses a strict approval status helper that accounts for newer timelog columns', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('create or replace function public.timelog_update_is_approval_status_change');
    expect(sql).toMatch(/p_new\.id is not distinct from p_old\.id[\s\S]+p_new\.event_id is not distinct from p_old\.event_id[\s\S]+p_new\.contractor_id is not distinct from p_old\.contractor_id[\s\S]+p_new\.km is not distinct from p_old\.km[\s\S]+p_new\.note is not distinct from p_old\.note[\s\S]+p_new\.submitted_at is not distinct from p_old\.submitted_at[\s\S]+p_new\.approved_at is not distinct from p_old\.approved_at[\s\S]+p_new\.created_at is not distinct from p_old\.created_at[\s\S]+p_new\.updated_at is not distinct from p_old\.updated_at[\s\S]+p_new\.crew_confirmation_snapshot is not distinct from p_old\.crew_confirmation_snapshot/);
    expect(sql).not.toMatch(/create or replace function public\.timelog_update_is_approval_status_change[\s\S]+p_new\.review_note is not distinct from p_old\.review_note/);
    expect(sql).toContain('revoke all on function public.timelog_update_is_approval_status_change(public.timelogs, public.timelogs) from public');
    expect(sql).toContain('grant execute on function public.timelog_update_is_approval_status_change(public.timelogs, public.timelogs) to authenticated');
  });

  it('hardens the legacy status-only helper against newer timelog columns', () => {
    const sql = readTargetedApprovalsSql();

    expect(sql).toContain('create or replace function public.timelog_update_is_status_only');
    expect(sql).toMatch(/create or replace function public\.timelog_update_is_status_only[\s\S]+p_new\.submitted_at is not distinct from p_old\.submitted_at[\s\S]+p_new\.approved_at is not distinct from p_old\.approved_at[\s\S]+p_new\.updated_at is not distinct from p_old\.updated_at[\s\S]+p_new\.crew_confirmation_snapshot is not distinct from p_old\.crew_confirmation_snapshot[\s\S]+p_new\.review_note is not distinct from p_old\.review_note/);
    expect(sql).toContain('revoke all on function public.timelog_update_is_status_only(public.timelogs, public.timelogs) from public');
    expect(sql).toContain('grant execute on function public.timelog_update_is_status_only(public.timelogs, public.timelogs) to authenticated');
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
