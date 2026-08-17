begin;

set local lock_timeout = '5s';

alter type public.timelog_status
  add value if not exists 'pending_crew_confirmation' after 'pending_ch';

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
    status in ('pending', 'withdrawn')
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
