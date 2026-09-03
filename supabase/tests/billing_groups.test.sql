-- All fixtures and assertions are rolled back; run only against the isolated local DB.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'billing_groups', 'stable billing group headers exist');
select has_table('public', 'billing_group_members', 'event membership exists');
select has_table('public', 'billing_group_state', 'serialized revision exists');
select has_table('public', 'billing_group_requests', 'idempotency ledger exists');
select has_function('public', 'read_billing_groups', array[]::text[], 'snapshot RPC exists');
select has_function('public', 'save_billing_group_atomic', array['uuid','uuid','text','uuid[]','integer','jsonb','boolean','boolean','boolean'], 'atomic RPC exists');
select ok((select bool_and(not prosecdef and proconfig @> array['search_path=""']) from pg_proc
  where oid in ('public.read_billing_groups()'::regprocedure,
    'public.save_billing_group_atomic(uuid,uuid,text,uuid[],integer,jsonb,boolean,boolean,boolean)'::regprocedure,
    'public.guard_billing_group_write()'::regprocedure,
    'public.can_manage_billing_groups()'::regprocedure)), 'all billing functions are invoker with empty search path');
select ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.billing_groups'::regclass,'public.billing_group_members'::regclass,
   'public.billing_group_state'::regclass,'public.billing_group_requests'::regclass)), 'RLS enabled on every billing table');

-- Temporary helpers only reduce UUID boilerplate; all calls still use the real invoker RPC.
create function pg_temp.fixture_id(kind integer, n integer) returns uuid language sql immutable as $$
  select (kind::text || '0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.versions(ids integer[]) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(e.id::text, e.updated_at), '{}'::jsonb)
  from public.events e where e.id in (select pg_temp.fixture_id(3, n) from unnest(ids) n)
$$;
create function pg_temp.save(req integer, grp integer, name text, ids integer[], rev integer,
  versions jsonb default null, cross_project boolean default false,
  moves boolean default false, deleting boolean default false)
returns jsonb language plpgsql as $$
declare selected uuid[]; checked jsonb;
begin
  select coalesce(array_agg(pg_temp.fixture_id(3, n) order by n), '{}'::uuid[]) into selected from unnest(ids) n;
  if versions is null then
    select coalesce(jsonb_object_agg(e.id::text, e.updated_at), '{}'::jsonb) into checked
    from public.events e where e.id = any(selected) or e.id in (
      select m.event_id from public.billing_group_members m where m.group_id = pg_temp.fixture_id(4, grp));
  else checked := versions;
  end if;
  return public.save_billing_group_atomic(pg_temp.fixture_id(5, req), pg_temp.fixture_id(4, grp),
    name, selected, rev, checked, cross_project, moves, deleting);
end;
$$;

insert into auth.users(id, email, raw_user_meta_data) values
  (pg_temp.fixture_id(1,1), 'billing-head@example.invalid', '{}'),
  (pg_temp.fixture_id(1,2), 'billing-coo@example.invalid', '{}'),
  (pg_temp.fixture_id(1,3), 'billing-crew@example.invalid', '{"role":"coo"}');
insert into public.user_roles(user_id, role) values
  (pg_temp.fixture_id(1,1), 'crewhead'), (pg_temp.fixture_id(1,2), 'coo');
insert into public.projects(id, name, job_number) values
  (pg_temp.fixture_id(2,1), 'Billing fixture A', 'BILL-TEST-A'),
  (pg_temp.fixture_id(2,2), 'Billing fixture B', 'BILL-TEST-B');
insert into public.events(id, name, project_id, job_number, status, updated_at) values
  (pg_temp.fixture_id(3,1), 'Visible billing event', pg_temp.fixture_id(2,1), 'BILL-TEST-A', 'upcoming', '2026-09-01T10:00:00Z'),
  (pg_temp.fixture_id(3,2), 'Hidden billing event', pg_temp.fixture_id(2,2), 'BILL-TEST-B', 'planning', '2026-09-01T11:00:00Z'),
  (pg_temp.fixture_id(3,3), 'Same job separate event', pg_temp.fixture_id(2,1), 'BILL-TEST-A', 'upcoming', '2026-09-01T12:00:00Z');
insert into public.event_assignments(id, event_id, profile_id)
  select pg_temp.fixture_id(6,1), pg_temp.fixture_id(3,1), id from public.profiles where user_id = pg_temp.fixture_id(1,3);
insert into public.timelogs(id, event_id, contractor_id, status, km, note)
  select pg_temp.fixture_id(7,1), pg_temp.fixture_id(3,1), id, 'draft', 17, 'Preserve billing fixture'
  from public.profiles where user_id = pg_temp.fixture_id(1,3);
insert into public.timelog_days(id, timelog_id, date, time_from, time_to)
  values (pg_temp.fixture_id(8,1), pg_temp.fixture_id(7,1), '2026-09-01', '08:00', '16:00');
insert into public.invoices(id, event_id, contractor_id, job_number, total_hours, total_amount)
  select pg_temp.fixture_id(9,1), pg_temp.fixture_id(3,1), id, 'BILL-TEST-A', 8, 1600
  from public.profiles where user_id = pg_temp.fixture_id(1,3);
create temporary table baseline as select
  (select jsonb_agg(to_jsonb(e) order by id) from public.events e) events,
  (select jsonb_agg(to_jsonb(p) order by id) from public.projects p) projects,
  (select jsonb_agg(to_jsonb(a) order by id) from public.event_assignments a) assignments,
  (select jsonb_agg(to_jsonb(t) order by id) from public.timelogs t) timelogs,
  (select jsonb_agg(to_jsonb(d) order by id) from public.timelog_days d) days,
  (select jsonb_agg(to_jsonb(i) order by id) from public.invoices i) invoices;
grant select on baseline to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select ok(public.can_manage_billing_groups(), 'crewhead is authoritative manager');
select is(public.read_billing_groups(), '{"revision":0,"groups":[]}'::jsonb, 'no auto groups even for shared job numbers');
select throws_ok($$insert into public.billing_groups values (pg_temp.fixture_id(4,1), 'Direct')$$,
  '42501', 'billing_group_atomic_required', 'direct header insert blocked');
select throws_ok($$update public.billing_group_state set revision = 99$$,
  '42501', 'billing_group_atomic_required', 'direct revision update blocked');
select throws_ok($$insert into public.billing_group_requests(request_id,actor_id,payload,result) values
  (pg_temp.fixture_id(5,99), auth.uid(), '{}', '{}')$$,
  '42501', 'billing_group_atomic_required', 'direct ledger insert blocked');
select ok(not has_function_privilege('authenticated', 'public.guard_billing_group_write()', 'EXECUTE'), 'guard not directly executable');
set local app.billing_group_write = 'prior-test-marker';
select is(pg_temp.save(1,1,'  First  ',array[1,3],0)->>'revision', '1', 'crewhead creates explicit shared-job group');
select is((select result from public.billing_group_requests where request_id=pg_temp.fixture_id(5,1)),
  jsonb_build_object('request_id',pg_temp.fixture_id(5,1),'group_id',pg_temp.fixture_id(4,1),'revision',1), 'reserved ledger result equals committed result');
select is((select name from public.billing_groups where id=pg_temp.fixture_id(4,1)), 'First', 'group name trimmed');
select ok(current_setting('app.billing_group_write', true) is distinct from 'atomic', 'marker restored on success');
select is(current_setting('app.billing_group_write', true), 'prior-test-marker', 'success restores exact previous marker');
select is(pg_temp.save(1,1,'  First  ',array[1,3],0)->>'revision', '1', 'exact replay bypasses obsolete revision');
select is((select revision from public.billing_group_state), 1, 'replay increments revision once');
select throws_ok($$select pg_temp.save(1,1,'First',array[1,3],0)$$,
  '22023', 'billing_group_request_mismatch', 'ledger retains exact untrimmed payload');
select throws_ok($$update public.billing_groups set name='Direct'$$, '42501', 'billing_group_atomic_required', 'direct header update blocked');
select throws_ok($$delete from public.billing_groups$$, '42501', 'billing_group_atomic_required', 'direct header delete blocked');
select throws_ok($$insert into public.billing_group_members values(pg_temp.fixture_id(3,2),pg_temp.fixture_id(4,1))$$,
  '42501', 'billing_group_atomic_required', 'direct member insert blocked');
select throws_ok($$update public.billing_group_members set group_id=pg_temp.fixture_id(4,1)$$,
  '42501', 'billing_group_atomic_required', 'direct member update blocked');
select throws_ok($$delete from public.billing_group_members$$, '42501', 'billing_group_atomic_required', 'direct member delete blocked');
select is(pg_temp.save(2,2,'Second',array[2],1)->>'revision', '2', 'separate source group created');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select ok(public.can_manage_billing_groups(), 'coo is authoritative manager');
select is((select count(*) from public.billing_group_requests), 0::bigint, 'other manager cannot read actor ledger');
select throws_ok($$select pg_temp.save(1,1,'  First  ',array[1,3],0)$$, '22023', 'billing_group_request_mismatch', 'another actor cannot reuse a request ID');
select throws_ok($$select pg_temp.save(1,1,'Altered by another actor',array[1],0)$$, '22023', 'billing_group_request_mismatch', 'hidden request collision rejects changed payload before stale revision');
select is((select revision from public.billing_group_state), 2, 'actor collision leaves revision unchanged');
select is(pg_temp.save(3,2,'COO name',array[2],2)->>'revision', '3', 'coo can manage');

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","user_metadata":{"role":"coo"}}';
select ok(not public.can_manage_billing_groups(), 'forged user metadata never grants management');
select throws_ok($$select pg_temp.save(90,1,'Forged',array[1],3)$$, '42501', 'billing_group_unauthorized', 'crew mutation denied');
select is(public.read_billing_groups()->'revision', 'null'::jsonb, 'crew revision hidden');
select is((select count(*) from public.billing_groups), 1::bigint, 'hidden-only group header inaccessible');
select is((select count(*) from public.billing_group_requests), 0::bigint, 'crew has no ledger payload access');
select ok(public.read_billing_groups()::text not like '%30000000-0000-4000-8000-000000000002%', 'hidden member UUID absent');
select throws_ok($$insert into public.billing_groups values(pg_temp.fixture_id(4,90),'Denied')$$,
  '42501','billing_group_atomic_required','crew direct write blocked too');

reset role;
set local role anon;
select throws_ok($$select public.read_billing_groups()$$, '42501', null, 'anon cannot execute read RPC');
select throws_ok($$select public.save_billing_group_atomic(null,null,null,null,null,null,null,null,null)$$, '42501', null, 'anon cannot execute write RPC');
select throws_ok($$select * from public.billing_groups$$, '42501', null, 'anon has no table access');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok($$select pg_temp.save(4,1,'Combined',array[1,2,3],3)$$, '22023','billing_group_cross_project_confirmation','cross-project grouping needs explicit confirmation');
select throws_ok($$select pg_temp.save(4,1,'Combined',array[1,2,3],3,null,true)$$, '22023','billing_group_move_confirmation','moving requires independent confirmation');
select is((select revision from public.billing_group_state),3,'confirmation errors leave revision unchanged');
select is((select group_id from public.billing_group_members where event_id=pg_temp.fixture_id(3,2)),pg_temp.fixture_id(4,2),'failure keeps source membership');
select is(pg_temp.save(4,1,'Combined',array[1,2,3],3,null,true,true)->>'revision','4','both explicit confirmations allow move');
select is((select count(*) from public.billing_group_members),3::bigint,'one membership per event');
select is((select count(*) from public.billing_groups where id=pg_temp.fixture_id(4,2)),1::bigint,'empty source group ID preserved');
select is((select count(*) from public.billing_group_members where group_id=pg_temp.fixture_id(4,2)),0::bigint,'source group emptied');

-- Inject a late write failure, after headers/members/ledger have been touched, to prove rollback.
reset role;
create function pg_temp.fail_billing_revision() returns trigger language plpgsql as $$
begin raise exception 'billing_test_late_failure'; end
$$;
create trigger billing_test_late_failure before update on public.billing_group_state
  for each row execute function pg_temp.fail_billing_revision();
set local role authenticated;
select throws_ok($$select pg_temp.save(89,1,'Must roll back',array[]::integer[],4)$$,
  'P0001','billing_test_late_failure','late failure rejects the entire atomic save');
select is((select name from public.billing_groups where id=pg_temp.fixture_id(4,1)),'Combined','late failure rolls back header write');
select is((select count(*) from public.billing_group_members where group_id=pg_temp.fixture_id(4,1)),3::bigint,'late failure rolls back member removals');
select is((select count(*) from public.billing_group_requests where request_id=pg_temp.fixture_id(5,89)),0::bigint,'late failure rolls back reserved ledger');
select is((select revision from public.billing_group_state),4,'late failure leaves revision unchanged');
select is(current_setting('app.billing_group_write',true),'prior-test-marker','late failure restores previous marker');
reset role;
drop trigger billing_test_late_failure on public.billing_group_state;
set local role authenticated;

set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(public.read_billing_groups(), jsonb_build_object('revision',null,'groups',jsonb_build_array(
  jsonb_build_object('id',pg_temp.fixture_id(4,1),'name','Combined','event_ids',jsonb_build_array(pg_temp.fixture_id(3,1),pg_temp.fixture_id(3,3))))),
  'crew snapshot contains only visible members, no hidden counts, headers or IDs');
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok($$select public.delete_event_atomic(pg_temp.fixture_id(3,1),(select updated_at from public.events where id=pg_temp.fixture_id(3,1)))$$,
  '23503',null,'existing event deletion RPC is blocked by restrictive membership FK');
select is((select count(*) from public.events where id=pg_temp.fixture_id(3,1)),1::bigint,'failed delete preserves event');
select is((select count(*) from public.event_assignments where id=pg_temp.fixture_id(6,1)),1::bigint,'failed delete rolls back dependent assignment deletion');
select is((select count(*) from public.timelog_days where id=pg_temp.fixture_id(8,1)),1::bigint,'failed delete preserves dependent hours');
select throws_ok($$select pg_temp.save(5,1,'Combined',array[]::integer[],4,null,false,false,true)$$,
  '23503','billing_group_not_empty','nonempty group deletion rejected');
select throws_ok($$select pg_temp.save(5,1,'Combined',array[2],3,null,true)$$,
  '40001','billing_group_conflict','stale global revision rejected');
select throws_ok($$select pg_temp.save(5,1,'Combined',array[2],4,pg_temp.versions(array[2]))$$,
  '40001','billing_group_conflict','removed members require versions too');
select throws_ok($$select pg_temp.save(5,1,'Combined',array[2],4,pg_temp.versions(array[1,2,3]) || '{"30000000-0000-4000-8000-000000000001":"2000-01-01T00:00:00Z"}')$$,
  '40001','billing_group_conflict','stale removed-member version conflicts');
select throws_ok($$select pg_temp.save(5,1,'Combined',array[2],4,pg_temp.versions(array[1,2,3]) || '{"extra":"2026-09-01"}')$$,
  '40001','billing_group_conflict','extra version keys rejected');
select throws_ok($$select pg_temp.save(5,1,'Combined',array[2],4,pg_temp.versions(array[1,2,3]) || '{"30000000-0000-4000-8000-000000000001":"garbage"}')$$,
  '40001','billing_group_conflict','malformed timestamp is conflict');
select throws_ok($$select pg_temp.save(5,1,'Combined',array[2],4,pg_temp.versions(array[1,2,3]) || '{"30000000-0000-4000-8000-000000000001":null}')$$,
  '40001','billing_group_conflict','null timestamp is conflict');
select throws_ok($$select pg_temp.save(5,1,'Combined',array[999],4,pg_temp.versions(array[1,2,3]) || '{"30000000-0000-4000-8000-000000000999":"2026-09-01T00:00:00Z"}')$$,
  '42501','billing_group_event_unavailable','unavailable event cannot be attached');
select ok(current_setting('app.billing_group_write',true) is distinct from 'atomic','failed RPC never leaks marker');
select is(current_setting('app.billing_group_write',true),'prior-test-marker','failure restores exact previous marker');
select is((select revision from public.billing_group_state),4,'all failed changes leave revision unchanged');
select is((select count(*) from public.billing_group_requests),3::bigint,'all failed changes leave actor ledger unchanged');
select is(pg_temp.save(5,1,'Hidden remains',array[2],4)->>'revision','5','detach removes only membership');
select is((select count(*) from public.events),3::bigint,'detaching preserves every event');
select throws_ok($$select pg_temp.save(6,2,'',array[1],5,null,false,false,true)$$,
  '23503','billing_group_not_empty','delete command cannot also request members');
select is(pg_temp.save(6,2,'',array[]::integer[],5,null,false,false,true)->>'revision','6','empty group can be deleted');
select throws_ok($$select pg_temp.save(7,2,'',array[]::integer[],6,null,false,false,true)$$,
  '22023','billing_group_missing','cannot delete absent group');
select is(pg_temp.save(7,1,'Empty now',array[]::integer[],6)->>'revision','7','last event may be detached');
select is((select count(*) from public.billing_groups),1::bigint,'detaching last member preserves header');
select is(pg_temp.save(8,1,'',array[]::integer[],7,null,false,false,true)->>'revision','8','detached empty header can be deleted');
select is((select count(*) from public.billing_groups),0::bigint,'explicit empty deletion removes only target header');

-- Strict input validation must not depend on table constraints or optimistic concurrency.
select throws_ok($$select public.save_billing_group_atomic(null,pg_temp.fixture_id(4,1),'x','{}',8,'{}',false,false,false)$$,'22023','billing_group_invalid_input','null request rejected');
select throws_ok($$select public.save_billing_group_atomic(pg_temp.fixture_id(5,90),null,'x','{}',8,'{}',false,false,false)$$,'22023','billing_group_invalid_input','null group rejected');
select throws_ok($$select public.save_billing_group_atomic(pg_temp.fixture_id(5,90),pg_temp.fixture_id(4,1),'x',null,8,'{}',false,false,false)$$,'22023','billing_group_invalid_input','null array rejected');
select throws_ok($$select public.save_billing_group_atomic(pg_temp.fixture_id(5,90),pg_temp.fixture_id(4,1),'x',array[null]::uuid[],8,'{}',false,false,false)$$,'22023','billing_group_invalid_input','null array entry rejected');
select throws_ok($$select public.save_billing_group_atomic(pg_temp.fixture_id(5,90),pg_temp.fixture_id(4,1),'x',array[[pg_temp.fixture_id(3,1)]],8,'{}',false,false,false)$$,'22023','billing_group_invalid_input','multidimensional array rejected');
select throws_ok($$select public.save_billing_group_atomic(pg_temp.fixture_id(5,90),pg_temp.fixture_id(4,1),'x','{}',8,null,false,false,false)$$,'22023','billing_group_invalid_input','null versions rejected');
select throws_ok($$select pg_temp.save(90,1,'x',array[1,1],8)$$,'22023','billing_group_invalid_input','duplicate event rejected');
select throws_ok($$select pg_temp.save(90,1,'x',array[]::integer[],null)$$,'22023','billing_group_invalid_input','null revision rejected');
select throws_ok($$select pg_temp.save(90,1,'x',array[]::integer[],-1)$$,'22023','billing_group_invalid_input','negative revision rejected');
select throws_ok($$select pg_temp.save(90,1,' ',array[]::integer[],8)$$,'22023','billing_group_invalid_input','blank name rejected');
select throws_ok($$select pg_temp.save(90,1,null,array[]::integer[],8)$$,'22023','billing_group_invalid_input','null name rejected');
select throws_ok($$select pg_temp.save(90,1,repeat('x',121),array[]::integer[],8)$$,'22023','billing_group_invalid_input','long name rejected');
select throws_ok($$select pg_temp.save(90,1,'x',array[]::integer[],8,'[]')$$,'22023','billing_group_invalid_input','versions must be an object');
select throws_ok($$select pg_temp.save(90,1,'x',array[]::integer[],8,null,null)$$,'22023','billing_group_invalid_input','null confirmation rejected');
select throws_ok($$select pg_temp.save(90,1,'x',array[]::integer[],8,null,false,null)$$,'22023','billing_group_invalid_input','null move confirmation rejected');
select throws_ok($$select pg_temp.save(90,1,'x',array[]::integer[],8,null,false,false,null)$$,'22023','billing_group_invalid_input','null delete flag rejected');
select is((select revision from public.billing_group_state),8,'invalid requests do not mutate revision');

reset role;
select is((select jsonb_agg(to_jsonb(e) order by id) from public.events e),(select events from baseline),'all original event fields including versions/project/job unchanged');
select is((select jsonb_agg(to_jsonb(p) order by id) from public.projects p),(select projects from baseline),'projects unchanged');
select is((select jsonb_agg(to_jsonb(a) order by id) from public.event_assignments a),(select assignments from baseline),'assignments unchanged');
select is((select jsonb_agg(to_jsonb(t) order by id) from public.timelogs t),(select timelogs from baseline),'timelogs unchanged');
select is((select jsonb_agg(to_jsonb(d) order by id) from public.timelog_days d),(select days from baseline),'hours unchanged');
select is((select jsonb_agg(to_jsonb(i) order by id) from public.invoices i),(select invoices from baseline),'invoices unchanged');
select * from finish();
rollback;
