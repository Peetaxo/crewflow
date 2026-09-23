-- Rollback-only authenticated lifecycle regression tests; synthetic IDs only.
\set ON_ERROR_STOP on
begin;
set local row_security=on;
do $$ begin
  if to_regprocedure('public.save_shift_workflow_drafts_atomic(uuid,uuid,uuid,uuid,jsonb,uuid)') is null
    or to_regprocedure('public.submit_shift_workflow_round_atomic(uuid,uuid,uuid,uuid,uuid,jsonb)') is null
    or to_regprocedure('public.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb)') is null then
    raise exception 'shared shift lifecycle RPCs missing';
  end if;
end $$;
do $$ declare proc regprocedure; begin
 foreach proc in array array[
  'public.save_shift_workflow_drafts_atomic(uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure,
  'public.submit_shift_workflow_round_atomic(uuid,uuid,uuid,uuid,uuid,jsonb)'::regprocedure,
  'public.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb)'::regprocedure,
  'public.approve_event_withdrawal(uuid,uuid,uuid)'::regprocedure
 ] loop
  if (select prosecdef from pg_proc where oid=proc) or has_function_privilege('anon',proc,'execute')
    or not has_function_privilege('authenticated',proc,'execute')
    or (select proconfig from pg_proc where oid=proc) is distinct from array['search_path=""']::text[] then
   raise exception 'lifecycle function ACL/search path mismatch: %',proc;
  end if;
 end loop;
 if has_table_privilege('authenticated','private.shift_workflow_write_permits','SELECT,INSERT,UPDATE,DELETE')
  or has_table_privilege('authenticated','private.shift_workflow_assignment_permits','SELECT,INSERT,UPDATE,DELETE') then
  raise exception 'private permit table exposed';
 end if;
end $$;

create function pg_temp.sid(n integer) returns uuid language sql immutable as $$
 select ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create function pg_temp.fails(statement text, expected_state text, message text default '')
returns void language plpgsql as $$
declare caught boolean:=false;
begin
 begin execute statement;
 exception when others then
  if sqlstate<>expected_state or position(message in sqlerrm)=0 then raise; end if;
  caught:=true;
 end;
 if not caught then raise exception 'expected failure %: %',expected_state,statement; end if;
end $$;
create function pg_temp.payload(ns integer[], complete boolean default true) returns jsonb language sql stable as $$
 select jsonb_agg(jsonb_build_object('id',t.id,'event_id',t.event_id,
   'expected_updated_at',t.updated_at,'expected_status',t.status,'km',12.5,'note','Crew note',
   'days',jsonb_build_array(jsonb_build_object('id',pg_temp.sid(n+100),'date','2099-09-01',
    'time_from',case when complete then '22:00' else '' end,'time_to',case when complete then '02:00' else '' end,
    'day_type','pripravy','note','Preparation overnight','meal','obed','meals',jsonb_build_array('obed','vecere')),
    jsonb_build_object('id',pg_temp.sid(n+200),'date','2099-09-01','time_from','09:00','time_to','10:00',
     'day_type','instal','note','Same date second slot','meal',null,'meals','[]'::jsonb))) order by t.id)
 from unnest(ns) n join public.timelogs t on t.id=pg_temp.sid(n)
$$;
create function pg_temp.targets(round_no integer) returns jsonb language sql stable as $$
 select jsonb_agg(jsonb_build_object('id',t.id,'expected_updated_at',t.updated_at,'expected_status',t.status) order by t.id)
 from public.shift_workflow_round_items i join public.timelogs t on t.id=i.timelog_id where i.round_id=pg_temp.sid(round_no)
$$;
create function pg_temp.later_payload() returns jsonb language sql stable as $$
 select jsonb_build_array(jsonb_build_object('id',t.id,'event_id',t.event_id,'expected_updated_at',t.updated_at,
  'expected_status',t.status,'km',0,'note','Later teardown','days',jsonb_build_array(jsonb_build_object(
   'id',pg_temp.sid(950),'date','2099-09-04','time_from','19:00','time_to','03:00','day_type','deinstal','note',null,'meal','vecere','meals',jsonb_build_array('vecere')))))
 from public.timelogs t where t.event_id=pg_temp.sid(104) and t.contractor_id=pg_temp.sid(13)
$$;
create function pg_temp.transition(req integer, round_no integer, action text, note text default '', affected integer default null,
 corrections jsonb default null) returns jsonb language sql as $$
 select public.transition_shift_workflow_round_atomic(pg_temp.sid(req),pg_temp.sid(round_no),
  (select updated_at from public.shift_workflow_rounds where id=pg_temp.sid(round_no)),
  pg_temp.targets(round_no),action,note,pg_temp.sid(affected),corrections)
$$;
insert into auth.users(id) select pg_temp.sid(n) from generate_series(1,6) n;
delete from public.user_roles where user_id in (select pg_temp.sid(n) from generate_series(1,6) n);
delete from public.profiles where user_id in (select pg_temp.sid(n) from generate_series(1,6) n);
insert into public.profiles(id,user_id,first_name,last_name)
 select pg_temp.sid(n+10),pg_temp.sid(n),'Round fixture',n::text from generate_series(1,6) n;
insert into public.user_roles(user_id,role) values
 (pg_temp.sid(1),'crewhead'),(pg_temp.sid(2),'coo'),(pg_temp.sid(3),'crew'),
 (pg_temp.sid(4),'crew'),(pg_temp.sid(5),'coo'),(pg_temp.sid(6),'crew');
insert into public.events(id,name,contact_profile_id,contact_approves_hours,free_days)
 select pg_temp.sid(n),'Round fixture '||n,pg_temp.sid(12),true,array['2099-09-02'::date] from generate_series(101,105) n;
insert into public.event_assignments(event_id,profile_id)
 select pg_temp.sid(n),pg_temp.sid(13) from generate_series(101,103) n;
insert into public.event_assignments(event_id,profile_id) values(pg_temp.sid(102),pg_temp.sid(14));
insert into public.timelogs(id,event_id,contractor_id,status)
 select pg_temp.sid(n+100),pg_temp.sid(n),pg_temp.sid(13),'draft' from generate_series(101,103) n;
insert into public.timelogs(id,event_id,contractor_id,status) values(pg_temp.sid(250),pg_temp.sid(102),pg_temp.sid(14),'draft');
insert into public.shift_workflows(id,created_by) values(pg_temp.sid(400),pg_temp.sid(1));
insert into public.shift_workflow_events(workflow_id,event_id,position)
 select pg_temp.sid(400),pg_temp.sid(n),n-101 from generate_series(101,104) n;
create temporary table saved(name text primary key,payload jsonb,result jsonb);
grant all on saved to authenticated;
set local role authenticated;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
insert into saved values('draft',pg_temp.payload(array[201,202,203],false),null);
update saved set result=public.save_shift_workflow_drafts_atomic(pg_temp.sid(501),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),payload) where name='draft';
select pg_temp.fails($q$update public.timelogs set note='single linked draft bypass' where id=pg_temp.sid(201)$q$,'42501','shared_shift');
select pg_temp.fails($q$delete from public.timelog_days where id=pg_temp.sid(301)$q$,'42501','shared_shift');
select pg_temp.fails($q$select public.save_timelog_atomic(pg_temp.sid(201),pg_temp.sid(101),pg_temp.sid(13),(select updated_at from public.timelogs where id=pg_temp.sid(201)),'draft',1,'old single draft edit','draft','[{"date":"2099-09-01","time_from":"08:00","time_to":"09:00","day_type":"pripravy"}]')$q$,'42501','shared_shift');
select pg_temp.fails($q$insert into private.shift_workflow_write_permits values(pg_current_xact_id(),auth.uid(),pg_temp.sid(201),'save','draft','draft',true)$q$,'42501');
select pg_temp.fails($q$select private.write_shift_timelog_payload(pg_temp.payload(array[201]))$q$,'42501');
select pg_temp.fails($q$select private.assign_event_crew_before_shared_rounds(pg_temp.sid(104),pg_temp.sid(13),null,'[]')$q$,'42501');
select pg_temp.fails($q$select private.approve_event_withdrawal_before_shared_rounds(pg_temp.sid(101),pg_temp.sid(13),pg_temp.sid(700))$q$,'42501');
set local crewflow.approved_timelog_import='on';
set local app.shift_workflow_write='atomic';
set local request.jwt.claims='{"role":"authenticated","user_metadata":{"role":"coo","shared_shift_write":true}}';
select pg_temp.fails($q$update public.timelogs set note='forged privilege' where id=pg_temp.sid(201)$q$,'42501','shared_shift');
set local crewflow.approved_timelog_import='off';
savepoint empty_later_draft;
select public.save_shift_workflow_drafts_atomic(pg_temp.sid(525),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),
 jsonb_set(pg_temp.payload(array[201,202,203]),'{2,days}','[]'));
select pg_temp.assert(not exists(select 1 from public.timelog_days where timelog_id=pg_temp.sid(203)),'empty later draft saved without submission');
rollback to empty_later_draft;
savepoint missing_canonical;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
insert into public.event_assignments(event_id,profile_id) values(pg_temp.sid(104),pg_temp.sid(13));
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(525),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202,203]))$q$,'P0002','timelog_missing');
select pg_temp.fails($q$insert into public.timelogs(id,event_id,contractor_id,status) values(pg_temp.sid(204),pg_temp.sid(104),pg_temp.sid(13),'draft')$q$,'42501','shared_shift');
rollback to missing_canonical;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000002';
set local crewflow.approved_timelog_import='on';
update public.timelogs set status='approved' where id=pg_temp.sid(201);
select pg_temp.assert((select status='draft' from public.timelogs where id=pg_temp.sid(201)),'COO forged import flag cannot evade draft RLS');
select pg_temp.fails($q$select public.import_approved_timelog_atomic(pg_temp.sid(201),pg_temp.sid(101),pg_temp.sid(13),(select updated_at from public.timelogs where id=pg_temp.sid(201)),'draft',1,'Legacy import bypass','[{"date":"2099-09-01","time_from":"08:00","time_to":"09:00","day_type":"provoz"}]')$q$,'42501','shared_shift');
set local crewflow.approved_timelog_import='off';
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
savepoint linked_draft_withdrawal;
insert into public.event_applications(id,event_id,profile_id,status) values
 (pg_temp.sid(700),pg_temp.sid(101),pg_temp.sid(13),'withdrawal_requested'),
 (pg_temp.sid(701),pg_temp.sid(102),pg_temp.sid(13),'pending');
select pg_temp.fails($q$select public.approve_event_withdrawal(pg_temp.sid(101),pg_temp.sid(13),pg_temp.sid(700))$q$,'42501');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select pg_temp.fails($q$select public.approve_event_withdrawal(pg_temp.sid(101),pg_temp.sid(13),pg_temp.sid(701))$q$,'P0002');
select pg_temp.fails($q$select public.approve_event_withdrawal(pg_temp.sid(101),pg_temp.sid(14),pg_temp.sid(700))$q$,'P0002');
select pg_temp.fails($q$select public.approve_event_withdrawal(pg_temp.sid(102),pg_temp.sid(13),pg_temp.sid(701))$q$,'P0001','withdrawal_conflict');
select pg_temp.assert(public.approve_event_withdrawal(pg_temp.sid(101),pg_temp.sid(13),pg_temp.sid(700)) @>
 '{"assignment_removed":true,"timelog_removed":true,"crew_filled":0}'::jsonb,'existing withdrawal RPC removes eligible linked draft');
select pg_temp.assert(not exists(select 1 from public.timelogs where id=pg_temp.sid(201))
 and not exists(select 1 from public.timelog_days where timelog_id=pg_temp.sid(201))
 and not exists(select 1 from public.event_assignments where event_id=pg_temp.sid(101) and profile_id=pg_temp.sid(13))
 and (select status='withdrawn' from public.event_applications where id=pg_temp.sid(700)),
 'linked draft withdrawal atomically removes canonical report/days/assignment and marks application withdrawn');
select pg_temp.assert(public.approve_event_withdrawal(pg_temp.sid(101),pg_temp.sid(13),pg_temp.sid(700)) @>
 '{"assignment_removed":false,"timelog_removed":false}'::jsonb,'existing withdrawn replay remains compatible');
reset role;
select pg_temp.assert(not exists(select 1 from private.shift_workflow_assignment_permits),'withdrawal clears its exact removal permit before return');
rollback to linked_draft_withdrawal;
savepoint coo_linked_draft_withdrawal;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000004';
insert into public.event_applications(id,event_id,profile_id,status) values(pg_temp.sid(702),pg_temp.sid(102),pg_temp.sid(14),'withdrawal_requested');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000002';
select pg_temp.assert(public.approve_event_withdrawal(pg_temp.sid(102),pg_temp.sid(14),pg_temp.sid(702)) @>
 '{"assignment_removed":true,"timelog_removed":true,"crew_filled":1}'::jsonb,'COO preserves eligible linked withdrawal and other crew assignment');
select pg_temp.assert(exists(select 1 from public.timelogs where id=pg_temp.sid(202))
 and not exists(select 1 from public.timelogs where id=pg_temp.sid(250)),'COO withdrawal touches only requested contractor');
rollback to coo_linked_draft_withdrawal;
select pg_temp.assert((select jsonb_array_length(result->'timelogs')=3 and result->'round'='null' from saved where name='draft'),'exact draft response and no implicit round');
select pg_temp.assert((select count(*)=6 from public.timelog_days where timelog_id in(pg_temp.sid(201),pg_temp.sid(202),pg_temp.sid(203))),'stable repeated-date days preserved');
select pg_temp.assert((select meal='obed' and meals=array['obed','vecere'] and note='Preparation overnight' and time_from='' and day_type='pripravy'
 from public.timelog_days where id=pg_temp.sid(301)),'all canonical day fields roundtrip');
select pg_temp.assert(public.save_shift_workflow_drafts_atomic(pg_temp.sid(501),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),(select payload from saved where name='draft'))=(select result from saved where name='draft'),'exact draft replay');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(501),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202,203]))$q$,'22023','request_conflict');
select pg_temp.fails($q$select public.submit_shift_workflow_round_atomic(pg_temp.sid(502),pg_temp.sid(600),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202,203],false))$q$,'22023');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(502),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202]))$q$,'22023','set');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(502),null,pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202,203]))$q$,'22023');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(502),pg_temp.sid(400),pg_temp.sid(14),pg_temp.sid(102),pg_temp.payload(array[250]))$q$,'42501');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(502),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),jsonb_set(pg_temp.payload(array[201,202,203]),'{1,expected_updated_at}','"2000-01-01"'))$q$,'40001');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(502),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),jsonb_set(pg_temp.payload(array[201,202,203]),'{1,km}','-1'))$q$,'22023');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(502),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),jsonb_set(pg_temp.payload(array[201,202,203]),'{1,days,0,date}','"not-a-date"'))$q$,'22023');
select pg_temp.fails($q$select public.submit_shift_workflow_round_atomic(pg_temp.sid(502),pg_temp.sid(600),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),jsonb_set(pg_temp.payload(array[201,202,203]),'{1,days}','[]'))$q$,'22023');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000004';
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(502),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),'[]')$q$,'42501');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
select pg_temp.assert((select time_from='' from public.timelog_days where id=pg_temp.sid(301)),'one stale member rolled back every member');
-- Inject a failure after all data/round/action writes. The complete request must
-- roll back, including versions; the fixture trigger itself is also rolled back.
savepoint late_failure;
reset role;
create function pg_temp.fail_shift_ledger() returns trigger language plpgsql as $$
begin if new.request_id=pg_temp.sid(526) then raise exception 'injected late ledger failure'; end if; return new; end $$;
create trigger fail_shift_ledger before insert on public.shift_workflow_requests for each row execute function pg_temp.fail_shift_ledger();
set local role authenticated;
select pg_temp.fails($q$select public.submit_shift_workflow_round_atomic(pg_temp.sid(526),pg_temp.sid(606),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202,203]))$q$,'P0001','injected late ledger');
select pg_temp.assert(not exists(select 1 from public.shift_workflow_rounds where id=pg_temp.sid(606))
 and (select time_from='' from public.timelog_days where id=pg_temp.sid(301))
 and (select count(*)=3 from public.timelogs where id in(pg_temp.sid(201),pg_temp.sid(202),pg_temp.sid(203)) and status='draft'),'late failure rolls back all data/round state');
rollback to late_failure;

insert into saved values('submit',pg_temp.payload(array[201,202,203]),null);
update saved set result=public.submit_shift_workflow_round_atomic(pg_temp.sid(503),pg_temp.sid(600),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),payload) where name='submit';
select pg_temp.assert((select status='pending_ch' and expected_item_count=3 from public.shift_workflow_rounds where id=pg_temp.sid(600)),'submitted frozen count');
select pg_temp.assert((select count(*)=3 from public.timelogs where id in(pg_temp.sid(201),pg_temp.sid(202),pg_temp.sid(203)) and status='pending_ch'),'whole submitted set');
savepoint frozen_withdrawal;
insert into public.event_applications(id,event_id,profile_id,status) values(pg_temp.sid(700),pg_temp.sid(101),pg_temp.sid(13),'withdrawal_requested');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select pg_temp.fails($q$select public.approve_event_withdrawal(pg_temp.sid(101),pg_temp.sid(13),pg_temp.sid(700))$q$,'P0001','removal_blocked');
select pg_temp.assert((select status='withdrawal_requested' from public.event_applications where id=pg_temp.sid(700))
 and (select status='pending_ch' from public.timelogs where id=pg_temp.sid(201))
 and exists(select 1 from public.event_assignments where event_id=pg_temp.sid(101) and profile_id=pg_temp.sid(13)),
 'frozen withdrawal leaves application/report/assignment unchanged');
rollback to frozen_withdrawal;
update public.timelogs set status='draft' where id=pg_temp.sid(201);
select pg_temp.assert((select status='pending_ch' from public.timelogs where id=pg_temp.sid(201)),'crew raw update hidden by RLS');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select pg_temp.fails($q$delete from public.event_assignments where event_id=pg_temp.sid(101) and profile_id=pg_temp.sid(13)$q$,'55000','assignment_locked');
select pg_temp.fails($q$update public.event_assignments set event_id=pg_temp.sid(105) where event_id=pg_temp.sid(101) and profile_id=pg_temp.sid(13)$q$,'55000','assignment_locked');
select pg_temp.fails($q$update public.timelogs set status='rejected' where id=pg_temp.sid(201)$q$,'42501','shared_shift');
select pg_temp.fails($q$update public.timelog_days set note='bypass' where id=pg_temp.sid(301)$q$,'42501','shared_shift');
select pg_temp.fails($q$select public.transition_timelog_statuses_atomic(jsonb_build_array(jsonb_build_object('id',pg_temp.sid(201),'expected_updated_at',(select updated_at from public.timelogs where id=pg_temp.sid(201)))),'pending_ch','rejected')$q$,'42501','shared_shift');
select pg_temp.fails($q$select public.handoff_timelogs_for_approval_atomic(jsonb_build_array(jsonb_build_object('id',pg_temp.sid(201),'expected_updated_at',(select updated_at from public.timelogs where id=pg_temp.sid(201)),'approval_id',pg_temp.sid(901),'approval_round_id',pg_temp.sid(902))))$q$,'42501','shared_shift');
select pg_temp.fails($q$select pg_temp.transition(504,600,'return','','101')$q$,'22023');
select pg_temp.fails($q$select pg_temp.transition(504,600,'return','Wrong event',105)$q$,'22023');
select pg_temp.fails($q$select public.transition_shift_workflow_round_atomic(pg_temp.sid(504),pg_temp.sid(600),(select updated_at from public.shift_workflow_rounds where id=pg_temp.sid(600)),pg_temp.targets(600)-2,'return','fix',pg_temp.sid(101),null)$q$,'22023','set');
select pg_temp.transition(505,600,'correct','Fix preparation',101,pg_temp.payload(array[201,202,203]));
select pg_temp.assert((select count(*)=3 from public.timelogs where id in(pg_temp.sid(201),pg_temp.sid(202),pg_temp.sid(203)) and status='pending_crew_confirmation' and crew_confirmation_snapshot is not null and review_note='Fix preparation'),'CH correction with per-report before snapshots');
select pg_temp.assert((select jsonb_array_length(before_snapshot)=3 from public.shift_workflow_round_actions where round_id=pg_temp.sid(600) and action='correct'),'persisted whole before snapshot');
select public.assign_event_crew(pg_temp.sid(104),pg_temp.sid(13),null,'[{"date":"2099-09-04","time_from":"","time_to":"","day_type":"deinstal"}]');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
select public.save_shift_workflow_drafts_atomic(pg_temp.sid(519),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.later_payload());
select pg_temp.fails($q$select public.submit_shift_workflow_round_atomic(pg_temp.sid(520),pg_temp.sid(605),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(104),pg_temp.later_payload())$q$,'40001','round_conflict');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(520),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202,203]))$q$,'22023','set');
select public.save_shift_workflow_drafts_atomic(pg_temp.sid(506),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202,203]),pg_temp.sid(600));
select pg_temp.assert((select count(*)=3 from public.shift_workflow_round_items where round_id=pg_temp.sid(600)),'later assignment excluded from pending round');
select pg_temp.transition(507,600,'confirm');
select pg_temp.assert((select status='pending_ch' from public.shift_workflow_rounds where id=pg_temp.sid(600)),'owner confirms same round');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
update public.events set contact_profile_id=pg_temp.sid(15) where id=pg_temp.sid(102);
select pg_temp.fails($q$select pg_temp.transition(508,600,'approve')$q$,'22023','approver_mismatch');
update public.events set contact_profile_id=pg_temp.sid(12) where id=pg_temp.sid(102);
update public.events set contact_profile_id=pg_temp.sid(11) where id in(pg_temp.sid(101),pg_temp.sid(102),pg_temp.sid(103));
select pg_temp.fails($q$select pg_temp.transition(508,600,'approve')$q$,'22023','approver_unavailable');
update public.events set contact_profile_id=pg_temp.sid(12) where id in(pg_temp.sid(101),pg_temp.sid(102),pg_temp.sid(103));
savepoint self_approval;
reset role;
insert into public.user_roles(user_id,role) values(pg_temp.sid(1),'coo'),(pg_temp.sid(3),'coo');
set local role authenticated;
update public.events set contact_profile_id=pg_temp.sid(11) where id in(pg_temp.sid(101),pg_temp.sid(102),pg_temp.sid(103));
select pg_temp.fails($q$select pg_temp.transition(508,600,'approve')$q$,'42501','approval_unauthorized');
update public.events set contact_profile_id=pg_temp.sid(13) where id in(pg_temp.sid(101),pg_temp.sid(102),pg_temp.sid(103));
select pg_temp.fails($q$select pg_temp.transition(508,600,'approve')$q$,'42501','approval_unauthorized');
rollback to self_approval;
select pg_temp.transition(508,600,'approve');
select pg_temp.assert((select count(*)=3 and count(distinct approval_round_id)=3 from public.timelog_approvals where timelog_id in(pg_temp.sid(201),pg_temp.sid(202),pg_temp.sid(203))),'distinct targeted report rounds');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000005';
select pg_temp.fails($q$select pg_temp.transition(509,600,'approve')$q$,'42501');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000002';
savepoint changed_author_binding;
reset role;
update public.profiles set user_id=null where id=pg_temp.sid(16);
update public.profiles set user_id=pg_temp.sid(6) where id=pg_temp.sid(13);
set local role authenticated;
select pg_temp.fails($q$select pg_temp.transition(527,600,'approve')$q$,'42501');
rollback to changed_author_binding;
savepoint changed_approver_binding;
reset role;
update public.profiles set user_id=null where id=pg_temp.sid(15);
update public.profiles set user_id=pg_temp.sid(5) where id=pg_temp.sid(12);
set local role authenticated;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000005';
select pg_temp.fails($q$select pg_temp.transition(527,600,'approve')$q$,'42501');
rollback to changed_approver_binding;
select pg_temp.fails($q$select public.resolve_timelog_approvals_atomic((select jsonb_build_array(jsonb_build_object('id',t.id,'expected_updated_at',t.updated_at,'approval_id',a.id,'approval_updated_at',a.updated_at)) from public.timelogs t join public.timelog_approvals a on a.timelog_id=t.id where t.id=pg_temp.sid(201) and a.superseded_at is null),'approved','')$q$,'42501','shared_shift');
select pg_temp.fails($q$select pg_temp.transition(509,600,'correct','COO correction forbidden',101,pg_temp.payload(array[201,202,203]))$q$,'42501');
select pg_temp.transition(510,600,'return','Needs review',102);
select pg_temp.assert((select status='rejected' from public.shift_workflow_rounds where id=pg_temp.sid(600)) and (select count(*)=3 from public.shift_workflow_round_items where round_id=pg_temp.sid(600) and released_at is not null),'COO return releases complete frozen set');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
select pg_temp.assert(public.submit_shift_workflow_round_atomic(pg_temp.sid(503),pg_temp.sid(600),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),(select payload from saved where name='submit'))=(select result from saved where name='submit'),'original submission replay after later state');
-- Remove only the later draft assignment through the authoritative old path.
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select public.remove_event_crew(pg_temp.sid(104),pg_temp.sid(13));
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
select public.submit_shift_workflow_round_atomic(pg_temp.sid(511),pg_temp.sid(601),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.payload(array[201,202,203]));
select pg_temp.assert((select count(*)=2 from public.shift_workflow_rounds where contractor_id=pg_temp.sid(13)),'resubmission preserves old round');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select pg_temp.transition(512,601,'approve');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000002';
select pg_temp.transition(513,601,'approve');
select pg_temp.assert((select count(*)=3 from public.timelogs where id in(pg_temp.sid(201),pg_temp.sid(202),pg_temp.sid(203)) and status='approved'),'all approved');
select pg_temp.assert(not exists(select 1 from public.invoice_timelogs where timelog_id in(pg_temp.sid(201),pg_temp.sid(202),pg_temp.sid(203))),'approval never creates invoice');
insert into saved values('billing_before',null,(select to_jsonb(t) from public.timelogs t where id=pg_temp.sid(201)));
update public.timelogs set status='invoiced' where id=pg_temp.sid(201);
select pg_temp.assert((select status='invoiced' from public.timelogs where id=pg_temp.sid(201)),'explicit billing transitions preserved');
select pg_temp.assert((select updated_at>(select (result->>'updated_at')::timestamptz from saved where name='billing_before')
 from public.timelogs where id=pg_temp.sid(201)),'explicit billing version advances after shared approval');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select public.assign_event_crew(pg_temp.sid(104),pg_temp.sid(13),null,'[{"date":"2099-09-04","time_from":"","time_to":"","day_type":"deinstal"}]');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
select public.submit_shift_workflow_round_atomic(pg_temp.sid(514),pg_temp.sid(602),pg_temp.sid(400),pg_temp.sid(13),pg_temp.sid(101),pg_temp.later_payload());
select pg_temp.assert((select expected_item_count=1 from public.shift_workflow_rounds where id=pg_temp.sid(602))
 and (select count(*)=2 from public.timelogs where contractor_id=pg_temp.sid(13) and status='approved'),'later draft creates next round excluding completed history');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select pg_temp.transition(515,602,'return','CH return',104);
select pg_temp.assert((select status='rejected' and note='CH return' from public.shift_workflow_rounds where id=pg_temp.sid(602)),'CH return whole next round');
-- Unlinked legacy preparation continues to work and does not silently create a
-- shared header. An own anchor can also opt into the new single-report round.
select public.assign_event_crew(pg_temp.sid(105),pg_temp.sid(13),null,'[{"date":"2099-09-05","time_from":"","time_to":"","day_type":"pripravy"}]');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
select public.save_timelog_atomic(t.id,t.event_id,t.contractor_id,t.updated_at,t.status,1,'Unlinked prep','draft',
 '[{"date":"2099-09-05","time_from":"08:00","time_to":"09:00","day_type":"pripravy"}]') from public.timelogs t where t.event_id=pg_temp.sid(105) and contractor_id=pg_temp.sid(13);
select public.submit_shift_workflow_round_atomic(pg_temp.sid(528),pg_temp.sid(608),null,pg_temp.sid(13),pg_temp.sid(105),
 (select jsonb_build_array(jsonb_build_object('id',t.id,'event_id',t.event_id,'expected_updated_at',t.updated_at,'expected_status',t.status,
   'km',t.km,'note',t.note,'days',(select jsonb_agg(jsonb_build_object('id',d.id,'date',d.date,'time_from',d.time_from,'time_to',d.time_to,
    'day_type',d.day_type,'note',d.note,'meal',d.meal,'meals',d.meals)) from public.timelog_days d where d.timelog_id=t.id)))
   from public.timelogs t where event_id=pg_temp.sid(105) and contractor_id=pg_temp.sid(13)));
select pg_temp.assert((select workflow_id is null and expected_item_count=1 from public.shift_workflow_rounds where id=pg_temp.sid(608)),'new single-anchor round preserves null workflow');
select pg_temp.assert((select free_days=array['2099-09-02'::date] from public.events where id=pg_temp.sid(101)),'event free days remain unchanged');

-- Historical request results contain complete hours and notes. Replay is a
-- fresh read authorization decision even when the original write already won.
reset role;
insert into public.events(id,name) values(pg_temp.sid(106),'Replay membership A'),(pg_temp.sid(107),'Replay membership B');
set local role authenticated;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select public.save_shift_workflow_atomic(pg_temp.sid(529),null,array[pg_temp.sid(106),pg_temp.sid(107)],0,
 (select jsonb_object_agg(id::text,updated_at) from public.events where id in(pg_temp.sid(106),pg_temp.sid(107))),false,false,false);
reset role;
create temporary table replay_cases as select request_id,kind,payload,result from public.shift_workflow_requests
 where request_id in(pg_temp.sid(501),pg_temp.sid(503),pg_temp.sid(507),pg_temp.sid(508),pg_temp.sid(510),pg_temp.sid(529));
create temporary table replay_access_checks(name text,denied boolean);
grant select on replay_cases to authenticated;
grant all on replay_access_checks to authenticated;
create function pg_temp.replay(n integer) returns jsonb language plpgsql as $$
declare r record; p jsonb;
begin
 select * into strict r from replay_cases where request_id=pg_temp.sid(n);p:=r.payload;
 if r.kind='transition_round' then return public.transition_shift_workflow_round_atomic(r.request_id,
  (p->>'round_id')::uuid,(p->>'expected_round_updated_at')::timestamptz,p->'targets',p->>'action',p->>'note',(p->>'affected_event_id')::uuid,p->'corrections');
 elsif r.kind='save_drafts' then return public.save_shift_workflow_drafts_atomic(r.request_id,(p->>'workflow_id')::uuid,
  (p->>'contractor_id')::uuid,(p->>'anchor_event_id')::uuid,p->'timelogs',(p->>'round_id')::uuid);
 elsif r.kind='submit_round' then return public.submit_shift_workflow_round_atomic(r.request_id,(p->>'round_id')::uuid,
  (p->>'workflow_id')::uuid,(p->>'contractor_id')::uuid,(p->>'anchor_event_id')::uuid,p->'timelogs');
 else return public.save_shift_workflow_atomic(r.request_id,(p->>'workflow_id')::uuid,
  array(select jsonb_array_elements_text(p->'event_ids'))::uuid[],(p->>'expected_revision')::integer,p->'event_versions',
  (p->>'confirm_cross_project')::boolean,(p->>'confirm_moves')::boolean,(p->>'delete')::boolean);
 end if;
end $$;
create function pg_temp.replay_denied(n integer) returns boolean language plpgsql as $$
begin perform pg_temp.replay(n);return false;exception when insufficient_privilege then return true;end $$;
set local role authenticated;
select pg_temp.assert(pg_temp.replay(508)=(select result from replay_cases where request_id=pg_temp.sid(508)),
 'authorized CH gets original handoff result after round was returned');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000002';
select pg_temp.assert(pg_temp.replay(510)=(select result from replay_cases where request_id=pg_temp.sid(510)),
 'authorized COO gets original historical return result');
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
select pg_temp.assert(pg_temp.replay(507)=(select result from replay_cases where request_id=pg_temp.sid(507)),
 'authorized frozen owner gets original confirmation result after advancement');
select pg_temp.assert(pg_temp.replay(501)=(select result from replay_cases where request_id=pg_temp.sid(501))
 and pg_temp.replay(503)=(select result from replay_cases where request_id=pg_temp.sid(503)),
 'authorized draft and submission replay remain exact after advancement');
reset role;
delete from public.user_roles where user_id=pg_temp.sid(1) and role='crewhead';
insert into public.user_roles(user_id,role) values(pg_temp.sid(1),'crew');
set local role authenticated;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000001';
select pg_temp.assert(not exists(select 1 from public.timelogs where contractor_id=pg_temp.sid(13)),
 'former CH has no ordinary access to another crew member hours');
insert into replay_access_checks values('former CH replay',pg_temp.replay_denied(508)),('membership replay after role revocation',pg_temp.replay_denied(529));
reset role;
delete from public.user_roles where user_id=pg_temp.sid(1) and role='crew';
insert into public.user_roles(user_id,role) values(pg_temp.sid(1),'coo');
set local role authenticated;
select pg_temp.assert(pg_temp.replay(508)=(select result from replay_cases where request_id=pg_temp.sid(508)),
 'CH to COO role switch retains current read scope independently of old write action');
reset role;
delete from public.user_roles where user_id=pg_temp.sid(1) and role='coo';
insert into public.user_roles(user_id,role) values(pg_temp.sid(1),'crewhead');
delete from public.user_roles where user_id=pg_temp.sid(2) and role='coo';
insert into public.user_roles(user_id,role) values(pg_temp.sid(2),'crew');
set local role authenticated;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000002';
insert into replay_access_checks values('former COO replay',pg_temp.replay_denied(510));
reset role;
delete from public.user_roles where user_id=pg_temp.sid(2) and role='crew';
insert into public.user_roles(user_id,role) values(pg_temp.sid(2),'coo');
update public.profiles set user_id=null where id in(pg_temp.sid(13),pg_temp.sid(16));
update public.profiles set user_id=pg_temp.sid(3) where id=pg_temp.sid(16);
set local role authenticated;
set local request.jwt.claim.sub='93000000-0000-4000-8000-000000000003';
insert into replay_access_checks values('rebound crew confirmation replay',pg_temp.replay_denied(507)),
 ('rebound crew draft replay',pg_temp.replay_denied(501)),('rebound crew submit replay',pg_temp.replay_denied(503));
reset role;
update public.profiles set user_id=pg_temp.sid(6) where id=pg_temp.sid(16);
update public.profiles set user_id=pg_temp.sid(3) where id=pg_temp.sid(13);
delete from public.user_roles where user_id=pg_temp.sid(3) and role='crew';
set local role authenticated;
insert into replay_access_checks values('revoked crew confirmation replay',pg_temp.replay_denied(507)),
 ('revoked crew draft replay',pg_temp.replay_denied(501)),('revoked crew submit replay',pg_temp.replay_denied(503));
reset role;
insert into public.user_roles(user_id,role) values(pg_temp.sid(3),'crew');
do $$ declare leaked text; begin
 select string_agg(name,', ' order by name) into leaked from replay_access_checks where denied is distinct from true;
 if leaked is not null then raise exception 'historical replay unauthorized disclosure: %',leaked; end if;
end $$;
set local role anon;
select pg_temp.fails($q$select public.approve_event_withdrawal(pg_temp.sid(101),pg_temp.sid(13),pg_temp.sid(700))$q$,'42501');
select pg_temp.fails($q$select public.save_shift_workflow_drafts_atomic(pg_temp.sid(999),null,pg_temp.sid(13),pg_temp.sid(101),'[]')$q$,'42501');
reset role;
select pg_temp.assert(not exists(select 1 from private.shift_workflow_write_permits),'no retained write permits');
set constraints all immediate;
rollback;
