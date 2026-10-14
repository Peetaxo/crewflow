-- Only synthetic rollback-only fixtures. Run against the isolated local demo.
\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_function('public','get_invoice_billing_snapshot',array[]::text[],'billing snapshot RPC exists');
select has_function('public','set_self_billing_consent',array['uuid','boolean','timestamp with time zone','boolean'],'explicit owner consent RPC exists');
select has_function('public','confirm_invoice_billing',array['uuid','uuid','timestamp with time zone','boolean'],'owner confirmation RPC exists');
select has_function('public','get_invoice_billing_quote',array['uuid[]'],'server approval quote exists');
create function pg_temp.bid(n integer) returns uuid language sql immutable as $$select ('97000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.targets(ns integer[]) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('id',t.id,'expected_updated_at',t.updated_at,'approval_id',null,'approval_updated_at',null) order by t.id)
 from public.timelogs t where id in(select pg_temp.bid(n) from unnest(ns)n)
$$;
insert into auth.users(id,email,raw_user_meta_data) select pg_temp.bid(n),'billing-'||n||'@example.invalid',case when n=1 then '{"role":"coo"}'::jsonb else '{}'::jsonb end from generate_series(1,5)n;
delete from public.user_roles where user_id in(select pg_temp.bid(n) from generate_series(1,5)n);
delete from public.profiles where user_id in(select pg_temp.bid(n) from generate_series(1,5)n);
insert into public.profiles(id,user_id,first_name,last_name,ico,bank_account,billing_street,billing_zip,billing_city,billing_country,hourly_rate)
 select pg_temp.bid(n+10),pg_temp.bid(n),'Billing fixture',n::text,'12345678','123/0800','Test street','10000','Praha','CZ',250 from generate_series(1,5)n;
insert into public.user_roles(user_id,role) values(pg_temp.bid(1),'crew'),(pg_temp.bid(2),'crew'),(pg_temp.bid(3),'crewhead'),(pg_temp.bid(4),'coo'),(pg_temp.bid(5),'coo');
insert into public.clients(id,name,ico,street,zip,city,country) values(pg_temp.bid(50),'Billing buyer','87654321','Buyer street','10000','Praha','CZ');
insert into public.projects(id,name,job_number,client_id) values(pg_temp.bid(51),'Billing project','BILL-TEST',pg_temp.bid(50));
insert into public.events(id,name,project_id,job_number,date_from,date_to,meal_allowance_enabled) select pg_temp.bid(n),'Billing fixture '||n,pg_temp.bid(51),'BILL-'||n,'2099-01-01','2099-01-03',true from generate_series(101,120)n;
insert into public.timelogs(id,event_id,contractor_id,status,km) select pg_temp.bid(n+100),pg_temp.bid(n),pg_temp.bid(11),case when n in(109,110) then 'pending_ch'::public.timelog_status else 'pending_coo'::public.timelog_status end,case when n=115 then 'NaN'::numeric when n=120 then -10 else 10 end from generate_series(101,120)n;
insert into public.timelog_days(timelog_id,date,time_from,time_to,day_type,meals)
 select pg_temp.bid(n+100),('2099-01-01'::date+d),'08:00',case when n=103 then '16:20' when n=104 then '20:00' else '18:00' end,'provoz',case when n=104 then array['obed','vecere'] else array['obed'] end from generate_series(101,120)n cross join generate_series(0,2)d where n<>103 or d=0;
update public.events set meal_allowance_enabled=false where id=pg_temp.bid(105);
update public.events set project_id=null where id in(pg_temp.bid(106),pg_temp.bid(118));

update public.events set contact_profile_id=pg_temp.bid(14),contact_approves_hours=true where id in(pg_temp.bid(109),pg_temp.bid(110));
insert into public.shift_workflows(id,created_by) values(pg_temp.bid(79),pg_temp.bid(3));
insert into public.shift_workflow_events(workflow_id,event_id,position) values(pg_temp.bid(79),pg_temp.bid(109),0),(pg_temp.bid(79),pg_temp.bid(110),1);
insert into public.shift_workflow_rounds(id,workflow_id,contractor_id,contractor_user_id,expected_item_count,status,created_by)
 values(pg_temp.bid(80),pg_temp.bid(79),pg_temp.bid(11),pg_temp.bid(1),2,'pending_ch',pg_temp.bid(1));
insert into public.shift_workflow_round_items(round_id,timelog_id,event_id,position) values(pg_temp.bid(80),pg_temp.bid(209),pg_temp.bid(109),0),(pg_temp.bid(80),pg_temp.bid(210),pg_temp.bid(110),1);
create function pg_temp.round_targets() returns jsonb language sql as $$select jsonb_agg(jsonb_build_object('id',t.id,'expected_updated_at',t.updated_at,'expected_status',t.status) order by t.id) from public.timelogs t where id in(pg_temp.bid(209),pg_temp.bid(210))$$;

update private.invoice_billing_jobs set available_at='infinity',locked_until='infinity' where statement_id in(select id from public.invoice_billing_statements where contractor_id<>pg_temp.bid(11));
create temporary table saved(k text primary key,v jsonb);
grant all on saved to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated','user_metadata',jsonb_build_object('role','coo'))::text,true);
select is((public.get_invoice_billing_snapshot()->'consent'->>'enabled')::boolean,false,'standing consent defaults disabled');
select throws_ok($$select public.prepare_invoice_billing_selection(pg_temp.bid(600),array[pg_temp.bid(201)])$$,'42501',null::text,'spoofed Crew cannot prepare COO selection');
select ok(not has_function_privilege('authenticated','public.claim_invoice_billing_jobs(integer)','execute'),'Crew cannot claim service jobs (real SDK denial also covered)');
select throws_ok($$insert into public.invoice_billing_statements(contractor_id) values(pg_temp.bid(11))$$,'42501',null::text,'direct statement insert denied');
select throws_ok($$select public.set_self_billing_consent(pg_temp.bid(601),true,null,false)$$,'22023',null::text,'non-VAT declaration required');
insert into saved values('grant',public.set_self_billing_consent(pg_temp.bid(602),true,null,true));
select is(public.set_self_billing_consent(pg_temp.bid(602),true,null,true),(select v from saved where k='grant'),'request replay returns identical consent');
select throws_ok($$select public.set_self_billing_consent(pg_temp.bid(602),false,null,false)$$,'22023',null::text,'request payload reuse rejected');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
insert into saved values('quote',public.get_invoice_billing_quote(array[pg_temp.bid(201)]));
select is(((select v from saved where k='quote')->'preview'->>'total_amount')::numeric,8606::numeric,'three 10-hour days freeze 7500 hours + 56 travel + 1050 meals');
insert into saved values('approval_targets',pg_temp.targets(array[201]));
insert into saved values('approval',public.resolve_timelog_approvals_atomic((select v from saved where k='approval_targets'),'approved','',((select v from saved where k='quote')->>'id')::uuid));
select is((select status::text from public.timelogs where id=pg_temp.bid(201)),'approved','approval response stays approved before job runs');
select is(public.resolve_timelog_approvals_atomic((select v from saved where k='approval_targets'),'approved','',((select v from saved where k='quote')->>'id')::uuid),(select v from saved where k='approval'),'consumed approval quote replays the same successful response');
select is((select count(*) from public.invoice_billing_sources where timelog_id=pg_temp.bid(201)),1::bigint,'three days produce one canonical statement');
reset role;
select is((select count(*) from private.invoice_billing_jobs where kind='issue' and statement_id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(201))),1::bigint,'new standing consent queues one durable issue job');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
update public.profiles set hourly_rate=999,first_name='Changed' where id=pg_temp.bid(11);
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(201))),8606::numeric,'snapshot read never reprices changed profile');
insert into saved values('stale',public.get_invoice_billing_quote(array[pg_temp.bid(202)]));
update public.profiles set hourly_rate=250 where id=pg_temp.bid(11);
select throws_ok($$select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[202]),'approved','',((select v from saved where k='stale')->>'id')::uuid)$$,'PT409',null::text,'stale rate quote rejects approval');
select is((select status::text from public.timelogs where id=pg_temp.bid(202)),'pending_coo','stale price leaves hours pending');
insert into saved values('old',public.resolve_timelog_approvals_atomic(pg_temp.targets(array[202]),'approved',''));
select is((select blocked_reason from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(202))),'approval_quote_required','legacy caller preserves hours but blocks unseen price');
insert into saved values('prepared',public.prepare_invoice_billing_selection(pg_temp.bid(610),array[pg_temp.bid(202)]));
select is((select status from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(202))),'ready','explicit COO preparation finalizes legacy statement');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(2),'role','authenticated')::text,true);
select is((select count(*) from public.invoice_billing_statements where contractor_id=pg_temp.bid(11)),0::bigint,'foreign Crew cannot read statements');
select throws_ok($$select public.confirm_invoice_billing(pg_temp.bid(611),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(202)),now(),true)$$,'42501',null::text,'foreign Crew cannot confirm');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select throws_ok($$select public.confirm_invoice_billing(pg_temp.bid(612),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(202)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(202))),false)$$,'22023',null::text,'individual confirmation requires declaration');
insert into saved values('issued',public.confirm_invoice_billing(pg_temp.bid(613),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(202)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(202))),true));
select is((select status::text from public.timelogs where id=pg_temp.bid(202)),'invoiced','confirmed statement links and invoices complete report');
reset role;
select is((select count(*) from public.invoice_timelogs where timelog_id=pg_temp.bid(202)),1::bigint,'exact source cannot receive a second invoice');
set local role authenticated;
select throws_ok($$select public.create_invoice_atomic('{}','[]','[]','[]')$$,'22023',null::text,'old create flow cannot bypass confirmation');
reset role;
select is((select count(*) from private.invoice_billing_write_permits),0::bigint,'issuer clears exact transaction permits');

-- Independent fractional-hour and meal-band checks, stale dependency/source quotes.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
insert into saved values('fraction',public.get_invoice_billing_quote(array[pg_temp.bid(203)]));
select is(((select v from saved where k='fraction')->'preview'->'reports'->0->>'amount_hours')::numeric,2083.33::numeric,'8h20m prices exact minutes before currency rounding');
insert into saved values('two_meals',public.get_invoice_billing_quote(array[pg_temp.bid(204)]));
select is(((select v from saved where k='two_meals')->'preview'->>'total_amount')::numeric,10556::numeric,'three 12h days with both meals include 1500 meal allowance');
insert into saved values('disabled_meals',public.get_invoice_billing_quote(array[pg_temp.bid(205)]));
select is(((select v from saved where k='disabled_meals')->'preview'->'reports'->0->>'amount_meals')::numeric,0::numeric,'disabled event excludes all meals');
select throws_ok($$select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[204]),'approved','',((select v from saved where k='fraction')->>'id')::uuid)$$,'PT409',null::text,'quote must match exact source set');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(5),'role','authenticated')::text,true);
select throws_ok($$select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[203]),'approved','',((select v from saved where k='fraction')->>'id')::uuid)$$,'42501',null::text,'a different COO cannot consume another actor quote');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
update public.events set meal_allowance_enabled=false where id=pg_temp.bid(104);
select throws_ok($$select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[204]),'approved','',((select v from saved where k='two_meals')->>'id')::uuid)$$,'PT409',null::text,'changed event meal setting rejects approval quote');
select is((select status::text from public.timelogs where id=pg_temp.bid(204)),'pending_coo','changed event leaves source pending');
insert into saved values('missing_customer',public.get_invoice_billing_quote(array[pg_temp.bid(206)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[206]),'approved','',((select v from saved where k='missing_customer')->>'id')::uuid);
select is((select blocked_reason from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(206))),'customer_missing','missing customer blocks billing without losing approved hours');
update public.events set project_id=pg_temp.bid(51) where id=pg_temp.bid(106);
update public.profiles set hourly_rate=1000 where id=pg_temp.bid(11);
select public.prepare_invoice_billing_selection(pg_temp.bid(620),array[pg_temp.bid(206)]);
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(206))),8606::numeric,'explicit identity resolution preserves verified financial snapshot');
update public.profiles set hourly_rate=250 where id=pg_temp.bid(11);
-- A current issued invoice keeps the frozen supplier name from before changes.
select is((select supplier_snapshot->>'name' from public.invoices where billing_statement_id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(202))),'Changed 1','invoice freezes supplier identity selected at explicit preparation');
-- Future standing approvals are queued, and grant revocation prevents issuance.
insert into saved values('future_quote',public.get_invoice_billing_quote(array[pg_temp.bid(207)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[207]),'approved','',((select v from saved where k='future_quote')->>'id')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select public.set_self_billing_consent(pg_temp.bid(621),false,(select updated_at from public.invoice_billing_consents where contractor_id=pg_temp.bid(11)),false);
reset role;
select is((select count(*) from public.invoice_billing_consent_history where contractor_id=pg_temp.bid(11)),2::bigint,'revocation appends immutable history');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('claimed',public.claim_invoice_billing_jobs(100));
select public.process_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid) from saved,jsonb_array_elements(v->'jobs')x where k='claimed' and x->>'kind'='issue';
reset role;
select is((select status from private.invoice_billing_jobs where kind='issue' and statement_id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(207))),'cancelled','revoked standing grant cancels future automatic issue');
select is((select status::text from public.timelogs where id=pg_temp.bid(207)),'approved','revocation leaves hours approved');
-- Register two immutable uploaded versions. Public registration is forbidden.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[208]),'approved','');
insert into saved values('upload_statement',public.prepare_invoice_billing_selection(pg_temp.bid(622),array[pg_temp.bid(208)]));
reset role;
insert into storage.objects(bucket_id,name,metadata)
 select 'invoice-pdfs','billing-statements/'||statement_id||'/documents/'||pg_temp.bid(623)||'.pdf','{"size":5242880,"mimetype":"application/pdf"}'
 from public.invoice_billing_sources where timelog_id=pg_temp.bid(208);
insert into storage.objects(bucket_id,name,metadata)
 select 'invoice-pdfs','billing-statements/'||statement_id||'/documents/'||pg_temp.bid(624)||'.pdf','{"size":5242881,"mimetype":"application/pdf"}'
 from public.invoice_billing_sources where timelog_id=pg_temp.bid(208);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);

select throws_ok($$select public.register_invoice_billing_document(pg_temp.bid(624),pg_temp.bid(2),((select v from saved where k='upload_statement')->'statement'->>'id')::uuid,now(),'wrong',repeat('a',64),1234,'OWN-ONE','2099-01-04','2099-01-18',8606)$$,'42501',null::text,'trusted registration still rejects foreign uploader');

select throws_ok($$select public.register_invoice_billing_document(pg_temp.bid(624),pg_temp.bid(1),
 ((select v from saved where k='upload_statement')->'statement'->>'id')::uuid,
 ((select v from saved where k='upload_statement')->'statement'->>'updated_at')::timestamptz,
 'billing-statements/'||((select v from saved where k='upload_statement')->'statement'->>'id')||'/documents/'||pg_temp.bid(624)||'.pdf',
 repeat('a',64),5242881,'OWN-ONE','2099-01-04','2099-01-18',8606)$$,'22023','invoice_billing_document_invalid','5MiB plus one byte is rejected before verified object registration');
insert into saved values('document1',public.register_invoice_billing_document(pg_temp.bid(623),pg_temp.bid(1),
 ((select v from saved where k='upload_statement')->'statement'->>'id')::uuid,
 ((select v from saved where k='upload_statement')->'statement'->>'updated_at')::timestamptz,
 'billing-statements/'||((select v from saved where k='upload_statement')->'statement'->>'id')||'/documents/'||pg_temp.bid(623)||'.pdf',
 repeat('a',64),5242880,'OWN-ONE','2099-01-04','2099-01-18',8606));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
select throws_ok($$select public.review_invoice_billing_document(pg_temp.bid(625),((select v from saved where k='document1')->'statement'->>'id')::uuid,((select v from saved where k='document1')->'document'->>'id')::uuid,((select v from saved where k='document1')->'statement'->>'updated_at')::timestamptz,'accept','')$$,'42501',null::text,'standalone COO cannot accept uploaded document');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(3),'role','authenticated')::text,true);
select throws_ok($$select public.review_invoice_billing_document(pg_temp.bid(626),((select v from saved where k='document1')->'statement'->>'id')::uuid,((select v from saved where k='document1')->'document'->>'id')::uuid,((select v from saved where k='document1')->'statement'->>'updated_at')::timestamptz,'return','')$$,'22023',null::text,'CH return requires a reason');
insert into saved values('returned',public.review_invoice_billing_document(pg_temp.bid(627),((select v from saved where k='document1')->'statement'->>'id')::uuid,((select v from saved where k='document1')->'document'->>'id')::uuid,((select v from saved where k='document1')->'statement'->>'updated_at')::timestamptz,'return','Missing buyer ICO'));
select is((select status::text from public.timelogs where id=pg_temp.bid(208)),'approved','return never invoices source hours');
reset role;
insert into storage.objects(bucket_id,name,metadata)
 select 'invoice-pdfs','billing-statements/'||statement_id||'/documents/'||pg_temp.bid(628)||'.pdf','{"size":1234,"mimetype":"application/pdf"}' from public.invoice_billing_sources where timelog_id=pg_temp.bid(208);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('document2',public.register_invoice_billing_document(pg_temp.bid(628),pg_temp.bid(1),
 ((select v from saved where k='returned')->'statement'->>'id')::uuid,((select v from saved where k='returned')->'statement'->>'updated_at')::timestamptz,
 'billing-statements/'||((select v from saved where k='returned')->'statement'->>'id')||'/documents/'||pg_temp.bid(628)||'.pdf',repeat('b',64),1234,'OWN-ONE','2099-01-04','2099-01-18',8606));
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(3),'role','authenticated')::text,true);
select throws_ok($$select public.review_invoice_billing_document(pg_temp.bid(629),((select v from saved where k='document2')->'statement'->>'id')::uuid,((select v from saved where k='document1')->'document'->>'id')::uuid,((select v from saved where k='document2')->'statement'->>'updated_at')::timestamptz,'accept','')$$,'PT409',null::text,'CH cannot accept old inactive document version');
insert into saved values('accepted',public.review_invoice_billing_document(pg_temp.bid(630),((select v from saved where k='document2')->'statement'->>'id')::uuid,((select v from saved where k='document2')->'document'->>'id')::uuid,((select v from saved where k='document2')->'statement'->>'updated_at')::timestamptz,'accept',''));
select is((select status::text from public.timelogs where id=pg_temp.bid(208)),'invoiced','active document acceptance invoices exact source');
select is((select status::text from public.invoices where billing_statement_id=((select v from saved where k='accepted')->'statement'->>'id')::uuid),'sent','accepted original is immediately payable without an email step');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
select public.mark_invoice_paid_atomic((select invoice_id from public.invoice_billing_statements where id=((select v from saved where k='accepted')->'statement'->>'id')::uuid),'sent',(select updated_at from public.invoices where billing_statement_id=((select v from saved where k='accepted')->'statement'->>'id')::uuid),clock_timestamp());
select is((select status::text from public.timelogs where id=pg_temp.bid(208)),'paid','COO can pay CH-accepted original directly');
select is((select to_jsonb(i)->>'paid_by_user_id' from public.invoices i where billing_statement_id=((select v from saved where k='accepted')->'statement'->>'id')::uuid),pg_temp.bid(4)::text,'uploaded payment records authenticated COO user');
select is((select to_jsonb(i)->>'paid_by_profile_id' from public.invoices i where billing_statement_id=((select v from saved where k='accepted')->'statement'->>'id')::uuid),pg_temp.bid(14)::text,'uploaded payment records exact current COO profile');
select ok((select (to_jsonb(i)->>'payment_recorded_at')::timestamptz between transaction_timestamp() and clock_timestamp() from public.invoices i where billing_statement_id=((select v from saved where k='accepted')->'statement'->>'id')::uuid),'uploaded payment records server marking time');
insert into saved values('upload_paid_audit',(select to_jsonb(i) from public.invoices i where billing_statement_id=((select v from saved where k='accepted')->'statement'->>'id')::uuid));
select public.mark_invoice_paid_atomic(((select v from saved where k='upload_paid_audit')->>'id')::uuid,'paid',((select v from saved where k='upload_paid_audit')->>'updated_at')::timestamptz,((select v from saved where k='upload_paid_audit')->>'paid_at')::timestamptz);
select is((select to_jsonb(i)->>'payment_recorded_at' from public.invoices i where id=((select v from saved where k='upload_paid_audit')->>'id')::uuid),(select v->>'payment_recorded_at' from saved where k='upload_paid_audit'),'payment replay keeps original marking time');
select throws_ok($$select public.mark_invoice_paid_atomic(((select v from saved where k='upload_paid_audit')->>'id')::uuid,'sent',((select v from saved where k='upload_paid_audit')->>'updated_at')::timestamptz,((select v from saved where k='upload_paid_audit')->>'paid_at')::timestamptz)$$,'PT409',null::text,'stale double-payment is a non-retrying boundary conflict');
reset role;
select throws_ok($$update public.invoices set paid_by_user_id=pg_temp.bid(5) where id=((select v from saved where k='upload_paid_audit')->>'id')::uuid$$,'42501',null::text,'first paid actor audit is immutable even to accidental privileged edits');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);

reset role;
select is((select billing_kind from public.invoices where billing_statement_id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(208))),'uploaded','accepted invoice records uploaded source');
select is((select pdf_path from public.invoices where billing_statement_id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(208))),
 'billing-statements/'||((select v from saved where k='document2')->'statement'->>'id')||'/documents/'||pg_temp.bid(628)||'.pdf','acceptance points to the same original uploaded PDF');
select is((select count(*) from public.invoice_billing_documents where statement_id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(208))),2::bigint,'both original immutable document versions are retained');
select throws_ok($$update public.invoice_billing_documents set external_invoice_number='REWRITE' where request_id=pg_temp.bid(623)$$,'42501',null::text,'document metadata is immutable even to accidental DBA writes');
-- Supplier-scoped external number uniqueness permits another supplier.
insert into public.invoices(contractor_id,job_number,invoice_number,total_amount) values(pg_temp.bid(12),'OTHER-SUPPLIER','OWN-ONE',1);
select throws_ok($$insert into public.invoices(contractor_id,job_number,invoice_number,total_amount) values(pg_temp.bid(11),'SAME-SUPPLIER','OWN-ONE',1)$$,'23505',null::text,'same supplier cannot reuse an external number');


-- A whole submitted shared round captures once, never at per-report approval.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select public.set_self_billing_consent(pg_temp.bid(640),true,(select updated_at from public.invoice_billing_consents where contractor_id=pg_temp.bid(11)),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(3),'role','authenticated')::text,true);
select public.transition_shift_workflow_round_atomic(pg_temp.bid(641),pg_temp.bid(80),(select updated_at from public.shift_workflow_rounds where id=pg_temp.bid(80)),pg_temp.round_targets(),'handoff','',null,null);
select is((select count(*) from public.invoice_billing_sources where timelog_id in(pg_temp.bid(209),pg_temp.bid(210))),0::bigint,'pending shared round captures no billing sources');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
select throws_ok($$select public.get_invoice_billing_quote(array[pg_temp.bid(209)])$$,'22023',null::text,'approval quote cannot select a partial shared round');
select throws_ok($$select public.prepare_invoice_billing_selection(pg_temp.bid(642),array[pg_temp.bid(209)])$$,'PT409',null::text,'pending selection cannot reserve partially approved reports');
select throws_ok($$select public.transition_shift_workflow_round_atomic(pg_temp.bid(684),pg_temp.bid(80),'2000-01-01'::timestamptz,pg_temp.round_targets(),'approve','',null,null)$$,'PT409','shift_workflow_round_conflict','shared public wrapper translates authoritative stale-round conflict without retry');
insert into saved values('shared_quote',public.get_invoice_billing_quote(array[pg_temp.bid(209),pg_temp.bid(210)]));
insert into saved values('shared_approval',public.transition_shift_workflow_round_atomic(pg_temp.bid(643),pg_temp.bid(80),(select updated_at from public.shift_workflow_rounds where id=pg_temp.bid(80)),pg_temp.round_targets(),'approve','',null,null,((select v from saved where k='shared_quote')->>'id')::uuid));
select is((select count(distinct statement_id) from public.invoice_billing_sources where timelog_id in(pg_temp.bid(209),pg_temp.bid(210))),1::bigint,'full frozen round captures one statement for both reports');
select ok((select bool_and(source_snapshot->'approval'->>'id' is not null and source_snapshot->>'workflow_round_updated_at' is not null) from public.invoice_billing_sources where timelog_id in(pg_temp.bid(209),pg_temp.bid(210))),'source snapshots retain exact approval IDs and round versions');
select is((select count(*) from public.timelogs where id in(pg_temp.bid(209),pg_temp.bid(210)) and status='approved'),2::bigint,'shared approval response remains approved until durable worker');
select throws_ok($$select public.prepare_invoice_billing_selection(pg_temp.bid(644),array[pg_temp.bid(209)])$$,'22023',null::text,'COO cannot split an approved frozen round');
select throws_ok($$update public.timelogs set status='invoiced' where id=pg_temp.bid(209)$$,'42501',null::text,'generic COO status edit cannot bypass reserved issuance');
insert into saved values('shared_statement',(select to_jsonb(s) from public.invoice_billing_statements s where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(209))));
reset role;
select is((select count(*) from private.invoice_billing_jobs where kind='issue' and statement_id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(209))),1::bigint,'whole shared round queues exactly one issue job');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('shared_jobs',public.claim_invoice_billing_jobs(100));
insert into saved select 'shared_issue',public.process_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid) from saved,jsonb_array_elements(v->'jobs')x where k='shared_jobs' and x->>'kind'='issue' and x->>'statement_id'=(select v->>'id' from saved where k='shared_statement');
select is(public.process_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid),(select v from saved where k='shared_issue'),'worker process replay returns same issued invoice') from saved,jsonb_array_elements(v->'jobs')x where k='shared_jobs' and x->>'kind'='issue' and x->>'statement_id'=(select v->>'id' from saved where k='shared_statement');
reset role;
select is((select count(distinct invoice_id) from public.invoice_timelogs where timelog_id in(pg_temp.bid(209),pg_temp.bid(210))),1::bigint,'service issues one invoice covering the complete round');
select is((select count(*) from public.invoice_items where invoice_id=((select v from saved where k='shared_issue')->>'invoice_id')::uuid),2::bigint,'shared invoice has exact per-event items');
select is((select total_amount from public.invoices where id=((select v from saved where k='shared_issue')->>'invoice_id')::uuid),17212::numeric,'shared invoice totals both frozen 8606 reports');
select is((select issue_date from public.invoices where id=((select v from saved where k='shared_issue')->>'invoice_id')::uuid),(clock_timestamp() at time zone 'Europe/Prague')::date,'generated invoice date uses Czech business date');
select is((select due_date-issue_date from public.invoices where id=((select v from saved where k='shared_issue')->>'invoice_id')::uuid),14,'generated due date is fourteen days later');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
select is((select status::text from public.invoices where id=((select v from saved where k='shared_issue')->>'invoice_id')::uuid),'sent','generated invoice is immediately payable');
select public.mark_invoice_paid_atomic(((select v from saved where k='shared_issue')->>'invoice_id')::uuid,'sent',(select updated_at from public.invoices where id=((select v from saved where k='shared_issue')->>'invoice_id')::uuid),clock_timestamp());
select is((select count(*) from public.timelogs where id in(pg_temp.bid(209),pg_temp.bid(210)) and status='paid'),2::bigint,'COO can pay generated complete shared invoice directly');
select is((select to_jsonb(i)->>'paid_by_user_id' from public.invoices i where id=((select v from saved where k='shared_issue')->>'invoice_id')::uuid),pg_temp.bid(4)::text,'generated payment also records authenticated COO actor');
-- PDF errors retry the same invoice/number, and completion is replayable.
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('pdf_jobs',public.claim_invoice_billing_jobs(100));
insert into saved select 'pdf_render',public.process_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid) from saved,jsonb_array_elements(v->'jobs')x where k='pdf_jobs' and x->>'kind'='pdf' and x->>'statement_id'=(select v->>'id' from saved where k='shared_statement');
select public.complete_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid,null,'Disposable failure') from saved,jsonb_array_elements(v->'jobs')x where k='pdf_jobs' and x->>'kind'='pdf' and x->>'statement_id'=(select v->>'id' from saved where k='shared_statement');
reset role;
update private.invoice_billing_jobs set available_at=clock_timestamp()-interval '1 second' where status='queued' and kind='pdf';
select is((select count(*) from public.invoices where id=((select v from saved where k='shared_issue')->>'invoice_id')::uuid),1::bigint,'PDF retry never allocates a second invoice');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('pdf_retry',public.claim_invoice_billing_jobs(100));
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'invoice-pdfs','invoices/'||(x->>'invoice_id')||'.pdf','{"size":1234,"mimetype":"application/pdf"}' from saved,jsonb_array_elements(v->'jobs')x where k='pdf_retry' and x->>'kind'='pdf' and x->>'statement_id'=(select v->>'id' from saved where k='shared_statement');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved select 'pdf_complete',public.complete_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid,'invoices/'||(x->>'invoice_id')||'.pdf',null) from saved,jsonb_array_elements(v->'jobs')x where k='pdf_retry' and x->>'kind'='pdf' and x->>'statement_id'=(select v->>'id' from saved where k='shared_statement');
select is(public.complete_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid,'invoices/'||(x->>'invoice_id')||'.pdf',null),(select v from saved where k='pdf_complete'),'PDF completion replay returns same completed artifact') from saved,jsonb_array_elements(v->'jobs')x where k='pdf_retry' and x->>'kind'='pdf' and x->>'statement_id'=(select v->>'id' from saved where k='shared_statement');
reset role;
select is((select count(*) from private.invoice_billing_write_permits),0::bigint,'service worker never retains or forges lifecycle permits');


-- Preview identity changes invalidate issuance while frozen amounts stay intact.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
insert into saved values('identity_quote',public.get_invoice_billing_quote(array[pg_temp.bid(211)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[211]),'approved','',((select v from saved where k='identity_quote')->>'id')::uuid);
update public.profiles set bank_account='NEW/0800' where id=pg_temp.bid(11);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select throws_ok($$select public.confirm_invoice_billing(pg_temp.bid(650),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(211)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(211))),true)$$,'PT409',null::text,'changed bank identity requires fresh owner preview before confirmation');
select is((select status::text from public.timelogs where id=pg_temp.bid(211)),'approved','stale identity never changes approved source status');


insert into saved values('identity_statement',(select to_jsonb(s) from public.invoice_billing_statements s where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(211))));
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('identity_jobs',public.claim_invoice_billing_jobs(100));
insert into saved select 'identity_blocked',public.process_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid) from saved,jsonb_array_elements(v->'jobs')x where k='identity_jobs' and x->>'kind'='issue' and x->>'statement_id'=(select v->>'id' from saved where k='identity_statement');
select is((select v->>'status' from saved where k='identity_blocked'),'blocked','standing worker waits for explicit identity refresh');
reset role;
do $$ declare n integer; v_jobs jsonb; v_job jsonb; v_statement uuid:=((select v from saved where k='identity_statement')->>'id')::uuid; begin
 for n in 1..10 loop
  update private.invoice_billing_jobs set available_at=clock_timestamp()-interval '1 second' where statement_id=v_statement and kind='issue';
  v_jobs:=public.claim_invoice_billing_jobs(100);
  for v_job in select value from jsonb_array_elements(v_jobs->'jobs') where value->>'statement_id'=v_statement::text and value->>'kind'='issue' loop
   perform public.process_invoice_billing_job((v_job->>'id')::uuid,(v_job->>'lease_token')::uuid);
  end loop;
 end loop;
end $$;
select is((select attempts from private.invoice_billing_jobs where statement_id=((select v from saved where k='identity_statement')->>'id')::uuid and kind='issue'),0,'human identity wait past retry threshold does not consume failure budget');

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select public.refresh_invoice_billing_preview(pg_temp.bid(651),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(211)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(211))));
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(211))),8606::numeric,'supplier refresh preserves every frozen monetary subtotal');
select is((select identity_version from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(211))),2,'supplier refresh creates a new identity preview version');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
update public.profiles set hourly_rate=888 where id=pg_temp.bid(11);
reset role;
update private.invoice_billing_jobs set available_at=clock_timestamp()-interval '1 second' where statement_id=(select v->>'id' from saved where k='identity_statement')::uuid and kind='issue';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('identity_retry',public.claim_invoice_billing_jobs(100));
select public.process_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid) from saved,jsonb_array_elements(v->'jobs')x where k='identity_retry' and x->>'kind'='issue' and x->>'statement_id'=(select v->>'id' from saved where k='identity_statement');
reset role;
select is((select total_amount from public.invoices where billing_statement_id=(select v->>'id' from saved where k='identity_statement')::uuid),8606::numeric,'changed rate after owner identity refresh never reprices auto invoice');
select is((select supplier_snapshot->>'bankAccount' from public.invoices where billing_statement_id=(select v->>'id' from saved where k='identity_statement')::uuid),'NEW/0800','auto invoice uses explicitly refreshed banking identity');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
update public.profiles set hourly_rate=250 where id=pg_temp.bid(11);
insert into saved values('customer_quote',public.get_invoice_billing_quote(array[pg_temp.bid(212)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[212]),'approved','',((select v from saved where k='customer_quote')->>'id')::uuid);
update public.clients set street='Changed buyer street' where id=pg_temp.bid(50);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select throws_ok($$select public.confirm_invoice_billing(pg_temp.bid(652),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(212)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(212))),true)$$,'PT409',null::text,'changed customer billing identity also rejects stale confirmation');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
select public.prepare_invoice_billing_selection(pg_temp.bid(653),array[pg_temp.bid(212)]);
select is((select customer_snapshot->>'street' from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(212))),'Changed buyer street','explicit COO preparation creates current buyer preview');
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(212))),8606::numeric,'buyer preview refresh preserves approved finances');
-- Explicit consolidation preserves two original financial snapshots and exact source history.
insert into saved values('consolidation_quote',public.get_invoice_billing_quote(array[pg_temp.bid(203),pg_temp.bid(205)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[203,205]),'approved','',((select v from saved where k='consolidation_quote')->>'id')::uuid);
insert into saved values('original_statements',(select jsonb_agg(to_jsonb(s) order by s.id) from public.invoice_billing_statements s where id in(select statement_id from public.invoice_billing_sources where timelog_id in(pg_temp.bid(203),pg_temp.bid(205)))));
select lives_ok($$insert into saved values('consolidated',public.prepare_invoice_billing_selection(pg_temp.bid(660),array[pg_temp.bid(203),pg_temp.bid(205)]))$$,'COO explicitly consolidates complete ready statements');
select is((select v->'statement'->>'total_amount' from saved where k='consolidated'),'9945.33','consolidation sums frozen fractional and disabled-meal reports');
select is((select count(distinct statement_id) from public.invoice_billing_sources where timelog_id in(pg_temp.bid(203),pg_temp.bid(205))),1::bigint,'current source reservations move atomically to one consolidated statement');
select ok((select bool_and(to_jsonb(s)->>'superseded_by_statement_id'=(select v->'statement'->>'id' from saved where k='consolidated') and s.financial_snapshot=original->'financial_snapshot') from saved,jsonb_array_elements(v)original join public.invoice_billing_statements s on s.id=(original->>'id')::uuid where k='original_statements'),'old statements keep frozen finances and explicit superseded linkage');
select ok(not exists(select 1 from jsonb_array_elements(public.get_invoice_billing_snapshot()->'statements')s where s->>'superseded_by_statement_id' is not null),'superseded statements are excluded from actionable snapshot');
reset role;
select is((select count(*) from private.invoice_billing_jobs where kind='issue' and statement_id=((select v from saved where k='consolidated')->'statement'->>'id')::uuid),0::bigint,'explicit consolidation never creates a standing issue job');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select lives_ok($$select public.confirm_invoice_billing(pg_temp.bid(661),((select v from saved where k='consolidated')->'statement'->>'id')::uuid,((select v from saved where k='consolidated')->'statement'->>'updated_at')::timestamptz,true)$$,'owner confirms the exact consolidated invoice');
reset role;
select is((select count(distinct invoice_id) from public.invoice_timelogs where timelog_id in(pg_temp.bid(203),pg_temp.bid(205))),1::bigint,'complete consolidated reports create one invoice');
select is((select total_amount from public.invoices where billing_statement_id=((select v from saved where k='consolidated')->'statement'->>'id')::uuid),9945.33::numeric,'consolidated invoice retains exact frozen cents');
select is((select count(*) from public.invoice_billing_source_history where timelog_id in(pg_temp.bid(203),pg_temp.bid(205))),4::bigint,'immutable source history keeps both original and consolidated exact links');
select throws_ok($$delete from public.invoice_billing_source_history where timelog_id=pg_temp.bid(203)$$,'42501',null::text,'original consolidated source history cannot be deleted');


-- Revocation wins even when an unrelated billing-identity refresh is required.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
insert into saved values('revoked_identity_quote',public.get_invoice_billing_quote(array[pg_temp.bid(213)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[213]),'approved','',((select v from saved where k='revoked_identity_quote')->>'id')::uuid);
insert into saved values('revoked_identity_statement',(select to_jsonb(s) from public.invoice_billing_statements s where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(213))));
update public.profiles set bank_account='NEXT/0800' where id=pg_temp.bid(11);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select public.set_self_billing_consent(pg_temp.bid(662),false,(select updated_at from public.invoice_billing_consents where contractor_id=pg_temp.bid(11)),false);
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('revoked_identity_jobs',public.claim_invoice_billing_jobs(100));
insert into saved select 'revoked_identity_result',public.process_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid) from saved,jsonb_array_elements(v->'jobs')x where k='revoked_identity_jobs' and x->>'kind'='issue' and x->>'statement_id'=(select v->>'id' from saved where k='revoked_identity_statement');
select is((select v->>'status' from saved where k='revoked_identity_result'),'cancelled','revocation cancels an identity-stale automatic job without retries');
reset role;

-- Numeric special values must block billing without poisoning JSON money or hours.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
update public.profiles set hourly_rate='NaN'::numeric where id=pg_temp.bid(11);
insert into saved values('invalid_rate_quote',public.get_invoice_billing_quote(array[pg_temp.bid(214)]));
select is(((select v from saved where k='invalid_rate_quote')->'preview'->>'total_amount')::numeric,1106::numeric,'nonfinite rate produces safe finite blocked-preview money');
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[214]),'approved','',((select v from saved where k='invalid_rate_quote')->>'id')::uuid);
select is((select blocked_reason from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(214))),'financial_data_incomplete','nonfinite rate blocks billing explicitly');
select is((select status::text from public.timelogs where id=pg_temp.bid(214)),'approved','nonfinite rate preserves approved hours');
update public.profiles set hourly_rate=250 where id=pg_temp.bid(11);
insert into saved values('invalid_km_quote',public.get_invoice_billing_quote(array[pg_temp.bid(215)]));
select is(((select v from saved where k='invalid_km_quote')->'preview'->>'total_amount')::numeric,8550::numeric,'nonfinite distance produces safe finite blocked-preview money');
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[215]),'approved','',((select v from saved where k='invalid_km_quote')->>'id')::uuid);
select is((select blocked_reason from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(215))),'financial_data_incomplete','nonfinite distance blocks billing explicitly');
select is((select status::text from public.timelogs where id=pg_temp.bid(215)),'approved','nonfinite distance preserves approved hours');
reset role;

-- Financially invalid captures recover only through explicit checked preparation.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
select ok(not (select financial_verified from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(214))),'invalid rate remains financially unverified');
select ok(not (select financial_verified from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(215))),'invalid distance remains financially unverified');
select public.prepare_invoice_billing_selection(pg_temp.bid(670),array[pg_temp.bid(214)]);
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(214))),8606::numeric,'explicit COO preparation establishes corrected finite rate financial version');
select is((select status from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(214))),'ready','corrected financial data recovers to ready');
-- The invalid approved source is repaired only through the authenticated COO RPC.
insert into saved values('distance_before',(select to_jsonb(t) from public.timelogs t where id=pg_temp.bid(215)));
select public.repair_invoice_billing_distance(pg_temp.bid(674),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(215)),pg_temp.bid(11),
 (select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(215))),
 jsonb_build_array(jsonb_build_object('timelog_id',pg_temp.bid(215),'expected_updated_at',(select updated_at from public.timelogs where id=pg_temp.bid(215)),'km',10)));
select is((select to_jsonb(t)-array['km','updated_at'] from public.timelogs t where id=pg_temp.bid(215)),(select v-array['km','updated_at'] from saved where k='distance_before'),'repair preserves status/hours/approval provenance fields');
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(215))),8606::numeric,'explicit COO preparation recovers corrected invalid distance');
select ok((select t.updated_at=x.report_updated_at from public.timelogs t join public.invoice_billing_sources x on x.timelog_id=t.id where t.id=pg_temp.bid(215)),'unverified repair reserves exact checked source version');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select lives_ok($$select public.confirm_invoice_billing(pg_temp.bid(675),(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(215)),(select updated_at from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(215))),true)$$,'owner can issue explicitly checked financial repair');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
-- Individual preview dates are owned by the server and expire at Prague midnight.
insert into saved values('dated_quote',public.get_invoice_billing_quote(array[pg_temp.bid(216)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[216]),'approved','',((select v from saved where k='dated_quote')->>'id')::uuid);
insert into saved values('dated_statement',(select to_jsonb(s) from public.invoice_billing_statements s where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(216))));
select is((select v->>'preview_issue_date' from saved where k='dated_statement'),((clock_timestamp() at time zone 'Europe/Prague')::date)::text,'statement preview includes authoritative Czech issue date');
select is((select v->>'preview_due_date' from saved where k='dated_statement'),(((clock_timestamp() at time zone 'Europe/Prague')::date)+14)::text,'statement preview includes authoritative due date');
select is((select v->>'preview_taxable_supply_date' from saved where k='dated_statement'),'2099-01-03','statement preview includes last included work date');
select ok((select (v->>'preview_valid_until')::timestamptz>clock_timestamp() from saved where k='dated_statement'),'statement preview binds a future Prague-midnight expiry');
reset role;
-- Simulate midnight drift only in the disposable rollback fixture. The conditional
-- dynamic command also lets the preceding preview assertions demonstrate RED.
do $$ begin if exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoice_billing_statements' and column_name='preview_valid_until') then
 execute 'update public.invoice_billing_statements set preview_issue_date=(clock_timestamp() at time zone ''Europe/Prague'')::date-1,preview_due_date=(clock_timestamp() at time zone ''Europe/Prague'')::date+13,preview_valid_until=clock_timestamp()-interval ''1 second'' where id=$1' using ((select v from saved where k='dated_statement')->>'id')::uuid;
end if; end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select throws_ok($$select public.confirm_invoice_billing(pg_temp.bid(671),((select v from saved where k='dated_statement')->>'id')::uuid,((select v from saved where k='dated_statement')->>'updated_at')::timestamptz,true)$$,'PT409','invoice_billing_preview_expired','expired individual date preview rejects issuance');
select is((select status::text from public.timelogs where id=pg_temp.bid(216)),'approved','date drift preserves approved source');
select public.refresh_invoice_billing_preview(pg_temp.bid(672),((select v from saved where k='dated_statement')->>'id')::uuid,(select updated_at from public.invoice_billing_statements where id=((select v from saved where k='dated_statement')->>'id')::uuid));
insert into saved values('dated_issued',public.confirm_invoice_billing(pg_temp.bid(673),((select v from saved where k='dated_statement')->>'id')::uuid,(select updated_at from public.invoice_billing_statements where id=((select v from saved where k='dated_statement')->>'id')::uuid),true));
select is((select total_amount from public.invoices where billing_statement_id=((select v from saved where k='dated_statement')->>'id')::uuid),8606::numeric,'date refresh preserves financial snapshot');
select ok((select i.issue_date=(s->>'preview_issue_date')::date and i.due_date=(s->>'preview_due_date')::date and i.taxable_supply_date=(s->>'preview_taxable_supply_date')::date from saved,jsonb_array_elements(jsonb_build_array(v->'statement'))s join public.invoices i on i.id=(s->>'invoice_id')::uuid where k='dated_issued'),'issued invoice uses exactly the refreshed displayed dates');
reset role;

-- Standing consent uses the actual transaction business date at automatic issue.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(1),'role','authenticated')::text,true);
select public.set_self_billing_consent(pg_temp.bid(676),true,(select updated_at from public.invoice_billing_consents where contractor_id=pg_temp.bid(11)),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
insert into saved values('standing_dated_quote',public.get_invoice_billing_quote(array[pg_temp.bid(217)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[217]),'approved','',((select v from saved where k='standing_dated_quote')->>'id')::uuid);
insert into saved values('standing_dated_statement',(select to_jsonb(s) from public.invoice_billing_statements s where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(217))));
reset role;
update public.invoice_billing_statements set preview_issue_date=(transaction_timestamp() at time zone 'Europe/Prague')::date-1,preview_due_date=(transaction_timestamp() at time zone 'Europe/Prague')::date+13,preview_valid_until=transaction_timestamp()-interval '1 second' where id=((select v from saved where k='standing_dated_statement')->>'id')::uuid;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into saved values('standing_dated_jobs',public.claim_invoice_billing_jobs(100));
insert into saved select 'standing_dated_blocked',public.process_invoice_billing_job((x->>'id')::uuid,(x->>'lease_token')::uuid) from saved,jsonb_array_elements(v->'jobs')x where k='standing_dated_jobs' and x->>'kind'='issue' and x->>'statement_id'=(select v->>'id' from saved where k='standing_dated_statement');
select is((select v->>'status' from saved where k='standing_dated_blocked'),'completed','standing consent issues with current server business date after midnight');
reset role;
select is((select count(*) from public.invoices where billing_statement_id=((select v from saved where k='standing_dated_statement')->>'id')::uuid),1::bigint,'standing date change allocates one invoice');
select is((select total_amount from public.invoices where billing_statement_id=((select v from saved where k='standing_dated_statement')->>'id')::uuid),8606::numeric,'standing date advance never reprices frozen money');
select ok((select issue_date=(transaction_timestamp() at time zone 'Europe/Prague')::date and due_date=issue_date+14 and taxable_supply_date='2099-01-03' from public.invoices where billing_statement_id=((select v from saved where k='standing_dated_statement')->>'id')::uuid),'automatic issue uses one transaction date, due14 and frozen supply date');
select is((select identity_version from public.invoice_billing_statements where id=((select v from saved where k='standing_dated_statement')->>'id')::uuid),2,'automatic date-only preview change records a version');

-- Missing/zero rates and invalid distance stay recoverable, including mixed
-- financial + buyer omissions; buyer-only correction never reprices later.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.bid(4),'role','authenticated')::text,true);
update public.profiles set hourly_rate=0 where id=pg_temp.bid(11);
insert into saved values('zero_rate_quote',public.get_invoice_billing_quote(array[pg_temp.bid(218)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[218]),'approved','',((select v from saved where k='zero_rate_quote')->>'id')::uuid);
select ok(not (select financial_verified from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(218))),'zero rate + missing buyer remains financially unverified');
update public.profiles set hourly_rate=250 where id=pg_temp.bid(11);
select public.prepare_invoice_billing_selection(pg_temp.bid(680),array[pg_temp.bid(218)]);
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(218))),8606::numeric,'explicit zero-rate repair prices corrected finance despite missing buyer');
update public.events set project_id=pg_temp.bid(51) where id=pg_temp.bid(118);
update public.profiles set hourly_rate=999 where id=pg_temp.bid(11);
select public.prepare_invoice_billing_selection(pg_temp.bid(681),array[pg_temp.bid(218)]);
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(218))),8606::numeric,'later buyer-only fix preserves verified monetary version');
update public.profiles set hourly_rate=null where id=pg_temp.bid(11);
insert into saved values('missing_rate_quote',public.get_invoice_billing_quote(array[pg_temp.bid(219)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[219]),'approved','',((select v from saved where k='missing_rate_quote')->>'id')::uuid);
select ok(not (select financial_verified from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(219))),'missing rate remains financially unverified');
update public.profiles set hourly_rate=250 where id=pg_temp.bid(11);
select public.prepare_invoice_billing_selection(pg_temp.bid(682),array[pg_temp.bid(219)]);
select is((select total_amount from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(219))),8606::numeric,'explicit missing-rate repair establishes checked monetary version');
insert into saved values('negative_km_quote',public.get_invoice_billing_quote(array[pg_temp.bid(220)]));
select public.resolve_timelog_approvals_atomic(pg_temp.targets(array[220]),'approved','',((select v from saved where k='negative_km_quote')->>'id')::uuid);
select ok(not (select financial_verified from public.invoice_billing_statements where id=(select statement_id from public.invoice_billing_sources where timelog_id=pg_temp.bid(220))),'negative distance remains financially unverified');
reset role;

select * from finish();
rollback;
