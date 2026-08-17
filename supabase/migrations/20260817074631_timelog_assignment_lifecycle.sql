begin;

set local lock_timeout = '5s';

alter type public.timelog_status
  add value if not exists 'pending_crew_confirmation' after 'pending_ch';

-- PostgreSQL forbids using a freshly-added enum label until the transaction
-- that added it commits. Keeping this small, idempotent step separate makes a
-- clean replay safe while the lifecycle/schema work below stays atomic.
commit;

begin;

set local lock_timeout = '5s';

create table if not exists public.event_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'withdrawal_requested')),
  note text,
  planned_from time,
  planned_to time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

alter table public.event_applications
  add column if not exists status text not null default 'pending',
  add column if not exists note text,
  add column if not exists planned_from time,
  add column if not exists planned_to time,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from (
      values
        ('id', 'uuid', 'NO'),
        ('event_id', 'uuid', 'NO'),
        ('profile_id', 'uuid', 'NO'),
        ('status', 'text', 'NO'),
        ('note', 'text', 'YES'),
        ('planned_from', 'time', 'YES'),
        ('planned_to', 'time', 'YES'),
        ('created_at', 'timestamptz', 'NO'),
        ('updated_at', 'timestamptz', 'NO')
    ) as required_columns (column_name, udt_name, is_nullable)
    left join information_schema.columns c
      on c.table_schema = 'public'
      and c.table_name = 'event_applications'
      and c.column_name = required_columns.column_name
    where c.column_name is null
      or c.udt_name <> required_columns.udt_name
      or c.is_nullable <> required_columns.is_nullable
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'event_applications'
      and c.column_name = 'id'
      and c.column_default is not null
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'event_applications'
      and c.column_name = 'status'
      and c.column_default = '''pending''::text'
  ) or exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'event_applications'
      and c.column_name in ('created_at', 'updated_at')
      and c.column_default is null
  ) then
    raise exception 'event_applications core columns are incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute id_column
      on id_column.attrelid = c.conrelid
      and id_column.attname = 'id'
      and not id_column.attisdropped
    where c.conrelid = 'public.event_applications'::pg_catalog.regclass
      and c.contype = 'p'
      and c.conkey = array[id_column.attnum]
  ) then
    raise exception 'event_applications primary key is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'event_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.event_applications'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.events'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) then
    raise exception 'event_applications event_id foreign key is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'profile_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.event_applications'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.profiles'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) then
    raise exception 'event_applications profile_id foreign key is incompatible';
  end if;
end
$$;

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

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  job_number text not null,
  event_id uuid references public.events(id) on delete set null,
  hours numeric(10,2) not null default 0,
  amount_hours numeric(12,2) not null default 0,
  km numeric(10,2) not null default 0,
  amount_km numeric(12,2) not null default 0,
  amount_receipts numeric(12,2) not null default 0,
  amount_meals numeric not null default 0,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.invoice_items
  add column if not exists amount_meals numeric not null default 0;

create table if not exists public.invoice_timelogs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  timelog_id uuid not null references public.timelogs(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint invoice_timelogs_invoice_id_timelog_id_key unique (invoice_id, timelog_id),
  constraint invoice_timelogs_timelog_id_key unique (timelog_id)
);

create table if not exists public.invoice_receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint invoice_receipts_invoice_id_receipt_id_key unique (invoice_id, receipt_id),
  constraint invoice_receipts_receipt_id_key unique (receipt_id)
);

do $$
begin
  if exists (
    select 1
    from (
      values
        ('invoice_number', 'text', 'YES'),
        ('issue_date', 'date', 'YES'),
        ('taxable_supply_date', 'date', 'YES'),
        ('due_date', 'date', 'YES'),
        ('currency', 'text', 'NO'),
        ('supplier_snapshot', 'jsonb', 'YES'),
        ('customer_snapshot', 'jsonb', 'YES'),
        ('pdf_path', 'text', 'YES'),
        ('pdf_generated_at', 'timestamptz', 'YES')
    ) as required_columns (column_name, udt_name, is_nullable)
    left join information_schema.columns c
      on c.table_schema = 'public'
      and c.table_name = 'invoices'
      and c.column_name = required_columns.column_name
    where c.column_name is null
      or c.udt_name <> required_columns.udt_name
      or c.is_nullable <> required_columns.is_nullable
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoices'
      and c.column_name = 'currency'
      and c.column_default = '''CZK''::text'
  ) then
    raise exception 'invoices billing columns are incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_id', 'uuid', 'NO', null::integer, null::integer),
        ('job_number', 'text', 'NO', null::integer, null::integer),
        ('event_id', 'uuid', 'YES', null::integer, null::integer),
        ('hours', 'numeric', 'NO', 10, 2),
        ('amount_hours', 'numeric', 'NO', 12, 2),
        ('km', 'numeric', 'NO', 10, 2),
        ('amount_km', 'numeric', 'NO', 12, 2),
        ('amount_receipts', 'numeric', 'NO', 12, 2),
        ('amount_meals', 'numeric', 'NO', null::integer, null::integer),
        ('total_amount', 'numeric', 'NO', 12, 2),
        ('created_at', 'timestamptz', 'NO', null::integer, null::integer)
    ) as required_columns (
      column_name,
      udt_name,
      is_nullable,
      numeric_precision,
      numeric_scale
    )
    left join information_schema.columns c
      on c.table_schema = 'public'
      and c.table_name = 'invoice_items'
      and c.column_name = required_columns.column_name
    where c.column_name is null
      or c.udt_name <> required_columns.udt_name
      or c.is_nullable <> required_columns.is_nullable
      or c.numeric_precision is distinct from required_columns.numeric_precision
      or c.numeric_scale is distinct from required_columns.numeric_scale
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoice_items'
      and c.column_name = 'id'
      and c.column_default = 'gen_random_uuid()'
  ) or exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoice_items'
      and c.column_name in (
        'hours',
        'amount_hours',
        'km',
        'amount_km',
        'amount_receipts',
        'amount_meals',
        'total_amount'
      )
      and c.column_default is distinct from '0'
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoice_items'
      and c.column_name = 'created_at'
      and c.column_default = 'now()'
  ) then
    raise exception 'invoice_items core columns are incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('id', 'uuid', 'NO'),
        ('invoice_id', 'uuid', 'NO'),
        ('timelog_id', 'uuid', 'NO'),
        ('created_at', 'timestamptz', 'NO')
    ) as required_columns (column_name, udt_name, is_nullable)
    left join information_schema.columns c
      on c.table_schema = 'public'
      and c.table_name = 'invoice_timelogs'
      and c.column_name = required_columns.column_name
    where c.column_name is null
      or c.udt_name <> required_columns.udt_name
      or c.is_nullable <> required_columns.is_nullable
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoice_timelogs'
      and c.column_name = 'id'
      and c.column_default = 'gen_random_uuid()'
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoice_timelogs'
      and c.column_name = 'created_at'
      and c.column_default = 'now()'
  ) then
    raise exception 'invoice_timelogs core columns are incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('id', 'uuid', 'NO'),
        ('invoice_id', 'uuid', 'NO'),
        ('receipt_id', 'uuid', 'NO'),
        ('created_at', 'timestamptz', 'NO')
    ) as required_columns (column_name, udt_name, is_nullable)
    left join information_schema.columns c
      on c.table_schema = 'public'
      and c.table_name = 'invoice_receipts'
      and c.column_name = required_columns.column_name
    where c.column_name is null
      or c.udt_name <> required_columns.udt_name
      or c.is_nullable <> required_columns.is_nullable
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoice_receipts'
      and c.column_name = 'id'
      and c.column_default = 'gen_random_uuid()'
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoice_receipts'
      and c.column_name = 'created_at'
      and c.column_default = 'now()'
  ) then
    raise exception 'invoice_receipts core columns are incompatible';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute id_column
      on id_column.attrelid = c.conrelid
      and id_column.attname = 'id'
      and not id_column.attisdropped
    where c.conrelid = 'public.invoice_items'::pg_catalog.regclass
      and c.contype = 'p'
      and c.conkey = array[id_column.attnum]
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'invoice_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.invoice_items'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.invoices'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'event_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.invoice_items'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.events'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'n'
  ) then
    raise exception 'invoice_items constraints are incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'timelog_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.invoices'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.timelogs'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'n'
  ) then
    raise exception 'invoices timelog_id foreign key is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute id_column
      on id_column.attrelid = c.conrelid
      and id_column.attname = 'id'
      and not id_column.attisdropped
    where c.conrelid = 'public.invoice_timelogs'::pg_catalog.regclass
      and c.contype = 'p'
      and c.conkey = array[id_column.attnum]
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.invoice_timelogs'::pg_catalog.regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (invoice_id, timelog_id)'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.invoice_timelogs'::pg_catalog.regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (timelog_id)'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'invoice_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.invoice_timelogs'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.invoices'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'timelog_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.invoice_timelogs'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.timelogs'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) then
    raise exception 'invoice_timelogs constraints are incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute id_column
      on id_column.attrelid = c.conrelid
      and id_column.attname = 'id'
      and not id_column.attisdropped
    where c.conrelid = 'public.invoice_receipts'::pg_catalog.regclass
      and c.contype = 'p'
      and c.conkey = array[id_column.attnum]
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.invoice_receipts'::pg_catalog.regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (invoice_id, receipt_id)'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.invoice_receipts'::pg_catalog.regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (receipt_id)'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'invoice_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.invoice_receipts'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.invoices'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'receipt_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.invoice_receipts'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.receipts'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) then
    raise exception 'invoice_receipts constraints are incompatible';
  end if;
end
$$;

create unique index if not exists invoices_invoice_number_key
  on public.invoices (invoice_number)
  where invoice_number is not null;
create index if not exists idx_invoices_pdf_path
  on public.invoices (pdf_path)
  where pdf_path is not null;
create index if not exists idx_invoice_items_invoice_id
  on public.invoice_items (invoice_id);
create index if not exists idx_invoice_items_event_id
  on public.invoice_items (event_id);
create index if not exists idx_invoice_timelogs_invoice_id
  on public.invoice_timelogs (invoice_id);
create index if not exists idx_invoice_timelogs_timelog_id
  on public.invoice_timelogs (timelog_id);
create index if not exists idx_invoice_receipts_invoice_id
  on public.invoice_receipts (invoice_id);
create index if not exists idx_invoice_receipts_receipt_id
  on public.invoice_receipts (receipt_id);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class index_relation on index_relation.oid = i.indexrelid
    join pg_catalog.pg_attribute indexed_column
      on indexed_column.attrelid = i.indrelid
      and indexed_column.attname = 'invoice_number'
      and not indexed_column.attisdropped
    where i.indrelid = 'public.invoices'::pg_catalog.regclass
      and index_relation.relname = 'invoices_invoice_number_key'
      and i.indisunique
      and i.indnkeyatts = 1
      and i.indkey[0] = indexed_column.attnum
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) = '(invoice_number IS NOT NULL)'
  ) or not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class index_relation on index_relation.oid = i.indexrelid
    join pg_catalog.pg_attribute indexed_column
      on indexed_column.attrelid = i.indrelid
      and indexed_column.attname = 'pdf_path'
      and not indexed_column.attisdropped
    where i.indrelid = 'public.invoices'::pg_catalog.regclass
      and index_relation.relname = 'idx_invoices_pdf_path'
      and not i.indisunique
      and i.indnkeyatts = 1
      and i.indkey[0] = indexed_column.attnum
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) = '(pdf_path IS NOT NULL)'
  ) then
    raise exception 'invoices billing indexes are incompatible';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'timelog_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.timelog_days'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.timelogs'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) then
    raise exception 'timelog_days timelog_id foreign key is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.event_assignments'::pg_catalog.regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (event_id, profile_id)'
  ) then
    raise exception 'event_assignments event/profile uniqueness is incompatible';
  end if;
end
$$;

alter table public.event_applications
  drop constraint if exists event_applications_status_check,
  add constraint event_applications_status_check
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'withdrawal_requested'));

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.event_applications'::pg_catalog.regclass
      and c.conname = 'event_applications_event_profile_unique'
      and pg_catalog.pg_get_constraintdef(c.oid) <> 'UNIQUE (event_id, profile_id)'
  ) then
    raise exception 'event_applications_event_profile_unique has an unexpected definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.event_applications'::pg_catalog.regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (event_id, profile_id)'
  ) then
    alter table public.event_applications
      add constraint event_applications_event_profile_unique unique (event_id, profile_id);
  end if;
end
$$;

alter table public.events
  add column if not exists allow_crew_time_proposal boolean not null default false;

create index if not exists event_applications_event_id_idx
  on public.event_applications (event_id);
create index if not exists event_applications_profile_id_idx
  on public.event_applications (profile_id);
create index if not exists event_applications_status_idx
  on public.event_applications (status);

alter table public.event_applications enable row level security;
revoke all on public.event_applications from authenticated;
grant select, insert, update on public.event_applications to authenticated;
revoke all on public.event_applications from anon;

drop policy if exists "Crew can view own event applications" on public.event_applications;
create policy "Crew can view own event applications"
on public.event_applications for select to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "Crew can create own event applications" on public.event_applications;
create policy "Crew can create own event applications"
on public.event_applications for insert to authenticated
with check (
  profile_id = public.current_profile_id()
  and (
    status = 'pending'
    or (
      status = 'withdrawal_requested'
      and exists (
        select 1
        from public.timelogs t
        where t.event_id = event_applications.event_id
          and t.contractor_id = public.current_profile_id()
      )
    )
  )
);

drop policy if exists "Crew can renew own event applications" on public.event_applications;
drop policy if exists "Crew can update own event applications" on public.event_applications;
create policy "Crew can renew own event applications"
on public.event_applications for update to authenticated
using (profile_id = public.current_profile_id())
with check (
  profile_id = public.current_profile_id()
  and (
    status in ('pending', 'approved', 'rejected', 'withdrawn')
    or (
      status = 'withdrawal_requested'
      and exists (
        select 1
        from public.timelogs t
        where t.event_id = event_applications.event_id
          and t.contractor_id = public.current_profile_id()
      )
    )
  )
);

drop policy if exists "CrewHead and COO can manage event applications" on public.event_applications;
create policy "CrewHead and COO can manage event applications"
on public.event_applications for all to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
)
with check (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
);

create or replace function public.enforce_event_application_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();

  if auth.uid() is null then
    return new;
  end if;

  if public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role) then
    return new;
  end if;

  if not public.has_role(auth.uid(), 'crew'::public.app_role)
    or old.profile_id is distinct from public.current_profile_id()
    or new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.profile_id is distinct from old.profile_id
    or new.created_at is distinct from old.created_at then
    raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status
    or (old.status = 'pending' and new.status = 'withdrawn')
    or (old.status in ('rejected', 'withdrawn') and new.status = 'pending')
    or (old.status = 'approved' and new.status = 'withdrawal_requested') then
    return new;
  end if;

  raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
end;
$$;

revoke all on function public.enforce_event_application_lifecycle_update() from public;
revoke all on function public.enforce_event_application_lifecycle_update() from anon;
revoke all on function public.enforce_event_application_lifecycle_update() from authenticated;

drop trigger if exists enforce_event_application_lifecycle_update on public.event_applications;
create trigger enforce_event_application_lifecycle_update
before update on public.event_applications
for each row execute function public.enforce_event_application_lifecycle_update();

create temporary table timelog_duplicate_repair_map (
  canonical_id uuid not null,
  duplicate_id uuid primary key,
  event_id uuid not null,
  contractor_id uuid not null,
  expected_status public.timelog_status not null,
  comparison text not null check (comparison in ('exact', 'divergent'))
) on commit drop;

insert into timelog_duplicate_repair_map values
  ('5e062036-278f-4e39-b0cd-8d02d33ced13', 'c55d4794-42d3-46be-aba4-931c40e495c0', '2bd32b32-2360-43e1-9971-322d21e5d888', '3d31b82a-ac5a-46ba-8683-6856ea2ff4a3', 'approved', 'exact'),
  ('5e062036-278f-4e39-b0cd-8d02d33ced13', 'ead03ebc-bc28-49ea-9297-86da3b64fcfa', '2bd32b32-2360-43e1-9971-322d21e5d888', '3d31b82a-ac5a-46ba-8683-6856ea2ff4a3', 'approved', 'exact'),
  ('0a75d458-e4e2-441e-8827-5b3d7778b186', '9c5a8932-fb1c-4439-a6d9-955df5c12748', '33bcf650-8f92-49ab-981e-d0d9421ea19f', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'exact'),
  ('34807683-1ab8-4772-aa2d-ce8c5b55a720', 'ce599341-ec8f-4d07-9e6d-32af0afbaa9a', '56ebb06f-bd2d-4324-bb0c-3d13a571d144', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'exact'),
  ('b7a6497e-44ff-4f55-bf89-629adb02bb88', '33beefe4-98d0-493f-b621-42699dd99107', '8c1a55b8-3e84-4645-8bb8-490c824e690e', '4cdb0844-88db-4ba1-aa97-b9368eaefc0e', 'approved', 'exact'),
  ('b7a6497e-44ff-4f55-bf89-629adb02bb88', '84dc508f-82b7-4ecd-a099-c95016a77741', '8c1a55b8-3e84-4645-8bb8-490c824e690e', '4cdb0844-88db-4ba1-aa97-b9368eaefc0e', 'approved', 'exact'),
  ('b7a6497e-44ff-4f55-bf89-629adb02bb88', 'b51d25df-4415-4951-9f99-fea599d33ab5', '8c1a55b8-3e84-4645-8bb8-490c824e690e', '4cdb0844-88db-4ba1-aa97-b9368eaefc0e', 'approved', 'exact'),
  ('7e6ab2b5-261b-4a12-b7e0-3fdd5c0afe63', 'f550a5a3-9ea8-4e4d-9265-6fa377b99d5b', '92e45dde-641e-434c-bbce-43ed95ac15a9', '86320ad3-9b14-4af5-a8f9-588c9868da86', 'approved', 'exact'),
  ('ddfaf624-b422-48bf-889e-c43ecd4bc8b5', '0ee6341d-ecc3-444d-bf4c-740392e13ac1', 'ad81d9bf-0e6e-467b-95a8-79f3ef59d566', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'divergent'),
  ('1489bcb7-b4fa-4c93-a92d-5433e725ba03', 'b4e14c6a-90f4-415a-b822-f20ce51736d8', 'bd8dcdf6-961a-43c0-9f35-d3bae4c4a2ef', 'd78b1623-712b-42aa-bbc5-897b73f63ffb', 'draft', 'exact'),
  ('286d8093-4c9f-4762-ad27-a04ad6291591', '623e3ece-5240-4d99-a354-0061e303ba3d', 'c06e08bd-2354-492b-8f1d-570080f9a1d1', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'exact'),
  ('286d8093-4c9f-4762-ad27-a04ad6291591', '696327a8-8b93-4ffa-9bc8-f2eb084e5744', 'c06e08bd-2354-492b-8f1d-570080f9a1d1', '58de7385-56e1-4c22-b610-ab6be7933ca3', 'approved', 'exact'),
  ('c5190763-785c-4f7b-b96b-c0c29c960e0b', 'd2c42270-64ab-46a8-94f3-bc61fe0f4162', 'f956aa0a-9363-4d7c-9fc4-427e1415b837', '72197f75-8537-416b-b1d2-6f27e69526bc', 'approved', 'exact');

create or replace function pg_temp.normalized_timelog_days(p_timelog_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.date,
        'time_from', d.time_from,
        'time_to', d.time_to,
        'day_type', d.day_type,
        'note', d.note
      ) order by d.date, d.time_from, d.time_to, d.day_type, d.note, d.id
    ),
    '[]'::jsonb
  )
  from public.timelog_days d
  where d.timelog_id = p_timelog_id;
$$;

lock table public.timelogs in share row exclusive mode;
lock table public.timelog_days in share row exclusive mode;
lock table public.invoices in share row exclusive mode;

do $$
begin
  if pg_catalog.to_regclass('public.invoice_timelogs') is not null then
    execute 'lock table public.invoice_timelogs in share row exclusive mode';
  end if;
end
$$;

do $$
declare
  v_mapping_count integer;
  v_present_count integer;
  v_has_legacy_invoice_link boolean := false;
  v_has_invoice_link boolean := false;
  v_deleted_count integer;
begin
  select count(*) into v_mapping_count from timelog_duplicate_repair_map;
  if v_mapping_count <> 13 then
    raise exception 'timelog repair map must contain 13 duplicate rows';
  end if;

  select count(distinct t.id)
  into v_present_count
  from public.timelogs t
  where t.id in (
    select canonical_id from timelog_duplicate_repair_map
    union
    select duplicate_id from timelog_duplicate_repair_map
  );

  if v_present_count = 0 then
    return;
  end if;

  if v_present_count <> 22 then
    raise exception 'known timelog repair set is only partially present';
  end if;

  if exists (
    select 1
    from timelog_duplicate_repair_map m
    join public.timelogs c on c.id = m.canonical_id
    join public.timelogs d on d.id = m.duplicate_id
    where c.event_id <> m.event_id
      or d.event_id <> m.event_id
      or c.contractor_id <> m.contractor_id
      or d.contractor_id <> m.contractor_id
      or c.status <> m.expected_status
      or d.status <> m.expected_status
  ) then
    raise exception 'known timelog identity or status changed';
  end if;

  if exists (
    select 1
    from timelog_duplicate_repair_map m
    join public.timelogs c on c.id = m.canonical_id
    join public.timelogs d on d.id = m.duplicate_id
    where m.comparison = 'exact'
      and (
        (pg_catalog.to_jsonb(c) - 'id' - 'created_at' - 'updated_at')
          is distinct from
        (pg_catalog.to_jsonb(d) - 'id' - 'created_at' - 'updated_at')
        or pg_temp.normalized_timelog_days(c.id)
          is distinct from pg_temp.normalized_timelog_days(d.id)
      )
  ) then
    raise exception 'an exact duplicate payload changed';
  end if;

  if exists (
    select 1
    from public.timelogs c
    cross join public.timelogs d
    where c.id = 'ddfaf624-b422-48bf-889e-c43ecd4bc8b5'
      and d.id = '0ee6341d-ecc3-444d-bf4c-740392e13ac1'
      and (pg_catalog.to_jsonb(c) - 'id' - 'created_at' - 'updated_at' - 'note')
        is distinct from
        (pg_catalog.to_jsonb(d) - 'id' - 'created_at' - 'updated_at' - 'note')
  ) then
    raise exception 'divergent Miss Agro parent payload changed';
  end if;

  if (
    select pg_catalog.jsonb_build_object(
      'status', t.status,
      'km', t.km,
      'note', coalesce(t.note, '')
    )
    from public.timelogs t
    where t.id = 'ddfaf624-b422-48bf-889e-c43ecd4bc8b5'
  ) is distinct from
    '{"status":"approved","km":0.00,"note":"PowerApps: Rebros-2026-015.pdf"}'::jsonb
  then
    raise exception 'complete Miss Agro canonical payload changed';
  end if;

  if (
    select pg_catalog.jsonb_build_object(
      'status', t.status,
      'km', t.km,
      'note', coalesce(t.note, '')
    )
    from public.timelogs t
    where t.id = '0ee6341d-ecc3-444d-bf4c-740392e13ac1'
  ) is distinct from
    '{"status":"approved","km":0.00,"note":""}'::jsonb
  then
    raise exception 'complete Miss Agro duplicate payload changed';
  end if;

  if pg_temp.normalized_timelog_days('ddfaf624-b422-48bf-889e-c43ecd4bc8b5')
    is distinct from
    '[{"date":"2026-05-12","time_from":"08:00","time_to":"14:00","day_type":"provoz","note":null},{"date":"2026-05-12","time_from":"22:30","time_to":"03:30","day_type":"provoz","note":null}]'::jsonb
  then
    raise exception 'complete Miss Agro day set changed';
  end if;

  if pg_temp.normalized_timelog_days('0ee6341d-ecc3-444d-bf4c-740392e13ac1')
    is distinct from
    '[{"date":"2026-05-12","time_from":"22:30","time_to":"03:30","day_type":"instal","note":null}]'::jsonb
  then
    raise exception 'subset Miss Agro day set changed';
  end if;

  select exists (
    select 1
    from public.invoices i
    where i.timelog_id in (
      select canonical_id from timelog_duplicate_repair_map
      union
      select duplicate_id from timelog_duplicate_repair_map
    )
  ) into v_has_legacy_invoice_link;

  if v_has_legacy_invoice_link then
    raise exception 'known timelog is linked through public.invoices.timelog_id';
  end if;

  if pg_catalog.to_regclass('public.invoice_timelogs') is not null then
    execute $query$
      select exists (
        select 1
        from public.invoice_timelogs it
        where it.timelog_id in (
          select canonical_id from timelog_duplicate_repair_map
          union
          select duplicate_id from timelog_duplicate_repair_map
        )
      )
    $query$ into v_has_invoice_link;

    if v_has_invoice_link then
      raise exception 'known duplicate timelog is linked to an invoice';
    end if;
  end if;

  delete from public.timelogs t
  using timelog_duplicate_repair_map m
  where t.id = m.duplicate_id;

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 13 then
    raise exception 'known timelog repair deleted an unexpected number of rows';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.timelogs
    group by event_id, contractor_id
    having count(*) > 1
  ) then
    raise exception 'timelog duplicates remain; unique constraint was not added';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.timelogs'::pg_catalog.regclass
      and c.conname = 'timelogs_event_contractor_unique'
      and pg_catalog.pg_get_constraintdef(c.oid) <> 'UNIQUE (event_id, contractor_id)'
  ) then
    raise exception 'timelogs_event_contractor_unique has an unexpected definition';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.timelogs'::pg_catalog.regclass
      and c.conname = 'timelogs_event_contractor_unique'
  ) then
    alter table public.timelogs
      add constraint timelogs_event_contractor_unique unique (event_id, contractor_id);
  end if;
end
$$;

create or replace function public.can_edit_timelog_data(
  p_contractor_id uuid,
  p_status public.timelog_status
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      public.has_role(auth.uid(), 'crew'::public.app_role)
      and p_contractor_id = public.current_profile_id()
      and p_status in (
        'draft'::public.timelog_status,
        'rejected'::public.timelog_status,
        'pending_crew_confirmation'::public.timelog_status
      )
    )
    or (
      public.has_role(auth.uid(), 'crewhead'::public.app_role)
      and p_status in (
        'draft'::public.timelog_status,
        'pending_ch'::public.timelog_status
      )
    );
$$;

revoke all on function public.can_edit_timelog_data(uuid, public.timelog_status) from public;
revoke all on function public.can_edit_timelog_data(uuid, public.timelog_status) from anon;
grant execute on function public.can_edit_timelog_data(uuid, public.timelog_status) to authenticated;

alter table public.timelogs enable row level security;
revoke all on table public.timelogs from public;
revoke all on table public.timelogs from anon;
revoke all on table public.timelogs from authenticated;
grant select, insert, update, delete on table public.timelogs to authenticated;

drop policy if exists "Crew can manage own timelogs" on public.timelogs;
drop policy if exists "COO can manage all timelogs" on public.timelogs;
drop policy if exists "CrewHead and COO can create assignment timelogs" on public.timelogs;
drop policy if exists "CrewHead can submit and update CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can update pending CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can delete draft and CH timelogs" on public.timelogs;
drop policy if exists "Crew can view own timelogs" on public.timelogs;
drop policy if exists "Crew can create own draft timelogs" on public.timelogs;
drop policy if exists "Crew can update own draft and rejected timelogs" on public.timelogs;
drop policy if exists "Crew can update own editable timelogs" on public.timelogs;
drop policy if exists "Crew can delete own draft and rejected timelogs" on public.timelogs;
drop policy if exists "CrewHead can view all timelogs" on public.timelogs;
drop policy if exists "CrewHead can create assignment draft timelogs" on public.timelogs;
drop policy if exists "CrewHead can create proposed timelogs" on public.timelogs;
drop policy if exists "CrewHead can update draft and CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can delete disposable timelogs" on public.timelogs;
drop policy if exists "COO can view all timelogs" on public.timelogs;
drop policy if exists "COO can status-update COO timelogs" on public.timelogs;

create policy "Crew can view own timelogs"
on public.timelogs
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
);

create policy "Crew can create own draft timelogs"
on public.timelogs
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status = 'draft'::public.timelog_status
);

create policy "Crew can update own editable timelogs"
on public.timelogs
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in (
    'draft'::public.timelog_status,
    'rejected'::public.timelog_status,
    'pending_crew_confirmation'::public.timelog_status
  )
)
with check (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in (
    'draft'::public.timelog_status,
    'rejected'::public.timelog_status,
    'pending_crew_confirmation'::public.timelog_status,
    'pending_ch'::public.timelog_status
  )
);

create policy "Crew can delete own draft and rejected timelogs"
on public.timelogs
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in (
    'draft'::public.timelog_status,
    'rejected'::public.timelog_status
  )
);

create policy "CrewHead can view all timelogs"
on public.timelogs
for select
to authenticated
using (public.has_role((select auth.uid()), 'crewhead'::public.app_role));

create policy "CrewHead can create assignment draft timelogs"
on public.timelogs
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  and status = 'draft'::public.timelog_status
);

create policy "CrewHead can create proposed timelogs"
on public.timelogs
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  and status = 'pending_ch'::public.timelog_status
);

create policy "CrewHead can update draft and CH timelogs"
on public.timelogs
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  and status in (
    'draft'::public.timelog_status,
    'pending_ch'::public.timelog_status
  )
)
with check (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  and status in (
    'draft'::public.timelog_status,
    'pending_ch'::public.timelog_status,
    'pending_crew_confirmation'::public.timelog_status,
    'pending_coo'::public.timelog_status,
    'rejected'::public.timelog_status
  )
);

create policy "CrewHead can delete disposable timelogs"
on public.timelogs
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  and status in (
    'draft'::public.timelog_status,
    'rejected'::public.timelog_status
  )
);

create policy "COO can view all timelogs"
on public.timelogs
for select
to authenticated
using (public.has_role((select auth.uid()), 'coo'::public.app_role));

create policy "COO can status-update COO timelogs"
on public.timelogs
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'coo'::public.app_role)
  and status in (
    'pending_coo'::public.timelog_status,
    'approved'::public.timelog_status,
    'invoiced'::public.timelog_status
  )
)
with check (
  public.has_role((select auth.uid()), 'coo'::public.app_role)
  and status in (
    'approved'::public.timelog_status,
    'rejected'::public.timelog_status,
    'invoiced'::public.timelog_status,
    'paid'::public.timelog_status
  )
);

alter table public.timelog_days enable row level security;
revoke all on table public.timelog_days from public;
revoke all on table public.timelog_days from anon;
revoke all on table public.timelog_days from authenticated;
grant select, insert, update, delete on table public.timelog_days to authenticated;

drop policy if exists "Users can manage timelog days via timelog" on public.timelog_days;
drop policy if exists "CrewHead and COO can create assignment timelog days" on public.timelog_days;
drop policy if exists "Users can view timelog days via visible timelog" on public.timelog_days;
drop policy if exists "Users can insert timelog days via editable timelog" on public.timelog_days;
drop policy if exists "Users can update timelog days via editable timelog" on public.timelog_days;
drop policy if exists "Users can delete timelog days via editable timelog" on public.timelog_days;

create policy "Users can view timelog days via visible timelog"
on public.timelog_days
for select
to authenticated
using (
  exists (
    select 1
    from public.timelogs t
    where t.id = timelog_days.timelog_id
      and (
        t.contractor_id = public.current_profile_id()
        or public.has_role((select auth.uid()), 'crewhead'::public.app_role)
        or public.has_role((select auth.uid()), 'coo'::public.app_role)
      )
  )
);

create policy "Users can insert timelog days via editable timelog"
on public.timelog_days
for insert
to authenticated
with check (
  exists (
    select 1
    from public.timelogs t
    where t.id = timelog_days.timelog_id
      and public.can_edit_timelog_data(t.contractor_id, t.status)
  )
);

create policy "Users can update timelog days via editable timelog"
on public.timelog_days
for update
to authenticated
using (
  exists (
    select 1
    from public.timelogs t
    where t.id = timelog_days.timelog_id
      and public.can_edit_timelog_data(t.contractor_id, t.status)
  )
)
with check (
  exists (
    select 1
    from public.timelogs t
    where t.id = timelog_days.timelog_id
      and public.can_edit_timelog_data(t.contractor_id, t.status)
  )
);

create policy "Users can delete timelog days via editable timelog"
on public.timelog_days
for delete
to authenticated
using (
  exists (
    select 1
    from public.timelogs t
    where t.id = timelog_days.timelog_id
      and public.can_edit_timelog_data(t.contractor_id, t.status)
  )
);

alter table public.invoice_items enable row level security;
alter table public.invoice_timelogs enable row level security;
alter table public.invoice_receipts enable row level security;

revoke all on table public.invoice_items from public;
revoke all on table public.invoice_items from anon;
revoke all on table public.invoice_items from authenticated;
grant select on table public.invoice_items to authenticated;
revoke all on table public.invoice_timelogs from public;
revoke all on table public.invoice_timelogs from anon;
revoke all on table public.invoice_timelogs from authenticated;
grant select on table public.invoice_timelogs to authenticated;
revoke all on table public.invoice_receipts from public;
revoke all on table public.invoice_receipts from anon;
revoke all on table public.invoice_receipts from authenticated;
grant select on table public.invoice_receipts to authenticated;

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'invoice_items',
    'invoice_timelogs',
    'invoice_receipts'
  ] loop
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      v_table_name || '_select_management',
      v_table_name
    );
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      v_table_name || '_insert_management',
      v_table_name
    );
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      v_table_name || '_delete_management',
      v_table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using (' ||
      'public.has_role((select auth.uid()), ''crewhead''::public.app_role) or ' ||
      'public.has_role((select auth.uid()), ''coo''::public.app_role))',
      v_table_name || '_select_management',
      v_table_name
    );
  end loop;
end
$$;

alter table public.invoices enable row level security;

revoke all on table public.invoices from public;
revoke all on table public.invoices from anon;
revoke all on table public.invoices from authenticated;
grant select on table public.invoices to authenticated;

drop policy if exists "Crew can view own invoices" on public.invoices;
drop policy if exists "CrewHead can view all invoices" on public.invoices;
drop policy if exists "COO can manage all invoices" on public.invoices;
drop policy if exists "CrewHead and COO can view all invoices" on public.invoices;

create policy "Crew can view own invoices"
on public.invoices
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
);

create policy "CrewHead and COO can view all invoices"
on public.invoices
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
);

create or replace function public.enforce_receipt_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data_changed boolean;
begin
  if auth.uid() is null then
    raise exception 'receipt_lifecycle_unauthorized' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.contractor_id is distinct from old.contractor_id
    or new.event_id is distinct from old.event_id
    or new.created_at is distinct from old.created_at then
    raise exception 'receipt_lifecycle_unauthorized' using errcode = '42501';
  end if;

  new.updated_at := pg_catalog.now();
  v_data_changed :=
    new.job_number is distinct from old.job_number
    or new.name is distinct from old.name
    or new.supplier is distinct from old.supplier
    or new.amount is distinct from old.amount
    or new.paid_at is distinct from old.paid_at
    or new.note is distinct from old.note;

  if public.has_role(auth.uid(), 'crew'::public.app_role)
    and old.contractor_id = public.current_profile_id()
    and old.status in ('draft', 'rejected')
    and new.status in (old.status, 'submitted') then
    return new;
  end if;

  if (
      public.has_role(auth.uid(), 'crewhead'::public.app_role)
      or public.has_role(auth.uid(), 'coo'::public.app_role)
    )
    and not v_data_changed
    and old.status = 'submitted'
    and new.status in ('approved', 'rejected') then
    return new;
  end if;

  if public.has_role(auth.uid(), 'coo'::public.app_role)
    and not v_data_changed
    and old.status = 'approved'
    and new.status = 'reimbursed' then
    return new;
  end if;

  if pg_catalog.current_setting('crewflow.invoice_receipt_mutation', true) = 'on'
    and public.has_role(auth.uid(), 'coo'::public.app_role)
    and not v_data_changed
    and (
      (old.status = 'approved' and new.status = 'attached')
      or (old.status = 'attached' and new.status in ('reimbursed', 'approved'))
    ) then
    return new;
  end if;

  raise exception 'receipt_lifecycle_unauthorized' using errcode = '42501';
end;
$$;

revoke all on function public.enforce_receipt_lifecycle_update() from public;
revoke all on function public.enforce_receipt_lifecycle_update() from anon;
revoke all on function public.enforce_receipt_lifecycle_update() from authenticated;

drop trigger if exists enforce_receipt_lifecycle_update on public.receipts;
create trigger enforce_receipt_lifecycle_update
before update on public.receipts
for each row execute function public.enforce_receipt_lifecycle_update();

alter table public.receipts enable row level security;

revoke all on table public.receipts from public;
revoke all on table public.receipts from anon;
revoke all on table public.receipts from authenticated;
grant select, insert, update, delete on table public.receipts to authenticated;

drop policy if exists "Crew can manage own receipts" on public.receipts;
drop policy if exists "CrewHead can view all receipts" on public.receipts;
drop policy if exists "COO can manage all receipts" on public.receipts;
drop policy if exists "Crew can view own receipts" on public.receipts;
drop policy if exists "CrewHead and COO can view all receipts" on public.receipts;
drop policy if exists "Crew can create own draft receipts" on public.receipts;
drop policy if exists "CrewHead and COO can create draft receipts" on public.receipts;
drop policy if exists "Crew can update own editable receipts" on public.receipts;
drop policy if exists "CrewHead and COO can review submitted receipts" on public.receipts;
drop policy if exists "COO can update invoice receipt status" on public.receipts;
drop policy if exists "Crew can delete own disposable receipts" on public.receipts;
drop policy if exists "CrewHead and COO can delete disposable receipts" on public.receipts;

create policy "Crew can view own receipts"
on public.receipts
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
);

create policy "CrewHead and COO can view all receipts"
on public.receipts
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
);

create policy "Crew can create own draft receipts"
on public.receipts
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status = 'draft'::public.receipt_status
);

create policy "CrewHead and COO can create draft receipts"
on public.receipts
for insert
to authenticated
with check (
  (
    public.has_role((select auth.uid()), 'crewhead'::public.app_role)
    or public.has_role((select auth.uid()), 'coo'::public.app_role)
  )
  and status = 'draft'::public.receipt_status
);

create policy "Crew can update own editable receipts"
on public.receipts
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in ('draft'::public.receipt_status, 'rejected'::public.receipt_status)
)
with check (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in (
    'draft'::public.receipt_status,
    'rejected'::public.receipt_status,
    'submitted'::public.receipt_status
  )
);

create policy "CrewHead and COO can review submitted receipts"
on public.receipts
for update
to authenticated
using (
  (
    public.has_role((select auth.uid()), 'crewhead'::public.app_role)
    or public.has_role((select auth.uid()), 'coo'::public.app_role)
  )
  and status = 'submitted'::public.receipt_status
)
with check (
  (
    public.has_role((select auth.uid()), 'crewhead'::public.app_role)
    or public.has_role((select auth.uid()), 'coo'::public.app_role)
  )
  and status in ('approved'::public.receipt_status, 'rejected'::public.receipt_status)
);

create policy "COO can update invoice receipt status"
on public.receipts
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'coo'::public.app_role)
  and status in ('approved'::public.receipt_status, 'attached'::public.receipt_status)
)
with check (
  public.has_role((select auth.uid()), 'coo'::public.app_role)
  and status in (
    'approved'::public.receipt_status,
    'attached'::public.receipt_status,
    'reimbursed'::public.receipt_status
  )
);

create policy "Crew can delete own disposable receipts"
on public.receipts
for delete
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in ('draft'::public.receipt_status, 'rejected'::public.receipt_status)
);

create policy "CrewHead and COO can delete disposable receipts"
on public.receipts
for delete
to authenticated
using (
  (
    public.has_role((select auth.uid()), 'crewhead'::public.app_role)
    or public.has_role((select auth.uid()), 'coo'::public.app_role)
  )
  and status in ('draft'::public.receipt_status, 'rejected'::public.receipt_status)
);

create or replace function public.transition_receipt_statuses_atomic(
  p_receipts jsonb,
  p_expected_status public.receipt_status,
  p_next_status public.receipt_status
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target_count integer;
  v_matching_count integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'receipt_mutation_unauthorized' using errcode = '42501';
  end if;

  if p_receipts is null
    or pg_catalog.jsonb_typeof(p_receipts) <> 'array'
    or pg_catalog.jsonb_array_length(p_receipts) = 0
    or p_expected_status is null
    or p_next_status is null
    or p_expected_status = p_next_status
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_receipts) target
      where case
        when pg_catalog.jsonb_typeof(target) <> 'object' then true
        else (
          select pg_catalog.array_agg(key order by key)
          from pg_catalog.jsonb_object_keys(target) key
        ) is distinct from array['expected_updated_at', 'id']::text[]
      end
    ) then
    raise exception 'receipt_mutation_invalid' using errcode = '22023';
  end if;

  begin
    perform
      (target->>'id')::uuid,
      (target->>'expected_updated_at')::timestamptz
    from pg_catalog.jsonb_array_elements(p_receipts) target;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow then
      raise exception 'receipt_mutation_invalid' using errcode = '22023';
  end;

  select pg_catalog.jsonb_array_length(p_receipts) into v_target_count;
  if v_target_count <> (
    select pg_catalog.count(distinct target->>'id')::integer
    from pg_catalog.jsonb_array_elements(p_receipts) target
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_receipts) target
    where nullif(target->>'id', '') is null
      or nullif(target->>'expected_updated_at', '') is null
  ) then
    raise exception 'receipt_mutation_invalid' using errcode = '22023';
  end if;

  if not (
    (
      public.has_role(auth.uid(), 'crew'::public.app_role)
      and p_expected_status in ('draft', 'rejected')
      and p_next_status = 'submitted'
    )
    or (
      (
        public.has_role(auth.uid(), 'crewhead'::public.app_role)
        or public.has_role(auth.uid(), 'coo'::public.app_role)
      )
      and p_expected_status = 'submitted'
      and p_next_status in ('approved', 'rejected')
    )
    or (
      public.has_role(auth.uid(), 'coo'::public.app_role)
      and p_expected_status = 'approved'
      and p_next_status = 'reimbursed'
    )
  ) then
    raise exception 'receipt_mutation_unauthorized' using errcode = '42501';
  end if;

  perform r.id
  from pg_catalog.jsonb_array_elements(p_receipts) target
  join public.receipts r on r.id = (target->>'id')::uuid
  order by (target->>'id')::uuid
  for update of r;

  select pg_catalog.count(*)::integer into v_matching_count
  from pg_catalog.jsonb_array_elements(p_receipts) target
  join public.receipts r on r.id = (target->>'id')::uuid
  where r.updated_at = (target->>'expected_updated_at')::timestamptz
    and r.status = p_expected_status;

  if v_matching_count <> v_target_count then
    raise exception 'receipt_mutation_conflict' using errcode = '40001';
  end if;

  update public.receipts r
  set status = p_next_status
  from pg_catalog.jsonb_array_elements(p_receipts) target
  where r.id = (target->>'id')::uuid
    and r.updated_at = (target->>'expected_updated_at')::timestamptz
    and r.status = p_expected_status;
  get diagnostics v_matching_count = row_count;

  if v_matching_count <> v_target_count then
    raise exception 'receipt_mutation_conflict' using errcode = '40001';
  end if;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'updated_at', r.updated_at
      ) order by r.id
    ),
    '[]'::jsonb
  ) into v_result
  from public.receipts r
  join pg_catalog.jsonb_array_elements(p_receipts) target
    on r.id = (target->>'id')::uuid;

  if pg_catalog.jsonb_array_length(v_result) <> v_target_count then
    raise exception 'receipt_mutation_conflict' using errcode = '40001';
  end if;

  return v_result;
exception
  when insufficient_privilege then
    raise exception 'receipt_mutation_unauthorized' using errcode = '42501';
end;
$$;

create or replace function public.handle_timelog_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_invoice_id uuid;
  v_receipt_ids uuid[];
  v_receipt_count integer;
  v_changed_count integer;
  v_total_hours numeric;
  v_receipt_amount numeric;
  v_amount_hours numeric;
  v_amount_km numeric;
  v_total_amount numeric;
  v_job text;
  v_previous_marker text;
begin
  if new.status = 'approved' and old.status = 'pending_coo' then
    if auth.uid() is null
      or not public.has_role(auth.uid(), 'coo'::public.app_role) then
      raise exception 'timelog_import_unauthorized' using errcode = '42501';
    end if;

    select p.* into v_profile
    from public.profiles p
    where p.id = new.contractor_id;

    if not found then
      raise exception 'invoice_create_conflict' using errcode = '40001';
    end if;

    select pg_catalog.coalesce(
      pg_catalog.array_agg(locked_receipt.id order by locked_receipt.id),
      array[]::uuid[]
    ) into v_receipt_ids
    from (
      select r.id
      from public.receipts r
      where r.event_id = new.event_id
        and r.contractor_id = new.contractor_id
        and r.status = 'approved'::public.receipt_status
      order by r.id
      for update
    ) locked_receipt;

    v_receipt_count := pg_catalog.coalesce(pg_catalog.array_length(v_receipt_ids, 1), 0);

    select pg_catalog.coalesce(pg_catalog.sum(r.amount), 0)
    into v_receipt_amount
    from public.receipts r
    where r.id = any(v_receipt_ids)
      and r.status = 'approved'::public.receipt_status;

    get diagnostics v_changed_count = row_count;
    if v_changed_count <> 1 then
      raise exception 'invoice_create_conflict' using errcode = '40001';
    end if;

    select pg_catalog.coalesce(pg_catalog.sum(
      pg_catalog.date_part('epoch', td.time_to::time - td.time_from::time) / 3600.0
    ), 0)
    into v_total_hours
    from public.timelog_days td
    where td.timelog_id = new.id;

    select project.job_number into v_job
    from public.events event_row
    left join public.projects project on project.id = event_row.project_id
    where event_row.id = new.event_id;

    v_amount_hours := v_total_hours * pg_catalog.coalesce(v_profile.hourly_rate, 0);
    v_amount_km := new.km * 5.0;
    v_total_amount := v_amount_hours + v_amount_km + v_receipt_amount;

    v_previous_marker := pg_catalog.current_setting(
      'crewflow.invoice_receipt_mutation',
      true
    );
    perform pg_catalog.set_config('crewflow.invoice_receipt_mutation', 'on', true);

    begin
      begin
        insert into public.invoices (
          contractor_id,
          event_id,
          timelog_id,
          job_number,
          total_hours,
          amount_hours,
          amount_km,
          amount_receipts,
          total_amount,
          status
        ) values (
          new.contractor_id,
          new.event_id,
          new.id,
          v_job,
          v_total_hours,
          v_amount_hours,
          v_amount_km,
          v_receipt_amount,
          v_total_amount,
          'draft'::public.invoice_status
        )
        returning id into v_invoice_id;

        insert into public.invoice_items (
          invoice_id,
          job_number,
          event_id,
          hours,
          amount_hours,
          km,
          amount_km,
          amount_receipts,
          total_amount
        ) values (
          v_invoice_id,
          pg_catalog.coalesce(v_job, ''),
          new.event_id,
          v_total_hours,
          v_amount_hours,
          new.km,
          v_amount_km,
          v_receipt_amount,
          v_total_amount
        );

        insert into public.invoice_timelogs (invoice_id, timelog_id)
        values (v_invoice_id, new.id);

        insert into public.invoice_receipts (invoice_id, receipt_id)
        select v_invoice_id, source.receipt_id
        from pg_catalog.unnest(v_receipt_ids) as source(receipt_id)
        order by source.receipt_id;
        get diagnostics v_changed_count = row_count;

        if v_changed_count <> v_receipt_count then
          raise exception 'invoice_create_conflict' using errcode = '40001';
        end if;

        update public.receipts r
        set status = 'attached'::public.receipt_status
        where r.id = any(v_receipt_ids)
          and r.status = 'approved'::public.receipt_status;
        get diagnostics v_changed_count = row_count;

        if v_changed_count <> v_receipt_count then
          raise exception 'invoice_create_conflict' using errcode = '40001';
        end if;
      exception
        when unique_violation or foreign_key_violation or check_violation then
          raise exception 'invoice_create_conflict' using errcode = '40001';
      end;

      perform pg_catalog.set_config(
        'crewflow.invoice_receipt_mutation',
        pg_catalog.coalesce(v_previous_marker, ''),
        true
      );
    exception
      when others then
        perform pg_catalog.set_config(
          'crewflow.invoice_receipt_mutation',
          pg_catalog.coalesce(v_previous_marker, ''),
          true
        );
        raise;
    end;

    new.status := 'invoiced'::public.timelog_status;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_timelog_approved() from public;
revoke all on function public.handle_timelog_approved() from anon;
revoke all on function public.handle_timelog_approved() from authenticated;

drop trigger if exists trg_timelog_approved on public.timelogs;
create trigger trg_timelog_approved
before update on public.timelogs
for each row execute function public.handle_timelog_approved();

alter table public.events enable row level security;

revoke all on table public.events from public;
revoke all on table public.events from anon;
revoke all on table public.events from authenticated;
grant select, insert, update on table public.events to authenticated;

drop policy if exists "CrewHead and COO can manage events" on public.events;
drop policy if exists "Crew can view assigned events" on public.events;
drop policy if exists "CrewHead and COO can view events" on public.events;
drop policy if exists "CrewHead and COO can create events" on public.events;
drop policy if exists "CrewHead and COO can update events" on public.events;

create policy "Crew can view assigned events"
on public.events
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and exists (
    select 1
    from public.event_assignments assignment
    where assignment.event_id = events.id
      and assignment.profile_id = public.current_profile_id()
  )
);

create policy "CrewHead and COO can view events"
on public.events
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
);

create policy "CrewHead and COO can create events"
on public.events
for insert
to authenticated
with check (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
);

create policy "CrewHead and COO can update events"
on public.events
for update
to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
)
with check (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
);

create or replace function public.enforce_timelog_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Timelog update requires authentication.' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.contractor_id is distinct from old.contractor_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Timelog identity fields cannot be changed.' using errcode = '42501';
  end if;

  if pg_catalog.current_setting('crewflow.approved_timelog_import', true) = 'on'
    and public.has_role(auth.uid(), 'coo'::public.app_role)
    and old.status in (
      'draft'::public.timelog_status,
      'rejected'::public.timelog_status,
      'pending_coo'::public.timelog_status
    )
    and new.status in (
      old.status,
      'approved'::public.timelog_status
    ) then
    return new;
  end if;

  if public.has_role(auth.uid(), 'crew'::public.app_role)
    and old.contractor_id = public.current_profile_id()
    and old.status in (
      'draft'::public.timelog_status,
      'rejected'::public.timelog_status,
      'pending_crew_confirmation'::public.timelog_status
    )
    and new.status in (
      'draft'::public.timelog_status,
      'rejected'::public.timelog_status,
      'pending_crew_confirmation'::public.timelog_status,
      'pending_ch'::public.timelog_status
    ) then
    return new;
  end if;

  if public.has_role(auth.uid(), 'crewhead'::public.app_role)
    and (
      (
        old.status = 'draft'::public.timelog_status
        and new.status in (
          'draft'::public.timelog_status,
          'pending_ch'::public.timelog_status
        )
      )
      or (
        old.status = 'pending_ch'::public.timelog_status
        and new.status in (
          'pending_ch'::public.timelog_status,
          'pending_coo'::public.timelog_status,
          'rejected'::public.timelog_status
        )
      )
    ) then
    return new;
  end if;

  if public.has_role(auth.uid(), 'coo'::public.app_role)
    and new.id is not distinct from old.id
    and new.event_id is not distinct from old.event_id
    and new.contractor_id is not distinct from old.contractor_id
    and new.km is not distinct from old.km
    and new.note is not distinct from old.note
    and new.created_at is not distinct from old.created_at
    and (
      (
        old.status = 'pending_coo'::public.timelog_status
        and new.status in (
          'approved'::public.timelog_status,
          'rejected'::public.timelog_status
        )
      )
      or (
        old.status = 'approved'::public.timelog_status
        and new.status in (
          'invoiced'::public.timelog_status,
          'paid'::public.timelog_status
        )
      )
      or (
        old.status = 'invoiced'::public.timelog_status
        and new.status in (
          'approved'::public.timelog_status,
          'paid'::public.timelog_status
        )
      )
    ) then
    return new;
  end if;

  raise exception 'Timelog update is not allowed for this role and status.' using errcode = '42501';
end;
$$;

revoke all on function public.enforce_timelog_update_permissions() from public;
revoke all on function public.enforce_timelog_update_permissions() from anon;
revoke all on function public.enforce_timelog_update_permissions() from authenticated;

drop trigger if exists enforce_timelog_update_permissions on public.timelogs;
create trigger enforce_timelog_update_permissions
before update on public.timelogs
for each row execute function public.enforce_timelog_update_permissions();

create or replace function public.save_timelog_atomic(
  p_timelog_id uuid,
  p_event_id uuid,
  p_contractor_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_status public.timelog_status,
  p_km numeric,
  p_note text,
  p_status public.timelog_status,
  p_days jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timelog public.timelogs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'timelog_mutation_not_found' using errcode = '42501';
  end if;

  if p_event_id is null
    or p_contractor_id is null
    or p_km is null
    or p_km < 0
    or p_status is null
    or p_days is null
    or pg_catalog.jsonb_typeof(p_days) <> 'array'
    or pg_catalog.jsonb_array_length(p_days) = 0
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_days) day
      where pg_catalog.jsonb_typeof(day) <> 'object'
        or nullif(day->>'date', '') is null
        or nullif(day->>'time_from', '') is null
        or nullif(day->>'time_to', '') is null
        or day->>'day_type' not in ('instal', 'provoz', 'deinstal')
    ) then
    raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end if;

  begin
    perform (day->>'date')::date,
      (day->>'time_from')::time,
      (day->>'time_to')::time
    from pg_catalog.jsonb_array_elements(p_days) day;
  exception
    when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
      raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_contractor_id::text, 0)
  );

  if p_timelog_id is null then
    if p_expected_updated_at is not null
      or p_expected_status is not null
      or p_status <> 'draft'::public.timelog_status then
      raise exception 'timelog_mutation_invalid' using errcode = '22023';
    end if;

    begin
      insert into public.timelogs (
        event_id,
        contractor_id,
        km,
        note,
        status
      ) values (
        p_event_id,
        p_contractor_id,
        p_km,
        coalesce(p_note, ''),
        'draft'::public.timelog_status
      )
      returning * into v_timelog;
    exception
      when unique_violation then
        raise exception 'timelog_mutation_conflict' using errcode = '40001';
    end;
  else
    if p_expected_updated_at is null or p_expected_status is null then
      raise exception 'timelog_mutation_invalid' using errcode = '22023';
    end if;

    select t.* into v_timelog
    from public.timelogs t
    where t.id = p_timelog_id
    for update;

    if not found then
      raise exception 'timelog_mutation_not_found' using errcode = 'P0002';
    end if;

    if v_timelog.event_id is distinct from p_event_id
      or v_timelog.contractor_id is distinct from p_contractor_id
      or v_timelog.updated_at is distinct from p_expected_updated_at
      or v_timelog.status is distinct from p_expected_status then
      raise exception 'timelog_mutation_conflict' using errcode = '40001';
    end if;

    update public.timelogs
    set km = p_km,
      note = coalesce(p_note, '')
    where id = p_timelog_id
    returning * into v_timelog;

    if not found then
      raise exception 'timelog_mutation_not_found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.timelog_days
  where timelog_id = v_timelog.id;

  if exists (
    select 1
    from public.timelog_days
    where timelog_id = v_timelog.id
  ) then
    raise exception 'timelog_mutation_not_found' using errcode = '42501';
  end if;

  insert into public.timelog_days (
    timelog_id,
    date,
    time_from,
    time_to,
    day_type,
    note
  )
  select
    v_timelog.id,
    (source.day->>'date')::date,
    source.day->>'time_from',
    source.day->>'time_to',
    (source.day->>'day_type')::public.timelog_type,
    nullif(pg_catalog.btrim(coalesce(source.day->>'note', '')), '')
  from pg_catalog.jsonb_array_elements(p_days) with ordinality source(day, ordinal)
  order by
    (source.day->>'date')::date,
    (source.day->>'time_from')::time,
    (source.day->>'time_to')::time,
    source.day->>'day_type',
    coalesce(source.day->>'note', ''),
    source.ordinal;

  if v_timelog.status is distinct from p_status then
    update public.timelogs
    set status = p_status
    where id = v_timelog.id
    returning * into v_timelog;

    if not found then
      raise exception 'timelog_mutation_conflict' using errcode = '40001';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_timelog.id,
    'updated_at', v_timelog.updated_at,
    'status', v_timelog.status
  );
end;
$$;

create or replace function public.transition_timelog_statuses_atomic(
  p_targets jsonb,
  p_expected_status public.timelog_status,
  p_next_status public.timelog_status
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target_count integer;
  v_locked_count integer;
  v_updated_count integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'timelog_mutation_not_found' using errcode = '42501';
  end if;

  if p_targets is null
    or pg_catalog.jsonb_typeof(p_targets) <> 'array'
    or pg_catalog.jsonb_array_length(p_targets) = 0
    or p_expected_status is null
    or p_next_status is null
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_targets) target
      where pg_catalog.jsonb_typeof(target) <> 'object'
        or nullif(target->>'id', '') is null
        or nullif(target->>'expected_updated_at', '') is null
    ) then
    raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end if;

  begin
    perform (target->>'id')::uuid,
      (target->>'expected_updated_at')::timestamptz
    from pg_catalog.jsonb_array_elements(p_targets) target;
  exception
    when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
      raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end;

  select pg_catalog.count(*)::integer into v_target_count
  from pg_catalog.jsonb_array_elements(p_targets);

  if (
    select pg_catalog.count(distinct (target->>'id')::uuid)
    from pg_catalog.jsonb_array_elements(p_targets) target
  ) <> v_target_count then
    raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end if;

  perform t.id
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelogs t on t.id = (target->>'id')::uuid
  order by (target->>'id')::uuid
  for update of t;
  get diagnostics v_locked_count = row_count;

  if v_locked_count <> v_target_count then
    raise exception 'timelog_mutation_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_targets) target
    join public.timelogs t on t.id = (target->>'id')::uuid
    where t.updated_at is distinct from (target->>'expected_updated_at')::timestamptz
      or t.status is distinct from p_expected_status
  ) then
    raise exception 'timelog_mutation_conflict' using errcode = '40001';
  end if;

  with targets as (
    select
      (target->>'id')::uuid as id,
      (target->>'expected_updated_at')::timestamptz as expected_updated_at
    from pg_catalog.jsonb_array_elements(p_targets) target
  ), updated as (
    update public.timelogs t
    set status = p_next_status
    from targets
    where t.id = targets.id
      and t.updated_at = targets.expected_updated_at
      and t.status = p_expected_status
    returning t.id, t.updated_at, t.status
  )
  select
    pg_catalog.count(*)::integer,
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', updated.id,
          'updated_at', updated.updated_at,
          'status', updated.status
        ) order by updated.id
      ),
      '[]'::jsonb
    )
  into v_updated_count, v_result
  from updated;

  if v_updated_count <> v_target_count then
    raise exception 'timelog_mutation_conflict' using errcode = '40001';
  end if;

  return v_result;
end;
$$;

create or replace function public.delete_timelog_atomic(
  p_timelog_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_status public.timelog_status
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timelog public.timelogs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'timelog_mutation_not_found' using errcode = '42501';
  end if;

  if p_timelog_id is null
    or p_expected_updated_at is null
    or p_expected_status is null then
    raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end if;

  select t.* into v_timelog
  from public.timelogs t
  where t.id = p_timelog_id
  for update;

  if not found then
    raise exception 'timelog_mutation_not_found' using errcode = 'P0002';
  end if;

  if v_timelog.updated_at is distinct from p_expected_updated_at
    or v_timelog.status is distinct from p_expected_status then
    raise exception 'timelog_mutation_conflict' using errcode = '40001';
  end if;

  if v_timelog.status not in ('draft', 'rejected') then
    raise exception 'timelog_mutation_blocked' using errcode = 'P0001';
  end if;

  delete from public.timelogs
  where id = p_timelog_id
    and updated_at = p_expected_updated_at
    and status in ('draft', 'rejected');

  if not found then
    raise exception 'timelog_mutation_conflict' using errcode = '40001';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_timelog.id,
    'updated_at', v_timelog.updated_at,
    'status', v_timelog.status
  );
end;
$$;

create or replace function public.import_approved_timelog_atomic(
  p_timelog_id uuid,
  p_event_id uuid,
  p_contractor_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_status public.timelog_status,
  p_km numeric,
  p_note text,
  p_days jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_days jsonb;
  v_previous_marker text;
  v_requested_days jsonb;
  v_timelog public.timelogs%rowtype;
begin
  if auth.uid() is null
    or not public.has_role(auth.uid(), 'coo'::public.app_role) then
    raise exception 'timelog_import_unauthorized' using errcode = '42501';
  end if;

  if p_event_id is null
    or p_contractor_id is null
    or p_km is null
    or p_km < 0
    or p_days is null
    or pg_catalog.jsonb_typeof(p_days) <> 'array'
    or pg_catalog.jsonb_array_length(p_days) = 0
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_days) day
      where pg_catalog.jsonb_typeof(day) <> 'object'
        or nullif(day->>'date', '') is null
        or nullif(day->>'time_from', '') is null
        or nullif(day->>'time_to', '') is null
        or day->>'day_type' not in ('instal', 'provoz', 'deinstal')
    ) then
    raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end if;

  begin
    perform (day->>'date')::date,
      (day->>'time_from')::time,
      (day->>'time_to')::time
    from pg_catalog.jsonb_array_elements(p_days) day;
  exception
    when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
      raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'date', (source.day->>'date')::date,
      'time_from', (source.day->>'time_from')::time,
      'time_to', (source.day->>'time_to')::time,
      'day_type', (source.day->>'day_type')::public.timelog_type,
      'note', nullif(pg_catalog.btrim(coalesce(source.day->>'note', '')), '')
    ) order by
      (source.day->>'date')::date,
      (source.day->>'time_from')::time,
      (source.day->>'time_to')::time,
      source.day->>'day_type',
      nullif(pg_catalog.btrim(coalesce(source.day->>'note', '')), ''),
      source.ordinal
  ) into v_requested_days
  from pg_catalog.jsonb_array_elements(p_days) with ordinality source(day, ordinal);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_contractor_id::text, 0)
  );

  if p_timelog_id is null then
    if p_expected_updated_at is not null or p_expected_status is not null then
      raise exception 'timelog_mutation_invalid' using errcode = '22023';
    end if;
  else
    if p_expected_updated_at is null or p_expected_status is null then
      raise exception 'timelog_mutation_invalid' using errcode = '22023';
    end if;

    select t.* into v_timelog
    from public.timelogs t
    where t.id = p_timelog_id
    for update;

    if not found then
      raise exception 'timelog_mutation_not_found' using errcode = 'P0002';
    end if;

    if v_timelog.event_id is distinct from p_event_id
      or v_timelog.contractor_id is distinct from p_contractor_id
      or v_timelog.updated_at is distinct from p_expected_updated_at
      or v_timelog.status is distinct from p_expected_status then
      raise exception 'timelog_mutation_conflict' using errcode = '40001';
    end if;

    if v_timelog.status in ('approved', 'invoiced') then
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'date', d.date,
            'time_from', d.time_from::time,
            'time_to', d.time_to::time,
            'day_type', d.day_type,
            'note', nullif(pg_catalog.btrim(coalesce(d.note, '')), '')
          ) order by
            d.date,
            d.time_from::time,
            d.time_to::time,
            d.day_type,
            nullif(pg_catalog.btrim(coalesce(d.note, '')), ''),
            d.id
        ),
        '[]'::jsonb
      ) into v_existing_days
      from public.timelog_days d
      where d.timelog_id = v_timelog.id;

      if v_timelog.km is distinct from p_km
        or coalesce(v_timelog.note, '') is distinct from coalesce(p_note, '')
        or v_existing_days is distinct from v_requested_days then
        raise exception 'timelog_mutation_conflict' using errcode = '40001';
      end if;

      return pg_catalog.jsonb_build_object(
        'id', v_timelog.id,
        'updated_at', v_timelog.updated_at,
        'status', v_timelog.status
      );
    end if;

    if v_timelog.status not in ('draft', 'rejected', 'pending_coo') then
      raise exception 'timelog_mutation_conflict' using errcode = '40001';
    end if;
  end if;

  v_previous_marker := pg_catalog.current_setting('crewflow.approved_timelog_import', true);
  perform pg_catalog.set_config('crewflow.approved_timelog_import', 'on', true);

  begin
    if p_timelog_id is null then
      begin
        insert into public.timelogs (
          event_id,
          contractor_id,
          km,
          note,
          status
        ) values (
          p_event_id,
          p_contractor_id,
          p_km,
          coalesce(p_note, ''),
          'draft'::public.timelog_status
        )
        returning * into v_timelog;
      exception
        when unique_violation then
          raise exception 'timelog_mutation_conflict' using errcode = '40001';
      end;
    else
      update public.timelogs
      set km = p_km,
        note = coalesce(p_note, '')
      where id = p_timelog_id
      returning * into v_timelog;
    end if;

    delete from public.timelog_days
    where timelog_id = v_timelog.id;

    insert into public.timelog_days (
      timelog_id,
      date,
      time_from,
      time_to,
      day_type,
      note
    )
    select
      v_timelog.id,
      (source.day->>'date')::date,
      source.day->>'time_from',
      source.day->>'time_to',
      (source.day->>'day_type')::public.timelog_type,
      nullif(pg_catalog.btrim(coalesce(source.day->>'note', '')), '')
    from pg_catalog.jsonb_array_elements(p_days) with ordinality source(day, ordinal)
    order by
      (source.day->>'date')::date,
      (source.day->>'time_from')::time,
      (source.day->>'time_to')::time,
      source.day->>'day_type',
      coalesce(source.day->>'note', ''),
      source.ordinal;

    update public.timelogs
    set status = 'approved'
    where id = v_timelog.id
    returning * into v_timelog;

    if not found then
      raise exception 'timelog_mutation_conflict' using errcode = '40001';
    end if;

    perform pg_catalog.set_config(
      'crewflow.approved_timelog_import',
      coalesce(v_previous_marker, ''),
      true
    );
  exception
    when others then
      perform pg_catalog.set_config(
        'crewflow.approved_timelog_import',
        coalesce(v_previous_marker, ''),
        true
      );
      raise;
  end;

  return pg_catalog.jsonb_build_object(
    'id', v_timelog.id,
    'updated_at', v_timelog.updated_at,
    'status', v_timelog.status
  );
end;
$$;

create or replace function public.delete_event_atomic(
  p_event_id uuid
)
returns table (
  event_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_receipt_count integer;
  v_deleted_receipt_count integer;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'event_delete_conflict' using errcode = '42501';
  end if;

  select e.id into v_event_id
  from public.events e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  perform t.id
  from public.timelogs t
  where t.event_id = p_event_id
  order by t.id
  for update;

  if exists (
    select 1
    from public.timelogs t
    where t.event_id = p_event_id
      and t.status not in ('draft', 'rejected')
  ) then
    raise exception 'event_has_protected_timelogs' using errcode = 'P0001';
  end if;

  perform r.id
  from public.receipts r
  where r.event_id = p_event_id
  order by r.id
  for update;

  if exists (
    select 1
    from public.receipts r
    where r.event_id = p_event_id
      and r.status not in ('draft', 'rejected')
  ) then
    raise exception 'event_has_protected_receipts' using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::integer into v_receipt_count
  from public.receipts r
  where r.event_id = p_event_id;

  begin
    delete from public.receipts r
    where r.event_id = p_event_id;
    get diagnostics v_deleted_receipt_count = row_count;

    if v_deleted_receipt_count <> v_receipt_count then
      raise exception 'event_delete_conflict' using errcode = '40001';
    end if;

    delete from public.events e
    where e.id = p_event_id
    returning e.id into v_event_id;

    if not found then
      raise exception 'event_delete_conflict' using errcode = '40001';
    end if;
  exception
    when insufficient_privilege then
      raise exception 'event_delete_conflict' using errcode = '42501';
  end;

  return query select v_event_id;
end;
$$;

create or replace function public.create_invoice_atomic(
  p_invoice jsonb,
  p_items jsonb,
  p_timelogs jsonb,
  p_receipts jsonb
)
returns table (
  invoice_id uuid,
  invoice_status public.invoice_status,
  invoice_updated_at timestamptz,
  paid_at timestamptz,
  timelogs jsonb,
  receipts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_contractor_id uuid;
  v_event_id uuid;
  v_total_hours numeric;
  v_amount_hours numeric;
  v_amount_km numeric;
  v_amount_receipts numeric;
  v_total_amount numeric;
  v_issue_date date;
  v_taxable_supply_date date;
  v_due_date date;
  v_target_count integer;
  v_matching_count integer;
  v_timelog_rows jsonb;
  v_receipt_rows jsonb;
  v_previous_marker text;
begin
  if auth.uid() is null
    or not public.has_role(auth.uid(), 'coo'::public.app_role) then
    raise exception 'invoice_unauthorized' using errcode = '42501';
  end if;

  if p_invoice is null
    or pg_catalog.jsonb_typeof(p_invoice) <> 'object'
    or p_items is null
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or p_timelogs is null
    or pg_catalog.jsonb_typeof(p_timelogs) <> 'array'
    or p_receipts is null
    or pg_catalog.jsonb_typeof(p_receipts) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) = 0
    or (
      pg_catalog.jsonb_array_length(p_timelogs) = 0
      and pg_catalog.jsonb_array_length(p_receipts) = 0
    ) then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  if (
    select pg_catalog.array_agg(key order by key)
    from pg_catalog.jsonb_object_keys(p_invoice) key
  ) is distinct from array[
    'amount_hours',
    'amount_km',
    'amount_receipts',
    'contractor_id',
    'currency',
    'customer_snapshot',
    'due_date',
    'event_id',
    'invoice_number',
    'issue_date',
    'job_number',
    'supplier_snapshot',
    'taxable_supply_date',
    'total_amount',
    'total_hours'
  ]::text[] then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) item
    where case
      when pg_catalog.jsonb_typeof(item) <> 'object' then true
      else (
          select pg_catalog.array_agg(key order by key)
          from pg_catalog.jsonb_object_keys(item) key
        ) is distinct from array[
          'amount_hours',
          'amount_km',
          'amount_receipts',
          'event_id',
          'hours',
          'job_number',
          'km',
          'total_amount'
        ]::text[]
      end
  ) or exists (
    select 1
    from (
      select target
      from pg_catalog.jsonb_array_elements(p_timelogs) target
      union all
      select target
      from pg_catalog.jsonb_array_elements(p_receipts) target
    ) targets
    where case
      when pg_catalog.jsonb_typeof(target) <> 'object' then true
      else (
          select pg_catalog.array_agg(key order by key)
          from pg_catalog.jsonb_object_keys(target) key
        ) is distinct from array['expected_updated_at', 'id']::text[]
      end
  ) then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  begin
    v_contractor_id := (p_invoice->>'contractor_id')::uuid;
    v_event_id := nullif(p_invoice->>'event_id', '')::uuid;
    v_total_hours := (p_invoice->>'total_hours')::numeric;
    v_amount_hours := (p_invoice->>'amount_hours')::numeric;
    v_amount_km := (p_invoice->>'amount_km')::numeric;
    v_amount_receipts := (p_invoice->>'amount_receipts')::numeric;
    v_total_amount := (p_invoice->>'total_amount')::numeric;
    v_issue_date := nullif(p_invoice->>'issue_date', '')::date;
    v_taxable_supply_date := nullif(p_invoice->>'taxable_supply_date', '')::date;
    v_due_date := nullif(p_invoice->>'due_date', '')::date;

    perform
      nullif(item->>'event_id', '')::uuid,
      (item->>'hours')::numeric,
      (item->>'amount_hours')::numeric,
      (item->>'km')::numeric,
      (item->>'amount_km')::numeric,
      (item->>'amount_receipts')::numeric,
      (item->>'total_amount')::numeric
    from pg_catalog.jsonb_array_elements(p_items) item;

    perform
      (target->>'id')::uuid,
      (target->>'expected_updated_at')::timestamptz
    from (
      select target
      from pg_catalog.jsonb_array_elements(p_timelogs) target
      union all
      select target
      from pg_catalog.jsonb_array_elements(p_receipts) target
    ) targets;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow
      or numeric_value_out_of_range then
      raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end;

  if v_contractor_id is null
    or nullif(pg_catalog.btrim(coalesce(p_invoice->>'currency', '')), '') is null
    or v_total_hours is null
    or v_amount_hours is null
    or v_amount_km is null
    or v_amount_receipts is null
    or v_total_amount is null
    or v_total_hours::text in ('NaN', 'Infinity', '-Infinity')
    or v_amount_hours::text in ('NaN', 'Infinity', '-Infinity')
    or v_amount_km::text in ('NaN', 'Infinity', '-Infinity')
    or v_amount_receipts::text in ('NaN', 'Infinity', '-Infinity')
    or v_total_amount::text in ('NaN', 'Infinity', '-Infinity')
    or v_total_hours < 0
    or v_amount_hours < 0
    or v_amount_km < 0
    or v_amount_receipts < 0
    or v_total_amount < 0
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_items) item
      where nullif(pg_catalog.btrim(coalesce(item->>'job_number', '')), '') is null
        or item->>'hours' is null
        or item->>'amount_hours' is null
        or item->>'km' is null
        or item->>'amount_km' is null
        or item->>'amount_receipts' is null
        or item->>'total_amount' is null
        or (item->>'hours')::numeric::text in ('NaN', 'Infinity', '-Infinity')
        or (item->>'amount_hours')::numeric::text in ('NaN', 'Infinity', '-Infinity')
        or (item->>'km')::numeric::text in ('NaN', 'Infinity', '-Infinity')
        or (item->>'amount_km')::numeric::text in ('NaN', 'Infinity', '-Infinity')
        or (item->>'amount_receipts')::numeric::text in ('NaN', 'Infinity', '-Infinity')
        or (item->>'total_amount')::numeric::text in ('NaN', 'Infinity', '-Infinity')
        or (item->>'hours')::numeric < 0
        or (item->>'amount_hours')::numeric < 0
        or (item->>'km')::numeric < 0
        or (item->>'amount_km')::numeric < 0
        or (item->>'amount_receipts')::numeric < 0
        or (item->>'total_amount')::numeric < 0
    )
    or exists (
      select 1
      from (
        select target
        from pg_catalog.jsonb_array_elements(p_timelogs) target
        union all
        select target
        from pg_catalog.jsonb_array_elements(p_receipts) target
      ) targets
      where nullif(target->>'id', '') is null
        or nullif(target->>'expected_updated_at', '') is null
    )
    or pg_catalog.jsonb_typeof(p_invoice->'supplier_snapshot') not in ('object', 'null')
    or pg_catalog.jsonb_typeof(p_invoice->'customer_snapshot') not in ('object', 'null') then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  select pg_catalog.jsonb_array_length(p_timelogs) into v_target_count;
  if v_target_count <> (
    select pg_catalog.count(distinct target->>'id')::integer
    from pg_catalog.jsonb_array_elements(p_timelogs) target
  ) then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  select pg_catalog.jsonb_array_length(p_receipts) into v_target_count;
  if v_target_count <> (
    select pg_catalog.count(distinct target->>'id')::integer
    from pg_catalog.jsonb_array_elements(p_receipts) target
  ) then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  perform t.id
  from pg_catalog.jsonb_array_elements(p_timelogs) target
  join public.timelogs t on t.id = (target->>'id')::uuid
  order by (target->>'id')::uuid
  for update of t;

  select pg_catalog.count(*)::integer into v_matching_count
  from pg_catalog.jsonb_array_elements(p_timelogs) target
  join public.timelogs t on t.id = (target->>'id')::uuid
  where t.updated_at = (target->>'expected_updated_at')::timestamptz
    and t.contractor_id = v_contractor_id
    and t.status = 'approved'::public.timelog_status;

  if v_matching_count <> pg_catalog.jsonb_array_length(p_timelogs) then
    raise exception 'invoice_create_conflict' using errcode = '40001';
  end if;

  perform r.id
  from pg_catalog.jsonb_array_elements(p_receipts) target
  join public.receipts r on r.id = (target->>'id')::uuid
  order by (target->>'id')::uuid
  for update of r;

  select pg_catalog.count(*)::integer into v_matching_count
  from pg_catalog.jsonb_array_elements(p_receipts) target
  join public.receipts r on r.id = (target->>'id')::uuid
  where r.updated_at = (target->>'expected_updated_at')::timestamptz
    and r.contractor_id = v_contractor_id
    and r.status = 'approved'::public.receipt_status;

  if v_matching_count <> pg_catalog.jsonb_array_length(p_receipts) then
    raise exception 'invoice_create_conflict' using errcode = '40001';
  end if;

  begin
    insert into public.invoices (
      contractor_id,
      event_id,
      timelog_id,
      job_number,
      total_hours,
      amount_hours,
      amount_km,
      amount_receipts,
      total_amount,
      invoice_number,
      issue_date,
      taxable_supply_date,
      due_date,
      currency,
      supplier_snapshot,
      customer_snapshot,
      pdf_path,
      pdf_generated_at,
      status,
      sent_at,
      paid_at
    ) values (
      v_contractor_id,
      v_event_id,
      null,
      nullif(pg_catalog.btrim(coalesce(p_invoice->>'job_number', '')), ''),
      v_total_hours,
      v_amount_hours,
      v_amount_km,
      v_amount_receipts,
      v_total_amount,
      nullif(pg_catalog.btrim(coalesce(p_invoice->>'invoice_number', '')), ''),
      v_issue_date,
      v_taxable_supply_date,
      v_due_date,
      p_invoice->>'currency',
      nullif(p_invoice->'supplier_snapshot', 'null'::jsonb),
      nullif(p_invoice->'customer_snapshot', 'null'::jsonb),
      null,
      null,
      'draft'::public.invoice_status,
      null,
      null
    )
    returning * into v_invoice;

    insert into public.invoice_items (
      invoice_id,
      job_number,
      event_id,
      hours,
      amount_hours,
      km,
      amount_km,
      amount_receipts,
      amount_meals,
      total_amount
    )
    select
      v_invoice.id,
      item->>'job_number',
      nullif(item->>'event_id', '')::uuid,
      (item->>'hours')::numeric,
      (item->>'amount_hours')::numeric,
      (item->>'km')::numeric,
      (item->>'amount_km')::numeric,
      (item->>'amount_receipts')::numeric,
      0,
      (item->>'total_amount')::numeric
    from pg_catalog.jsonb_array_elements(p_items) with ordinality source(item, ordinal)
    order by item->>'job_number', nullif(item->>'event_id', '')::uuid, ordinal;

    insert into public.invoice_timelogs (invoice_id, timelog_id)
    select v_invoice.id, (target->>'id')::uuid
    from pg_catalog.jsonb_array_elements(p_timelogs) target
    order by (target->>'id')::uuid;

    insert into public.invoice_receipts (invoice_id, receipt_id)
    select v_invoice.id, (target->>'id')::uuid
    from pg_catalog.jsonb_array_elements(p_receipts) target
    order by (target->>'id')::uuid;

    v_previous_marker := pg_catalog.current_setting(
      'crewflow.invoice_receipt_mutation',
      true
    );
    perform pg_catalog.set_config('crewflow.invoice_receipt_mutation', 'on', true);
    begin
      update public.receipts r
      set status = 'attached'::public.receipt_status
      from pg_catalog.jsonb_array_elements(p_receipts) target
      where r.id = (target->>'id')::uuid
        and r.status = 'approved'::public.receipt_status;

      get diagnostics v_matching_count = row_count;
      if v_matching_count <> pg_catalog.jsonb_array_length(p_receipts) then
        raise exception 'invoice_create_conflict' using errcode = '40001';
      end if;

      perform pg_catalog.set_config(
        'crewflow.invoice_receipt_mutation',
        pg_catalog.coalesce(v_previous_marker, ''),
        true
      );
    exception
      when others then
        perform pg_catalog.set_config(
          'crewflow.invoice_receipt_mutation',
          pg_catalog.coalesce(v_previous_marker, ''),
          true
        );
        raise;
    end;

    update public.timelogs t
    set status = 'invoiced'::public.timelog_status
    from pg_catalog.jsonb_array_elements(p_timelogs) target
    where t.id = (target->>'id')::uuid
      and t.status = 'approved'::public.timelog_status;

    get diagnostics v_matching_count = row_count;
    if v_matching_count <> pg_catalog.jsonb_array_length(p_timelogs) then
      raise exception 'invoice_create_conflict' using errcode = '40001';
    end if;
  exception
    when unique_violation or foreign_key_violation then
      raise exception 'invoice_create_conflict' using errcode = '40001';
    when not_null_violation
      or check_violation
      or numeric_value_out_of_range
      or invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow then
      raise exception 'invoice_mutation_invalid' using errcode = '22023';
    when insufficient_privilege then
      raise exception 'invoice_unauthorized' using errcode = '42501';
  end;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', t.id,
        'status', t.status,
        'updated_at', t.updated_at
      ) order by t.id
    ),
    '[]'::jsonb
  ) into v_timelog_rows
  from public.timelogs t
  join pg_catalog.jsonb_array_elements(p_timelogs) target
    on t.id = (target->>'id')::uuid;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'updated_at', r.updated_at
      ) order by r.id
    ),
    '[]'::jsonb
  ) into v_receipt_rows
  from public.receipts r
  join pg_catalog.jsonb_array_elements(p_receipts) target
    on r.id = (target->>'id')::uuid;

  return query
  select
    v_invoice.id,
    v_invoice.status,
    v_invoice.updated_at,
    v_invoice.paid_at,
    v_timelog_rows,
    v_receipt_rows;
end;
$$;

create or replace function public.mark_invoice_sent_atomic(
  p_invoice_id uuid,
  p_expected_updated_at timestamptz,
  p_sent_at timestamptz
)
returns table (
  invoice_id uuid,
  invoice_status public.invoice_status,
  invoice_updated_at timestamptz,
  paid_at timestamptz,
  timelogs jsonb,
  receipts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_timelog_rows jsonb;
  v_receipt_rows jsonb;
begin
  if auth.uid() is null
    or not public.has_role(auth.uid(), 'coo'::public.app_role) then
    raise exception 'invoice_unauthorized' using errcode = '42501';
  end if;

  if p_invoice_id is null
    or p_expected_updated_at is null
    or p_sent_at is null then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;

  if v_invoice.updated_at is distinct from p_expected_updated_at
    or v_invoice.status not in ('draft', 'sent')
    or (
      v_invoice.status = 'sent'::public.invoice_status
      and v_invoice.sent_at is distinct from p_sent_at
    ) then
    raise exception 'invoice_sent_conflict' using errcode = '40001';
  end if;

  perform link.id
  from public.invoice_timelogs link
  where link.invoice_id = p_invoice_id
  order by link.id
  for update;

  perform link.id
  from public.invoice_receipts link
  where link.invoice_id = p_invoice_id
  order by link.id
  for update;

  perform t.id
  from public.timelogs t
  join (
    select v_invoice.timelog_id as id
    where v_invoice.timelog_id is not null
    union
    select link.timelog_id
    from public.invoice_timelogs link
    where link.invoice_id = p_invoice_id
  ) linked on linked.id = t.id
  order by t.id
  for update of t;

  perform r.id
  from public.receipts r
  join public.invoice_receipts link on link.receipt_id = r.id
  where link.invoice_id = p_invoice_id
  order by r.id
  for update of r;

  if exists (
    select 1
    from public.timelogs t
    join (
      select v_invoice.timelog_id as id
      where v_invoice.timelog_id is not null
      union
      select link.timelog_id
      from public.invoice_timelogs link
      where link.invoice_id = p_invoice_id
    ) linked on linked.id = t.id
    where t.status <> 'invoiced'::public.timelog_status
  ) or exists (
    select 1
    from public.receipts r
    join public.invoice_receipts link on link.receipt_id = r.id
    where link.invoice_id = p_invoice_id
      and r.status <> 'attached'::public.receipt_status
  ) then
    raise exception 'invoice_has_protected_items' using errcode = 'P0001';
  end if;

  if v_invoice.status = 'draft'::public.invoice_status then
    update public.invoices i
    set status = 'sent'::public.invoice_status,
      sent_at = p_sent_at
    where i.id = p_invoice_id
      and i.status = 'draft'::public.invoice_status
      and i.updated_at = p_expected_updated_at
    returning i.* into v_invoice;

    if not found then
      raise exception 'invoice_sent_conflict' using errcode = '40001';
    end if;
  end if;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', t.id,
        'status', t.status,
        'updated_at', t.updated_at
      ) order by t.id
    ),
    '[]'::jsonb
  ) into v_timelog_rows
  from public.timelogs t
  join (
    select v_invoice.timelog_id as id
    where v_invoice.timelog_id is not null
    union
    select link.timelog_id
    from public.invoice_timelogs link
    where link.invoice_id = p_invoice_id
  ) linked on linked.id = t.id;

  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'updated_at', r.updated_at
      ) order by r.id
    ),
    '[]'::jsonb
  ) into v_receipt_rows
  from public.receipts r
  join public.invoice_receipts link on link.receipt_id = r.id
  where link.invoice_id = p_invoice_id;

  return query
  select
    v_invoice.id,
    v_invoice.status,
    v_invoice.updated_at,
    v_invoice.paid_at,
    v_timelog_rows,
    v_receipt_rows;
end;
$$;

create or replace function public.mark_invoice_paid_atomic(
  p_invoice_id uuid,
  p_expected_status public.invoice_status,
  p_expected_updated_at timestamptz,
  p_paid_at timestamptz
)
returns table (
  invoice_id uuid,
  invoice_status public.invoice_status,
  invoice_updated_at timestamptz,
  paid_at timestamptz,
  timelogs jsonb,
  receipts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_timelog_rows jsonb;
  v_receipt_rows jsonb;
  v_previous_marker text;
begin
  if auth.uid() is null
    or not public.has_role(auth.uid(), 'coo'::public.app_role) then
    raise exception 'invoice_unauthorized' using errcode = '42501';
  end if;

  if p_invoice_id is null
    or p_expected_status is null
    or p_expected_updated_at is null
    or p_paid_at is null then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;

  if v_invoice.status is distinct from p_expected_status
    or v_invoice.updated_at is distinct from p_expected_updated_at
    or v_invoice.status not in ('sent', 'paid')
    or (
      v_invoice.status = 'paid'::public.invoice_status
      and v_invoice.paid_at is distinct from p_paid_at
    ) then
    raise exception 'invoice_paid_conflict' using errcode = '40001';
  end if;

  perform link.id
  from public.invoice_timelogs link
  where link.invoice_id = p_invoice_id
  order by link.id
  for update;

  perform link.id
  from public.invoice_receipts link
  where link.invoice_id = p_invoice_id
  order by link.id
  for update;

  perform t.id
  from public.timelogs t
  join (
    select v_invoice.timelog_id as id
    where v_invoice.timelog_id is not null
    union
    select link.timelog_id
    from public.invoice_timelogs link
    where link.invoice_id = p_invoice_id
  ) linked on linked.id = t.id
  order by t.id
  for update of t;

  perform r.id
  from public.receipts r
  join public.invoice_receipts link on link.receipt_id = r.id
  where link.invoice_id = p_invoice_id
  order by r.id
  for update of r;

  if exists (
    select 1
    from public.timelogs t
    join (
      select v_invoice.timelog_id as id
      where v_invoice.timelog_id is not null
      union
      select link.timelog_id
      from public.invoice_timelogs link
      where link.invoice_id = p_invoice_id
    ) linked on linked.id = t.id
    where t.status not in ('invoiced', 'paid')
  ) or exists (
    select 1
    from public.receipts r
    join public.invoice_receipts link on link.receipt_id = r.id
    where link.invoice_id = p_invoice_id
      and r.status not in ('attached', 'reimbursed')
  ) then
    raise exception 'invoice_has_protected_items' using errcode = 'P0001';
  end if;

  begin
    v_previous_marker := pg_catalog.current_setting(
      'crewflow.invoice_receipt_mutation',
      true
    );
    perform pg_catalog.set_config('crewflow.invoice_receipt_mutation', 'on', true);
    begin
      update public.receipts r
      set status = 'reimbursed'::public.receipt_status
      from public.invoice_receipts link
      where link.invoice_id = p_invoice_id
        and link.receipt_id = r.id
        and r.status = 'attached'::public.receipt_status;

      perform pg_catalog.set_config(
        'crewflow.invoice_receipt_mutation',
        pg_catalog.coalesce(v_previous_marker, ''),
        true
      );
    exception
      when others then
        perform pg_catalog.set_config(
          'crewflow.invoice_receipt_mutation',
          pg_catalog.coalesce(v_previous_marker, ''),
          true
        );
        raise;
    end;

    update public.timelogs t
    set status = 'paid'::public.timelog_status
    from (
      select v_invoice.timelog_id as id
      where v_invoice.timelog_id is not null
      union
      select link.timelog_id
      from public.invoice_timelogs link
      where link.invoice_id = p_invoice_id
    ) linked
    where linked.id = t.id
      and t.status = 'invoiced'::public.timelog_status;

    if v_invoice.status = 'sent'::public.invoice_status then
      update public.invoices i
      set status = 'paid'::public.invoice_status,
        paid_at = p_paid_at
      where i.id = p_invoice_id
        and i.status = 'sent'::public.invoice_status
        and i.updated_at = p_expected_updated_at
      returning i.* into v_invoice;

      if not found then
        raise exception 'invoice_paid_conflict' using errcode = '40001';
      end if;
    end if;
  exception
    when insufficient_privilege then
      raise exception 'invoice_unauthorized' using errcode = '42501';
  end;

  if exists (
    select 1
    from public.timelogs t
    join (
      select v_invoice.timelog_id as id
      where v_invoice.timelog_id is not null
      union
      select link.timelog_id
      from public.invoice_timelogs link
      where link.invoice_id = p_invoice_id
    ) linked on linked.id = t.id
    where t.status <> 'paid'::public.timelog_status
  ) or exists (
    select 1
    from public.receipts r
    join public.invoice_receipts link on link.receipt_id = r.id
    where link.invoice_id = p_invoice_id
      and r.status <> 'reimbursed'::public.receipt_status
  ) then
    raise exception 'invoice_paid_conflict' using errcode = '40001';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', t.id,
        'status', t.status,
        'updated_at', t.updated_at
      ) order by t.id
    ),
    '[]'::jsonb
  ) into v_timelog_rows
  from public.timelogs t
  join (
    select v_invoice.timelog_id as id
    where v_invoice.timelog_id is not null
    union
    select link.timelog_id
    from public.invoice_timelogs link
    where link.invoice_id = p_invoice_id
  ) linked on linked.id = t.id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'updated_at', r.updated_at
      ) order by r.id
    ),
    '[]'::jsonb
  ) into v_receipt_rows
  from public.receipts r
  join public.invoice_receipts link on link.receipt_id = r.id
  where link.invoice_id = p_invoice_id;

  return query
  select
    v_invoice.id,
    v_invoice.status,
    v_invoice.updated_at,
    v_invoice.paid_at,
    v_timelog_rows,
    v_receipt_rows;
end;
$$;

create or replace function public.delete_invoice_atomic(
  p_invoice_id uuid,
  p_expected_status public.invoice_status,
  p_expected_updated_at timestamptz
)
returns table (
  invoice_id uuid,
  invoice_status public.invoice_status,
  invoice_updated_at timestamptz,
  paid_at timestamptz,
  timelogs jsonb,
  receipts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_timelog_rows jsonb;
  v_receipt_rows jsonb;
  v_deleted_invoice_id uuid;
  v_previous_marker text;
begin
  if auth.uid() is null
    or not public.has_role(auth.uid(), 'coo'::public.app_role) then
    raise exception 'invoice_unauthorized' using errcode = '42501';
  end if;

  if p_invoice_id is null
    or p_expected_status is null
    or p_expected_updated_at is null then
    raise exception 'invoice_mutation_invalid' using errcode = '22023';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;

  if v_invoice.status is distinct from p_expected_status
    or v_invoice.updated_at is distinct from p_expected_updated_at
    or v_invoice.status <> 'draft'::public.invoice_status then
    raise exception 'invoice_delete_conflict' using errcode = '40001';
  end if;

  perform link.id
  from public.invoice_timelogs link
  where link.invoice_id = p_invoice_id
  order by link.id
  for update;

  perform link.id
  from public.invoice_receipts link
  where link.invoice_id = p_invoice_id
  order by link.id
  for update;

  perform t.id
  from public.timelogs t
  join (
    select v_invoice.timelog_id as id
    where v_invoice.timelog_id is not null
    union
    select link.timelog_id
    from public.invoice_timelogs link
    where link.invoice_id = p_invoice_id
  ) linked on linked.id = t.id
  order by t.id
  for update of t;

  perform r.id
  from public.receipts r
  join public.invoice_receipts link on link.receipt_id = r.id
  where link.invoice_id = p_invoice_id
  order by r.id
  for update of r;

  if exists (
    select 1
    from public.timelogs t
    join (
      select v_invoice.timelog_id as id
      where v_invoice.timelog_id is not null
      union
      select link.timelog_id
      from public.invoice_timelogs link
      where link.invoice_id = p_invoice_id
    ) linked on linked.id = t.id
    where t.status not in ('invoiced', 'approved')
  ) or exists (
    select 1
    from public.receipts r
    join public.invoice_receipts link on link.receipt_id = r.id
    where link.invoice_id = p_invoice_id
      and r.status not in ('attached', 'approved')
  ) then
    raise exception 'invoice_has_protected_items' using errcode = 'P0001';
  end if;

  begin
    v_previous_marker := pg_catalog.current_setting(
      'crewflow.invoice_receipt_mutation',
      true
    );
    perform pg_catalog.set_config('crewflow.invoice_receipt_mutation', 'on', true);
    begin
      update public.receipts r
      set status = 'approved'::public.receipt_status
      from public.invoice_receipts link
      where link.invoice_id = p_invoice_id
        and link.receipt_id = r.id
        and r.status = 'attached'::public.receipt_status;

      perform pg_catalog.set_config(
        'crewflow.invoice_receipt_mutation',
        pg_catalog.coalesce(v_previous_marker, ''),
        true
      );
    exception
      when others then
        perform pg_catalog.set_config(
          'crewflow.invoice_receipt_mutation',
          pg_catalog.coalesce(v_previous_marker, ''),
          true
        );
        raise;
    end;

    update public.timelogs t
    set status = 'approved'::public.timelog_status
    from (
      select v_invoice.timelog_id as id
      where v_invoice.timelog_id is not null
      union
      select link.timelog_id
      from public.invoice_timelogs link
      where link.invoice_id = p_invoice_id
    ) linked
    where linked.id = t.id
      and t.status = 'invoiced'::public.timelog_status;

    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', t.id,
          'status', t.status,
          'updated_at', t.updated_at
        ) order by t.id
      ),
      '[]'::jsonb
    ) into v_timelog_rows
    from public.timelogs t
    join (
      select v_invoice.timelog_id as id
      where v_invoice.timelog_id is not null
      union
      select link.timelog_id
      from public.invoice_timelogs link
      where link.invoice_id = p_invoice_id
    ) linked on linked.id = t.id;

    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'status', r.status,
          'updated_at', r.updated_at
        ) order by r.id
      ),
      '[]'::jsonb
    ) into v_receipt_rows
    from public.receipts r
    join public.invoice_receipts link on link.receipt_id = r.id
    where link.invoice_id = p_invoice_id;

    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_timelog_rows) row_value
      where row_value->>'status' <> 'approved'
    ) or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_receipt_rows) row_value
      where row_value->>'status' <> 'approved'
    ) then
      raise exception 'invoice_delete_conflict' using errcode = '40001';
    end if;

    delete from public.invoices i
    where i.id = p_invoice_id
      and i.status = 'draft'::public.invoice_status
      and i.updated_at = p_expected_updated_at
    returning i.id into v_deleted_invoice_id;

    if not found then
      raise exception 'invoice_delete_conflict' using errcode = '40001';
    end if;
  exception
    when insufficient_privilege then
      raise exception 'invoice_unauthorized' using errcode = '42501';
  end;

  return query
  select
    v_deleted_invoice_id,
    v_invoice.status,
    v_invoice.updated_at,
    v_invoice.paid_at,
    v_timelog_rows,
    v_receipt_rows;
end;
$$;

create or replace function public.assign_event_crew(
  p_event_id uuid,
  p_profile_id uuid,
  p_application_id uuid default null,
  p_days jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_existing_assignment_id uuid;
  v_timelog_id uuid;
  v_timelog_status public.timelog_status;
  v_timelog_created boolean := false;
  v_crew_filled integer;
  v_application_id uuid;
  v_application_status text;
  v_application_already_approved boolean := false;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_profile_id::text, 0)
  );

  perform id
  from public.events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  if p_application_id is not null then
    select id, status into v_application_id, v_application_status
    from public.event_applications
    where id = p_application_id
      and event_id = p_event_id
      and profile_id = p_profile_id
    for update;

    if not found then
      raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
    end if;

    if v_application_status not in ('pending', 'approved') then
      raise exception 'crew_application_conflict' using errcode = 'P0001';
    end if;
  end if;

  select id into v_existing_assignment_id
  from public.event_assignments
  where event_id = p_event_id and profile_id = p_profile_id
  for update;

  select id, status into v_timelog_id, v_timelog_status
  from public.timelogs
  where event_id = p_event_id and contractor_id = p_profile_id
  for update;

  if v_application_status = 'approved' then
    if v_existing_assignment_id is null or v_timelog_id is null then
      raise exception 'crew_application_conflict' using errcode = 'P0001';
    end if;
    v_application_already_approved := true;
  end if;

  if v_timelog_id is not null
    and v_existing_assignment_id is null
    and v_timelog_status <> 'draft'::public.timelog_status then
    raise exception 'crew_assignment_conflict' using errcode = 'P0001';
  end if;

  insert into public.event_assignments (event_id, profile_id)
  values (p_event_id, p_profile_id)
  on conflict (event_id, profile_id) do nothing;

  select id into v_assignment_id
  from public.event_assignments
  where event_id = p_event_id and profile_id = p_profile_id;

  if v_timelog_id is null then
    if p_days is null or pg_catalog.jsonb_typeof(p_days) <> 'array' then
      raise exception 'crew_assignment_invalid_days' using errcode = '22023';
    end if;

    if pg_catalog.jsonb_array_length(p_days) = 0 or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_days) day
      where nullif(day->>'date', '') is null
        or nullif(day->>'time_from', '') is null
        or nullif(day->>'time_to', '') is null
        or nullif(day->>'day_type', '') is null
        or day->>'day_type' not in ('instal', 'provoz', 'deinstal')
    ) then
      raise exception 'crew_assignment_invalid_days' using errcode = '22023';
    end if;

    -- Also force-cast all dates and both times solely for validation before inserts.
    -- Keep stored time strings in their original HH:MM form.
    begin
      perform (day->>'date')::date,
        (day->>'time_from')::time,
        (day->>'time_to')::time
      from pg_catalog.jsonb_array_elements(p_days) day;
    exception
      when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
        raise exception 'crew_assignment_invalid_days' using errcode = '22023';
    end;

    insert into public.timelogs (event_id, contractor_id, km, note, status)
    values (p_event_id, p_profile_id, 0, '', 'draft')
    returning id into v_timelog_id;

    insert into public.timelog_days (
      timelog_id, date, time_from, time_to, day_type, note
    )
    select
      v_timelog_id,
      (day->>'date')::date,
      day->>'time_from',
      day->>'time_to',
      (day->>'day_type')::public.timelog_type,
      nullif(day->>'note', '')
    from pg_catalog.jsonb_array_elements(p_days) day;

    v_timelog_created := true;
  end if;

  if p_application_id is not null and not v_application_already_approved then
    v_application_id := null;
    update public.event_applications
    set status = 'approved', updated_at = pg_catalog.now()
    where id = p_application_id
      and event_id = p_event_id
      and profile_id = p_profile_id
      and status = 'pending'
    returning id into v_application_id;

    if v_application_id is null then
      raise exception 'crew_application_conflict' using errcode = 'P0001';
    end if;
  elsif p_application_id is null then
    update public.event_applications
    set status = 'approved', updated_at = pg_catalog.now()
    where event_id = p_event_id and profile_id = p_profile_id
    returning id into v_application_id;
  end if;

  select count(*)::integer into v_crew_filled
  from public.event_assignments
  where event_id = p_event_id;

  update public.events
  set crew_filled = v_crew_filled
  where id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'profile_id', p_profile_id,
    'assignment_id', v_assignment_id,
    'timelog_id', v_timelog_id,
    'application_id', v_application_id,
    'timelog_created', v_timelog_created,
    'crew_filled', v_crew_filled
  );
end;
$$;

create or replace function public.remove_event_crew(
  p_event_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_removed boolean := false;
  v_timelog_removed boolean := false;
  v_application_id uuid;
  v_crew_filled integer;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_profile_id::text, 0)
  );

  perform id
  from public.events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  perform id
  from public.timelogs
  where event_id = p_event_id and contractor_id = p_profile_id
  for update;

  if exists (
    select 1
    from public.timelogs
    where event_id = p_event_id
      and contractor_id = p_profile_id
      and status not in ('draft', 'rejected')
  ) then
    raise exception 'crew_removal_blocked' using errcode = 'P0001';
  end if;

  delete from public.timelogs
  where event_id = p_event_id
    and contractor_id = p_profile_id
    and status in ('draft', 'rejected');
  v_timelog_removed := found;

  delete from public.event_assignments
  where event_id = p_event_id and profile_id = p_profile_id;
  v_assignment_removed := found;

  update public.event_applications
  set status = 'withdrawn', updated_at = pg_catalog.now()
  where event_id = p_event_id and profile_id = p_profile_id
  returning id into v_application_id;

  select count(*)::integer into v_crew_filled
  from public.event_assignments
  where event_id = p_event_id;

  update public.events
  set crew_filled = v_crew_filled
  where id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'profile_id', p_profile_id,
    'application_id', v_application_id,
    'assignment_removed', v_assignment_removed,
    'timelog_removed', v_timelog_removed,
    'crew_filled', v_crew_filled
  );
end;
$$;

create or replace function public.approve_event_withdrawal(
  p_event_id uuid,
  p_profile_id uuid,
  p_application_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_assignment_removed boolean := false;
  v_timelog_id uuid;
  v_timelog_status public.timelog_status;
  v_timelog_removed boolean := false;
  v_application_id uuid;
  v_application_status text;
  v_crew_filled integer;
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'crew_lifecycle_unauthorized' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text || ':' || p_profile_id::text, 0)
  );

  perform id
  from public.events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  select id, status into v_application_id, v_application_status
  from public.event_applications
  where id = p_application_id
    and event_id = p_event_id
    and profile_id = p_profile_id
  for update;
  if not found then
    raise exception 'crew_lifecycle_not_found' using errcode = 'P0002';
  end if;

  select id into v_assignment_id
  from public.event_assignments
  where event_id = p_event_id and profile_id = p_profile_id
  for update;

  select id, status into v_timelog_id, v_timelog_status
  from public.timelogs
  where event_id = p_event_id and contractor_id = p_profile_id
  for update;

  if v_application_status = 'withdrawn' then
    if v_assignment_id is not null or v_timelog_id is not null then
      raise exception 'crew_withdrawal_conflict' using errcode = 'P0001';
    end if;
  elsif v_application_status <> 'withdrawal_requested' then
    raise exception 'crew_withdrawal_conflict' using errcode = 'P0001';
  else
    if v_timelog_id is not null and v_timelog_status not in ('draft', 'rejected') then
      raise exception 'crew_removal_blocked' using errcode = 'P0001';
    end if;

    delete from public.timelogs
    where id = v_timelog_id
      and status in ('draft', 'rejected');
    v_timelog_removed := found;

    delete from public.event_assignments
    where id = v_assignment_id;
    v_assignment_removed := found;

    update public.event_applications
    set status = 'withdrawn', updated_at = pg_catalog.now()
    where id = p_application_id
      and event_id = p_event_id
      and profile_id = p_profile_id
      and status = 'withdrawal_requested';
    if not found then
      raise exception 'crew_withdrawal_conflict' using errcode = 'P0001';
    end if;
  end if;

  select count(*)::integer into v_crew_filled
  from public.event_assignments
  where event_id = p_event_id;

  update public.events
  set crew_filled = v_crew_filled
  where id = p_event_id;

  return pg_catalog.jsonb_build_object(
    'event_id', p_event_id,
    'profile_id', p_profile_id,
    'application_id', v_application_id,
    'assignment_removed', v_assignment_removed,
    'timelog_removed', v_timelog_removed,
    'crew_filled', v_crew_filled
  );
end;
$$;

revoke all on function public.assign_event_crew(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.assign_event_crew(uuid, uuid, uuid, jsonb) from anon;
grant execute on function public.assign_event_crew(uuid, uuid, uuid, jsonb) to authenticated;

revoke all on function public.remove_event_crew(uuid, uuid) from public;
revoke all on function public.remove_event_crew(uuid, uuid) from anon;
grant execute on function public.remove_event_crew(uuid, uuid) to authenticated;

revoke all on function public.approve_event_withdrawal(uuid, uuid, uuid) from public;
revoke all on function public.approve_event_withdrawal(uuid, uuid, uuid) from anon;
grant execute on function public.approve_event_withdrawal(uuid, uuid, uuid) to authenticated;

revoke all on function public.save_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, public.timelog_status, jsonb) from public;
revoke all on function public.save_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, public.timelog_status, jsonb) from anon;
grant execute on function public.save_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, public.timelog_status, jsonb) to authenticated;

revoke all on function public.transition_timelog_statuses_atomic(jsonb, public.timelog_status, public.timelog_status) from public;
revoke all on function public.transition_timelog_statuses_atomic(jsonb, public.timelog_status, public.timelog_status) from anon;
grant execute on function public.transition_timelog_statuses_atomic(jsonb, public.timelog_status, public.timelog_status) to authenticated;

revoke all on function public.transition_receipt_statuses_atomic(jsonb, public.receipt_status, public.receipt_status) from public;
revoke all on function public.transition_receipt_statuses_atomic(jsonb, public.receipt_status, public.receipt_status) from anon;
grant execute on function public.transition_receipt_statuses_atomic(jsonb, public.receipt_status, public.receipt_status) to authenticated;

revoke all on function public.delete_timelog_atomic(uuid, timestamptz, public.timelog_status) from public;
revoke all on function public.delete_timelog_atomic(uuid, timestamptz, public.timelog_status) from anon;
grant execute on function public.delete_timelog_atomic(uuid, timestamptz, public.timelog_status) to authenticated;

revoke all on function public.import_approved_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, jsonb) from public;
revoke all on function public.import_approved_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, jsonb) from anon;
grant execute on function public.import_approved_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, jsonb) to authenticated;

revoke all on function public.delete_event_atomic(uuid) from public;
revoke all on function public.delete_event_atomic(uuid) from anon;
grant execute on function public.delete_event_atomic(uuid) to authenticated;

revoke all on function public.create_invoice_atomic(jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.create_invoice_atomic(jsonb, jsonb, jsonb, jsonb) from anon;
grant execute on function public.create_invoice_atomic(jsonb, jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.mark_invoice_sent_atomic(uuid, timestamptz, timestamptz) from public;
revoke all on function public.mark_invoice_sent_atomic(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.mark_invoice_sent_atomic(uuid, timestamptz, timestamptz) to authenticated;

revoke all on function public.mark_invoice_paid_atomic(uuid, public.invoice_status, timestamptz, timestamptz) from public;
revoke all on function public.mark_invoice_paid_atomic(uuid, public.invoice_status, timestamptz, timestamptz) from anon;
grant execute on function public.mark_invoice_paid_atomic(uuid, public.invoice_status, timestamptz, timestamptz) to authenticated;

revoke all on function public.delete_invoice_atomic(uuid, public.invoice_status, timestamptz) from public;
revoke all on function public.delete_invoice_atomic(uuid, public.invoice_status, timestamptz) from anon;
grant execute on function public.delete_invoice_atomic(uuid, public.invoice_status, timestamptz) to authenticated;

commit;
