-- Integration proof against the schema-only local database. Never use real accounts.
-- Run with psql -X -v ON_ERROR_STOP=1; all synthetic fixtures roll back.
--
-- Two-session race regression for the schedule-only migration (run separately
-- before the targeted approval migration in a disposable local database).
-- After targeted approval is installed, direct CH -> COO updates are forbidden;
-- use targeted-event-approval.sql for guarded day/receipt invariants and
-- targeted_event_approval.concurrency.mjs for the handoff/delete lock proof.
-- 1. As its owner, create only these synthetic fixtures and COMMIT:
--    BEGIN;
--    INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000101');
--    INSERT INTO public.profiles(id,user_id) VALUES
--      ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000101');
--    INSERT INTO public.user_roles(user_id,role) VALUES
--      ('00000000-0000-4000-8000-000000000101','crewhead');
--    INSERT INTO public.events(id,name) VALUES
--      ('00000000-0000-4000-8000-000000000301','Synthetic concurrency only');
--    INSERT INTO public.timelogs(id,event_id,contractor_id,status) VALUES
--      ('00000000-0000-4000-8000-000000000401','00000000-0000-4000-8000-000000000301',
--       '00000000-0000-4000-8000-000000000201','pending_ch');
--    INSERT INTO public.timelog_days(id,timelog_id,date,time_from,time_to,day_type) VALUES
--      ('00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000401',
--       '2099-01-01','8:00','17:00','provoz');
--    COMMIT;
-- 2. Session A: BEGIN; SET LOCAL ROLE authenticated;
--    SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
--    UPDATE public.timelogs SET status='pending_coo'
--      WHERE id='00000000-0000-4000-8000-000000000401';
--    Leave A open (it now holds the parent row lock).
-- 3. Session B: BEGIN; SET LOCAL ROLE authenticated;
--    SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
--    UPDATE public.timelog_days SET time_to='18:00'
--      WHERE id='00000000-0000-4000-8000-000000000501';
--    B must block. An owner session can verify pg_stat_activity reports
--    wait_event_type='Lock', wait_event='transactionid' for this UPDATE.
-- 4. COMMIT A. B must raise timelog_mutation_not_found (42501), then ROLLBACK B.
--    Assert the final join remains pending_coo / 8:00 / 17:00:
--    SELECT t.status,d.time_from,d.time_to FROM public.timelogs t
--    JOIN public.timelog_days d ON d.timelog_id=t.id
--    WHERE t.id='00000000-0000-4000-8000-000000000401';
--    Without the before-day guard B commits 18:00: completeness alone is insufficient.
--    Stop/discard the disposable database after this separate committed-fixture test.
-- Lock-order caveat: a direct external child UPDATE locks its day row before the
-- parent-lock trigger runs, so it can deadlock with a parent-first atomic RPC.
-- PostgreSQL aborts one transaction with 40P01; retry that entire transaction.
-- The application writes days through the parent-first RPCs, not direct UPDATEs.
begin;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000102');
insert into public.profiles (id, user_id, first_name) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Synthetic CH'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'Synthetic Crew');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000000101', 'crewhead'),
  ('00000000-0000-4000-8000-000000000102', 'crew');
insert into public.events (id, name, date_from, date_to) values
  ('00000000-0000-4000-8000-000000000301', 'Synthetic blank schedule', '2099-01-01', '2099-01-02'),
  ('00000000-0000-4000-8000-000000000302', 'Synthetic validation', '2099-01-01', '2099-01-02'),
  ('00000000-0000-4000-8000-000000000303', 'Synthetic actuals', '2099-01-01', '2099-01-02');

create temp table financial_before as
select 'invoices' as kind, coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]') as rows from public.invoices i
union all
select 'receipts', coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from public.receipts r;

create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Assertion failed: %', message; end if;
end;
$$;

-- Every deferred per-day completeness assertion filters this foreign key.
select pg_temp.check_true(exists (
  select 1 from pg_catalog.pg_index i
  where i.indexrelid = pg_catalog.to_regclass('public.timelog_days_timelog_id_idx')
    and i.indisvalid and i.indisready
    and pg_catalog.pg_get_indexdef(i.indexrelid) =
      'CREATE INDEX timelog_days_timelog_id_idx ON public.timelog_days USING btree (timelog_id)'
), 'timelog_days.timelog_id must have a valid ready B-tree index');

-- Every negative test rolls back only its statement and deferred trigger queue.
-- Unexpected error codes/messages are rethrown, never treated as a passing test.
create function pg_temp.expect_error(statement text, code text, message text default null)
returns void language plpgsql as $$
begin
  begin
    execute statement;
    set constraints all immediate;
  exception when others then
    if sqlstate <> code or (message is not null and sqlerrm <> message) then raise; end if;
    return;
  end;
  raise exception 'Expected SQLSTATE % for %', code, statement;
end;
$$;

create function pg_temp.save_days(days jsonb, target public.timelog_status default 'draft')
returns jsonb language plpgsql as $$
declare t public.timelogs%rowtype;
begin
  select * into strict t from public.timelogs
  where event_id = '00000000-0000-4000-8000-000000000301';
  return public.save_timelog_atomic(t.id, t.event_id, t.contractor_id, t.updated_at,
    t.status, 7, 'Synthetic note', target, days);
end;
$$;

create function pg_temp.expect_save_error_no_mutation(days jsonb, target public.timelog_status, message text)
returns void language plpgsql as $$
declare before_parent jsonb; before_days jsonb; after_parent jsonb; after_days jsonb;
begin
  select to_jsonb(t), (select jsonb_agg(to_jsonb(d) order by d.id)
    from public.timelog_days d where d.timelog_id = t.id)
  into strict before_parent, before_days from public.timelogs t
  where t.event_id = '00000000-0000-4000-8000-000000000301';
  perform pg_temp.expect_error(format('select pg_temp.save_days(%L::jsonb, %L)', days, target), '22023', message);
  select to_jsonb(t), (select jsonb_agg(to_jsonb(d) order by d.id)
    from public.timelog_days d where d.timelog_id = t.id)
  into strict after_parent, after_days from public.timelogs t
  where t.event_id = '00000000-0000-4000-8000-000000000301';
  perform pg_temp.check_true(before_parent = after_parent and before_days = after_days,
    'invalid save must leave the entire parent and day payload unchanged');
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

-- RED on the old audited RPC: crew_assignment_invalid_days (22023).
select public.assign_event_crew(
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000202', null,
  '[{"date":"2099-01-01","day_type":"provoz","time_from":"","time_to":null}]'
);

do $$
begin
  if not exists (
    select 1 from public.timelogs t join public.timelog_days d on d.timelog_id = t.id
    where t.event_id = '00000000-0000-4000-8000-000000000301'
      and t.status = 'draft' and d.time_from = '' and d.time_to is null
  ) then
    raise exception 'blank assignment must persist a draft without invented actuals';
  end if;
end;
$$;

-- Existing filled actuals are not overwritten by an idempotent assignment.
select public.assign_event_crew('00000000-0000-4000-8000-000000000303',
  '00000000-0000-4000-8000-000000000202', null,
  '[{"date":"2099-01-01","day_type":"pripravy","time_from":"8:00","time_to":"17:00","note":"Actual"}]');
select public.assign_event_crew('00000000-0000-4000-8000-000000000303',
  '00000000-0000-4000-8000-000000000202', null,
  '[{"date":"2099-01-01","day_type":"provoz","time_from":"","time_to":""}]');
select pg_temp.check_true(exists (
  select 1 from public.timelogs t join public.timelog_days d on d.timelog_id = t.id
  where t.event_id = '00000000-0000-4000-8000-000000000303'
    and d.time_from = '8:00' and d.time_to = '17:00' and d.note = 'Actual'
), 'filled actuals unchanged');

select pg_temp.check_true((select schedule_version = 1 and free_days = '{}'::date[]
  from public.events where id = '00000000-0000-4000-8000-000000000301'), 'legacy version default');
update public.events set schedule_version = 2, free_days = array['2099-01-02'::date]
where id = '00000000-0000-4000-8000-000000000301';
select pg_temp.expect_error($q$update public.events set schedule_version = 3
  where id = '00000000-0000-4000-8000-000000000301'$q$, '23514');

select pg_temp.expect_error($q$select public.assign_event_crew(
  '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', null,
  '[{"date":"2099-01-01","day_type":"provoz","time_from":"24:00","time_to":""}]')$q$,
  '22023', 'crew_assignment_invalid_days');
select pg_temp.expect_error($q$select public.assign_event_crew(
  '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', null,
  '[{"date":"2099-01-01","time_from":"","time_to":""}]')$q$,
  '22023', 'crew_assignment_invalid_days');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
select pg_temp.expect_error($q$select public.assign_event_crew(
  '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', null,
  '[{"date":"2099-01-01","day_type":"provoz"}]')$q$, '42501', 'crew_lifecycle_unauthorized');
select pg_temp.expect_error($q$select public.save_timelog_atomic(null,
  '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201',
  null, null, 0, '', 'draft', '[{"date":"2099-01-01","day_type":"provoz","time_from":"","time_to":""}]')$q$,
  '42501');

select pg_temp.save_days('[{"date":"2099-01-01","day_type":"pripravy","time_from":"","time_to":null},
  {"date":"2099-01-02","day_type":"instal","time_from":"8:00","time_to":""}]');
select pg_temp.check_true((select count(*) = 2 from public.timelog_days d join public.timelogs t on t.id = d.timelog_id
  where t.event_id = '00000000-0000-4000-8000-000000000301'
    and ((d.time_from = '' and d.time_to is null) or (d.time_from = '8:00' and d.time_to = ''))),
  'blank and partial draft reload preserves original strings');

-- BEGIN empty strict regression
do $$
declare target public.timelog_status;
begin
  foreach target in array array['pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid']::public.timelog_status[] loop
    perform pg_temp.expect_save_error_no_mutation('[]', target, 'timelog_incomplete');
  end loop;
end;
$$;
-- END empty strict regression

-- BEGIN malformed strict regression
do $$
declare target public.timelog_status;
begin
  foreach target in array array['pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid']::public.timelog_status[] loop
    perform pg_temp.expect_save_error_no_mutation(
      '[{"date":"2099-01-01","day_type":"provoz","time_from":"24:00","time_to":"08:00"}]',
      target, 'timelog_incomplete');
    perform pg_temp.expect_save_error_no_mutation(
      '[{"date":"2099-01-01","day_type":"provoz","time_from":"08:00","time_to":"08:00:00"}]',
      target, 'timelog_incomplete');
    perform pg_temp.expect_save_error_no_mutation(
      '[{"date":"2099-01-01","day_type":"provoz","time_to":"08:00"}]', target, 'timelog_incomplete');
    perform pg_temp.expect_save_error_no_mutation(
      '[{"date":"2099-01-01","day_type":"provoz","time_from":"8:00","time_to":"08:00"}]',
      target, 'timelog_incomplete');
  end loop;
end;
$$;
-- END malformed strict regression

-- Structural errors keep their generic token even for review/financial targets.
select pg_temp.expect_save_error_no_mutation('{}', 'pending_ch', 'timelog_mutation_invalid');
select pg_temp.expect_save_error_no_mutation('[null]', 'pending_ch', 'timelog_mutation_invalid');
select pg_temp.expect_save_error_no_mutation(
  '[{"date":"2099-99-99","day_type":"provoz","time_from":"24:00"}]', 'pending_ch', 'timelog_mutation_invalid');
select pg_temp.expect_save_error_no_mutation(
  '[{"date":"2099-01-01","time_from":"24:00"}]', 'pending_ch', 'timelog_mutation_invalid');
select pg_temp.expect_save_error_no_mutation('[]', 'draft', 'timelog_mutation_invalid');
select pg_temp.expect_save_error_no_mutation(
  '[{"date":"2099-01-01","day_type":"provoz","time_from":"24:00"}]', 'draft', 'timelog_mutation_invalid');

select pg_temp.expect_error($q$select pg_temp.save_days(
  '[{"date":"2099-01-01","day_type":"provoz","time_from":"24:00","time_to":"08:00"}]')$q$,
  '22023', 'timelog_mutation_invalid');
select pg_temp.expect_error($q$select pg_temp.save_days(
  '[{"date":"2099-01-01","time_from":"08:00","time_to":"09:00"}]')$q$,
  '22023', 'timelog_mutation_invalid');
select pg_temp.expect_error($q$select pg_temp.save_days(
  '[{"date":"2099-01-01","day_type":"provoz","time_from":"8:00","time_to":"08:00"}]', 'pending_ch')$q$,
  '22023', 'timelog_incomplete');
select pg_temp.expect_error($q$select pg_temp.save_days(
  '[{"date":"2099-01-01","day_type":"provoz","time_from":"8:00","time_to":""}]', 'pending_ch')$q$,
  '22023', 'timelog_incomplete');
select pg_temp.expect_error($q$select public.save_timelog_atomic(t.id, t.event_id, t.contractor_id,
  t.updated_at - interval '1 second', t.status, 0, '', 'draft',
  '[{"date":"2099-01-01","day_type":"provoz","time_from":"","time_to":""}]')
  from public.timelogs t where event_id = '00000000-0000-4000-8000-000000000301'$q$,
  '40001', 'timelog_mutation_conflict');

-- Both direct REST-style updates and generic status RPCs must enforce completeness.
select pg_temp.expect_error($q$update public.timelogs set status = 'pending_ch'
  where event_id = '00000000-0000-4000-8000-000000000301'$q$, '22023', 'timelog_incomplete');
select pg_temp.expect_error($q$select public.transition_timelog_statuses_atomic(
  jsonb_build_array(jsonb_build_object('id', id, 'expected_updated_at', updated_at)), 'draft', 'pending_ch')
  from public.timelogs where event_id = '00000000-0000-4000-8000-000000000301'$q$,
  '22023', 'timelog_incomplete');

-- Relaxed states retain blanks; overnight actuals are complete, not negative duration.
select pg_temp.save_days('[{"date":"2099-01-01","day_type":"provoz","time_from":"","time_to":""}]', 'rejected');
select pg_temp.save_days('[{"date":"2099-01-01","day_type":"deinstal","time_from":null,"time_to":"6:00"}]', 'pending_crew_confirmation');
select pg_temp.save_days('[{"date":"2099-01-01","day_type":"provoz","time_from":"22:00","time_to":"6:00"}]', 'pending_ch');
set constraints all immediate;
set constraints all deferred;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select pg_temp.expect_error($q$insert into public.timelogs(event_id, contractor_id, status)
  values ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', 'pending_ch')$q$,
  '22023', 'timelog_incomplete');
select pg_temp.expect_error($q$update public.timelog_days set time_to = ''
  where timelog_id = (select id from public.timelogs where event_id = '00000000-0000-4000-8000-000000000301')$q$,
  '22023', 'timelog_incomplete');
select pg_temp.expect_error($q$update public.timelog_days set time_from = 'bad'
  where timelog_id = (select id from public.timelogs where event_id = '00000000-0000-4000-8000-000000000301')$q$,
  '22023', 'timelog_incomplete');
select pg_temp.expect_error($q$delete from public.timelog_days
  where timelog_id = (select id from public.timelogs where event_id = '00000000-0000-4000-8000-000000000301')$q$,
  '22023', 'timelog_incomplete');
select pg_temp.expect_error($q$update public.timelog_days set timelog_id =
  (select id from public.timelogs where event_id = '00000000-0000-4000-8000-000000000303')
  where timelog_id = (select id from public.timelogs where event_id = '00000000-0000-4000-8000-000000000301')$q$,
  '22023', 'timelog_incomplete');

-- An atomic delete/reinsert replacement is legal when final pending_ch days are complete.
select pg_temp.save_days('[{"date":"2099-01-01","day_type":"instal","time_from":"8:00","time_to":"17:00"},
  {"date":"2099-01-02","day_type":"deinstal","time_from":"17:00","time_to":"18:00"}]', 'pending_ch');
set constraints all immediate;
set constraints all deferred;

select pg_temp.check_true(public.is_valid_timelog_time('8:00') and public.is_valid_timelog_time('23:59')
  and not public.is_valid_timelog_time('24:00') and not public.is_valid_timelog_time('08:00:00')
  and not public.is_valid_timelog_time(null) and not public.is_valid_timelog_time(''), 'time grammar');
reset role;
do $$
declare strict_status text;
begin
  foreach strict_status in array array['pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid'] loop
    perform pg_temp.expect_error(format(
      'insert into public.timelogs(event_id, contractor_id, status) values (%L, %L, %L)',
      '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', strict_status),
      '22023', 'timelog_incomplete');
  end loop;
end;
$$;
select pg_temp.check_true(not has_function_privilege('anon', 'public.is_valid_timelog_time(text)', 'execute')
  and has_function_privilege('authenticated', 'public.is_valid_timelog_time(text)', 'execute'), 'validator ACL');
select pg_temp.check_true(not has_function_privilege('authenticated', 'private.assert_timelog_complete(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.assert_timelog_complete(uuid)', 'execute'), 'assertion is not an RPC');
select pg_temp.check_true((select rows from financial_before where kind = 'invoices') =
  (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]') from public.invoices i), 'invoices untouched');
select pg_temp.check_true((select rows from financial_before where kind = 'receipts') =
  (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from public.receipts r), 'receipts untouched');
set constraints all immediate;
select 'event schedule drafts: all integration assertions passed' as result;
rollback;
