alter table public.invoices
  add column if not exists amount_meals numeric default 0;

alter table public.invoice_items
  add column if not exists amount_meals numeric default 0;

update public.invoices
set amount_meals = 0
where amount_meals is null;

update public.invoice_items
set amount_meals = 0
where amount_meals is null;

alter table public.invoice_items
  alter column amount_meals set not null;
