-- Shared shift membership is separate from billing_groups and invoice selection.
-- This migration creates no groups/rounds from existing business data.
begin;

create table public.shift_workflows (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index shift_workflows_created_by_idx on public.shift_workflows(created_by);

create table public.shift_workflow_events (
  event_id uuid primary key references public.events(id) on delete restrict,
  workflow_id uuid not null references public.shift_workflows(id) on delete restrict,
  position integer not null check (position >= 0),
  unique (workflow_id, position)
);

create table public.shift_workflow_state (
  singleton boolean primary key default true check (singleton),
  revision integer not null default 0 check (revision >= 0)
);
insert into public.shift_workflow_state(singleton,revision) values(true,0);

-- Append-only request ledger: no caller can read or mutate it. The sole writer
-- below INSERTs once, never UPDATEs/DELETEs, and compares actor+kind+full payload.
create table public.shift_workflow_requests (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind = 'save_membership'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default clock_timestamp()
);
create index shift_workflow_requests_actor_id_idx on public.shift_workflow_requests(actor_id);

-- These tables reserve persistent round identities/history. Submission and
-- approval RPCs are deliberately not part of the membership foundation.
create table public.shift_workflow_rounds (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.shift_workflows(id) on delete restrict,
  contractor_id uuid not null references public.profiles(id) on delete restrict,
  contractor_user_id uuid not null references auth.users(id) on delete restrict,
  expected_item_count integer not null check (expected_item_count > 0),
  status text not null check (status in ('pending_ch','pending_crew_confirmation','pending_coo','approved','rejected')),
  note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
comment on column public.shift_workflow_rounds.expected_item_count is
  'Frozen item count set once on round creation; lifecycle transitions must never change it.';
create index shift_workflow_rounds_workflow_id_idx on public.shift_workflow_rounds(workflow_id);
create index shift_workflow_rounds_contractor_id_idx on public.shift_workflow_rounds(contractor_id);
create index shift_workflow_rounds_contractor_user_id_idx on public.shift_workflow_rounds(contractor_user_id);
create index shift_workflow_rounds_created_by_idx on public.shift_workflow_rounds(created_by);

create table public.shift_workflow_round_items (
  round_id uuid not null references public.shift_workflow_rounds(id) on delete restrict,
  timelog_id uuid not null references public.timelogs(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  position integer not null check (position >= 0),
  released_at timestamptz,
  primary key (round_id,timelog_id),
  unique (round_id,event_id),
  unique (round_id,position)
);
create unique index shift_workflow_round_items_active_timelog_idx
  on public.shift_workflow_round_items(timelog_id) where released_at is null;
-- Also index historical rows, which remain membership guards after release.
create index shift_workflow_round_items_timelog_id_idx on public.shift_workflow_round_items(timelog_id);
create index shift_workflow_round_items_event_id_idx on public.shift_workflow_round_items(event_id);

create table public.shift_workflow_round_actions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.shift_workflow_rounds(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  action text not null check (btrim(action) <> ''),
  from_status text check (from_status in ('pending_ch','pending_crew_confirmation','pending_coo','approved','rejected')),
  to_status text not null check (to_status in ('pending_ch','pending_crew_confirmation','pending_coo','approved','rejected')),
  note text not null default '',
  created_at timestamptz not null default clock_timestamp()
);
create index shift_workflow_round_actions_round_id_idx on public.shift_workflow_round_actions(round_id);
create index shift_workflow_round_actions_actor_id_idx on public.shift_workflow_round_actions(actor_id);
create index shift_workflow_round_actions_event_id_idx on public.shift_workflow_round_actions(event_id);

alter table public.shift_workflows enable row level security;
alter table public.shift_workflow_events enable row level security;
alter table public.shift_workflow_state enable row level security;
alter table public.shift_workflow_requests enable row level security;
alter table public.shift_workflow_rounds enable row level security;
alter table public.shift_workflow_round_items enable row level security;
alter table public.shift_workflow_round_actions enable row level security;

revoke all on table public.shift_workflows, public.shift_workflow_events,
  public.shift_workflow_state, public.shift_workflow_requests, public.shift_workflow_rounds,
  public.shift_workflow_round_items, public.shift_workflow_round_actions
  from public, anon, authenticated, service_role;
grant select on table public.shift_workflows, public.shift_workflow_events,
  public.shift_workflow_state, public.shift_workflow_rounds,
  public.shift_workflow_round_items, public.shift_workflow_round_actions to authenticated;

create policy shift_workflow_events_read on public.shift_workflow_events for select to authenticated
using (
  public.has_role((select auth.uid()),'crewhead'::public.app_role)
  or public.has_role((select auth.uid()),'coo'::public.app_role)
  or exists (select 1 from public.event_assignments a
    where a.event_id=shift_workflow_events.event_id and a.profile_id=(select public.current_profile_id()))
);
create policy shift_workflows_read on public.shift_workflows for select to authenticated
using (
  public.has_role((select auth.uid()),'crewhead'::public.app_role)
  or public.has_role((select auth.uid()),'coo'::public.app_role)
  or exists (select 1 from public.shift_workflow_events e where e.workflow_id=shift_workflows.id)
);
create policy shift_workflow_state_read on public.shift_workflow_state for select to authenticated
using (
  public.has_role((select auth.uid()),'crewhead'::public.app_role)
  or public.has_role((select auth.uid()),'coo'::public.app_role)
);
-- A current assignment is never an ownership predicate for rounds or history.
create policy shift_workflow_rounds_read on public.shift_workflow_rounds for select to authenticated
using (
  public.has_role((select auth.uid()),'crewhead'::public.app_role)
  or public.has_role((select auth.uid()),'coo'::public.app_role)
  or (contractor_id=(select public.current_profile_id()) and contractor_user_id=(select auth.uid()))
);
create policy shift_workflow_round_items_read on public.shift_workflow_round_items for select to authenticated
using (exists (select 1 from public.shift_workflow_rounds r where r.id=shift_workflow_round_items.round_id));
create policy shift_workflow_round_actions_read on public.shift_workflow_round_actions for select to authenticated
using (exists (select 1 from public.shift_workflow_rounds r where r.id=shift_workflow_round_actions.round_id));
-- Explicit deny documents the private ledger boundary in addition to its ACL.
create policy shift_workflow_requests_deny on public.shift_workflow_requests
as restrictive for all to authenticated using (false) with check (false);

-- Private definers are narrowly scoped to these two operations. The read needs
-- an authoritative complete assignment set despite underlying legacy policies;
-- save needs writes denied to every API caller. Public wrappers stay invokers.
-- Neither operation trusts user_metadata or caller-set privilege markers.
create function private.read_shift_workflows()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_profile uuid;
  v_manager boolean;
  v_assigned uuid[];
  v_result jsonb;
begin
  if v_actor is null or (select count(*) from public.profiles p where p.user_id=v_actor) <> 1 then
    raise exception 'shift_workflow_unauthorized' using errcode='42501';
  end if;
  v_profile := public.current_profile_id();
  v_manager := public.has_role(v_actor,'crewhead'::public.app_role)
    or public.has_role(v_actor,'coo'::public.app_role);
  select coalesce(array_agg(a.event_id order by a.event_id),'{}'::uuid[]) into v_assigned
  from public.event_assignments a where a.profile_id=v_profile;

  -- Count is frozen at creation: a valid surviving item must not disguise a
  -- partially deleted round. Never reconstruct an old round from assignments
  -- or silently filter a damaged frozen set.
  if exists (
    select 1 from public.shift_workflow_rounds r
    where (v_manager or (r.contractor_id=v_profile and r.contractor_user_id=v_actor))
      and ((select count(*) from public.shift_workflow_round_items i where i.round_id=r.id) <> r.expected_item_count
        or exists (
          select 1 from public.shift_workflow_round_items i
          left join public.timelogs t on t.id=i.timelog_id
          left join public.events e on e.id=i.event_id
          where i.round_id=r.id and (t.id is null or e.id is null
            or t.event_id is distinct from i.event_id or t.contractor_id is distinct from r.contractor_id)
        ))
  ) then
    raise exception 'shift_workflow_round_invalid' using errcode='22023';
  end if;

  select jsonb_build_object(
    'revision',case when v_manager then (select s.revision from public.shift_workflow_state s where s.singleton) else null end,
    'workflows',coalesce((
      select jsonb_agg(jsonb_build_object('id',w.id,'event_ids',coalesce(members.event_ids,'[]'::jsonb),'updated_at',w.updated_at) order by w.id)
      from public.shift_workflows w
      cross join lateral (
        select jsonb_agg(e.event_id order by e.position,e.event_id) as event_ids
        from public.shift_workflow_events e
        where e.workflow_id=w.id and (v_manager or e.event_id=any(v_assigned))
      ) members
      where v_manager or members.event_ids is not null
    ),'[]'::jsonb),
    'rounds',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.id,'workflow_id',r.workflow_id,
        'contractor_id',r.contractor_id,'status',r.status,'event_ids',items.event_ids,
        'timelog_ids',items.timelog_ids,'note',r.note,'updated_at',r.updated_at) order by r.created_at,r.id)
      from public.shift_workflow_rounds r
      cross join lateral (
        select jsonb_agg(i.event_id order by i.position,i.timelog_id) as event_ids,
          jsonb_agg(i.timelog_id order by i.position,i.timelog_id) as timelog_ids
        from public.shift_workflow_round_items i where i.round_id=r.id
      ) items
      where v_manager or (r.contractor_id=v_profile and r.contractor_user_id=v_actor)
    ),'[]'::jsonb),
    'assigned_event_ids',to_jsonb(v_assigned)
  ) into v_result;
  return v_result;
end $$;

create function private.save_shift_workflow_atomic(
  p_request_id uuid, p_workflow_id uuid, p_event_ids uuid[], p_expected_revision integer,
  p_event_versions jsonb, p_confirm_cross_project boolean, p_confirm_moves boolean, p_delete boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_revision integer;
  v_payload jsonb;
  v_previous public.shift_workflow_requests%rowtype;
  v_workflow uuid := p_workflow_id;
  v_sources uuid[];
  v_affected uuid[];
  v_keys text[];
  v_expected_keys text[];
  v_locked_count integer;
  v_changed_at timestamptz;
  v_result jsonb;
begin
  if v_actor is null or not (
    public.has_role(v_actor,'crewhead'::public.app_role)
    or public.has_role(v_actor,'coo'::public.app_role)
  ) or (select count(*) from public.profiles p where p.user_id=v_actor) <> 1
    or public.current_profile_id() is null then
    raise exception 'shift_workflow_unauthorized' using errcode='42501';
  end if;
  if p_request_id is null or p_event_ids is null or p_expected_revision is null
    or p_expected_revision < 0 or p_event_versions is null
    or jsonb_typeof(p_event_versions) <> 'object'
    or p_confirm_cross_project is null or p_confirm_moves is null or p_delete is null
    or cardinality(p_event_ids) > 200
    or (cardinality(p_event_ids)>0 and (array_ndims(p_event_ids) <> 1 or array_lower(p_event_ids,1) <> 1))
    or exists(select 1 from unnest(p_event_ids) id where id is null)
    or cardinality(p_event_ids) <> (select count(distinct id) from unnest(p_event_ids) id)
    or (p_delete and (p_workflow_id is null or cardinality(p_event_ids) <> 0))
    or (not p_delete and cardinality(p_event_ids) < case when p_workflow_id is null then 2 else 1 end)
  then
    raise exception 'shift_workflow_invalid' using errcode='22023';
  end if;

  v_payload := jsonb_build_object('workflow_id',p_workflow_id,'event_ids',to_jsonb(p_event_ids),
    'expected_revision',p_expected_revision,'event_versions',p_event_versions,
    'confirm_cross_project',p_confirm_cross_project,'confirm_moves',p_confirm_moves,'delete',p_delete);

  -- One serialization point for every membership mutation and request replay.
  -- Exact retry returns the original result even after the revision advances.
  select s.revision into strict v_revision from public.shift_workflow_state s where s.singleton for update;
  select * into v_previous from public.shift_workflow_requests r where r.request_id=p_request_id;
  if found then
    if v_previous.actor_id is distinct from v_actor or v_previous.kind <> 'save_membership'
      or v_previous.payload is distinct from v_payload then
      raise exception 'shift_workflow_request_conflict' using errcode='22023';
    end if;
    return v_previous.result;
  end if;
  if v_revision <> p_expected_revision then
    raise exception 'shift_workflow_revision_conflict' using errcode='40001';
  end if;
  if p_workflow_id is not null and not exists(select 1 from public.shift_workflows w where w.id=p_workflow_id) then
    raise exception 'shift_workflow_not_found' using errcode='P0002';
  end if;

  select coalesce(array_agg(distinct e.workflow_id order by e.workflow_id),'{}'::uuid[]) into v_sources
  from public.shift_workflow_events e
  where e.event_id=any(p_event_ids) and e.workflow_id is distinct from p_workflow_id;
  select coalesce(array_agg(distinct x.event_id order by x.event_id),'{}'::uuid[]) into v_affected
  from (
    select unnest(p_event_ids) as event_id
    union select e.event_id from public.shift_workflow_events e
      where e.workflow_id=p_workflow_id or e.workflow_id=any(v_sources)
  ) x;
  if cardinality(v_affected)>1000 then
    raise exception 'shift_workflow_too_many_affected_events' using errcode='22023';
  end if;

  -- Strong parent locks also serialize FK-backed insertions and existing
  -- assignment/removal RPCs. No event is locked after any timelog lock.
  perform e.id from public.events e where e.id=any(v_affected) order by e.id for update;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> cardinality(v_affected) then
    raise exception 'shift_workflow_event_not_found' using errcode='P0002';
  end if;
  select coalesce(array_agg(key order by key),'{}'::text[]) into v_keys from jsonb_object_keys(p_event_versions) key;
  select coalesce(array_agg(id::text order by id::text),'{}'::text[]) into v_expected_keys from unnest(v_affected) id;
  if v_keys is distinct from v_expected_keys or exists(
    select 1 from jsonb_each(p_event_versions) kv where jsonb_typeof(kv.value) <> 'string'
  ) then
    raise exception 'shift_workflow_versions_invalid' using errcode='22023';
  end if;
  begin
    if exists (select 1 from jsonb_each_text(p_event_versions) kv where not isfinite(kv.value::timestamptz)) then
      raise exception 'shift_workflow_versions_invalid' using errcode='22023';
    end if;
    if exists(select 1 from public.events e where e.id=any(v_affected)
      and e.updated_at is distinct from (p_event_versions->>e.id::text)::timestamptz) then
      raise exception 'shift_workflow_event_conflict' using errcode='40001';
    end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'shift_workflow_versions_invalid' using errcode='22023';
  end;
  if cardinality(v_sources)>0 and not p_confirm_moves then
    raise exception 'shift_workflow_move_confirmation_required' using errcode='22023';
  end if;
  if not p_confirm_cross_project and (
    select count(*) from (select distinct e.project_id,e.job_number from public.events e where e.id=any(p_event_ids)) identities
  )>1 then
    raise exception 'shift_workflow_cross_project_confirmation_required' using errcode='22023';
  end if;

  perform t.id from public.timelogs t where t.event_id=any(v_affected) order by t.id for update;
  if exists(select 1 from public.timelogs t where t.event_id=any(v_affected) and t.status <> 'draft'::public.timelog_status)
    or exists(select 1 from public.shift_workflow_round_items i
      left join public.timelogs t on t.id=i.timelog_id where i.event_id=any(v_affected) or t.event_id=any(v_affected))
    or exists(select 1 from public.shift_workflow_rounds r where r.workflow_id=p_workflow_id or r.workflow_id=any(v_sources))
    or exists(select 1 from public.timelog_approvals a join public.timelogs t on t.id=a.timelog_id where t.event_id=any(v_affected))
    or exists(select 1 from public.invoice_timelogs i join public.timelogs t on t.id=i.timelog_id where t.event_id=any(v_affected))
  then
    raise exception 'shift_workflow_membership_locked' using errcode='55000';
  end if;

  v_changed_at := clock_timestamp();
  if p_delete then
    delete from public.shift_workflow_events where workflow_id=v_workflow;
    delete from public.shift_workflows where id=v_workflow;
  else
    if v_workflow is null then
      insert into public.shift_workflows(created_by,created_at,updated_at)
      values(v_actor,v_changed_at,v_changed_at) returning id into v_workflow;
    else
      update public.shift_workflows set updated_at=v_changed_at where id=v_workflow;
    end if;
    delete from public.shift_workflow_events where workflow_id=v_workflow or event_id=any(p_event_ids);
    insert into public.shift_workflow_events(event_id,workflow_id,position)
      select id,v_workflow,(ordinal-1)::integer from unnest(p_event_ids) with ordinality as selected(id,ordinal);
    -- Keep a singleton source explicitly; unchanged positions retain its order.
    update public.shift_workflows set updated_at=v_changed_at where id=any(v_sources);
    delete from public.shift_workflows w where w.id=any(v_sources)
      and not exists(select 1 from public.shift_workflow_events e where e.workflow_id=w.id)
      and not exists(select 1 from public.shift_workflow_rounds r where r.workflow_id=w.id);
  end if;
  update public.shift_workflow_state set revision=revision+1 where singleton returning revision into v_revision;
  v_result := jsonb_build_object('request_id',p_request_id,'workflow_id',v_workflow,'revision',v_revision);
  insert into public.shift_workflow_requests(request_id,actor_id,kind,payload,result)
  values(p_request_id,v_actor,'save_membership',v_payload,v_result);
  return v_result;
end $$;

create function public.read_shift_workflows() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.read_shift_workflows()
$$;
create function public.save_shift_workflow_atomic(
  p_request_id uuid,p_workflow_id uuid,p_event_ids uuid[],p_expected_revision integer,
  p_event_versions jsonb,p_confirm_cross_project boolean,p_confirm_moves boolean,p_delete boolean
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.save_shift_workflow_atomic(p_request_id,p_workflow_id,p_event_ids,p_expected_revision,
    p_event_versions,p_confirm_cross_project,p_confirm_moves,p_delete)
$$;

revoke all on function private.read_shift_workflows(), public.read_shift_workflows(),
  private.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean),
  public.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean)
  from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.read_shift_workflows(), public.read_shift_workflows(),
  private.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean),
  public.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean) to authenticated;

commit;
