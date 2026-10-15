-- Local-only rollback fixtures. pg_net cannot send these requests before COMMIT.
-- Use the reviewed single admin connection with session_preload_libraries=''.
\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_function('private','dispatch_invoice_billing_jobs',array[]::text[],'private conditional worker dispatcher exists');
select has_table('private','invoice_worker_dispatch_control','explicit private dispatch fence exists');
select to_regprocedure('private.dispatch_invoice_billing_jobs()') is not null as installed \gset
\if :installed
select is((select enabled from private.invoice_worker_dispatch_control where id=1),false,'installing the migration leaves dispatch disabled');
select ok((select relrowsecurity from pg_class where oid='private.invoice_worker_dispatch_control'::regclass),'private control has RLS defense in depth');
select ok(not has_table_privilege('anon','private.invoice_worker_dispatch_control','select,insert,update,delete') and not has_table_privilege('authenticated','private.invoice_worker_dispatch_control','select,insert,update,delete'),'browser roles cannot read or change dispatch control');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in('private.dispatch_invoice_billing_jobs()'::regprocedure,'private.notify_invoice_billing_jobs()'::regprocedure)),'dispatcher and trigger have pinned empty search paths');
set local role anon;
select throws_ok('select private.dispatch_invoice_billing_jobs()','42501',null::text,'anon cannot dispatch worker');
reset role;
set local role authenticated;
select throws_ok('select private.dispatch_invoice_billing_jobs()','42501',null::text,'authenticated cannot dispatch worker');
select throws_ok('select private.notify_invoice_billing_jobs()','42501',null::text,'authenticated cannot call trigger helper');
reset role;

-- Do not consume or change committed fixtures. All timer changes roll back.
update private.invoice_billing_jobs set available_at='infinity',locked_until='infinity' where status in('queued','running');
create function pg_temp.did(n integer) returns uuid language sql immutable as $$select ('96000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.requests() returns bigint language sql as $$select count(*) from net.http_request_queue where url='https://invoice-dispatch.invalid/worker'$$;
insert into auth.users(id,email) values(pg_temp.did(1),'DISPOSABLE-dispatch@crewflow-demo.test');
delete from public.user_roles where user_id=pg_temp.did(1);
delete from public.profiles where user_id=pg_temp.did(1);
insert into public.profiles(id,user_id,first_name,last_name) values(pg_temp.did(2),pg_temp.did(1),'DISPOSABLE','dispatch');
insert into public.user_roles(user_id,role) values(pg_temp.did(1),'crew');
insert into public.invoice_billing_statements(id,contractor_id,contractor_user_id,status,capture_kind,financial_snapshot,supplier_snapshot,customer_snapshot,total_amount,approved_at)
select pg_temp.did(n),pg_temp.did(2),pg_temp.did(1),'ready','selection','{}','{}','{}',1,clock_timestamp() from generate_series(10,19)n;
insert into public.invoices(id,contractor_id,invoice_number,total_amount,billing_statement_id)
select pg_temp.did(n+100),pg_temp.did(2),'DISPOSABLE-dispatch-'||n,1,pg_temp.did(n) from generate_series(10,19)n;
update public.invoice_billing_statements set status='issued',invoice_id=pg_temp.did(right(id::text,12)::integer+100) where contractor_id=pg_temp.did(2);
-- Temporarily hide existing names, without reading or changing any secret value.
update vault.secrets set name=name||'-dispatch-rollback' where name in('invoice_pdf_worker_url','invoice_pdf_worker_secret');
select vault.create_secret('https://invoice-dispatch.invalid/worker','invoice_pdf_worker_url');
select vault.create_secret('rollback-only-not-a-real-worker-credential','invoice_pdf_worker_secret');

-- Keep pgTAP's result bookkeeping in the outer transaction. Reset only marked
-- test rows and the private notification marker between independent cases.
create function pg_temp.clear_dispatch_case() returns void language plpgsql as $$
begin
 update private.invoice_worker_dispatch_control set enabled=false where id=1;
 delete from private.invoice_billing_jobs where statement_id in(select id from public.invoice_billing_statements where contractor_id=pg_temp.did(2));
 delete from net.http_request_queue where url='https://invoice-dispatch.invalid/worker';
 update private.invoice_worker_dispatch_control set enabled=true,last_dispatch_transaction=null,last_request_id=null where id=1;
end$$;

insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110));
select is(pg_temp.requests(),0::bigint,'disabled due insert cannot enqueue a request');
select is(private.dispatch_invoice_billing_jobs(),null::bigint,'disabled fallback cannot enqueue a request');
\ir ../functions/process-invoice-pdfs/schedule.sql
select is((select enabled from private.invoice_worker_dispatch_control where id=1),false,'installing hourly Cron cannot activate existing due jobs');
select is(pg_temp.requests(),0::bigint,'schedule setup sends no HTTP request while disabled');
\ir ../functions/process-invoice-pdfs/teardown-schedule.sql
delete from private.invoice_billing_jobs where id=pg_temp.did(210);
\ir ../functions/process-invoice-pdfs/activate-dispatch.sql
select is((select enabled from private.invoice_worker_dispatch_control where id=1),true,'activation deliberately enables event dispatch');
select is(pg_temp.requests(),0::bigint,'activation and fallback leave an idle queue quiet');
select is(private.dispatch_invoice_billing_jobs(),null::bigint,'idle check does not suppress a later event in the same transaction');

insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110));
select is(pg_temp.requests(),1::bigint,'due persisted insert enqueues one asynchronous HTTP wake');
select ok((select method='POST' and convert_from(body,'UTF8')::jsonb='{}'::jsonb and timeout_milliseconds=10000 from net.http_request_queue where url='https://invoice-dispatch.invalid/worker'),'real pg_net request uses the protected worker POST contract');
select is((select count(*) from net._http_response r join net.http_request_queue q on q.id=r.id where q.url='https://invoice-dispatch.invalid/worker'),0::bigint,'uncommitted pg_net request has not run an HTTP worker');
insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(211),'pdf',pg_temp.did(11),pg_temp.did(111));
select is(pg_temp.requests(),1::bigint,'multiple events in one transaction coalesce after a successful enqueue');
select pg_temp.clear_dispatch_case();
create function pg_temp.rollback_dispatch_event() returns void language plpgsql as $$begin
 insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110));
 raise exception 'deliberate business rollback';
end$$;
select throws_ok('select pg_temp.rollback_dispatch_event()','P0001','deliberate business rollback','business failure rolls back its durable job and notification together');
select is(pg_temp.requests(),0::bigint,'rolling back persisted work also removes its queued HTTP notification');
select ok(not exists(select 1 from private.invoice_billing_jobs where id=pg_temp.did(210)),'rolled-back event leaves no durable job');

insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id,available_at) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110),clock_timestamp()+interval '1 hour');
select is(pg_temp.requests(),0::bigint,'future backoff insert does not wake worker');
select is(private.dispatch_invoice_billing_jobs(),null::bigint,'hourly helper does not wake for future backoff alone');
update private.invoice_billing_jobs set status='running',locked_until=clock_timestamp()+interval '5 minutes' where id=pg_temp.did(210);
select is(pg_temp.requests(),0::bigint,'claims do not recursively wake worker');
update private.invoice_billing_jobs set status='queued',locked_until=null where id=pg_temp.did(210);
select is(pg_temp.requests(),0::bigint,'failed release to future backoff does not loop');
select pg_temp.clear_dispatch_case();

insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id,status,attempts,failure_code,last_error) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110),'failed',8,'retry_budget_exhausted','DISPOSABLE failure');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.did(1),'role','authenticated')::text,true);
select lives_ok($$select public.retry_invoice_billing_job(pg_temp.did(310),pg_temp.did(10),pg_temp.did(210),(select updated_at from public.invoice_billing_statements where id=pg_temp.did(10)),(public.get_invoice_billing_snapshot()->'jobs'->0->>'updated_at')::timestamptz)$$,'actual owner retry remains authorized');
reset role;
select is(pg_temp.requests(),1::bigint,'explicit owner retry wakes due work');
select is((select attempts from private.invoice_billing_jobs where id=pg_temp.did(210)),0,'explicit recovery retains the existing retry budget behavior');
select pg_temp.clear_dispatch_case();

update private.invoice_worker_dispatch_control set enabled=false where id=1;
insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id,status,attempts,available_at,failure_code,last_error) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110),'queued',1,clock_timestamp()-interval '1 minute','transient_failure','DISPOSABLE failure');
update private.invoice_worker_dispatch_control set enabled=true where id=1;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.did(1),'role','authenticated')::text,true);
select lives_ok($$select public.retry_invoice_billing_job(pg_temp.did(311),pg_temp.did(10),pg_temp.did(210),(select updated_at from public.invoice_billing_statements where id=pg_temp.did(10)),(public.get_invoice_billing_snapshot()->'jobs'->0->>'updated_at')::timestamptz)$$,'owner can explicitly retry an already-due transient job');
reset role;
select is(pg_temp.requests(),1::bigint,'explicit retry wakes even when its previous backoff is already due');
select is((select attempts from private.invoice_billing_jobs where id=pg_temp.did(210)),1,'retrying transient backoff retains the current delivery budget');
select pg_temp.clear_dispatch_case();

-- Stage due work behind the explicit fence to simulate a missed notification.
update private.invoice_worker_dispatch_control set enabled=false where id=1;
insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id,status,attempts,lease_token,locked_until) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110),'running',1,pg_temp.did(410),clock_timestamp()+interval '5 minutes');
insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(211),'pdf',pg_temp.did(11),pg_temp.did(111));
update private.invoice_worker_dispatch_control set enabled=true where id=1;
insert into storage.objects(bucket_id,name,metadata) values('invoice-pdfs','invoices/'||pg_temp.did(110)||'.pdf','{"mimetype":"application/pdf"}');
select lives_ok($$select private.complete_invoice_billing_job(pg_temp.did(210),pg_temp.did(410),'invoices/'||pg_temp.did(110)||'.pdf',null)$$,'actual PDF completion succeeds');
select is(pg_temp.requests(),1::bigint,'completion promptly continues other queued work');
update private.invoice_worker_dispatch_control set last_dispatch_transaction=null where id=1;
update private.invoice_billing_jobs set last_error='metadata only' where id=pg_temp.did(210);
select is(pg_temp.requests(),1::bigint,'terminal metadata creates no extra wake');
select pg_temp.clear_dispatch_case();

update private.invoice_worker_dispatch_control set enabled=false where id=1;
insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id,status,attempts,lease_token,locked_until) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110),'running',1,pg_temp.did(410),clock_timestamp()+interval '5 minutes');
insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(211),'pdf',pg_temp.did(11),pg_temp.did(111));
update private.invoice_worker_dispatch_control set enabled=true where id=1;
select lives_ok($$select private.complete_invoice_billing_job(pg_temp.did(210),pg_temp.did(410),null,'DISPOSABLE render failure')$$,'actual worker failure releases the lease');
select is(pg_temp.requests(),1::bigint,'failed release continues other queued work promptly');
select ok((select status='queued' and available_at>clock_timestamp() and attempts=1 from private.invoice_billing_jobs where id=pg_temp.did(210)),'failed job retains finite future backoff without an immediate retry');
select pg_temp.clear_dispatch_case();

insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id,status,attempts,locked_until,available_at) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110),'running',7,clock_timestamp()-interval '1 second','infinity');
select is(pg_temp.requests(),0::bigint,'running inserts do not send claim notifications');
select ok(private.dispatch_invoice_billing_jobs() is not null,'hourly helper recovers an expired lease even with future available_at');
select is(pg_temp.requests(),1::bigint,'expired lease fallback enqueues once');
select pg_temp.clear_dispatch_case();

insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id,status,attempts,locked_until) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110),'running',8,clock_timestamp()-interval '1 second');
select ok(private.dispatch_invoice_billing_jobs() is not null,'expired eighth attempt receives one housekeeping wake');
select is((private.claim_invoice_billing_jobs(1)->'jobs'), '[]'::jsonb,'existing claim function retires the exhausted lease without a ninth attempt');
select is((select status from private.invoice_billing_jobs where id=pg_temp.did(210)),'failed','exhausted lease becomes reviewable terminal failure');
select is(pg_temp.requests(),1::bigint,'housekeeping transition does not create a wake storm');
update private.invoice_worker_dispatch_control set last_dispatch_transaction=null where id=1;
select is(private.dispatch_invoice_billing_jobs(),null::bigint,'terminal exhausted jobs leave fallback idle');
select pg_temp.clear_dispatch_case();

update vault.secrets set name='invoice_pdf_worker_url-missing' where name='invoice_pdf_worker_url';
select lives_ok($$insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110))$$,'missing config cannot undo durable business work');
select is((select status from private.invoice_billing_jobs where id=pg_temp.did(210)),'queued','missing config preserves queued work');
select is(pg_temp.requests(),0::bigint,'missing config enqueues nothing');
update vault.secrets set name='invoice_pdf_worker_url' where name='invoice_pdf_worker_url-missing';
select ok(private.dispatch_invoice_billing_jobs() is not null,'repaired configuration can recover work in the same transaction');
select pg_temp.clear_dispatch_case();

create function pg_temp.reject_dispatch_http() returns trigger language plpgsql as $$begin raise exception 'deliberate rollback-only enqueue failure';end$$;
create trigger invoice_dispatch_rollback_failure before insert on net.http_request_queue for each row when(new.url='https://invoice-dispatch.invalid/worker') execute function pg_temp.reject_dispatch_http();
select lives_ok($$insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110))$$,'real pg_net enqueue failure cannot undo durable business work');
select is((select status from private.invoice_billing_jobs where id=pg_temp.did(210)),'queued','enqueue failure preserves durable job');
select is(pg_temp.requests(),0::bigint,'failed enqueue leaves no partial HTTP request');
drop trigger invoice_dispatch_rollback_failure on net.http_request_queue;
select ok(private.dispatch_invoice_billing_jobs() is not null,'successful recovery is not suppressed by a failed enqueue');
select pg_temp.clear_dispatch_case();

\ir ../functions/process-invoice-pdfs/schedule.sql
select is((select schedule from cron.job where jobname='crewflow-invoice-pdfs'),'0 * * * *','actual named safety schedule runs hourly');
select is((select count(*) from cron.job where jobname='crewflow-invoice-pdfs'),1::bigint,'named setup creates exactly one schedule');
\ir ../functions/process-invoice-pdfs/schedule.sql
select is((select count(*) from cron.job where jobname='crewflow-invoice-pdfs'),1::bigint,'reapplying setup updates the same named schedule');
create function pg_temp.run_invoice_schedule() returns void language plpgsql as $$declare command text;begin select j.command into strict command from cron.job j where jobname='crewflow-invoice-pdfs';execute command;end$$;
select lives_ok('select pg_temp.run_invoice_schedule()','actual registered hourly command executes');
select is(pg_temp.requests(),0::bigint,'registered hourly command sends no request for idle queue');
insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id,status,locked_until) values(pg_temp.did(210),'pdf',pg_temp.did(10),pg_temp.did(110),'running',clock_timestamp()-interval '1 second');
select lives_ok('select pg_temp.run_invoice_schedule()','actual registered hourly command can recover an expired lease');
select is(pg_temp.requests(),1::bigint,'registered hourly fallback enqueues eligible work');
\ir ../functions/process-invoice-pdfs/teardown-schedule.sql
select is((select enabled from private.invoice_worker_dispatch_control where id=1),false,'maintenance teardown disables the event fence');
select is((select count(*) from cron.job where jobname='crewflow-invoice-pdfs'),0::bigint,'maintenance teardown removes hourly fallback');
insert into private.invoice_billing_jobs(id,kind,statement_id,invoice_id) values(pg_temp.did(211),'pdf',pg_temp.did(11),pg_temp.did(111));
select is(pg_temp.requests(),1::bigint,'teardown blocks new events while retaining already enqueued requests');
select is((select count(*) from private.invoice_billing_jobs where id in(pg_temp.did(210),pg_temp.did(211))),2::bigint,'teardown retains durable jobs');
select is((select count(*) from vault.secrets where name in('invoice_pdf_worker_url','invoice_pdf_worker_secret')),2::bigint,'teardown retains both credential entries without reading values');
\ir ../functions/process-invoice-pdfs/teardown-schedule.sql
select is((select count(*) from cron.job where jobname='crewflow-invoice-pdfs'),0::bigint,'teardown is safe to repeat');
\endif
select * from finish();
rollback;
