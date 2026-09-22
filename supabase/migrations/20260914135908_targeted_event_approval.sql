-- Targeted timelog approvals. Approval actors are snapshotted as both profile
-- and auth identities because profiles.user_id is mutable.

alter table public.profiles
  alter column user_id drop not null;

alter table public.events
  add column if not exists contact_profile_id uuid,
  add column contact_approves_hours boolean not null default true,
  add column timelog_approver_profile_id uuid references public.profiles(id) on delete restrict;

do $$
declare
  v_contact_attnum smallint;
  v_profile_id_attnum smallint;
  v_contact_fk_count integer;
begin
  select a.attnum into strict v_contact_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.events'::pg_catalog.regclass
    and a.attname = 'contact_profile_id'
    and not a.attisdropped;

  select a.attnum into strict v_profile_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.profiles'::pg_catalog.regclass
    and a.attname = 'id'
    and not a.attisdropped;

  select pg_catalog.count(*)::integer into v_contact_fk_count
  from pg_catalog.pg_constraint c
  where c.contype = 'f'
    and c.conrelid = 'public.events'::pg_catalog.regclass
    and v_contact_attnum = any(c.conkey);

  if v_contact_fk_count = 0 then
    alter table public.events
      add constraint events_contact_profile_id_fkey
      foreign key (contact_profile_id) references public.profiles(id) on delete set null;
  elsif v_contact_fk_count <> 1 or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.conrelid = 'public.events'::pg_catalog.regclass
      and c.conkey = array[v_contact_attnum]::smallint[]
      and c.confrelid = 'public.profiles'::pg_catalog.regclass
      and c.confkey = array[v_profile_id_attnum]::smallint[]
      and c.confdeltype = 'n'
  ) then
    raise exception 'events_contact_profile_id_fkey_invalid' using errcode = '22023';
  end if;
end
$$;

create index if not exists idx_events_contact_profile_id
  on public.events (contact_profile_id);

alter table public.timelogs
  add column if not exists review_note text;

create index events_timelog_approver_profile_id_idx
  on public.events (timelog_approver_profile_id)
  where timelog_approver_profile_id is not null;

create table public.timelog_approvals (
  id uuid primary key,
  handoff_batch_id uuid not null,
  approval_round_id uuid not null,
  timelog_id uuid not null references public.timelogs(id) on delete cascade,
  approver_profile_id uuid not null references public.profiles(id) on delete restrict,
  approver_user_id uuid not null references auth.users(id) on delete restrict,
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('pending', 'approved', 'returned')),
  requested_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_timelog_expected_updated_at timestamptz,
  resolved_approval_expected_updated_at timestamptz,
  superseded_at timestamptz,
  note text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  unique (approval_round_id, timelog_id),
  constraint timelog_approvals_handoff_batch_anchor_check check (handoff_batch_id <= id),
  constraint timelog_approvals_resolution_check check (
    (
      status = 'pending'
      and resolved_at is null
      and resolved_timelog_expected_updated_at is null
      and resolved_approval_expected_updated_at is null
    )
    or (
      status in ('approved', 'returned')
      and resolved_at is not null
      and resolved_timelog_expected_updated_at is not null
      and resolved_approval_expected_updated_at is not null
    )
  )
);

create index timelog_approvals_timelog_id_idx
  on public.timelog_approvals (timelog_id);
create index timelog_approvals_handoff_batch_id_idx
  on public.timelog_approvals (handoff_batch_id);
create index timelog_approvals_approver_profile_id_idx
  on public.timelog_approvals (approver_profile_id);
create index timelog_approvals_approver_user_id_idx
  on public.timelog_approvals (approver_user_id);
create index timelog_approvals_requested_by_profile_id_idx
  on public.timelog_approvals (requested_by_profile_id);
create index timelog_approvals_requested_by_user_id_idx
  on public.timelog_approvals (requested_by_user_id);
create unique index timelog_approvals_active_timelog_idx
  on public.timelog_approvals (timelog_id)
  where superseded_at is null;
create index timelog_approvals_active_approver_status_idx
  on public.timelog_approvals (approver_profile_id, status, timelog_id)
  where superseded_at is null;

alter table public.timelog_approvals enable row level security;

revoke all on table public.timelog_approvals from public, anon, authenticated, service_role;
grant select on table public.timelog_approvals to authenticated;

create policy timelog_approvals_select
on public.timelog_approvals
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crewhead'::public.app_role)
  or public.has_role((select auth.uid()), 'coo'::public.app_role)
  or exists (
    select 1
    from public.timelogs t
    where t.id = timelog_approvals.timelog_id
      and t.contractor_id = public.current_profile_id()
  )
);

create or replace function private.list_event_contact_options()
returns table (
  profile_id uuid,
  name text,
  phone text,
  can_approve_hours boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    pg_catalog.btrim(pg_catalog.concat_ws(' ', p.first_name, p.last_name)),
    p.phone,
    p.user_id is not null
      and public.has_role(p.user_id, 'coo'::public.app_role)
  from public.profiles p
  order by p.first_name, p.last_name, p.id;
end;
$$;

create or replace function private.handoff_timelogs_for_approval_atomic(p_targets jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_count integer;
  v_locked_count integer;
  v_exact_count integer;
  v_exact_batch_count integer;
  v_changed_count integer;
  v_batch_requested_at timestamptz := clock_timestamp();
  v_handoff_batch_id uuid;
  v_requester_profile_id uuid;
  v_requester_user_id uuid := auth.uid();
  v_approver_user_id uuid;
  v_contractor_id uuid;
  v_contractor_user_id uuid;
  v_batch_targets jsonb;
  v_result jsonb;
  v_target record;
begin
  if v_requester_user_id is null
    or not public.has_role(v_requester_user_id, 'crewhead'::public.app_role) then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  select p.id
  into v_requester_profile_id
  from public.profiles p
  where p.user_id = v_requester_user_id;

  if v_requester_profile_id is null then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  if p_targets is null
    or pg_catalog.jsonb_typeof(p_targets) <> 'array'
    or pg_catalog.jsonb_array_length(p_targets) = 0
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_targets) target
      where case
        when pg_catalog.jsonb_typeof(target) <> 'object' then true
        else (
          select pg_catalog.array_agg(key order by key)
          from pg_catalog.jsonb_object_keys(target) key
        ) is distinct from array[
          'approval_id',
          'approval_round_id',
          'expected_updated_at',
          'id'
        ]::text[]
      end
    ) then
    raise exception 'timelog_approval_invalid' using errcode = '22023';
  end if;

  begin
    perform
      (target->>'id')::uuid,
      (target->>'expected_updated_at')::timestamptz,
      (target->>'approval_id')::uuid,
      (target->>'approval_round_id')::uuid
    from pg_catalog.jsonb_array_elements(p_targets) target;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow then
      raise exception 'timelog_approval_invalid' using errcode = '22023';
  end;

  select pg_catalog.jsonb_array_length(p_targets) into v_target_count;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_targets) target
    where nullif(target->>'id', '') is null
      or nullif(target->>'expected_updated_at', '') is null
      or nullif(target->>'approval_id', '') is null
      or nullif(target->>'approval_round_id', '') is null
  ) or v_target_count is distinct from (
    select pg_catalog.count(distinct (target->>'id')::uuid)::integer
    from pg_catalog.jsonb_array_elements(p_targets) target
  ) or v_target_count is distinct from (
    select pg_catalog.count(distinct (target->>'approval_id')::uuid)::integer
    from pg_catalog.jsonb_array_elements(p_targets) target
  ) or v_target_count is distinct from (
    select pg_catalog.count(distinct (target->>'approval_round_id')::uuid)::integer
    from pg_catalog.jsonb_array_elements(p_targets) target
  ) then
    raise exception 'timelog_approval_invalid' using errcode = '22023';
  end if;

  -- The smallest client-generated approval UUID is a collision-proof batch
  -- anchor: its globally unique approval row must belong to this batch.
  select (target->>'approval_id')::uuid
  into v_handoff_batch_id
  from pg_catalog.jsonb_array_elements(p_targets) target
  order by (target->>'approval_id')::uuid
  limit 1;

  -- Every mutating endpoint locks parent timelogs in UUID order first.
  perform t.id
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelogs t on t.id = (target->>'id')::uuid
  order by t.id
  for update of t;
  get diagnostics v_locked_count = row_count;

  if v_locked_count <> v_target_count then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
  end if;

  -- An exact whole-batch retry is authoritative even after resolution. Partial
  -- matches are never completed, so client timeouts cannot split a batch.
  select pg_catalog.count(*)::integer
  into v_exact_count
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelog_approvals a
    on a.id = (target->>'approval_id')::uuid
   and a.approval_round_id = (target->>'approval_round_id')::uuid
   and a.timelog_id = (target->>'id')::uuid
   and a.requested_by_profile_id = v_requester_profile_id
   and a.requested_by_user_id = v_requester_user_id
   and a.handoff_batch_id = v_handoff_batch_id
   and a.superseded_at is null;

  if v_exact_count = v_target_count then
    select pg_catalog.count(*)::integer
    into v_exact_batch_count
    from public.timelog_approvals a
    where a.requested_by_profile_id = v_requester_profile_id
      and a.requested_by_user_id = v_requester_user_id
      and a.handoff_batch_id = v_handoff_batch_id;

    if v_exact_batch_count <> v_target_count
      or not exists (
        select 1
        from public.timelog_approvals a
        where a.id = a.handoff_batch_id
          and a.id = v_handoff_batch_id
      ) then
      raise exception 'timelog_approval_conflict' using errcode = '40001';
    end if;

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', t.id,
        'updated_at', t.updated_at,
        'status', t.status,
        'approval_id', a.id,
        'approval_round_id', a.approval_round_id,
        'approval_status', a.status,
        'approval_updated_at', a.updated_at
      ) order by t.id
    )
    into v_result
    from pg_catalog.jsonb_array_elements(p_targets) target
    join public.timelogs t on t.id = (target->>'id')::uuid
    join public.timelog_approvals a on a.id = (target->>'approval_id')::uuid;

    return v_result;
  elsif v_exact_count <> 0 then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.timelog_approvals a
    where exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_targets) target
      where a.id = (target->>'approval_id')::uuid
        or a.approval_round_id = (target->>'approval_round_id')::uuid
    )
  ) then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
  end if;

  -- Read event selection exactly once after the timelog locks. This immutable
  -- local snapshot avoids the event -> timelog lock order used by event delete
  -- while ensuring later contact edits cannot redirect this approval round.
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', (target->>'id')::uuid,
      'expected_updated_at', (target->>'expected_updated_at')::timestamptz,
      'approval_id', (target->>'approval_id')::uuid,
      'approval_round_id', (target->>'approval_round_id')::uuid,
      'event_id', t.event_id,
      'contractor_id', t.contractor_id,
      'contact_approves_hours', e.contact_approves_hours,
      'approver_profile_id', case
        when e.contact_approves_hours then e.contact_profile_id
        else e.timelog_approver_profile_id
      end
    ) order by t.id
  )
  into v_batch_targets
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelogs t on t.id = (target->>'id')::uuid
  join public.events e on e.id = t.event_id;

  if pg_catalog.jsonb_array_length(v_batch_targets) is distinct from v_target_count then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
  end if;

  -- Profile user bindings are mutable. Lock every requester, contractor, and
  -- selected approver binding once, in UUID order, before snapshotting users.
  perform p.id
  from public.profiles p
  where p.id = v_requester_profile_id
    or p.id in (
      select (target->>'contractor_id')::uuid
      from pg_catalog.jsonb_array_elements(v_batch_targets) target
    )
    or p.id in (
      select (target->>'approver_profile_id')::uuid
      from pg_catalog.jsonb_array_elements(v_batch_targets) target
    )
  order by p.id
  for update;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_requester_profile_id and p.user_id = v_requester_user_id
  ) or not public.has_role(v_requester_user_id, 'crewhead'::public.app_role) then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  for v_target in
    select
      (target->>'id')::uuid as id,
      (target->>'expected_updated_at')::timestamptz as expected_updated_at,
      (target->>'approval_id')::uuid as approval_id,
      (target->>'approval_round_id')::uuid as approval_round_id,
      (target->>'contractor_id')::uuid as contractor_id,
      (target->>'approver_profile_id')::uuid as approver_profile_id
    from pg_catalog.jsonb_array_elements(v_batch_targets) target
    order by (target->>'id')::uuid
  loop
    if v_target.approver_profile_id is null then
      raise exception 'timelog_approver_unavailable' using errcode = '22023';
    end if;

    select p.user_id
    into v_approver_user_id
    from public.profiles p
    where p.id = v_target.approver_profile_id;

    if not found
      or v_approver_user_id is null
      or not public.has_role(v_approver_user_id, 'coo'::public.app_role) then
      raise exception 'timelog_approver_unavailable' using errcode = '22023';
    end if;

    v_contractor_id := v_target.contractor_id;
    select p.user_id
    into v_contractor_user_id
    from public.profiles p
    where p.id = v_contractor_id;

    if v_target.approver_profile_id = v_requester_profile_id
      or v_approver_user_id = v_requester_user_id
      or v_target.approver_profile_id = v_contractor_id
      or v_approver_user_id is not distinct from v_contractor_user_id then
      raise exception 'timelog_approval_unauthorized' using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.timelog_approvals a
      where a.timelog_id = v_target.id
        and a.superseded_at is null
        and a.status = 'pending'
    ) then
      raise exception 'timelog_approval_conflict' using errcode = '40001';
    end if;

    if not exists (
      select 1
      from public.timelogs t
      where t.id = v_target.id
        and t.status = 'pending_ch'::public.timelog_status
        and t.updated_at = v_target.expected_updated_at
    ) then
      raise exception 'timelog_approval_conflict' using errcode = '40001';
    end if;

    perform private.assert_timelog_complete(v_target.id);

    update public.timelog_approvals a
    set superseded_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where a.timelog_id = v_target.id
      and a.superseded_at is null
      and a.status in ('approved', 'returned');

    insert into public.timelog_approvals (
      id,
      handoff_batch_id,
      approval_round_id,
      timelog_id,
      approver_profile_id,
      approver_user_id,
      requested_by_profile_id,
      requested_by_user_id,
      status,
      requested_at
    ) values (
      v_target.approval_id,
      v_handoff_batch_id,
      v_target.approval_round_id,
      v_target.id,
      v_target.approver_profile_id,
      v_approver_user_id,
      v_requester_profile_id,
      v_requester_user_id,
      'pending',
      v_batch_requested_at
    );

    update public.timelogs t
    set status = 'pending_coo'::public.timelog_status
    where t.id = v_target.id
      and t.status = 'pending_ch'::public.timelog_status
      and t.updated_at = v_target.expected_updated_at;
    get diagnostics v_changed_count = row_count;

    if v_changed_count <> 1 then
      raise exception 'timelog_approval_conflict' using errcode = '40001';
    end if;
  end loop;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', t.id,
      'updated_at', t.updated_at,
      'status', t.status,
      'approval_id', a.id,
      'approval_round_id', a.approval_round_id,
      'approval_status', a.status,
      'approval_updated_at', a.updated_at
    ) order by t.id
  )
  into v_result
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelogs t on t.id = (target->>'id')::uuid
  join public.timelog_approvals a on a.id = (target->>'approval_id')::uuid;

  return v_result;
exception
  when unique_violation or foreign_key_violation or check_violation then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
end;
$$;

create or replace function private.resolve_timelog_approvals_atomic(
  p_targets jsonb,
  p_resolution text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_count integer;
  v_targeted_count integer;
  v_locked_count integer;
  v_changed_count integer;
  v_actor_profile_id uuid;
  v_actor_user_id uuid := auth.uid();
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_result jsonb;
  v_target record;
  v_parent public.timelogs%rowtype;
  v_approval public.timelog_approvals%rowtype;
  v_contractor_user_id uuid;
begin
  if v_actor_user_id is null
    or not public.has_role(v_actor_user_id, 'coo'::public.app_role) then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  select p.id
  into v_actor_profile_id
  from public.profiles p
  where p.user_id = v_actor_user_id;

  if v_actor_profile_id is null then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  if p_resolution is null
    or p_resolution not in ('approved', 'returned')
    or (p_resolution = 'returned' and v_note = '')
    or p_targets is null
    or pg_catalog.jsonb_typeof(p_targets) <> 'array'
    or pg_catalog.jsonb_array_length(p_targets) = 0
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_targets) target
      where case
        when pg_catalog.jsonb_typeof(target) <> 'object' then true
        else (
          select pg_catalog.array_agg(key order by key)
          from pg_catalog.jsonb_object_keys(target) key
        ) is distinct from array[
          'approval_id',
          'approval_updated_at',
          'expected_updated_at',
          'id'
        ]::text[]
      end
    ) then
    raise exception 'timelog_approval_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_targets) target
    where nullif(target->>'id', '') is null
      or nullif(target->>'expected_updated_at', '') is null
      or ((target->>'approval_id') is null) <> ((target->>'approval_updated_at') is null)
  ) then
    raise exception 'timelog_approval_invalid' using errcode = '22023';
  end if;

  begin
    perform
      (target->>'id')::uuid,
      (target->>'expected_updated_at')::timestamptz,
      case when (target->>'approval_id') is null then null
        else (target->>'approval_id')::uuid end,
      case when (target->>'approval_updated_at') is null then null
        else (target->>'approval_updated_at')::timestamptz end
    from pg_catalog.jsonb_array_elements(p_targets) target;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow then
      raise exception 'timelog_approval_invalid' using errcode = '22023';
  end;

  select pg_catalog.jsonb_array_length(p_targets) into v_target_count;
  select pg_catalog.count(*)::integer
  into v_targeted_count
  from pg_catalog.jsonb_array_elements(p_targets) target
  where (target->>'approval_id') is not null;

  if v_target_count is distinct from (
    select pg_catalog.count(distinct (target->>'id')::uuid)::integer
    from pg_catalog.jsonb_array_elements(p_targets) target
  ) or v_targeted_count is distinct from (
    select pg_catalog.count(distinct (target->>'approval_id')::uuid)::integer
    from pg_catalog.jsonb_array_elements(p_targets) target
    where (target->>'approval_id') is not null
  ) then
    raise exception 'timelog_approval_invalid' using errcode = '22023';
  end if;

  -- Parent lock order is shared with handoff; approval rows are locked second.
  perform t.id
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelogs t on t.id = (target->>'id')::uuid
  order by t.id
  for update of t;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_target_count then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
  end if;

  perform a.id
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelog_approvals a on a.id = (target->>'approval_id')::uuid
  where (target->>'approval_id') is not null
  order by a.id
  for update of a;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_targeted_count then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
  end if;

  -- Freeze all mutable profile-to-auth bindings after parent/approval locks,
  -- using UUID order shared by every resolver batch.
  perform p.id
  from public.profiles p
  where p.id = v_actor_profile_id
    or p.id in (
      select t.contractor_id
      from pg_catalog.jsonb_array_elements(p_targets) target
      join public.timelogs t on t.id = (target->>'id')::uuid
    )
    or p.id in (
      select a.approver_profile_id
      from pg_catalog.jsonb_array_elements(p_targets) target
      join public.timelog_approvals a on a.id = (target->>'approval_id')::uuid
      where (target->>'approval_id') is not null
    )
    or p.id in (
      select a.requested_by_profile_id
      from pg_catalog.jsonb_array_elements(p_targets) target
      join public.timelog_approvals a on a.id = (target->>'approval_id')::uuid
      where (target->>'approval_id') is not null
    )
  order by p.id
  for update;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor_profile_id and p.user_id = v_actor_user_id
  ) or not public.has_role(v_actor_user_id, 'coo'::public.app_role) then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  -- Validate the entire mixed targeted/legacy batch before changing either table.
  for v_target in
    select
      (target->>'id')::uuid as id,
      (target->>'expected_updated_at')::timestamptz as expected_updated_at,
      case when (target->>'approval_id') is null then null
        else (target->>'approval_id')::uuid end as approval_id,
      case when (target->>'approval_updated_at') is null then null
        else (target->>'approval_updated_at')::timestamptz end as approval_updated_at
    from pg_catalog.jsonb_array_elements(p_targets) target
    order by (target->>'id')::uuid
  loop
    select t.* into strict v_parent
    from public.timelogs t
    where t.id = v_target.id;

    select p.user_id into v_contractor_user_id
    from public.profiles p
    where p.id = v_parent.contractor_id;

    if v_target.approval_id is null then
      if exists (
        select 1 from public.timelog_approvals a
        where a.timelog_id = v_target.id
      ) then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;

      if v_parent.status <> 'pending_coo'::public.timelog_status
        or v_parent.updated_at is distinct from v_target.expected_updated_at then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;
    else
      select a.* into strict v_approval
      from public.timelog_approvals a
      where a.id = v_target.approval_id;

      if v_approval.timelog_id <> v_target.id
        or v_approval.superseded_at is not null then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;

      if v_approval.approver_profile_id <> v_actor_profile_id
        or v_approval.approver_user_id <> v_actor_user_id
        or v_approval.requested_by_profile_id = v_actor_profile_id
        or v_approval.requested_by_user_id = v_actor_user_id
        or v_parent.contractor_id = v_actor_profile_id
        or v_contractor_user_id is not distinct from v_actor_user_id then
        raise exception 'timelog_approval_unauthorized' using errcode = '42501';
      end if;

      if v_approval.status = p_resolution
        and v_approval.note = v_note then
        if v_approval.resolved_timelog_expected_updated_at is distinct from v_target.expected_updated_at
          or v_approval.resolved_approval_expected_updated_at is distinct from v_target.approval_updated_at then
          raise exception 'timelog_approval_conflict' using errcode = '40001';
        end if;
        continue;
      end if;

      if v_approval.status <> 'pending'
        or v_parent.status <> 'pending_coo'::public.timelog_status
        or v_parent.updated_at is distinct from v_target.expected_updated_at
        or v_approval.updated_at is distinct from v_target.approval_updated_at then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;
    end if;
  end loop;

  for v_target in
    select
      (target->>'id')::uuid as id,
      (target->>'expected_updated_at')::timestamptz as expected_updated_at,
      case when (target->>'approval_id') is null then null
        else (target->>'approval_id')::uuid end as approval_id,
      case when (target->>'approval_updated_at') is null then null
        else (target->>'approval_updated_at')::timestamptz end as approval_updated_at
    from pg_catalog.jsonb_array_elements(p_targets) target
    order by (target->>'id')::uuid
  loop
    if v_target.approval_id is not null then
      select a.* into strict v_approval
      from public.timelog_approvals a
      where a.id = v_target.approval_id;

      if v_approval.status = p_resolution and v_approval.note = v_note then
        continue;
      end if;

      update public.timelog_approvals a
      set status = p_resolution,
          note = v_note,
          resolved_at = clock_timestamp(),
          resolved_timelog_expected_updated_at = v_target.expected_updated_at,
          resolved_approval_expected_updated_at = v_target.approval_updated_at,
          updated_at = clock_timestamp()
      where a.id = v_target.approval_id
        and a.status = 'pending'
        and a.superseded_at is null;
      get diagnostics v_changed_count = row_count;
      if v_changed_count <> 1 then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;
    end if;

    update public.timelogs t
    set status = case p_resolution
          when 'approved' then 'approved'::public.timelog_status
          else 'rejected'::public.timelog_status
        end,
        review_note = case when p_resolution = 'returned' then v_note else null end,
        approved_at = case when p_resolution = 'approved' then clock_timestamp() else null end
    where t.id = v_target.id;
    get diagnostics v_changed_count = row_count;
    if v_changed_count <> 1 then
      raise exception 'timelog_approval_conflict' using errcode = '40001';
    end if;
  end loop;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', t.id,
      'updated_at', t.updated_at,
      'status', t.status
    ) order by t.id
  )
  into v_result
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelogs t on t.id = (target->>'id')::uuid;

  return v_result;
end;
$$;

create or replace function public.list_event_contact_options()
returns table (
  profile_id uuid,
  name text,
  phone text,
  can_approve_hours boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_event_contact_options()
$$;

create or replace function public.handoff_timelogs_for_approval_atomic(p_targets jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.handoff_timelogs_for_approval_atomic(p_targets)
$$;

create or replace function public.resolve_timelog_approvals_atomic(
  p_targets jsonb,
  p_resolution text,
  p_note text default ''
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.resolve_timelog_approvals_atomic(p_targets, p_resolution, p_note)
$$;

revoke all on function private.list_event_contact_options() from public, anon, authenticated, service_role;
revoke all on function private.handoff_timelogs_for_approval_atomic(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.resolve_timelog_approvals_atomic(jsonb, text, text) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;
grant execute on function private.list_event_contact_options() to authenticated;
grant execute on function private.handoff_timelogs_for_approval_atomic(jsonb) to authenticated;
grant execute on function private.resolve_timelog_approvals_atomic(jsonb, text, text) to authenticated;

revoke all on function public.list_event_contact_options() from public, anon, authenticated, service_role;
revoke all on function public.handoff_timelogs_for_approval_atomic(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.resolve_timelog_approvals_atomic(jsonb, text, text) from public, anon, authenticated, service_role;
grant execute on function public.list_event_contact_options() to authenticated;
grant execute on function public.handoff_timelogs_for_approval_atomic(jsonb) to authenticated;
grant execute on function public.resolve_timelog_approvals_atomic(jsonb, text, text) to authenticated;

create or replace function private.guard_targeted_timelog_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_profile_id uuid;
  v_approval public.timelog_approvals%rowtype;
  v_has_history boolean;
begin
  select exists (
    select 1 from public.timelog_approvals a where a.timelog_id = old.id
  ) into v_has_history;

  select p.id into v_actor_profile_id
  from public.profiles p
  where p.user_id = auth.uid();

  -- Every new CH handoff must have been staged by the targeted RPC. Existing
  -- zero-history pending_coo rows remain legacy only after they already exist.
  if old.status = 'pending_ch'::public.timelog_status
    and new.status = 'pending_coo'::public.timelog_status then
    select a.* into v_approval
    from public.timelog_approvals a
    where a.timelog_id = old.id
      and a.superseded_at is null
      and a.status = 'pending';

    if not found
      or auth.uid() is null
      or v_actor_profile_id is null
      or v_approval.requested_by_profile_id <> v_actor_profile_id
      or v_approval.requested_by_user_id <> auth.uid()
      or not public.has_role(auth.uid(), 'crewhead'::public.app_role)
      or new.id is distinct from old.id
      or new.event_id is distinct from old.event_id
      or new.contractor_id is distinct from old.contractor_id
      or new.km is distinct from old.km
      or new.note is distinct from old.note
      or new.submitted_at is distinct from old.submitted_at
      or new.approved_at is distinct from old.approved_at
      or new.created_at is distinct from old.created_at
      or new.crew_confirmation_snapshot is distinct from old.crew_confirmation_snapshot
      or new.review_note is distinct from old.review_note then
      raise exception 'timelog_approval_unauthorized' using errcode = '42501';
    end if;

    return new;
  end if;

  if not v_has_history then
    return new;
  end if;

  -- Explicit post-approval billing transitions retain their established path.
  if old.status in (
    'approved'::public.timelog_status,
    'invoiced'::public.timelog_status,
    'paid'::public.timelog_status
  ) then
    return new;
  end if;

  if pg_catalog.current_setting('crewflow.approved_timelog_import', true) = 'on'
    and old.status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status) then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  if old.status = 'pending_coo'::public.timelog_status then
    select a.* into v_approval
    from public.timelog_approvals a
    where a.timelog_id = old.id
      and a.superseded_at is null;

    if not found
      or v_approval.status not in ('approved', 'returned')
      or auth.uid() is null
      or v_actor_profile_id is null
      or v_approval.approver_profile_id <> v_actor_profile_id
      or v_approval.approver_user_id <> auth.uid()
      or not public.has_role(auth.uid(), 'coo'::public.app_role)
      or new.status is distinct from (case v_approval.status
          when 'approved' then 'approved'::public.timelog_status
          else 'rejected'::public.timelog_status
        end)
      or new.id is distinct from old.id
      or new.event_id is distinct from old.event_id
      or new.contractor_id is distinct from old.contractor_id
      or new.km is distinct from old.km
      or new.note is distinct from old.note
      or new.submitted_at is distinct from old.submitted_at
      or new.created_at is distinct from old.created_at
      or new.crew_confirmation_snapshot is distinct from old.crew_confirmation_snapshot
      or (v_approval.status = 'returned' and new.review_note is distinct from v_approval.note)
      or (v_approval.status = 'approved' and new.review_note is not null) then
      raise exception 'timelog_approval_unauthorized' using errcode = '42501';
    end if;

    return new;
  end if;

  if new.status = 'approved'::public.timelog_status then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_targeted_timelog_approval() from public, anon, authenticated, service_role;

drop trigger if exists approval_guard_targeted_timelog_update on public.timelogs;
create trigger approval_guard_targeted_timelog_update
before update on public.timelogs
for each row execute function private.guard_targeted_timelog_approval();

drop trigger if exists trg_timelog_approved on public.timelogs;
