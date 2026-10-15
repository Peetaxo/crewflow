-- Rollback-only local reproduction: a profile may be rebound by privileged account
-- administration, but a statement-backed invoice retains the frozen Auth owner.
\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(10);
create temporary table fixture as
 select i.id invoice_id,i.contractor_id,s.id statement_id,s.contractor_user_id,i.pdf_path,d.storage_path old_document_path,
 (select p.user_id from public.invoices legacy join public.profiles p on p.id=legacy.contractor_id where legacy.id='a87b8597-cd3e-4f71-afe4-9d899cfc2bd6') legacy_user_id,
 (select r.user_id from public.user_roles r join auth.users u on u.id=r.user_id where r.role='crewhead' and u.email like '%@crewflow-demo.test' limit 1) ch_user_id
 from public.invoices i join public.invoice_billing_statements s on s.id=i.billing_statement_id
 join public.invoice_billing_documents d on d.statement_id=s.id and d.id<>i.billing_document_id
 where s.contractor_user_id is not null and i.pdf_path is not null and exists(select 1 from storage.objects o where o.bucket_id='invoice-pdfs' and o.name=i.pdf_path) limit 1;
select is((select count(*) from fixture),1::bigint,'fixture contains an existing synthetic statement invoice');
insert into auth.users(id,email,raw_user_meta_data) values('97800000-0000-4000-8000-000000000001','DISPOSABLE-binding@crewflow-demo.test','{}');
delete from public.profiles where user_id='97800000-0000-4000-8000-000000000001';
insert into public.user_roles(user_id,role) values('97800000-0000-4000-8000-000000000001','crew') on conflict do nothing;
update public.profiles set user_id='97800000-0000-4000-8000-000000000001' where id=(select contractor_id from fixture);
grant select on fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"97800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.invoice_billing_statements where id=(select statement_id from fixture)),0::bigint,'replacement Auth user cannot see original frozen statement');
select is((select count(*) from public.invoices where id=(select invoice_id from fixture)),0::bigint,'replacement Auth user cannot see original invoice');
select is((select count(*) from public.invoice_items where invoice_id=(select invoice_id from fixture)),0::bigint,'item reads follow the frozen parent invoice visibility');
select is((select count(*) from storage.objects where bucket_id='invoice-pdfs' and name=(select pdf_path from fixture)),0::bigint,'replacement user cannot read the accepted original through invoice fallback');
select is((select count(*) from storage.objects where bucket_id='invoice-pdfs' and name=(select old_document_path from fixture)),0::bigint,'replacement user cannot read a retained returned document');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select ch_user_id from fixture),'role','authenticated')::text,true);
select is((select count(*) from public.invoices where id=(select invoice_id from fixture)),1::bigint,'CH retains invoice visibility');
select is((select count(*) from storage.objects where bucket_id='invoice-pdfs' and name=(select pdf_path from fixture)),1::bigint,'CH retains accepted original access');
select is((select count(*) from storage.objects where bucket_id='invoice-pdfs' and name=(select old_document_path from fixture)),1::bigint,'CH retains returned original history access');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select legacy_user_id from fixture),'role','authenticated')::text,true);
select is((select count(*) from public.invoices where id='a87b8597-cd3e-4f71-afe4-9d899cfc2bd6'),1::bigint,'legacy owner access remains available');
select * from finish();
rollback;
