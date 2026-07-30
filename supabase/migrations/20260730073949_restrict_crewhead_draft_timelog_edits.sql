begin;

create or replace function public.can_edit_timelog_data(
  p_contractor_id uuid,
  p_status public.timelog_status
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      public.has_role(auth.uid(), 'crew'::public.app_role)
      and p_contractor_id = public.current_profile_id()
      and p_status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status, 'pending_crew_confirmation'::public.timelog_status)
    )
    or (
      public.has_role(auth.uid(), 'crewhead'::public.app_role)
      and p_status = 'pending_ch'::public.timelog_status
    );
$$;

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

drop policy if exists "CrewHead can create assignment draft timelogs" on public.timelogs;
drop policy if exists "CrewHead can submit and update CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can update draft and CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can update pending CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can delete draft and CH timelogs" on public.timelogs;

create policy "CrewHead can update pending CH timelogs"
on public.timelogs
for update
using (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  and status = 'pending_ch'::public.timelog_status
)
with check (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  and status in ('pending_ch'::public.timelog_status, 'pending_crew_confirmation'::public.timelog_status, 'pending_coo'::public.timelog_status, 'rejected'::public.timelog_status)
);

commit;
