begin;

alter table public.invoices
  add column if not exists invoice_number text,
  add column if not exists issue_date date,
  add column if not exists taxable_supply_date date,
  add column if not exists due_date date,
  add column if not exists currency text not null default 'CZK',
  add column if not exists supplier_snapshot jsonb,
  add column if not exists customer_snapshot jsonb,
  add column if not exists pdf_path text,
  add column if not exists pdf_generated_at timestamptz;

alter table public.profiles
  add column if not exists iban text;

create unique index if not exists invoices_invoice_number_key
  on public.invoices(invoice_number)
  where invoice_number is not null;

create index if not exists idx_invoices_pdf_path
  on public.invoices(pdf_path)
  where pdf_path is not null;

create table if not exists public.invoice_number_sequences (
  id uuid primary key default gen_random_uuid(),
  invoice_year integer not null,
  supplier_profile_id uuid not null references public.profiles(id) on delete cascade,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_number_sequences_year_supplier_key unique (invoice_year, supplier_profile_id)
);

create or replace function public.next_self_billing_invoice_sequence(
  p_invoice_year integer,
  p_supplier_profile_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.invoice_number_sequences (invoice_year, supplier_profile_id, last_number)
  values (p_invoice_year, p_supplier_profile_id, 1)
  on conflict (invoice_year, supplier_profile_id)
  do update set
    last_number = public.invoice_number_sequences.last_number + 1,
    updated_at = now()
  returning last_number into v_next;

  return v_next;
end;
$$;

insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "Users can read invoice PDFs" on storage.objects;

create policy "Users can read invoice PDFs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'invoice-pdfs'
    and exists (
      select 1
      from public.invoices invoice
      where invoice.pdf_path = storage.objects.name
        and (
          invoice.contractor_id = public.current_profile_id()
          or public.has_role(auth.uid(), 'crewhead'::public.app_role)
          or public.has_role(auth.uid(), 'coo'::public.app_role)
        )
    )
  );

with invoices_to_backfill as (
  select
    invoice.id,
    invoice.contractor_id,
    extract(year from coalesce(invoice.created_at, now()))::integer as invoice_year,
    coalesce(invoice.created_at::date, current_date) as issue_date,
    profile.first_name,
    profile.last_name,
    profile.ico as supplier_ico,
    profile.dic as supplier_dic,
    profile.bank_account,
    profile.iban,
    profile.billing_street,
    profile.billing_zip,
    profile.billing_city,
    coalesce(profile.billing_country, 'Ceska republika') as billing_country,
    client.id as client_id,
    client.name as client_name,
    client.ico as client_ico,
    client.dic as client_dic,
    client.street as client_street,
    client.zip as client_zip,
    client.city as client_city,
    coalesce(client.country, 'Ceska republika') as client_country
  from public.invoices invoice
  join public.profiles profile on profile.id = invoice.contractor_id
  join public.events event on event.id = invoice.event_id
  join public.projects project on project.id = event.project_id
  join public.clients client on client.id = project.client_id
  where invoice.invoice_number is null
),
numbered_invoices as (
  select
    *,
    public.next_self_billing_invoice_sequence(invoice_year, contractor_id) as invoice_sequence
  from invoices_to_backfill
)
update public.invoices invoice
set
  invoice_number = concat(
    'SF-',
    numbered.invoice_year,
    '-',
    coalesce(nullif(regexp_replace(upper(numbered.last_name), '[^A-Z0-9]+', '-', 'g'), ''), 'X'),
    '-',
    left(coalesce(nullif(regexp_replace(upper(numbered.first_name), '[^A-Z0-9]+', '', 'g'), ''), 'X'), 1),
    '-',
    lpad(numbered.invoice_sequence::text, 4, '0')
  ),
  issue_date = numbered.issue_date,
  taxable_supply_date = numbered.issue_date,
  due_date = numbered.issue_date + interval '14 days',
  currency = 'CZK',
  supplier_snapshot = jsonb_build_object(
    'profileId', numbered.contractor_id,
    'name', trim(concat_ws(' ', numbered.first_name, numbered.last_name)),
    'ico', coalesce(numbered.supplier_ico, ''),
    'dic', nullif(numbered.supplier_dic, ''),
    'bankAccount', coalesce(numbered.bank_account, ''),
    'iban', nullif(numbered.iban, ''),
    'billingStreet', coalesce(numbered.billing_street, ''),
    'billingZip', coalesce(numbered.billing_zip, ''),
    'billingCity', coalesce(numbered.billing_city, ''),
    'billingCountry', numbered.billing_country,
    'vatPayer', false
  ),
  customer_snapshot = jsonb_build_object(
    'clientId', numbered.client_id,
    'name', coalesce(numbered.client_name, ''),
    'ico', coalesce(numbered.client_ico, ''),
    'dic', nullif(numbered.client_dic, ''),
    'street', coalesce(numbered.client_street, ''),
    'zip', coalesce(numbered.client_zip, ''),
    'city', coalesce(numbered.client_city, ''),
    'country', numbered.client_country
  )
from numbered_invoices numbered
where invoice.id = numbered.id;

update public.invoices invoice
set supplier_snapshot = jsonb_set(
  jsonb_set(
    coalesce(invoice.supplier_snapshot, '{}'::jsonb),
    '{iban}',
    to_jsonb(profile.iban),
    true
  ),
  '{bankAccount}',
  to_jsonb(profile.bank_account),
  true
)
from public.profiles profile
where profile.id = invoice.contractor_id
  and profile.iban is not null
  and (
    (invoice.supplier_snapshot->>'iban') is null
    or (invoice.supplier_snapshot->>'bankAccount') is distinct from profile.bank_account
  );

comment on column public.invoices.invoice_number is
  'Self-billing invoice number, e.g. SF-2026-NOVAK-T-0001.';
comment on column public.invoices.supplier_snapshot is
  'Immutable supplier billing snapshot copied from profiles when the invoice is issued.';
comment on column public.invoices.customer_snapshot is
  'Immutable customer billing snapshot copied from clients when the invoice is issued.';
comment on column public.invoices.pdf_path is
  'Private Supabase Storage path in bucket invoice-pdfs.';
comment on column public.profiles.iban is
  'Verified IBAN used for QR Platba on self-billing invoices.';

commit;
