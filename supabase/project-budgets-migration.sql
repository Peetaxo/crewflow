begin;

create table if not exists public.budget_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_package_events (
  budget_package_id uuid not null references public.budget_packages(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (budget_package_id, event_id)
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  budget_package_id uuid references public.budget_packages(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  section text not null,
  name text not null,
  units text not null default '',
  amount numeric(12,2) not null default 0,
  quantity numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_budget_packages_project_id
  on public.budget_packages(project_id);

create index if not exists idx_budget_package_events_event_id
  on public.budget_package_events(event_id);

create index if not exists idx_budget_items_project_id
  on public.budget_items(project_id);

create index if not exists idx_budget_items_budget_package_id
  on public.budget_items(budget_package_id);

create index if not exists idx_budget_items_event_id
  on public.budget_items(event_id);

create or replace function public.check_budget_package_event_project()
returns trigger
language plpgsql
as $$
declare
  package_project_id uuid;
  event_project_id uuid;
begin
  select project_id
  into package_project_id
  from public.budget_packages
  where id = new.budget_package_id;

  select project_id
  into event_project_id
  from public.events
  where id = new.event_id;

  if package_project_id is null
    or event_project_id is null
    or package_project_id <> event_project_id then
    raise exception 'budget package event must belong to the same project';
  end if;

  return new;
end;
$$;

create or replace function public.check_budget_item_project()
returns trigger
language plpgsql
as $$
declare
  related_project_id uuid;
begin
  if new.budget_package_id is not null then
    select project_id
    into related_project_id
    from public.budget_packages
    where id = new.budget_package_id;

    if related_project_id is null or related_project_id <> new.project_id then
      raise exception 'budget item package must belong to the same project';
    end if;
  end if;

  if new.event_id is not null then
    select project_id
    into related_project_id
    from public.events
    where id = new.event_id;

    if related_project_id is null or related_project_id <> new.project_id then
      raise exception 'budget item event must belong to the same project';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_budget_package_project_change()
returns trigger
language plpgsql
as $$
begin
  if new.project_id <> old.project_id then
    raise exception 'budget package project cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_budget_package_project_change
  on public.budget_packages;

create trigger prevent_budget_package_project_change
  before update of project_id
  on public.budget_packages
  for each row
  execute function public.prevent_budget_package_project_change();

drop trigger if exists validate_budget_package_event_project
  on public.budget_package_events;

create trigger validate_budget_package_event_project
  before insert or update
  on public.budget_package_events
  for each row
  execute function public.check_budget_package_event_project();

drop trigger if exists validate_budget_item_project
  on public.budget_items;

create trigger validate_budget_item_project
  before insert or update
  on public.budget_items
  for each row
  execute function public.check_budget_item_project();

create or replace function public.save_budget_package_events(
  p_budget_package_id uuid,
  p_event_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  package_project_id uuid;
  requested_event_count integer;
  valid_event_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select project_id
  into package_project_id
  from public.budget_packages
  where id = p_budget_package_id;

  if package_project_id is null then
    raise exception 'budget package does not exist';
  end if;

  select count(distinct selected.event_id)
  into requested_event_count
  from unnest(coalesce(p_event_ids, array[]::uuid[])) as selected(event_id)
  where selected.event_id is not null;

  if cardinality(coalesce(p_event_ids, array[]::uuid[])) <> requested_event_count then
    raise exception 'budget package event ids must be non-null and unique';
  end if;

  select count(*)
  into valid_event_count
  from public.events event_row
  join (
    select distinct selected.event_id
    from unnest(coalesce(p_event_ids, array[]::uuid[])) as selected(event_id)
    where selected.event_id is not null
  ) selected_events on selected_events.event_id = event_row.id
  where event_row.project_id = package_project_id;

  if valid_event_count <> requested_event_count then
    raise exception 'budget package events must belong to the package project';
  end if;

  delete from public.budget_package_events
  where budget_package_id = p_budget_package_id;

  insert into public.budget_package_events (budget_package_id, event_id)
  select p_budget_package_id, selected.event_id
  from unnest(coalesce(p_event_ids, array[]::uuid[])) as selected(event_id);
end;
$$;

revoke all on function public.save_budget_package_events(uuid, uuid[]) from public;
revoke all on function public.save_budget_package_events(uuid, uuid[]) from anon;
grant execute on function public.save_budget_package_events(uuid, uuid[]) to authenticated;

alter table public.budget_packages enable row level security;
alter table public.budget_package_events enable row level security;
alter table public.budget_items enable row level security;

drop policy if exists "authenticated users can read budget packages" on public.budget_packages;
drop policy if exists "authenticated users can write budget packages" on public.budget_packages;
drop policy if exists "authenticated users can read budget package events" on public.budget_package_events;
drop policy if exists "authenticated users can write budget package events" on public.budget_package_events;
drop policy if exists "authenticated users can read budget items" on public.budget_items;
drop policy if exists "authenticated users can write budget items" on public.budget_items;

create policy "authenticated users can read budget packages"
  on public.budget_packages
  for select
  to authenticated
  using (true);

create policy "authenticated users can write budget packages"
  on public.budget_packages
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read budget package events"
  on public.budget_package_events
  for select
  to authenticated
  using (true);

create policy "authenticated users can write budget package events"
  on public.budget_package_events
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read budget items"
  on public.budget_items
  for select
  to authenticated
  using (true);

create policy "authenticated users can write budget items"
  on public.budget_items
  for all
  to authenticated
  using (true)
  with check (true);

comment on table public.budget_packages is
  'Project-level budget groupings such as Majales inside one job-number project.';

comment on table public.budget_package_events is
  'Join table linking existing events into project budget packages.';

comment on table public.budget_items is
  'Planned budget line items mirroring sectioned event budget workbooks.';

commit;
