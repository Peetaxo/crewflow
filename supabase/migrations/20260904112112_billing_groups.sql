-- Production-managed event grouping only. No event, project, hour or invoice writes.
begin;

create table public.billing_groups (
  id uuid primary key,
  name text not null check (name = pg_catalog.btrim(name) and pg_catalog.char_length(name) between 1 and 120)
);

create table public.billing_group_members (
  event_id uuid primary key references public.events(id) on delete restrict,
  group_id uuid not null references public.billing_groups(id) on delete restrict
);
create index billing_group_members_group_id_idx on public.billing_group_members(group_id);

create table public.billing_group_state (
  singleton boolean primary key default true check (singleton),
  revision integer not null default 0 check (revision >= 0)
);
insert into public.billing_group_state(singleton, revision) values (true, 0);

create table public.billing_group_requests (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index billing_group_requests_actor_id_idx on public.billing_group_requests(actor_id);

create or replace function public.can_manage_billing_groups()
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.has_role((select auth.uid()), 'crewhead'::public.app_role)
    or public.has_role((select auth.uid()), 'coo'::public.app_role)
$$;
revoke all on function public.can_manage_billing_groups() from public, anon;
grant execute on function public.can_manage_billing_groups() to authenticated;

alter table public.billing_groups enable row level security;
alter table public.billing_group_members enable row level security;
alter table public.billing_group_state enable row level security;
alter table public.billing_group_requests enable row level security;
revoke all on public.billing_groups, public.billing_group_members, public.billing_group_state,
  public.billing_group_requests from public, anon, authenticated;
grant select, insert, update, delete on public.billing_groups, public.billing_group_members to authenticated;
grant select, update on public.billing_group_state to authenticated;
grant select, insert on public.billing_group_requests to authenticated;

create policy billing_groups_select on public.billing_groups for select to authenticated using (
  (select public.can_manage_billing_groups())
  or exists (select 1 from public.billing_group_members m where m.group_id = billing_groups.id)
);
create policy billing_groups_insert on public.billing_groups for insert to authenticated
  with check ((select public.can_manage_billing_groups()));
create policy billing_groups_update on public.billing_groups for update to authenticated
  using ((select public.can_manage_billing_groups())) with check ((select public.can_manage_billing_groups()));
create policy billing_groups_delete on public.billing_groups for delete to authenticated
  using ((select public.can_manage_billing_groups()));

-- This subquery is intentionally invoker-visible: existing event RLS remains authoritative.
create policy billing_group_members_select on public.billing_group_members for select to authenticated
  using (exists (select 1 from public.events e where e.id = billing_group_members.event_id));
create policy billing_group_members_insert on public.billing_group_members for insert to authenticated
  with check ((select public.can_manage_billing_groups())
    and exists (select 1 from public.events e where e.id = billing_group_members.event_id));
create policy billing_group_members_update on public.billing_group_members for update to authenticated
  using ((select public.can_manage_billing_groups())
    and exists (select 1 from public.events e where e.id = billing_group_members.event_id))
  with check ((select public.can_manage_billing_groups())
    and exists (select 1 from public.events e where e.id = billing_group_members.event_id));
create policy billing_group_members_delete on public.billing_group_members for delete to authenticated
  using ((select public.can_manage_billing_groups())
    and exists (select 1 from public.events e where e.id = billing_group_members.event_id));

create policy billing_group_state_select on public.billing_group_state for select to authenticated
  using ((select public.can_manage_billing_groups()));
create policy billing_group_state_update on public.billing_group_state for update to authenticated
  using ((select public.can_manage_billing_groups())) with check ((select public.can_manage_billing_groups()));
create policy billing_group_requests_select on public.billing_group_requests for select to authenticated
  using (actor_id = (select auth.uid()) and (select public.can_manage_billing_groups()));
create policy billing_group_requests_insert on public.billing_group_requests for insert to authenticated
  with check (actor_id = (select auth.uid()) and (select public.can_manage_billing_groups()));

-- A workflow guard, not an authorization boundary. RLS and authoritative roles also apply.
-- Never expose a generic SQL/set_config RPC that would let clients choose this marker.
create or replace function public.guard_billing_group_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.can_manage_billing_groups()
    or pg_catalog.current_setting('app.billing_group_write', true) is distinct from 'atomic' then
    raise exception 'billing_group_atomic_required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_billing_group_write() from public, anon, authenticated;
create trigger guard_billing_groups before insert or update or delete on public.billing_groups
  for each row execute function public.guard_billing_group_write();
create trigger guard_billing_group_members before insert or update or delete on public.billing_group_members
  for each row execute function public.guard_billing_group_write();
create trigger guard_billing_group_state before update on public.billing_group_state
  for each row execute function public.guard_billing_group_write();
create trigger guard_billing_group_requests before insert on public.billing_group_requests
  for each row execute function public.guard_billing_group_write();

create or replace function public.read_billing_groups()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'revision', (select s.revision from public.billing_group_state s where s.singleton),
    'groups', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', g.id, 'name', g.name,
        'event_ids', coalesce((select pg_catalog.jsonb_agg(m.event_id order by m.event_id)
          from public.billing_group_members m where m.group_id = g.id), '[]'::jsonb)
      ) order by g.id) from public.billing_groups g
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.read_billing_groups() from public, anon;
grant execute on function public.read_billing_groups() to authenticated;

create or replace function public.save_billing_group_atomic(
  p_request_id uuid,
  p_group_id uuid,
  p_name text,
  p_event_ids uuid[],
  p_expected_revision integer,
  p_event_versions jsonb,
  p_confirm_cross_project boolean,
  p_confirm_moves boolean,
  p_delete boolean
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_actor_id uuid := auth.uid();
  v_revision integer;
  v_payload jsonb;
  v_previous_request public.billing_group_requests%rowtype;
  v_result jsonb;
  v_inserted integer;
  v_affected_ids uuid[];
  v_version_keys text[];
  v_event record;
  v_seen integer := 0;
  v_expected_timestamp timestamptz;
  v_previous_marker text;
begin
  if v_actor_id is null or not public.can_manage_billing_groups() then
    raise exception 'billing_group_unauthorized' using errcode = '42501';
  end if;
  if p_request_id is null or p_group_id is null or p_expected_revision is null
    or p_expected_revision < 0 or p_delete is null or p_confirm_cross_project is null
    or p_confirm_moves is null or p_event_ids is null
    or coalesce(pg_catalog.array_ndims(p_event_ids), 1) <> 1
    or pg_catalog.array_position(p_event_ids, null) is not null
    or pg_catalog.cardinality(p_event_ids) <> (select pg_catalog.count(distinct id) from pg_catalog.unnest(p_event_ids) id)
    or p_event_versions is null or pg_catalog.jsonb_typeof(p_event_versions) <> 'object'
    or (not p_delete and (p_name is null or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 120)) then
    raise exception 'billing_group_invalid_input' using errcode = '22023';
  end if;

  -- Keep the original name, array order and JSON values, not a normalized approximation.
  v_payload := pg_catalog.jsonb_build_object(
    'request_id', p_request_id, 'group_id', p_group_id, 'name', p_name,
    'event_ids', p_event_ids, 'expected_revision', p_expected_revision,
    'event_versions', p_event_versions, 'confirm_cross_project', p_confirm_cross_project,
    'confirm_moves', p_confirm_moves, 'delete', p_delete
  );
  select s.revision into v_revision from public.billing_group_state s where s.singleton for update;
  if not found then raise exception 'billing_group_conflict' using errcode = '40001'; end if;

  select r.* into v_previous_request from public.billing_group_requests r where r.request_id = p_request_id;
  if found then
    if v_previous_request.actor_id is distinct from v_actor_id or v_previous_request.payload is distinct from v_payload then
      raise exception 'billing_group_request_mismatch' using errcode = '22023';
    end if;
    return v_previous_request.result;
  end if;

  v_result := pg_catalog.jsonb_build_object('request_id', p_request_id, 'group_id', p_group_id, 'revision', v_revision + 1);
  v_previous_marker := pg_catalog.current_setting('app.billing_group_write', true);
  perform pg_catalog.set_config('app.billing_group_write', 'atomic', true);
  begin
    -- Other actors' ledger rows are intentionally invisible under RLS. Reserving the complete
    -- result with ON CONFLICT detects their IDs without a definer bypass or exposing payloads.
    -- Reservation and all following writes roll back together if any validation fails.
    insert into public.billing_group_requests(request_id, actor_id, payload, result)
      values (p_request_id, v_actor_id, v_payload, v_result) on conflict (request_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted <> 1 then
      raise exception 'billing_group_request_mismatch' using errcode = '22023';
    end if;
    if v_revision <> p_expected_revision then
      raise exception 'billing_group_conflict' using errcode = '40001';
    end if;

    select coalesce(pg_catalog.array_agg(id order by id), '{}'::uuid[]) into v_affected_ids
    from (select m.event_id as id from public.billing_group_members m where m.group_id = p_group_id
      union select id from pg_catalog.unnest(p_event_ids) id) affected;
    select coalesce(pg_catalog.array_agg(key order by key), '{}'::text[]) into v_version_keys
      from pg_catalog.jsonb_object_keys(p_event_versions) key;
    if v_version_keys is distinct from v_affected_ids::text[] then
      raise exception 'billing_group_conflict' using errcode = '40001';
    end if;

    -- All affected events, including removed members, are locked in UUID order. SHARE also
    -- blocks edits of non-key project/job/version fields until this transaction finishes.
    for v_event in select e.id, e.updated_at from public.events e
      where e.id = any(v_affected_ids) order by e.id for share
    loop
      v_seen := v_seen + 1;
      if pg_catalog.jsonb_typeof(p_event_versions -> v_event.id::text) is distinct from 'string' then
        raise exception 'billing_group_conflict' using errcode = '40001';
      end if;
      begin
        v_expected_timestamp := (p_event_versions ->> v_event.id::text)::timestamptz;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception 'billing_group_conflict' using errcode = '40001';
      end;
      if v_expected_timestamp is distinct from v_event.updated_at then
        raise exception 'billing_group_conflict' using errcode = '40001';
      end if;
    end loop;
    if v_seen <> pg_catalog.cardinality(v_affected_ids) then
      raise exception 'billing_group_event_unavailable' using errcode = '42501';
    end if;
    if not p_confirm_cross_project and (select pg_catalog.count(distinct (e.project_id, e.job_number))
      from public.events e where e.id = any(p_event_ids)) > 1 then
      raise exception 'billing_group_cross_project_confirmation' using errcode = '22023';
    end if;
    if not p_confirm_moves and exists (select 1 from public.billing_group_members m
      where m.event_id = any(p_event_ids) and m.group_id <> p_group_id) then
      raise exception 'billing_group_move_confirmation' using errcode = '22023';
    end if;

    if p_delete then
      if not exists (select 1 from public.billing_groups g where g.id = p_group_id) then
        raise exception 'billing_group_missing' using errcode = '22023';
      end if;
      if pg_catalog.cardinality(p_event_ids) <> 0 or exists (
        select 1 from public.billing_group_members m where m.group_id = p_group_id) then
        raise exception 'billing_group_not_empty' using errcode = '23503';
      end if;
      delete from public.billing_groups g where g.id = p_group_id;
    else
      insert into public.billing_groups(id, name) values (p_group_id, pg_catalog.btrim(p_name))
        on conflict (id) do update set name = excluded.name;
      delete from public.billing_group_members m where m.group_id = p_group_id and not (m.event_id = any(p_event_ids));
      insert into public.billing_group_members(event_id, group_id)
        select id, p_group_id from pg_catalog.unnest(p_event_ids) id order by id
        on conflict (event_id) do update set group_id = excluded.group_id;
    end if;
    update public.billing_group_state set revision = v_revision + 1 where singleton;
    perform pg_catalog.set_config('app.billing_group_write', coalesce(v_previous_marker, ''), true);
  exception when others then
    perform pg_catalog.set_config('app.billing_group_write', coalesce(v_previous_marker, ''), true);
    raise;
  end;
  return v_result;
end;
$$;
revoke all on function public.save_billing_group_atomic(uuid,uuid,text,uuid[],integer,jsonb,boolean,boolean,boolean) from public, anon;
grant execute on function public.save_billing_group_atomic(uuid,uuid,text,uuid[],integer,jsonb,boolean,boolean,boolean) to authenticated;

commit;
