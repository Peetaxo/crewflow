-- Run only against the isolated local DB. All fixtures and write probes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select relrowsecurity from pg_class where oid = 'public.invoice_items'::regclass), 'invoice items retain RLS');
select ok(not has_table_privilege('anon', 'public.invoice_items', 'SELECT'), 'anonymous callers have no item read grant');
select ok(not has_table_privilege('authenticated', 'public.invoice_items', 'INSERT'), 'direct insert remains unavailable');
select ok(not has_table_privilege('authenticated', 'public.invoice_items', 'UPDATE'), 'direct update remains unavailable');
select ok(not has_table_privilege('authenticated', 'public.invoice_items', 'DELETE'), 'direct delete remains unavailable');

insert into auth.users(id, email, raw_user_meta_data) values
  ('94000000-0000-4000-8000-000000000001', 'invoice-items-owner-a@example.invalid', '{"role":"coo"}'),
  ('94000000-0000-4000-8000-000000000002', 'invoice-items-owner-b@example.invalid', '{}'),
  ('94000000-0000-4000-8000-000000000003', 'invoice-items-head@example.invalid', '{}'),
  ('94000000-0000-4000-8000-000000000004', 'invoice-items-coo@example.invalid', '{}');
insert into public.user_roles(user_id, role) values
  ('94000000-0000-4000-8000-000000000001', 'crew'),
  ('94000000-0000-4000-8000-000000000002', 'crew'),
  ('94000000-0000-4000-8000-000000000003', 'crewhead'),
  ('94000000-0000-4000-8000-000000000004', 'coo') on conflict do nothing;
insert into public.invoices(id, contractor_id, job_number, invoice_number, total_hours, total_amount)
  select '95000000-0000-4000-8000-000000000001', id, 'ITEM-TEST-A', 'TEST-ITEM-OWNER-A', 4, 1000
  from public.profiles where user_id = '94000000-0000-4000-8000-000000000001';
insert into public.invoices(id, contractor_id, job_number, invoice_number, total_hours, total_amount)
  select '95000000-0000-4000-8000-000000000002', id, 'ITEM-TEST-B', 'TEST-ITEM-OWNER-B', 8, 2000
  from public.profiles where user_id = '94000000-0000-4000-8000-000000000002';
insert into public.invoice_items(id, invoice_id, job_number, hours, amount_hours, km, amount_km, total_amount) values
  ('96000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 'ITEM-TEST-A', 4, 1000, 10, 0, 1000),
  ('96000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000002', 'ITEM-TEST-B', 8, 2000, 20, 0, 2000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000001","role":"authenticated","user_metadata":{"role":"coo"}}', true);
select is((select count(*) from public.invoice_items), 1::bigint, 'owner A sees only their own item even without a client filter');
select is((select count(*) from public.invoice_items where invoice_id = '95000000-0000-4000-8000-000000000001'), 1::bigint, 'owner A sees their persisted item');
select is((select count(*) from public.invoice_items where invoice_id = '95000000-0000-4000-8000-000000000002'), 0::bigint, 'owner A cannot see B even with spoofed user metadata');
select throws_ok($$update public.invoice_items set km = 99 where id = '96000000-0000-4000-8000-000000000001'$$, '42501', null::text, 'owner cannot directly update items');
select throws_ok($$delete from public.invoice_items where id = '96000000-0000-4000-8000-000000000001'$$, '42501', null::text, 'owner cannot directly delete items');
select throws_ok($$insert into public.invoice_items(invoice_id, job_number) values ('95000000-0000-4000-8000-000000000001', 'UNAUTHORIZED')$$, '42501', null::text, 'owner cannot directly insert items');

select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.invoice_items), 1::bigint, 'owner B sees only their own item');
select is((select count(*) from public.invoice_items where invoice_id = '95000000-0000-4000-8000-000000000001'), 0::bigint, 'owner B cannot see A');

select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.invoice_items where invoice_id in ('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000002')), 2::bigint, 'CrewHead retains management read access');
select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.invoice_items where invoice_id in ('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000002')), 2::bigint, 'COO retains management read access');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.invoice_items$$, '42501', null::text, 'anonymous item requests are rejected');
reset role;
select is((select km from public.invoice_items where id = '96000000-0000-4000-8000-000000000001'), 10::numeric, 'rejected writes leave persisted kilometers unchanged');
select * from finish();
rollback;
