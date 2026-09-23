-- Synthetic fixtures only. Every row, DDL helper and injected failure rolls back.
\set ON_ERROR_STOP on
-- Local Supabase 17.6.1.104 requires PGOPTIONS='-c supautils.hint_roles='
-- for denied-function tests (upstream postgres issue #2112). No ACL/RLS bypass.
begin;
set local row_security = on;
do $$ begin
  if to_regprocedure('public.read_shift_workflows()') is null then
    raise exception 'shared shift read RPC missing';
  end if;
  if to_regprocedure('public.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean)') is null then
    raise exception 'shared shift save RPC missing';
  end if;
end $$;

create function pg_temp.sid(n integer) returns uuid language sql immutable as $$
  select ('91000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.ids(ns integer[]) returns uuid[] language sql immutable as $$
  select coalesce(array_agg(pg_temp.sid(n) order by ordinal),'{}'::uuid[])
  from unnest(ns) with ordinality as ns(n,ordinal)
$$;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %', message; end if; end $$;
create function pg_temp.fails(statement text, expected_state text, message text default '')
returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute statement;
  exception when others then
    if sqlstate <> expected_state or position(message in sqlerrm)=0 then raise; end if;
    caught := true;
  end;
  if not caught then raise exception 'expected failure %: %',expected_state,statement; end if;
end $$;
create function pg_temp.versions(ns integer[]) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(id::text,updated_at),'{}'::jsonb)
  from public.events where id=any(pg_temp.ids(ns))
$$;
create function pg_temp.save(req integer, workflow uuid, ns integer[], versions jsonb default null,
  cross_job boolean default false, moves boolean default false, deleting boolean default false,
  revision integer default null) returns jsonb language sql as $$
  select public.save_shift_workflow_atomic(pg_temp.sid(req),workflow,pg_temp.ids(ns),
    coalesce(revision,(select s.revision from public.shift_workflow_state s)),
    coalesce(versions,pg_temp.versions(ns)),cross_job,moves,deleting)
$$;

-- Snapshot original rows before fixtures, even when the local template is empty.
create temporary table original_rows(table_name text primary key, rows jsonb) on commit drop;
do $$ declare tab text; snapshot jsonb; begin
  foreach tab in array array['events','projects','event_assignments','timelogs','timelog_days',
    'timelog_approvals','invoices','invoice_timelogs','receipts','billing_groups'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by id),''[]'') from public.%I t',tab) into snapshot;
    insert into original_rows values(tab,snapshot);
  end loop;
end $$;
insert into auth.users(id) select pg_temp.sid(n) from generate_series(1,5) n;
delete from public.user_roles where user_id=any(pg_temp.ids(array[1,2,3,4,5]));
delete from public.profiles where user_id=any(pg_temp.ids(array[1,2,3,4,5]));
insert into public.profiles(id,user_id,first_name,last_name)
select pg_temp.sid(n+10),pg_temp.sid(n),'Shared fixture',n::text from generate_series(1,4) n;
insert into public.user_roles(user_id,role) values
  (pg_temp.sid(1),'crewhead'),(pg_temp.sid(2),'coo'),
  (pg_temp.sid(3),'crew'),(pg_temp.sid(4),'crew'),(pg_temp.sid(5),'crewhead');
insert into public.projects(id,job_number,name) values
  (pg_temp.sid(90),'SHIFT-A','Synthetic A'),(pg_temp.sid(91),'SHIFT-B','Synthetic B');
insert into public.events(id,name,project_id,job_number)
select pg_temp.sid(n),'Shared fixture '||n,
  case when n=108 then pg_temp.sid(91) else pg_temp.sid(90) end,
  case when n>=107 then 'SHIFT-B' else 'SHIFT-A' end from generate_series(101,112) n;
insert into public.event_assignments(event_id,profile_id) values
  (pg_temp.sid(101),pg_temp.sid(13)),(pg_temp.sid(102),pg_temp.sid(13)),
  (pg_temp.sid(102),pg_temp.sid(14)),(pg_temp.sid(103),pg_temp.sid(14));
insert into public.timelogs(id,event_id,contractor_id,status,note)
select pg_temp.sid(n+100),pg_temp.sid(n),pg_temp.sid(13),'draft','Untouched hours'
from generate_series(101,112) n;
insert into public.timelogs(id,event_id,contractor_id,status) values
  (pg_temp.sid(250),pg_temp.sid(102),pg_temp.sid(14),'draft');
insert into public.timelog_days(id,timelog_id,date,time_from,time_to,day_type) values
  (pg_temp.sid(300),pg_temp.sid(201),'2099-09-01','08:00','17:00','provoz');
-- Existing billing tables have their own authoritative-role + marker trigger.
-- Establish only this synthetic invariant fixture under that existing contract.
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';
set local app.billing_group_write='atomic';
insert into public.billing_groups(id,name) values(pg_temp.sid(350),'Untouched historical billing group');
set local app.billing_group_write='';
create temporary table event_snapshot as select * from public.events where id=any(pg_temp.ids(array[101,102,103,104,105,106,107,108,109,110,111,112]));
create temporary table timelog_snapshot as select * from public.timelogs where id=any(pg_temp.ids(array[201,202,203,204,205,206,207,208,209,210,211,212,250]));
create temporary table saved(name text primary key,result jsonb);
grant all on saved to authenticated;

set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';
select pg_temp.assert(public.read_shift_workflows()=jsonb_build_object(
  'revision',0,'workflows','[]'::jsonb,'rounds','[]'::jsonb,'assigned_event_ids','[]'::jsonb),
  'empty arrays and initial integer manager revision');
savepoint empty_header;
reset role;
insert into public.shift_workflows(id,created_by) values(pg_temp.sid(390),pg_temp.sid(1));
set local role authenticated;
select pg_temp.assert(public.read_shift_workflows()->'workflows'->0->'event_ids'='[]','empty header has array, never null');
rollback to empty_header;
select pg_temp.fails($q$select pg_temp.save(401,null,array[101])$q$,'22023');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,101])$q$,'22023');
select pg_temp.fails($q$select public.save_shift_workflow_atomic(pg_temp.sid(401),null,array[pg_temp.sid(101),null],0,'{}',false,false,false)$q$,'22023');
select pg_temp.fails($q$select public.save_shift_workflow_atomic(null,null,pg_temp.ids(array[101,102]),0,pg_temp.versions(array[101,102]),false,false,false)$q$,'22023');
select pg_temp.fails($q$select public.save_shift_workflow_atomic(pg_temp.sid(401),null,null,0,'{}',false,false,false)$q$,'22023');
select pg_temp.fails($q$select public.save_shift_workflow_atomic(pg_temp.sid(401),null,pg_temp.ids(array[101,102]),0,'{}',null,false,false)$q$,'22023');
select pg_temp.fails($q$select pg_temp.save(401,null,array(select generate_series(101,401)))$q$,'22023');
select pg_temp.fails($q$select pg_temp.save(401,pg_temp.sid(999),array[101,102])$q$,'P0002');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,999])$q$,'P0002');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,102],pg_temp.versions(array[101]))$q$,'22023');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,102],pg_temp.versions(array[101,102,103]))$q$,'22023');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,102],jsonb_build_object(pg_temp.sid(101),'invalid',pg_temp.sid(102),'2020-01-01'))$q$,'22023');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,102],jsonb_build_object(pg_temp.sid(101),null,pg_temp.sid(102),'2020-01-01'))$q$,'22023');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,102],jsonb_build_object(pg_temp.sid(101),'2020-01-01',pg_temp.sid(102),'2020-01-01'))$q$,'40001');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,107])$q$,'22023','cross_project');
select pg_temp.fails($q$select pg_temp.save(401,null,array[107,108])$q$,'22023','cross_project');
select pg_temp.assert(jsonb_array_length(public.read_shift_workflows()->'workflows')=0,'cross-job never auto links');

insert into saved values('first',pg_temp.save(401,null,array[103,101,102]));
select pg_temp.assert((public.read_shift_workflows()->'workflows'->0->'event_ids')=to_jsonb(pg_temp.ids(array[103,101,102])),'explicit order canonical');
select pg_temp.assert((select count(*) from public.shift_workflow_events)=3,'one link per selected event');
insert into saved values('source',pg_temp.save(402,null,array[104,105,106]));
-- Replay is exact even after another save advanced the revision.
select pg_temp.assert(pg_temp.save(401,null,array[103,101,102],null,false,false,false,0)=
  (select result from saved where name='first'),'exact historical replay result');
select pg_temp.fails($q$select pg_temp.save(401,null,array[101,102,103],null,false,false,false,0)$q$,'22023','request');
select pg_temp.fails($q$select pg_temp.save(401,null,array[103,101,102],null,true,false,false,0)$q$,'22023','request');
select pg_temp.fails($q$select pg_temp.save(403,null,array[109,110],null,false,false,false,0)$q$,'40001');

-- All direct DML is denied even for a manager; the ledger has no direct read.
do $$ declare tab text; begin
  foreach tab in array array['shift_workflows','shift_workflow_events','shift_workflow_state',
    'shift_workflow_requests','shift_workflow_rounds','shift_workflow_round_items','shift_workflow_round_actions'] loop
    perform pg_temp.fails(format('delete from public.%I',tab),'42501');
    perform pg_temp.fails(format('insert into public.%I default values',tab),'42501');
  end loop;
end $$;
select pg_temp.fails('select * from public.shift_workflow_requests','42501');

-- Any omitted removed target or untouched source member invalidates the save.
select pg_temp.fails($q$select pg_temp.save(404,(select (result->>'workflow_id')::uuid from saved where name='first'),array[101,104],pg_temp.versions(array[101,104]),false,true)$q$,'22023','versions');
select pg_temp.fails($q$select pg_temp.save(404,(select (result->>'workflow_id')::uuid from saved where name='first'),array[101,104],pg_temp.versions(array[101,102,103,104]),false,true)$q$,'22023','versions');
select pg_temp.fails($q$select pg_temp.save(404,(select (result->>'workflow_id')::uuid from saved where name='first'),array[101,104],pg_temp.versions(array[101,102,103,104,105,106]))$q$,'22023','move');
savepoint guarded_source_remnant;
reset role;
update public.timelogs set status='pending_ch' where id=pg_temp.sid(206);
set local role authenticated;
select pg_temp.fails($q$select pg_temp.save(404,(select (result->>'workflow_id')::uuid from saved where name='first'),array[101,104],pg_temp.versions(array[101,102,103,104,105,106]),false,true)$q$,'55000');
rollback to guarded_source_remnant;
insert into saved values('moved',pg_temp.save(404,(select (result->>'workflow_id')::uuid from saved where name='first'),array[101,104],pg_temp.versions(array[101,102,103,104,105,106]),false,true));
select pg_temp.assert((select array_agg(event_id order by position) from public.shift_workflow_events where workflow_id=(select (result->>'workflow_id')::uuid from saved where name='source'))=pg_temp.ids(array[105,106]),'source remnant deterministic');
select pg_temp.assert(not exists(select 1 from public.shift_workflow_events where event_id=any(pg_temp.ids(array[102,103]))),'removed events unlinked');
insert into saved values('singleton',pg_temp.save(405,(select (result->>'workflow_id')::uuid from saved where name='first'),array[101,104,105],pg_temp.versions(array[101,104,105,106]),false,true));
select pg_temp.assert((select array_agg(event_id order by position) from public.shift_workflow_events where workflow_id=(select (result->>'workflow_id')::uuid from saved where name='source'))=pg_temp.ids(array[106]),'singleton source retained');
select pg_temp.save(406,(select (result->>'workflow_id')::uuid from saved where name='first'),array[101,104,105,106],null,false,true);
select pg_temp.assert(not exists(select 1 from public.shift_workflows where id=(select (result->>'workflow_id')::uuid from saved where name='source')),'empty source removed');
insert into saved values('cross',pg_temp.save(407,null,array[107,108],null,true));

-- COO saves; another actor cannot replay a CH request, even with its exact payload.
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000002';
select pg_temp.fails($q$select pg_temp.save(401,null,array[103,101,102],null,false,false,false,0)$q$,'22023','request');
insert into saved values('coo',pg_temp.save(408,null,array[109,110]));
select pg_temp.assert(jsonb_typeof(public.read_shift_workflows()->'revision')='number','COO sees revision');

-- Missing profile and missing auth identity must fail despite a valid DB role.
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000005';
select pg_temp.fails('select public.read_shift_workflows()','42501');
select pg_temp.fails($q$select pg_temp.save(409,null,array[111,112])$q$,'42501');
set local request.jwt.claim.sub='';
select pg_temp.fails('select public.read_shift_workflows()','42501');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';

-- Guards are exercised on draft rows, including historical/released membership.
savepoint guard_test;
reset role;
update public.timelogs set status='pending_ch' where id=pg_temp.sid(201);
set local role authenticated;
select pg_temp.fails($q$select pg_temp.save(410,(select (result->>'workflow_id')::uuid from saved where name='first'),array[]::integer[],pg_temp.versions(array[101,104,105,106]),false,false,true)$q$,'55000');
rollback to guard_test;

savepoint guard_test;
reset role;
insert into public.shift_workflow_rounds(id,workflow_id,contractor_id,contractor_user_id,expected_item_count,status,created_by)
values(pg_temp.sid(500),(select (result->>'workflow_id')::uuid from saved where name='first'),pg_temp.sid(13),pg_temp.sid(3),1,'rejected',pg_temp.sid(1));
insert into public.shift_workflow_round_items(round_id,timelog_id,event_id,position,released_at)
values(pg_temp.sid(500),pg_temp.sid(201),pg_temp.sid(101),0,now());
set local role authenticated;
select pg_temp.fails($q$select pg_temp.save(410,(select (result->>'workflow_id')::uuid from saved where name='first'),array[104,105,106],pg_temp.versions(array[101,104,105,106]))$q$,'55000');
rollback to guard_test;

savepoint guard_test;
reset role;
insert into public.timelog_approvals(id,handoff_batch_id,approval_round_id,timelog_id,approver_profile_id,approver_user_id,requested_by_profile_id,requested_by_user_id,status,superseded_at)
values(pg_temp.sid(520),pg_temp.sid(520),pg_temp.sid(521),pg_temp.sid(201),pg_temp.sid(12),pg_temp.sid(2),pg_temp.sid(11),pg_temp.sid(1),'pending',now());
set local role authenticated;
select pg_temp.fails($q$select pg_temp.save(410,(select (result->>'workflow_id')::uuid from saved where name='first'),array[104,105,106],pg_temp.versions(array[101,104,105,106]))$q$,'55000');
rollback to guard_test;

savepoint guard_test;
reset role;
insert into public.invoices(id,contractor_id) values(pg_temp.sid(530),pg_temp.sid(13));
insert into public.invoice_timelogs(invoice_id,timelog_id) values(pg_temp.sid(530),pg_temp.sid(201));
set local role authenticated;
select pg_temp.fails($q$select pg_temp.save(410,(select (result->>'workflow_id')::uuid from saved where name='first'),array[104,105,106],pg_temp.versions(array[101,104,105,106]))$q$,'55000');
rollback to guard_test;

-- Failure after headers/members/revision are changed must roll all of them back.
savepoint injected_failure;
reset role;
create function pg_temp.reject_shift_request() returns trigger language plpgsql as $$
begin raise exception 'injected ledger failure'; end $$;
create trigger shared_shift_test_reject before insert on public.shift_workflow_requests
for each row execute function pg_temp.reject_shift_request();
set local role authenticated;
insert into saved values('before_failure',public.read_shift_workflows());
select pg_temp.fails($q$select pg_temp.save(411,null,array[111,112])$q$,'P0001','injected ledger failure');
select pg_temp.assert(public.read_shift_workflows()=(select result from saved where name='before_failure'),'injected failure restored all visible state');
reset role;
select pg_temp.assert(not exists(select 1 from public.shift_workflow_requests where request_id=pg_temp.sid(411)),'failed request absent');
rollback to injected_failure;

-- Delete uses current target versions and the same checks as moves.
select pg_temp.fails($q$select pg_temp.save(412,(select (result->>'workflow_id')::uuid from saved where name='coo'),array[]::integer[],'{}',false,false,true)$q$,'22023','versions');
select pg_temp.save(412,(select (result->>'workflow_id')::uuid from saved where name='coo'),array[]::integer[],pg_temp.versions(array[109,110]),false,false,true);
select pg_temp.assert(not exists(select 1 from public.shift_workflows where id=(select (result->>'workflow_id')::uuid from saved where name='coo')),'delete removes header');

-- Frozen rounds have separate contractor ownership from current assignments.
reset role;
insert into public.shift_workflow_rounds(id,workflow_id,contractor_id,contractor_user_id,expected_item_count,status,created_by,note) values
  (pg_temp.sid(501),(select (result->>'workflow_id')::uuid from saved where name='first'),pg_temp.sid(13),pg_temp.sid(3),2,'pending_ch',pg_temp.sid(1),'own round'),
  (pg_temp.sid(502),null,pg_temp.sid(14),pg_temp.sid(4),1,'pending_coo',pg_temp.sid(1),'foreign round');
select pg_temp.fails($q$insert into public.shift_workflow_rounds(contractor_id,contractor_user_id,expected_item_count,status,created_by) values(pg_temp.sid(13),pg_temp.sid(3),0,'pending_ch',pg_temp.sid(1))$q$,'23514');
select pg_temp.fails($q$insert into public.shift_workflow_rounds(contractor_id,contractor_user_id,expected_item_count,status,created_by) values(pg_temp.sid(13),pg_temp.sid(3),null,'pending_ch',pg_temp.sid(1))$q$,'23502');
insert into public.shift_workflow_round_items(round_id,timelog_id,event_id,position) values
  (pg_temp.sid(501),pg_temp.sid(201),pg_temp.sid(101),0),
  (pg_temp.sid(501),pg_temp.sid(204),pg_temp.sid(104),1),
  (pg_temp.sid(502),pg_temp.sid(250),pg_temp.sid(102),0);
insert into public.shift_workflow_round_actions(round_id,actor_id,action,from_status,to_status) values
  (pg_temp.sid(501),pg_temp.sid(1),'submit',null,'pending_ch'),
  (pg_temp.sid(502),pg_temp.sid(2),'handoff','pending_ch','pending_coo');
set local role authenticated;
select pg_temp.assert(jsonb_array_length(public.read_shift_workflows()->'rounds')=2,'manager reads all rounds');
select pg_temp.fails('update public.shift_workflow_rounds set expected_item_count=1','42501');
savepoint truncated_frozen_round;
reset role;
-- Remove only the trailing item; the retained item still has valid event and
-- contractor ownership, so validating surviving rows alone cannot detect loss.
delete from public.shift_workflow_round_items where round_id=pg_temp.sid(501) and position=1;
select pg_temp.assert((select count(*) from public.shift_workflow_round_items where round_id=pg_temp.sid(501))=1,
  'truncated fixture retains one valid frozen item');
set local role authenticated;
do $$
declare manager_denied boolean := false; owner_denied boolean := false;
begin
  perform set_config('request.jwt.claim.sub',pg_temp.sid(1)::text,true);
  begin perform public.read_shift_workflows();
  exception when sqlstate '22023' then
    if sqlerrm <> 'shift_workflow_round_invalid' then raise; end if;
    manager_denied := true;
  end;
  perform set_config('request.jwt.claim.sub',pg_temp.sid(3)::text,true);
  begin perform public.read_shift_workflows();
  exception when sqlstate '22023' then
    if sqlerrm <> 'shift_workflow_round_invalid' then raise; end if;
    owner_denied := true;
  end;
  perform pg_temp.assert(manager_denied and owner_denied,
    format('partial frozen set denied: manager=%s owner=%s',manager_denied,owner_denied));
end $$;
rollback to truncated_frozen_round;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000003';
select pg_temp.assert(public.read_shift_workflows()->'revision'='null','crew revision hidden');
select pg_temp.assert(public.read_shift_workflows()->'assigned_event_ids'=to_jsonb(pg_temp.ids(array[101,102])),'crew assigned IDs');
select pg_temp.assert(public.read_shift_workflows()->'workflows'->0->'event_ids'=to_jsonb(pg_temp.ids(array[101])),'crew workflow only assigned intersection');
select pg_temp.assert(public.read_shift_workflows()->'rounds'->0->'event_ids'=to_jsonb(pg_temp.ids(array[101,104])),'own frozen unassigned event retained');
select pg_temp.assert(public.read_shift_workflows()->'rounds'->0->'timelog_ids'=to_jsonb(pg_temp.ids(array[201,204])),'canonical frozen timelogs');
select pg_temp.assert(jsonb_array_length(public.read_shift_workflows()->'rounds')=1,'foreign round never exposed through assignment');
select pg_temp.assert((select count(*) from public.shift_workflow_events)=1,'direct crew links filtered');
select pg_temp.assert((select count(*) from public.shift_workflow_rounds)=1,'direct own rounds');
select pg_temp.assert((select count(*) from public.shift_workflow_round_items)=2,'direct own items');
select pg_temp.assert((select count(*) from public.shift_workflow_round_actions)=1,'direct own actions');
select pg_temp.assert((select count(*) from public.shift_workflow_state)=0,'direct revision filtered');
select pg_temp.fails($q$select pg_temp.save(413,null,array[111,112])$q$,'42501');
-- Neither user-controlled JWT metadata nor an invented workflow GUC grants DML.
set local request.jwt.claims='{"user_metadata":{"role":"crewhead","roles":["coo"]}}';
set local app.shift_workflow_write='atomic';
select pg_temp.fails($q$select public.save_shift_workflow_atomic(pg_temp.sid(413),null,pg_temp.ids(array[111,112]),8,'{}',true,true,false)$q$,'42501');
select pg_temp.fails('delete from public.shift_workflows','42501');
set local request.jwt.claims='{}';
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000004';
select pg_temp.assert(public.read_shift_workflows()->'workflows'='[]','other crew no current group members');
select pg_temp.assert(public.read_shift_workflows()->'rounds'->0->>'id'=pg_temp.sid(502)::text,'other crew own round only');

savepoint reassigned_identity;
reset role;
update public.profiles set user_id=null where id=pg_temp.sid(13);
update public.profiles set user_id=pg_temp.sid(3) where id=pg_temp.sid(14);
set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000003';
select pg_temp.assert(public.read_shift_workflows()->'rounds'='[]','changed profile/auth binding cannot inherit frozen round');
select pg_temp.assert((select count(*) from public.shift_workflow_rounds)=0,'direct profile/auth snapshot ownership enforced');
rollback to reassigned_identity;

-- Fail closed if privileged/imported data has inconsistent frozen ownership.
savepoint inconsistent_round;
reset role;
update public.shift_workflow_round_items set event_id=pg_temp.sid(112) where round_id=pg_temp.sid(502);
set local role authenticated;
select pg_temp.fails('select public.read_shift_workflows()','22023','round');
rollback to inconsistent_round;

savepoint foreign_contractor;
reset role;
update public.shift_workflow_round_items set timelog_id=pg_temp.sid(202) where round_id=pg_temp.sid(502);
set local role authenticated;
select pg_temp.fails('select public.read_shift_workflows()','22023','round');
rollback to foreign_contractor;

savepoint missing_frozen_set;
reset role;
delete from public.shift_workflow_round_items where round_id=pg_temp.sid(502);
set local role authenticated;
select pg_temp.fails('select public.read_shift_workflows()','22023','round');
rollback to missing_frozen_set;

reset role;
select pg_temp.fails($q$insert into public.shift_workflow_round_items(round_id,timelog_id,event_id,position) values(pg_temp.sid(502),pg_temp.sid(999),pg_temp.sid(103),3)$q$,'23503');
select pg_temp.fails($q$insert into public.shift_workflow_round_items(round_id,timelog_id,event_id,position) values(pg_temp.sid(502),pg_temp.sid(201),pg_temp.sid(103),3)$q$,'23505');
select pg_temp.fails($q$insert into public.profiles(id,user_id) values(pg_temp.sid(19),pg_temp.sid(1))$q$,'23505');

set local role anon;
select pg_temp.fails('select public.read_shift_workflows()','42501');
select pg_temp.fails($q$select public.save_shift_workflow_atomic(null,null,null,null,null,false,false,false)$q$,'42501');
select pg_temp.fails('select * from public.shift_workflows','42501');
reset role;
select pg_temp.assert(not exists((select * from event_snapshot except select * from public.events) union all
  (select * from public.events where id in(select id from event_snapshot) except select * from event_snapshot)),'event metadata unchanged');
select pg_temp.assert(not exists((select * from timelog_snapshot except select * from public.timelogs) union all
  (select * from public.timelogs where id in(select id from timelog_snapshot) except select * from timelog_snapshot)),'hours and status unchanged');
select pg_temp.assert((select name from public.billing_groups where id=pg_temp.sid(350))='Untouched historical billing group','billing group unchanged');
do $$ declare rec record; actual jsonb; begin
  for rec in select * from original_rows loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by id),''[]'') from public.%I t where id in(select (r->>''id'')::uuid from jsonb_array_elements($1) r)',rec.table_name)
      into actual using rec.rows;
    perform pg_temp.assert(actual=rec.rows,'original rows unchanged: '||rec.table_name);
  end loop;
end $$;
rollback;
\echo 'shared shift authenticated integration: PASS (rolled back)'
