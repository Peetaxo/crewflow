begin;

create table if not exists public.invoice_approval_documents (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'powerapps_document_approval',
  external_id text,
  document_name text not null,
  company text,
  job_number text,
  invoice_number text,
  supplier_name text,
  approval_status text not null default 'unknown',
  approval_status_label text,
  comment text,
  approvers text[] not null default '{}',
  requester text,
  raw_payload jsonb,
  matched_invoice_id uuid references public.invoices(id) on delete set null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_approval_documents_source_check
    check (source in ('powerapps_document_approval')),
  constraint invoice_approval_documents_status_check
    check (approval_status in ('pending', 'approved', 'rejected', 'unknown'))
);

create unique index if not exists invoice_approval_documents_source_external_id_key
  on public.invoice_approval_documents(source, external_id)
  where external_id is not null;

create index if not exists idx_invoice_approval_documents_matched_invoice_id
  on public.invoice_approval_documents(matched_invoice_id);

create index if not exists idx_invoice_approval_documents_invoice_number
  on public.invoice_approval_documents(invoice_number)
  where invoice_number is not null;

create index if not exists idx_invoice_approval_documents_job_number
  on public.invoice_approval_documents(job_number)
  where job_number is not null;

create index if not exists idx_invoice_approval_documents_supplier_name
  on public.invoice_approval_documents(supplier_name)
  where supplier_name is not null;

comment on table public.invoice_approval_documents is
  'Read-only mirror of documents from the PowerApps Document Approval flow. This does not represent bank payment state.';

comment on column public.invoice_approval_documents.matched_invoice_id is
  'Optional reviewed link to a Nodu invoice when automatic matching is ambiguous.';

comment on column public.invoice_approval_documents.raw_payload is
  'Original connector payload from PowerApps/Dataverse/SharePoint for audit and reprocessing.';

alter table public.invoice_approval_documents enable row level security;

drop policy if exists "Crewhead and COO can read unmatched approval documents"
  on public.invoice_approval_documents;

create policy "Crewhead and COO can read unmatched approval documents"
  on public.invoice_approval_documents
  for select
  to authenticated
  using (
    matched_invoice_id is null
    and (
      public.has_role(auth.uid(), 'crewhead'::public.app_role)
      or public.has_role(auth.uid(), 'coo'::public.app_role)
    )
  );

drop policy if exists "Users can read approval documents for visible invoices"
  on public.invoice_approval_documents;

create policy "Users can read approval documents for visible invoices"
  on public.invoice_approval_documents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.invoices invoice
      where invoice.id = invoice_approval_documents.matched_invoice_id
        and (
          invoice.contractor_id = public.current_profile_id()
          or public.has_role(auth.uid(), 'crewhead'::public.app_role)
          or public.has_role(auth.uid(), 'coo'::public.app_role)
        )
    )
  );

drop policy if exists "Crewhead and COO can manage approval documents"
  on public.invoice_approval_documents;

create policy "Crewhead and COO can manage approval documents"
  on public.invoice_approval_documents
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  )
  with check (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  );

commit;
