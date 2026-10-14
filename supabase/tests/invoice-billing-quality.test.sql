\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.qid(n integer) returns uuid language sql immutable as $$select ('97000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.targets(n integer) returns jsonb language sql as $$select jsonb_build_array(jsonb_build_object('id',t.id,'expected_updated_at',t.updated_at,'approval_id',null,'approval_updated_at',null)) from public.timelogs t where t.id=pg_temp.qid(n)$$;
insert into auth.users(id,email) values(pg_temp.qid(1),'quality-owner@crewflow-demo.test'),(pg_temp.qid(2),'quality-coo@crewflow-demo.test'),(pg_temp.qid(3),'quality-ch@crewflow-demo.test');
delete from public.user_roles where user_id in(pg_temp.qid(1),pg_temp.qid(2),pg_temp.qid(3));
delete from public.profiles where user_id in(pg_temp.qid(1),pg_temp.qid(2),pg_temp.qid(3));
insert into public.profiles(id,user_id,first_name,last_name,ico,bank_account,billing_street,billing_zip,billing_city,hourly_rate) values(pg_temp.qid(11),pg_temp.qid(1),'Review','Owner','12345678','123/0800','Street','10000','Praha',250),(pg_temp.qid(12),pg_temp.qid(2),'Review','COO','12345678','123/0800','Street','10000','Praha',250),(pg_temp.qid(13),pg_temp.qid(3),'Review','CH','12345678','123/0800','Street','10000','Praha',250);
insert into public.user_roles(user_id,role) values(pg_temp.qid(1),'crew'),(pg_temp.qid(2),'coo'),(pg_temp.qid(3),'crewhead');
insert into public.clients(id,name,ico,street,zip,city,country) values(pg_temp.qid(50),'DISPOSABLE quality buyer','87654321','Buyer street','10000','Praha','CZ');
insert into public.projects(id,name,job_number,client_id) values(pg_temp.qid(51),'DISPOSABLE quality project','QUALITY',pg_temp.qid(50));
insert into public.events(id,name,project_id,job_number,date_from,date_to,meal_allowance_enabled) select pg_temp.qid(n),'DISPOSABLE quality event '||n,pg_temp.qid(51),'QUALITY-'||n,'2026-10-10','2026-10-10',false from generate_series(21,28)n;
insert into public.timelogs(id,event_id,contractor_id,status,km,updated_at) select pg_temp.qid(n+10),pg_temp.qid(n),pg_temp.qid(11),'pending_coo',0,'2000-01-01'::timestamptz from generate_series(21,28)n;
insert into public.timelog_days(timelog_id,date,time_from,time_to,day_type) select pg_temp.qid(n),'2026-10-10','08:00','16:00','provoz' from generate_series(31,38)n;
create temporary table saved(k text primary key,v jsonb);
grant all on saved to authenticated,service_role;

-- Final approvals create separate statements, and a stored owner preview request
-- remains safe to replay after explicit COO consolidation supersedes its parent.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(2),'role','authenticated')::text,true);
insert into saved select 'quote'||n,public.get_invoice_billing_quote(array[pg_temp.qid(n)]) from generate_series(31,38)n;
select public.resolve_timelog_approvals_atomic(pg_temp.targets(n),'approved','',((select v from saved where k='quote'||n)->>'id')::uuid) from generate_series(31,38)n;
insert into saved values('old1',(select to_jsonb(s) from public.invoice_billing_statements s where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.qid(31))));
select ok((select (s.financial_snapshot->'reports'->0->>'report_updated_at')::timestamptz=x.report_updated_at from public.invoice_billing_statements s join public.invoice_billing_sources x on x.statement_id=s.id where x.timelog_id=pg_temp.qid(31)),'captured quoted money binds the approved source version');
select is((select s.financial_snapshot->'reports'->0->>'quoted_report_updated_at' from public.invoice_billing_statements s join public.invoice_billing_sources x on x.statement_id=s.id where x.timelog_id=pg_temp.qid(31)),(select v->'preview'->'reports'->0->>'report_updated_at' from saved where k='quote31'),'quote source-version provenance retained');
select is((select (s.financial_snapshot->'reports'->0)-array['report_updated_at','status','quoted_report_updated_at'] from public.invoice_billing_statements s join public.invoice_billing_sources x on x.statement_id=s.id where x.timelog_id=pg_temp.qid(31)),(select (v->'preview'->'reports'->0)-array['report_updated_at','status','quoted_report_updated_at'] from saved where k='quote31'),'consumed quote rates/hours/days/money remain exactly unchanged');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(1),'role','authenticated')::text,true);
insert into saved values('preview_request',jsonb_build_object('p_request_id',pg_temp.qid(602),'p_statement_id',(select v->>'id' from saved where k='old1'),'p_expected_updated_at',(select v->>'updated_at' from saved where k='old1')));
insert into saved values('preview_result',public.refresh_invoice_billing_preview(pg_temp.qid(602),((select v from saved where k='old1')->>'id')::uuid,((select v from saved where k='old1')->>'updated_at')::timestamptz));
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(2),'role','authenticated')::text,true);
insert into saved values('consolidated',public.prepare_invoice_billing_selection(pg_temp.qid(601),array[pg_temp.qid(31),pg_temp.qid(32)]));
insert into saved values('old1_after',(select to_jsonb(s) from public.invoice_billing_statements s where id=((select v from saved where k='old1')->>'id')::uuid));
select ok((select v->>'superseded_by_statement_id' is not null from saved where k='old1_after'),'old statement is superseded');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(1),'role','authenticated')::text,true);
select is(public.refresh_invoice_billing_preview(pg_temp.qid(602),((select v from saved where k='old1')->>'id')::uuid,((select v from saved where k='old1')->>'updated_at')::timestamptz),(select v from saved where k='preview_result'),'old request safely replays unchanged after consolidation');
select throws_ok($$select public.refresh_invoice_billing_preview(pg_temp.qid(603),((select v from saved where k='old1_after')->>'id')::uuid,((select v from saved where k='old1_after')->>'updated_at')::timestamptz)$$,'22023',null::text,'fresh superseded preview must reject');
select throws_ok($$select public.confirm_invoice_billing(pg_temp.qid(604),((select v from saved where k='old1_after')->>'id')::uuid,(select updated_at from public.invoice_billing_statements where id=((select v from saved where k='old1_after')->>'id')::uuid),true)$$,'22023',null::text,'fresh superseded confirmation must reject');
select is((select status from public.invoice_billing_statements where id=((select v from saved where k='old1_after')->>'id')::uuid),'blocked','superseded parent cannot be revived');
reset role;
select throws_ok($$select private.invoice_billing_issue(((select v from saved where k='old1_after')->>'id')::uuid)$$,'22023',null::text,'central issuer refuses superseded parent even with privileged caller');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select public.register_invoice_billing_document(pg_temp.qid(605),pg_temp.qid(1),((select v from saved where k='old1_after')->>'id')::uuid,((select v from saved where k='old1_after')->>'updated_at')::timestamptz,'irrelevant',repeat('a',64),1,'Q-OLD','2026-10-10','2026-10-24',2000)$$,'22023',null::text,'superseded upload registration rejects before file checks');
reset role;
insert into private.invoice_billing_jobs(id,kind,statement_id,status) values(pg_temp.qid(610),'issue',((select v from saved where k='old1_after')->>'id')::uuid,'failed');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(1),'role','authenticated')::text,true);
select throws_ok($$select public.retry_invoice_billing_job(pg_temp.qid(611),((select v from saved where k='old1_after')->>'id')::uuid,pg_temp.qid(610),((select v from saved where k='old1_after')->>'updated_at')::timestamptz,clock_timestamp())$$,'22023','invoice_billing_statement_superseded','fresh superseded retry rejects consistently');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(2),'role','authenticated')::text,true);
select throws_ok($$select public.repair_invoice_billing_distance(pg_temp.qid(612),((select v from saved where k='old1_after')->>'id')::uuid,pg_temp.qid(11),((select v from saved where k='old1_after')->>'updated_at')::timestamptz,jsonb_build_array(jsonb_build_object('timelog_id',pg_temp.qid(31),'expected_updated_at',clock_timestamp(),'km',0)))$$,'22023','invoice_billing_statement_superseded','fresh superseded repair rejects consistently');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(3),'role','authenticated')::text,true);
select throws_ok($$select public.review_invoice_billing_document(pg_temp.qid(613),((select v from saved where k='old1_after')->>'id')::uuid,pg_temp.qid(99),((select v from saved where k='old1_after')->>'updated_at')::timestamptz,'return','Reason')$$,'22023','invoice_billing_statement_superseded','fresh superseded document review rejects consistently');
reset role;
insert into saved values('before_rejections',jsonb_build_object('invoices',(select count(*) from public.invoices where contractor_id=pg_temp.qid(11)),'links',(select count(*) from public.invoice_timelogs l join public.timelogs t on t.id=l.timelog_id where t.contractor_id=pg_temp.qid(11)),'sequences',(select to_jsonb(n) from public.invoice_number_sequences n where supplier_profile_id=pg_temp.qid(11))));
-- Inspect the central reservation invariant using deliberately corrupt disposable
-- metadata; protected public writes are covered separately and never used here.
insert into saved values('malformed_original',(select to_jsonb(s) from public.invoice_billing_statements s where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.qid(38))));
create function pg_temp.reject_snapshot(p_reports jsonb) returns text language plpgsql as $f$
declare sid uuid:=((select v from saved where k='malformed_original')->>'id')::uuid; result text;
begin
 update public.invoice_billing_statements set financial_snapshot=jsonb_set(financial_snapshot,'{reports}',p_reports) where id=sid;
 begin
  perform private.invoice_billing_issue(sid);
  result:='issued';
 exception when others then result:=sqlstate; end;
 -- Rollback every deliberate source corruption/possible issuance at function boundary.
 raise exception 'probe_result:%',result using errcode='P0001';
end $f$;
select throws_ok($$select pg_temp.reject_snapshot('[]')$$,'P0001','probe_result:PT409','empty frozen reports cannot issue');
select throws_ok($$select pg_temp.reject_snapshot('{}')$$,'P0001','probe_result:PT409','non-array frozen reports fail with domain conflict');
select throws_ok($$select pg_temp.reject_snapshot('[{}]')$$,'P0001','probe_result:PT409','missing report ID cannot issue');
select throws_ok($$select pg_temp.reject_snapshot('[{"timelog_id":"invalid"}]')$$,'P0001','probe_result:PT409','malformed report ID cannot issue');
select throws_ok($$select pg_temp.reject_snapshot((select (v->'financial_snapshot'->'reports')||(v->'financial_snapshot'->'reports') from saved where k='malformed_original'))$$,'P0001','probe_result:PT409','duplicate frozen source cannot bill twice');
select throws_ok($$select pg_temp.reject_snapshot(jsonb_set((select v->'financial_snapshot'->'reports' from saved where k='malformed_original'),'{0,timelog_id}',to_jsonb(pg_temp.qid(37)::text)))$$,'P0001','probe_result:PT409','frozen source IDs must equal current reservations');
select throws_ok($$select pg_temp.reject_snapshot(jsonb_set((select v->'financial_snapshot'->'reports' from saved where k='malformed_original'),'{0,contractor_id}',to_jsonb(pg_temp.qid(12)::text)))$$,'P0001','probe_result:PT409','frozen supplier must match statement binding');
select throws_ok($$select pg_temp.reject_snapshot(jsonb_set((select v->'financial_snapshot'->'reports' from saved where k='malformed_original'),'{0,contractor_user_id}',to_jsonb(pg_temp.qid(2)::text)))$$,'P0001','probe_result:PT409','frozen owner user must match statement binding');
select throws_ok($$select pg_temp.reject_snapshot(jsonb_set((select v->'financial_snapshot'->'reports' from saved where k='malformed_original'),'{0,event_id}',to_jsonb(pg_temp.qid(21)::text)))$$,'P0001','probe_result:PT409','frozen event must match reservation');
select throws_ok($$select pg_temp.reject_snapshot(jsonb_set((select v->'financial_snapshot'->'reports' from saved where k='malformed_original'),'{0,report_updated_at}',to_jsonb('2000-01-01T00:00:00Z'::text)))$$,'P0001','probe_result:PT409','frozen source version must match reservation');
create function pg_temp.reject_empty_reservation() returns text language plpgsql as $f$
declare sid uuid:=((select v from saved where k='malformed_original')->>'id')::uuid; result text;
begin
 delete from public.invoice_billing_sources where statement_id=sid;
 begin perform private.invoice_billing_issue(sid);result:='issued';exception when others then result:=sqlstate;end;
 raise exception 'probe_result:%',result using errcode='P0001';
end $f$;
select throws_ok($$select pg_temp.reject_empty_reservation()$$,'P0001','probe_result:PT409','nonempty frozen reports require nonempty current reservations');
select is(jsonb_build_object('invoices',(select count(*) from public.invoices where contractor_id=pg_temp.qid(11)),'links',(select count(*) from public.invoice_timelogs l join public.timelogs t on t.id=l.timelog_id where t.contractor_id=pg_temp.qid(11)),'sequences',(select to_jsonb(n) from public.invoice_number_sequences n where supplier_profile_id=pg_temp.qid(11))),(select v from saved where k='before_rejections'),'rejections allocate no invoice, number or links');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(1),'role','authenticated')::text,true);
select public.confirm_invoice_billing(pg_temp.qid(606),((select v from saved where k='consolidated')->'statement'->>'id')::uuid,((select v from saved where k='consolidated')->'statement'->>'updated_at')::timestamptz,true);
reset role;
select is((select count(*) from public.invoices where contractor_id=pg_temp.qid(11)),1::bigint,'consolidated source set has one invoice');
select is((select sum(total_amount) from public.invoices where contractor_id=pg_temp.qid(11)),4000::numeric,'consolidated work is billed exactly once');
select is((select count(*) from public.invoice_timelogs l join public.invoices i on i.id=l.invoice_id where i.contractor_id=pg_temp.qid(11)),2::bigint,'privileged inspection sees exact two source links');
-- Number rollover and occupied candidates execute the actual issuer.
insert into public.invoice_number_sequences(invoice_year,supplier_profile_id,last_number) values(extract(year from (transaction_timestamp() at time zone 'Europe/Prague'))::int,pg_temp.qid(11),9999) on conflict(invoice_year,supplier_profile_id) do update set last_number=9999;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(1),'role','authenticated')::text,true);
select public.confirm_invoice_billing(pg_temp.qid(607),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.qid(33)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.qid(33))),true);
select is((select right(invoice_number,5) from public.invoices where timelog_id=pg_temp.qid(33)),'10000','sequence9999 yields full suffix10000');
reset role;
insert into public.invoices(contractor_id,invoice_number,total_amount) values(pg_temp.qid(11),'SF-'||extract(year from (transaction_timestamp() at time zone 'Europe/Prague'))::int||'-97000000-10001',1);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(1),'role','authenticated')::text,true);
select public.confirm_invoice_billing(pg_temp.qid(608),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.qid(34)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.qid(34))),true);
select is((select right(invoice_number,5) from public.invoices where timelog_id=pg_temp.qid(34)),'10002','occupied10001 advances safely to full10002');
reset role;
update public.invoice_number_sequences set last_number=10002 where supplier_profile_id=pg_temp.qid(11);
insert into public.invoices(contractor_id,invoice_number,total_amount) select pg_temp.qid(11),'SF-'||extract(year from (transaction_timestamp() at time zone 'Europe/Prague'))::int||'-97000000-'||n,1 from generate_series(10003,10034)n;
insert into saved values('collision_before',jsonb_build_object('invoices',(select count(*) from public.invoices where contractor_id=pg_temp.qid(11)),'sequence',(select last_number from public.invoice_number_sequences where supplier_profile_id=pg_temp.qid(11))));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(1),'role','authenticated')::text,true);
select throws_ok($$select public.confirm_invoice_billing(pg_temp.qid(609),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.qid(35)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.qid(35))),true)$$,'PT409',null::text,'32 occupied candidates stop with a bounded allocation conflict');
reset role;
select is(jsonb_build_object('invoices',(select count(*) from public.invoices where contractor_id=pg_temp.qid(11)),'sequence',(select last_number from public.invoice_number_sequences where supplier_profile_id=pg_temp.qid(11))),(select v from saved where k='collision_before'),'exhausted allocation rolls back sequence and invoice writes');
-- Historical draft deletion restores approved work without a new final approval.
insert into public.events(id,name) values(pg_temp.qid(29),'DISPOSABLE historical delete');
insert into public.timelogs(id,event_id,contractor_id,status,km,approved_at) values(pg_temp.qid(39),pg_temp.qid(29),pg_temp.qid(11),'invoiced',0,clock_timestamp());
insert into public.timelog_days(timelog_id,date,time_from,time_to,day_type) values(pg_temp.qid(39),'2026-10-10','08:00','16:00','provoz');
insert into public.invoices(id,contractor_id,event_id,timelog_id,status,invoice_number,total_amount) values(pg_temp.qid(41),pg_temp.qid(11),pg_temp.qid(29),pg_temp.qid(39),'draft','QUALITY-LEGACY-DELETE',2000);
insert into public.invoice_timelogs(invoice_id,timelog_id) values(pg_temp.qid(41),pg_temp.qid(39));
insert into saved values('legacy_before',jsonb_build_object('statements',(select count(*) from public.invoice_billing_statements),'jobs',(select count(*) from private.invoice_billing_jobs),'paid',(select to_jsonb(i) from public.invoices i where invoice_number='SF-2026-CREW-D-0001')));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.qid(2),'role','authenticated')::text,true);
select lives_ok($$select public.delete_invoice_atomic(pg_temp.qid(41),'draft',(select updated_at from public.invoices where id=pg_temp.qid(41)))$$,'historical draft deletion succeeds');
select is((select status::text from public.timelogs where id=pg_temp.qid(39)),'approved','historical source restored to approved');
reset role;
select ok(not exists(select 1 from public.invoices where id=pg_temp.qid(41)) and not exists(select 1 from public.invoice_timelogs where invoice_id=pg_temp.qid(41)),'legacy invoice and links actually deleted');
select is(jsonb_build_object('statements',(select count(*) from public.invoice_billing_statements),'jobs',(select count(*) from private.invoice_billing_jobs),'paid',(select to_jsonb(i) from public.invoices i where invoice_number='SF-2026-CREW-D-0001')),(select v from saved where k='legacy_before'),'restoration creates no statement/job and preserves paid history');
select * from finish();
rollback;
