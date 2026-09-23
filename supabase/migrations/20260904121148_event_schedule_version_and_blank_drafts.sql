-- Additive schedule metadata. Constant defaults preserve every historical payload.
begin;
set local lock_timeout = '5s';

alter table public.events
  add column schedule_version smallint not null default 1
    constraint events_schedule_version_check check (schedule_version in (1, 2)),
  add column free_days date[] not null default '{}'::date[];

-- Bound each deferred completeness lookup to the affected timelog's days.
create index timelog_days_timelog_id_idx
  on public.timelog_days using btree (timelog_id);

create or replace function public.is_valid_timelog_time(value text)
returns boolean language sql immutable
set search_path = ''
as $$
  select coalesce(value ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$', false);
$$;
revoke all on function public.is_valid_timelog_time(text) from public, anon;
grant execute on function public.is_valid_timelog_time(text) to authenticated;

-- Full audited live definitions; only day/time validation changes below.
CREATE OR REPLACE FUNCTION public.assign_event_crew(p_event_id uuid, p_profile_id uuid, p_application_id uuid DEFAULT NULL::uuid, p_days jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
      where pg_catalog.jsonb_typeof(day) <> 'object'
        or nullif(day->>'date', '') is null
        or (nullif(day->>'time_from', '') is not null
          and not public.is_valid_timelog_time(day->>'time_from'))
        or (nullif(day->>'time_to', '') is not null
          and not public.is_valid_timelog_time(day->>'time_to'))
        or nullif(day->>'day_type', '') is null
        or day->>'day_type' not in ('pripravy', 'instal', 'provoz', 'deinstal')
    ) then
      raise exception 'crew_assignment_invalid_days' using errcode = '22023';
    end if;

    -- Also force-cast all dates and both times solely for validation before inserts.
    -- Keep stored time strings in their original HH:MM form.
    begin
      perform (day->>'date')::date,
        nullif(day->>'time_from', '')::time,
        nullif(day->>'time_to', '')::time
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


CREATE OR REPLACE FUNCTION public.save_timelog_atomic(p_timelog_id uuid, p_event_id uuid, p_contractor_id uuid, p_expected_updated_at timestamp with time zone, p_expected_status public.timelog_status, p_km numeric, p_note text, p_status public.timelog_status, p_days jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
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
    or pg_catalog.jsonb_typeof(p_days) <> 'array' then
    raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end if;

  -- Structural errors keep their generic contract regardless of target status.
  if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_days) day
      where pg_catalog.jsonb_typeof(day) <> 'object'
        or nullif(day->>'date', '') is null
        or nullif(day->>'day_type', '') is null
        or day->>'day_type' not in ('pripravy', 'instal', 'provoz', 'deinstal')
    ) then
    raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end if;

  begin
    perform (day->>'date')::date
    from pg_catalog.jsonb_array_elements(p_days) day;
  exception
    when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
      raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end;

  -- Review/financial targets require actuals, while drafts may remain partial.
  if p_status in ('pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid')
    and (pg_catalog.jsonb_array_length(p_days) = 0 or exists (
      select 1 from pg_catalog.jsonb_array_elements(p_days) day
      where case
        when public.is_valid_timelog_time(day->>'time_from')
          and public.is_valid_timelog_time(day->>'time_to')
        then nullif(day->>'time_from', '')::time = nullif(day->>'time_to', '')::time
        else true
      end
    )) then
    raise exception 'timelog_incomplete' using errcode = '22023';
  end if;

  -- Empty draft payloads and malformed nonempty draft clocks remain prohibited.
  -- Run this after the strict check so every incomplete actual has the same token.
  if pg_catalog.jsonb_array_length(p_days) = 0 or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_days) day
    where (nullif(day->>'time_from', '') is not null
        and not public.is_valid_timelog_time(day->>'time_from'))
      or (nullif(day->>'time_to', '') is not null
        and not public.is_valid_timelog_time(day->>'time_to'))
  ) then
    raise exception 'timelog_mutation_invalid' using errcode = '22023';
  end if;

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
    nullif(source.day->>'time_from', '')::time,
    nullif(source.day->>'time_to', '')::time,
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


-- CREATE OR REPLACE preserves ownership and privileges; make the API ACL explicit.
revoke all on function public.assign_event_crew(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.assign_event_crew(uuid, uuid, uuid, jsonb) to authenticated;
revoke all on function public.save_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, public.timelog_status, jsonb) from public, anon;
grant execute on function public.save_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, public.timelog_status, jsonb) to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Lock the parent before checking authorization again. A statement whose RLS
-- snapshot predates CH approval cannot wait and then mutate newly locked actuals.
-- INVOKER intentionally preserves existing audited SECURITY DEFINER import and
-- assignment flows, without granting ordinary API callers any extra permission.
create or replace function private.lock_timelog_day_parent()
returns trigger language plpgsql security invoker
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_parent public.timelogs%rowtype;
  v_parent_ids uuid[];
  v_bypass_rls boolean;
begin
  if tg_op = 'INSERT' then
    v_parent_ids := array[new.timelog_id];
  elsif tg_op = 'DELETE' then
    v_parent_ids := array[old.timelog_id];
  else
    v_parent_ids := array[old.timelog_id, new.timelog_id];
  end if;

  select r.rolbypassrls or r.rolsuper into v_bypass_rls
  from pg_catalog.pg_roles r where r.rolname = current_user;

  for v_parent_id in
    select distinct id from pg_catalog.unnest(v_parent_ids) id order by id
  loop
    select t.* into v_parent from public.timelogs t
    where t.id = v_parent_id for update;
    if not found then
      -- A deleted parent cascades its day deletion; there is no final state to edit.
      if tg_op = 'DELETE' and not exists (
        select 1 from public.timelogs t where t.id = v_parent_id
      ) then
        continue;
      end if;
      raise exception 'timelog_mutation_not_found' using errcode = '42501';
    end if;
    if not coalesce(v_bypass_rls, false)
      and not coalesce(public.can_edit_timelog_data(v_parent.contractor_id, v_parent.status), false) then
      raise exception 'timelog_mutation_not_found' using errcode = '42501';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.lock_timelog_day_parent() from public, anon, authenticated;

create trigger lock_timelog_day_parent
before insert or update or delete on public.timelog_days
for each row execute function private.lock_timelog_day_parent();

-- This is an internal invariant, not an exposed RPC. RLS must not hide days from
-- the assertion. Read the final parent status, not the trigger's historical NEW.
create or replace function private.assert_timelog_complete(p_timelog_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_status public.timelog_status;
begin
  select t.status into v_status from public.timelogs t
  where t.id = p_timelog_id for update;

  if not found or v_status not in ('pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid') then
    return;
  end if;

  if not exists (select 1 from public.timelog_days d where d.timelog_id = p_timelog_id)
    or exists (
      select 1 from public.timelog_days d where d.timelog_id = p_timelog_id
        and case
          when public.is_valid_timelog_time(d.time_from) and public.is_valid_timelog_time(d.time_to)
          then nullif(d.time_from, '')::time = nullif(d.time_to, '')::time
          else true
        end
    ) then
    raise exception 'timelog_incomplete' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.assert_timelog_complete(uuid) from public, anon, authenticated;

create or replace function private.check_timelog_completeness()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_parent_id uuid;
  v_parent_ids uuid[];
begin
  if tg_table_name = 'timelogs' then
    v_parent_ids := array[new.id];
  elsif tg_op = 'INSERT' then
    v_parent_ids := array[new.timelog_id];
  elsif tg_op = 'DELETE' then
    v_parent_ids := array[old.timelog_id];
  else
    v_parent_ids := array[old.timelog_id, new.timelog_id];
  end if;
  -- Reparenting must validate both parents, in the same deterministic order.
  for v_parent_id in
    select distinct id from pg_catalog.unnest(v_parent_ids) id order by id
  loop
    perform private.assert_timelog_complete(v_parent_id);
  end loop;
  return null;
end;
$$;
revoke all on function private.check_timelog_completeness() from public, anon, authenticated;

-- Deferred checks allow existing atomic saves to delete and reinsert all days.
create constraint trigger timelog_status_completeness
after insert or update of status on public.timelogs
deferrable initially deferred
for each row execute function private.check_timelog_completeness();

create constraint trigger timelog_days_completeness
after insert or update or delete on public.timelog_days
deferrable initially deferred
for each row execute function private.check_timelog_completeness();

commit;
