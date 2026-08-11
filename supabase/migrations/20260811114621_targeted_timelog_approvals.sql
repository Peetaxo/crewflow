begin;

create table if not exists public.timelog_approvals (
  id uuid primary key default gen_random_uuid(),
  approval_round_id uuid not null,
  timelog_id uuid not null references public.timelogs(id) on delete cascade,
  approver_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'returned')),
  requested_by_profile_id uuid references public.profiles(id) on delete set null default public.current_profile_id(),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  superseded_at timestamptz,
  note text not null default ''
);

create index if not exists timelog_approvals_timelog_active_idx
  on public.timelog_approvals (timelog_id, approval_round_id, status)
  where superseded_at is null;

create index if not exists timelog_approvals_approver_active_idx
  on public.timelog_approvals (approver_profile_id, status, requested_at desc)
  where superseded_at is null;

create unique index if not exists timelog_approvals_active_approver_key
  on public.timelog_approvals (timelog_id, approver_profile_id)
  where superseded_at is null;

alter table public.timelog_approvals enable row level security;

drop policy if exists "Timelog approval rows are visible to involved users" on public.timelog_approvals;
create policy "Timelog approval rows are visible to involved users"
on public.timelog_approvals
for select
to authenticated
using (
  approver_profile_id = public.current_profile_id()
  or requested_by_profile_id = public.current_profile_id()
  or public.has_role(auth.uid(), 'crewhead'::public.app_role)
  or public.has_role(auth.uid(), 'coo'::public.app_role)
  or exists (
    select 1
    from public.timelogs t
    where t.id = timelog_approvals.timelog_id
      and t.contractor_id = public.current_profile_id()
  )
);

drop policy if exists "CrewHead and COO can create timelog approval rows" on public.timelog_approvals;
drop policy if exists "Selected approvers can update own approval rows" on public.timelog_approvals;

drop policy if exists "Selected approvers can view assigned timelogs" on public.timelogs;
create policy "Selected approvers can view assigned timelogs"
on public.timelogs
for select
to authenticated
using (
  exists (
    select 1
    from public.timelog_approvals approval
    where approval.timelog_id = timelogs.id
      and approval.approver_profile_id = public.current_profile_id()
      and approval.superseded_at is null
  )
);

create or replace function public.enforce_timelog_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'User must be authenticated to update timelogs.' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.contractor_id is distinct from old.contractor_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Timelog identity fields cannot be changed.' using errcode = '42501';
  end if;

  if public.has_role(auth.uid(), 'crew'::public.app_role)
    and old.contractor_id = public.current_profile_id()
    and old.status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status, 'pending_crew_confirmation'::public.timelog_status)
    and new.status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status, 'pending_crew_confirmation'::public.timelog_status, 'pending_ch'::public.timelog_status) then
    return new;
  end if;

  if (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  )
    and public.timelog_update_is_status_only(old, new)
    and old.status = 'pending_ch'::public.timelog_status
    and new.status = 'pending_coo'::public.timelog_status
    and exists (
      select 1
      from public.timelog_approvals approval
      where approval.timelog_id = old.id
        and approval.requested_by_profile_id = public.current_profile_id()
        and approval.superseded_at is null
        and approval.status = 'pending'
    ) then
    return new;
  end if;

  if (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  )
    and public.timelog_update_is_status_only(old, new)
    and old.status = 'pending_ch'::public.timelog_status
    and new.status = 'approved'::public.timelog_status then
    return new;
  end if;

  if public.has_role(auth.uid(), 'crewhead'::public.app_role)
    and (
      (
        old.status = 'pending_ch'::public.timelog_status
        and new.status = 'pending_crew_confirmation'::public.timelog_status
      )
      or (
        old.status = 'pending_ch'::public.timelog_status
        and new.status in ('pending_ch'::public.timelog_status, 'rejected'::public.timelog_status)
      )
      or (
        old.status = 'pending_ch'::public.timelog_status
        and public.timelog_update_is_status_only(old, new)
        and new.status = 'pending_coo'::public.timelog_status
      )
    ) then
    return new;
  end if;

  if public.timelog_update_is_status_only(old, new)
    and old.status = 'pending_coo'::public.timelog_status
    and new.status in ('approved'::public.timelog_status, 'rejected'::public.timelog_status)
    and exists (
      select 1
      from public.timelog_approvals approval
      where approval.timelog_id = old.id
        and approval.approver_profile_id = public.current_profile_id()
        and approval.superseded_at is null
        and (
          (
            new.status = 'approved'::public.timelog_status
            and approval.status = 'approved'
          )
          or (
            new.status = 'rejected'::public.timelog_status
            and approval.status = 'returned'
          )
        )
    ) then
    return new;
  end if;

  if public.has_role(auth.uid(), 'coo'::public.app_role)
    and public.timelog_update_is_status_only(old, new)
    and (
      (
        old.status = 'pending_coo'::public.timelog_status
        and new.status in ('approved'::public.timelog_status, 'rejected'::public.timelog_status)
      )
      or (
        old.status = 'approved'::public.timelog_status
        and new.status in ('invoiced'::public.timelog_status, 'paid'::public.timelog_status)
      )
      or (
        old.status = 'invoiced'::public.timelog_status
        and new.status = 'paid'::public.timelog_status
      )
    ) then
    return new;
  end if;

  raise exception 'Timelog update is not allowed for this role and status.' using errcode = '42501';
end;
$$;

create or replace function public.send_timelog_to_approvers(
  p_timelog_id uuid,
  p_approver_profile_ids uuid[],
  p_note text default null
)
returns public.timelogs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_profile_id uuid := public.current_profile_id();
  v_timelog public.timelogs;
  v_round_id uuid := gen_random_uuid();
  v_approver_ids uuid[];
  v_result public.timelogs;
begin
  if auth.uid() is null then
    raise exception 'User must be authenticated to send timelog approvals.' using errcode = '42501';
  end if;

  if not (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  ) then
    raise exception 'Only management can send timelog approvals.' using errcode = '42501';
  end if;

  select *
  into v_timelog
  from public.timelogs
  where id = p_timelog_id
  for update;

  if not found then
    raise exception 'Timelog was not found.' using errcode = 'P0002';
  end if;

  if v_timelog.status <> 'pending_ch'::public.timelog_status then
    raise exception 'Timelog must wait for internal control before final approval.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct profile_id), '{}'::uuid[])
  into v_approver_ids
  from unnest(coalesce(p_approver_profile_ids, '{}'::uuid[])) as profile_id
  where profile_id is not null
    and profile_id <> v_actor_profile_id
    and exists (
      select 1
      from public.profiles profile
      where profile.id = profile_id
    );

  update public.timelog_approvals
  set superseded_at = now()
  where timelog_id = p_timelog_id
    and superseded_at is null;

  if cardinality(v_approver_ids) = 0 then
    update public.timelogs
    set
      status = 'approved'::public.timelog_status,
      review_note = nullif(trim(coalesce(p_note, '')), '')
    where id = p_timelog_id
    returning * into v_result;

    return v_result;
  end if;

  insert into public.timelog_approvals (
    approval_round_id,
    timelog_id,
    approver_profile_id,
    requested_by_profile_id,
    note
  )
  select
    v_round_id,
    p_timelog_id,
    profile_id,
    v_actor_profile_id,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), '')
  from unnest(v_approver_ids) as profile_id;

  update public.timelogs
  set
    status = 'pending_coo'::public.timelog_status,
    review_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_timelog_id
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.resolve_timelog_approval(
  p_approval_id uuid,
  p_action text,
  p_note text default null
)
returns public.timelogs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_profile_id uuid := public.current_profile_id();
  v_timelog_id uuid;
  v_timelog public.timelogs;
  v_approval public.timelog_approvals;
  v_unapproved_count integer;
  v_result public.timelogs;
begin
  if auth.uid() is null then
    raise exception 'User must be authenticated to resolve timelog approvals.' using errcode = '42501';
  end if;

  select approval.timelog_id
  into v_timelog_id
  from public.timelog_approvals approval
  where approval.id = p_approval_id
    and approval.superseded_at is null;

  if not found then
    raise exception 'Approval request was not found.' using errcode = 'P0002';
  end if;

  select *
  into v_timelog
  from public.timelogs
  where id = v_timelog_id
  for update;

  if not found then
    raise exception 'Timelog was not found.' using errcode = 'P0002';
  end if;

  select *
  into v_approval
  from public.timelog_approvals
  where id = p_approval_id
    and superseded_at is null
  for update;

  if not found then
    raise exception 'Approval request was not found.' using errcode = 'P0002';
  end if;

  if v_approval.approver_profile_id <> v_actor_profile_id then
    raise exception 'Only the selected approver can resolve this approval request.' using errcode = '42501';
  end if;

  if v_approval.status <> 'pending' then
    raise exception 'Approval request has already been resolved.' using errcode = '42501';
  end if;

  if p_action = 'approved' then
    update public.timelog_approvals
    set
      status = 'approved',
      resolved_at = now(),
      note = coalesce(nullif(trim(coalesce(p_note, '')), ''), '')
    where id = p_approval_id;

    select count(*)
    into v_unapproved_count
    from public.timelog_approvals
    where timelog_id = v_approval.timelog_id
      and approval_round_id = v_approval.approval_round_id
      and superseded_at is null
      and status <> 'approved';

    if v_unapproved_count = 0 then
      update public.timelogs
      set status = 'approved'::public.timelog_status
      where id = v_approval.timelog_id
      returning * into v_result;
    else
      select *
      into v_result
      from public.timelogs
      where id = v_approval.timelog_id;
    end if;

    return v_result;
  end if;

  if p_action = 'returned' then
    update public.timelog_approvals
    set
      status = 'returned',
      resolved_at = now(),
      note = coalesce(nullif(trim(coalesce(p_note, '')), ''), '')
    where id = p_approval_id;

    update public.timelog_approvals
    set superseded_at = now()
    where timelog_id = v_approval.timelog_id
      and approval_round_id = v_approval.approval_round_id
      and id <> p_approval_id
      and superseded_at is null
      and status = 'pending';

    update public.timelogs
    set
      status = 'rejected'::public.timelog_status,
      review_note = nullif(trim(coalesce(p_note, '')), '')
    where id = v_approval.timelog_id
    returning * into v_result;

    return v_result;
  end if;

  raise exception 'Unsupported approval action.' using errcode = '22023';
end;
$$;

revoke all on function public.send_timelog_to_approvers(uuid, uuid[], text) from public;
revoke all on function public.resolve_timelog_approval(uuid, text, text) from public;
grant execute on function public.send_timelog_to_approvers(uuid, uuid[], text) to authenticated;
grant execute on function public.resolve_timelog_approval(uuid, text, text) to authenticated;

revoke insert, update, delete on public.timelog_approvals from anon;
revoke insert, update, delete on public.timelog_approvals from authenticated;
grant select on public.timelog_approvals to authenticated;

commit;
