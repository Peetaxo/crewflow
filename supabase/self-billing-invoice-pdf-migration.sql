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

comment on column public.invoices.invoice_number is
  'Self-billing invoice number, e.g. SF-2026-NOVAK-T-0001.';
comment on column public.invoices.supplier_snapshot is
  'Immutable supplier billing snapshot copied from profiles when the invoice is issued.';
comment on column public.invoices.customer_snapshot is
  'Immutable customer billing snapshot copied from clients when the invoice is issued.';
comment on column public.invoices.pdf_path is
  'Private Supabase Storage path in bucket invoice-pdfs.';

commit;
