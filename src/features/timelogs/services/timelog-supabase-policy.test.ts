import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readWorkflowPolicySql = () => (
  readFileSync(resolve(process.cwd(), 'supabase/timelog-role-workflow-policies-2026-07.sql'), 'utf8')
);

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
});
