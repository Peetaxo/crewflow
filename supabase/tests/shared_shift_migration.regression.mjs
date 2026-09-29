// Rollback-only migration rehearsal in the fixed disposable local database.
// Never accepts a URL, linked project, database name or production data input.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const insideTransaction = (sql) => sql.replace(/^(begin|commit);\s*$/gim, '');
const reset = insideTransaction(read('shared-shift-rounds.reset-local.sql'));
const foundation = insideTransaction(read('../migrations/20260923092136_shared_shift_workflows.sql'));
const lifecycle = insideTransaction(read('../migrations/20260923100014_shared_shift_round_lifecycle.sql'));
const tables = ['events', 'projects', 'event_assignments', 'timelogs', 'timelog_days', 'timelog_approvals',
  'invoices', 'invoice_timelogs', 'invoice_receipts', 'receipts', 'billing_groups', 'billing_group_members', 'billing_group_state', 'billing_group_requests'];
const sql = `
begin;
set local statement_timeout='20s';
${reset}
-- All new tables are verified empty by the reset helper. No CASCADE or data
-- deletion is used; the whole rehearsal, including DDL, rolls back on exit.
drop function public.read_shift_workflows(), public.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean),
 private.read_shift_workflows(), private.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean);
drop table public.shift_workflow_round_actions, public.shift_workflow_round_items, public.shift_workflow_rounds,
 public.shift_workflow_events, public.shift_workflow_requests, public.shift_workflow_state, public.shift_workflows;
create function pg_temp.sid(n integer) returns uuid language sql immutable as $$
 select ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
insert into auth.users(id) select pg_temp.sid(n) from generate_series(1,3) n;
delete from public.user_roles where user_id in(select pg_temp.sid(n) from generate_series(1,3) n);
delete from public.profiles where user_id in(select pg_temp.sid(n) from generate_series(1,3) n);
insert into public.profiles(id,user_id,first_name,last_name)
 select pg_temp.sid(n+10),pg_temp.sid(n),'Migration fixture',n::text from generate_series(1,3) n;
insert into public.user_roles(user_id,role) values(pg_temp.sid(1),'crewhead'),(pg_temp.sid(2),'crew'),(pg_temp.sid(3),'crew');
insert into public.events(id,name,job_number)
 select pg_temp.sid(n),'Preserved migration event '||n,case when n=101 then 'JOB-A' else 'JOB-B' end from generate_series(101,107) n;
insert into public.event_assignments(event_id,profile_id)
 select pg_temp.sid(n),pg_temp.sid(12) from generate_series(101,107) n;
insert into public.event_assignments(event_id,profile_id) values(pg_temp.sid(101),pg_temp.sid(13));
insert into public.timelogs(id,event_id,contractor_id,status,km,note)
 select pg_temp.sid(n+200),pg_temp.sid(n+100),pg_temp.sid(12),
  (array['draft','pending_ch','pending_coo','approved','invoiced','paid','approved'])[n]::public.timelog_status,
  n*3.5,'Preserve note '||n from generate_series(1,7) n;
insert into public.timelog_days(id,timelog_id,date,time_from,time_to,day_type,note,meal,meals)
 select pg_temp.sid(n+300),pg_temp.sid(n+200),'2099-10-01','08:00','16:00','pripravy','Preserve day','obed',array['obed'] from generate_series(1,7) n;
set local request.jwt.claim.sub='95000000-0000-4000-8000-000000000001';
set local app.billing_group_write='atomic';
insert into public.billing_groups(id,name) values(pg_temp.sid(400),'Legacy unrelated events');
insert into public.billing_group_members(event_id,group_id) values(pg_temp.sid(101),pg_temp.sid(400)),(pg_temp.sid(102),pg_temp.sid(400));
set local app.billing_group_write='';
insert into public.invoices(id,event_id,contractor_id,job_number,total_hours,total_amount) values
 (pg_temp.sid(501),pg_temp.sid(105),pg_temp.sid(12),'JOB-B',8,2500),
 (pg_temp.sid(502),null,pg_temp.sid(12),'MULTI',16,5000);
insert into public.invoice_timelogs(invoice_id,timelog_id) values
 (pg_temp.sid(501),pg_temp.sid(205)),(pg_temp.sid(502),pg_temp.sid(206)),(pg_temp.sid(502),pg_temp.sid(207));
insert into public.receipts(id,contractor_id,event_id,job_number,name,supplier,amount,paid_at,note,status)
 values(pg_temp.sid(601),pg_temp.sid(12),pg_temp.sid(101),'JOB-A','Preserved receipt','Fixture Supplier',123.45,'2099-10-01','Preserve approved receipt','approved'),
 (pg_temp.sid(602),pg_temp.sid(12),pg_temp.sid(105),'JOB-B','Attached receipt','Fixture Supplier',55.50,'2099-10-01','Preserve attached receipt','attached');
insert into public.invoice_receipts(invoice_id,receipt_id) values(pg_temp.sid(501),pg_temp.sid(602));
create temporary table before_migration(table_name text primary key, rows jsonb) on commit drop;
${tables.map((table) => `insert into before_migration select '${table}',coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t;`).join('\n')}
${foundation}
${lifecycle}
${tables.map((table) => `select pg_temp.assert((select rows from before_migration where table_name='${table}')=(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t),'${table} changed during migration');`).join('\n')}
select pg_temp.assert(not exists(select 1 from public.shift_workflows) and not exists(select 1 from public.shift_workflow_rounds),'legacy groups must not be converted');
-- The targeted-approval baseline intentionally retains the old trigger function
-- unattached. Assert the actual execution boundary, not deletion of unused code.
select pg_temp.assert(not exists(select 1 from pg_trigger where tgname='trg_timelog_approved' or tgfoid=to_regprocedure('public.handle_timelog_approved()')),'no automatic invoice trigger');
rollback;
`;
const result = spawnSync('docker', ['--context', 'colima', 'exec', '-i', '-e', 'PGOPTIONS=-c supautils.hint_roles=',
  'crewflow-event-form-db', 'psql', '-U', 'postgres', '-d', 'crewflow_shared_shift_tests', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-o', '/dev/null'],
{ input: sql, encoding: 'utf8', timeout: 60000 });
if (result.status !== 0) throw new Error(`Migration rehearsal failed (${result.status}): ${result.stderr}`);
console.log(`PASS: both migrations preserve all ${tables.length} pre-existing business-table snapshots, mixed historical statuses, assignments, days, invoices, attached/approved receipts and billing groups; no automatic conversion/invoice; all fixture and schema changes rolled back.`);
