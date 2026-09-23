-- Local-only empty-schema replay helper. Never run against a populated database.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database()<>'crewflow_shared_shift_tests' then raise exception 'dedicated local DB required'; end if;
 if exists(select 1 from public.shift_workflows) or exists(select 1 from public.shift_workflow_rounds)
  or exists(select 1 from public.shift_workflow_round_actions) or exists(select 1 from public.shift_workflow_requests)
  or exists(select 1 from private.shift_workflow_write_permits) or exists(select 1 from private.shift_workflow_assignment_permits) then
  raise exception 'refuse reset: shared test schema is not empty';
 end if;
end $$;
drop trigger a_shared_shift_timelog_write on public.timelogs;
drop trigger a_shared_shift_day_write on public.timelog_days;
drop trigger guard_active_shift_assignment on public.event_assignments;
drop trigger zz_shared_shift_version on public.timelogs;
drop function private.guard_shared_shift_timelog(),private.guard_shared_shift_day(),private.guard_active_shift_assignment(),private.version_shared_shift_timelog();
drop function public.save_shift_workflow_drafts_atomic(uuid,uuid,uuid,uuid,jsonb,uuid),
 public.submit_shift_workflow_round_atomic(uuid,uuid,uuid,uuid,uuid,jsonb),
 public.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb),
 private.save_shift_drafts_or_submit(uuid,uuid,uuid,uuid,uuid,jsonb,boolean),
 private.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb),
 private.validate_shift_timelog_payload(jsonb,boolean),private.write_shift_timelog_payload(jsonb),private.shift_round_result(uuid,uuid,uuid,uuid[]);
drop function public.assign_event_crew(uuid,uuid,uuid,jsonb),public.remove_event_crew(uuid,uuid),private.shift_workflow_assignment(uuid,uuid,uuid,jsonb,boolean);
alter function private.assign_event_crew_before_shared_rounds(uuid,uuid,uuid,jsonb) rename to assign_event_crew;
alter function private.assign_event_crew(uuid,uuid,uuid,jsonb) set schema public;
alter function private.remove_event_crew_before_shared_rounds(uuid,uuid) rename to remove_event_crew;
alter function private.remove_event_crew(uuid,uuid) set schema public;
do $$ begin
 if to_regprocedure('private.approve_event_withdrawal_before_shared_rounds(uuid,uuid,uuid)') is not null then
  drop function public.approve_event_withdrawal(uuid,uuid,uuid),private.approve_event_withdrawal_shared(uuid,uuid,uuid);
  alter function private.approve_event_withdrawal_before_shared_rounds(uuid,uuid,uuid) rename to approve_event_withdrawal;
  alter function private.approve_event_withdrawal(uuid,uuid,uuid) set schema public;
 end if;
end $$;
drop table private.shift_workflow_write_permits,private.shift_workflow_assignment_permits;
alter table public.shift_workflow_round_actions drop column before_snapshot;
commit;
