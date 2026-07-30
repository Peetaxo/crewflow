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
});
