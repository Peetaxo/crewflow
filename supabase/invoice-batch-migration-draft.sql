begin;

-- Billing batch migration draft.
-- Goal: one invoice header per contractor/batch, with multiple job-number items
-- and explicit links to the approved timelogs included in that batch.

-- 1) New invoice item table: one invoice can contain multiple job numbers.
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  job_number text not null,
  event_id uuid null references public.events(id) on delete set null,
  hours numeric(10,2) not null default 0,
  amount_hours numeric(12,2) not null default 0,
  km numeric(10,2) not null default 0,
  amount_km numeric(12,2) not null default 0,
  amount_receipts numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_items_invoice_id on public.invoice_items(invoice_id);
create index if not exists idx_invoice_items_job_number on public.invoice_items(job_number);
create index if not exists idx_invoice_items_event_id on public.invoice_items(event_id);

comment on table public.invoice_items is
  'Polozky faktury. Jedna faktura muze obsahovat vice job number i vice akci.';

comment on column public.invoice_items.job_number is
  'Job Number, pod kterym se seskupuji polozky faktury.';

comment on column public.invoice_items.total_amount is
  'Soucet hours/km/uctenek pro jednu fakturacni polozku (typicky jeden job number).';

-- 2) Link table between invoices and approved timelogs included in a billing batch.
create table if not exists public.invoice_timelogs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  timelog_id uuid not null references public.timelogs(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint invoice_timelogs_invoice_id_timelog_id_key unique (invoice_id, timelog_id),
  constraint invoice_timelogs_timelog_id_key unique (timelog_id)
);

create index if not exists idx_invoice_timelogs_invoice_id on public.invoice_timelogs(invoice_id);
create index if not exists idx_invoice_timelogs_timelog_id on public.invoice_timelogs(timelog_id);

comment on table public.invoice_timelogs is
  'Vazba mezi fakturou a konkretne vyfakturovanymi timelogy.';

-- 3) Optional forward-compatible link table for receipts.
create table if not exists public.invoice_receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint invoice_receipts_invoice_id_receipt_id_key unique (invoice_id, receipt_id),
  constraint invoice_receipts_receipt_id_key unique (receipt_id)
);

create index if not exists idx_invoice_receipts_invoice_id on public.invoice_receipts(invoice_id);
create index if not exists idx_invoice_receipts_receipt_id on public.invoice_receipts(receipt_id);

comment on table public.invoice_receipts is
  'Volitelna vazba mezi fakturou a uctenkami zahrnutymi do fakturace.';

-- 4) Legacy columns kept temporarily for backward compatibility during migration.
comment on table public.invoices is
  'Hlavicka faktury / billing batch pro jednoho kontraktora. Polozky a timelogy jsou navazane pres invoice_items a invoice_timelogs.';

comment on column public.invoices.event_id is
  'Docasne ponechano kvuli prechodu ze stareho modelu 1 invoice = 1 event/timelog.';

comment on column public.invoices.timelog_id is
  'Docasne ponechano kvuli prechodu ze stareho modelu 1 invoice = 1 timelog.';

comment on column public.invoices.job_number is
  'Docasne ponechano kvuli prechodu na invoice_items s vice job number v jedne fakture.';

comment on column public.invoices.total_amount is
  'Celkovy soucet faktury napric vsemi invoice_items v danem billing batchi.';

-- 5) The approval trigger should not auto-create invoices in the old 1:1 model.
drop trigger if exists trg_timelog_approved on public.timelogs;

drop function if exists public.handle_timelog_approved();

commit;
