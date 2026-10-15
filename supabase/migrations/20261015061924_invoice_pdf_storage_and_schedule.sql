-- A re-bound profile must not inherit a different Auth user's frozen statement.
-- Legacy invoices keep their existing owner access; management scope is unchanged.
alter policy "Crew can view own invoices" on public.invoices
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and (
    billing_statement_id is null
    or exists (select 1 from public.invoice_billing_statements s where s.id = invoices.billing_statement_id)
  )
);

-- Exact immutable document records authorize every retained version, including returns
-- and superseded statements. Existing invoice-path SELECT policy remains intact.
create policy "Authorized users can read original invoice documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'invoice-pdfs'
  and exists (
    select 1 from public.invoice_billing_documents d
    where d.storage_bucket = storage.objects.bucket_id
      and d.storage_path = storage.objects.name
  )
);
-- No INSERT/UPDATE/DELETE policies: all files are written by verified Edge services.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
-- Provision the credential and one named schedule only after reviewed deployment;
-- see functions/process-invoice-pdfs/schedule.sql and README.md. No secret in migrations.
