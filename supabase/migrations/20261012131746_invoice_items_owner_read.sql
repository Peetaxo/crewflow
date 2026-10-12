-- Crew can read the breakdown of their own invoice. Management reads and
-- write privileges are unchanged; the parent invoice remains subject to RLS.
create policy invoice_items_select_own
on public.invoice_items
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and exists (
    select 1
    from public.invoices as invoice
    where invoice.id = invoice_items.invoice_id
      and invoice.contractor_id = (select public.current_profile_id())
  )
);
