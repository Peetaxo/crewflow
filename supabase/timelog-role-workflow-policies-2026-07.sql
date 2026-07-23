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
      and p_status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status)
    )
    or (
      public.has_role(auth.uid(), 'crewhead'::public.app_role)
      and p_status in ('draft'::public.timelog_status, 'pending_ch'::public.timelog_status)
    );
$$;

create or replace function public.timelog_update_is_status_only(
  p_old public.timelogs,
  p_new public.timelogs
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    p_new.id is not distinct from p_old.id
    and p_new.event_id is not distinct from p_old.event_id
    and p_new.contractor_id is not distinct from p_old.contractor_id
    and p_new.km is not distinct from p_old.km
    and p_new.note is not distinct from p_old.note
    and p_new.created_at is not distinct from p_old.created_at;
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
    and old.status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status)
    and new.status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status, 'pending_ch'::public.timelog_status) then
    return new;
  end if;

  if public.has_role(auth.uid(), 'crewhead'::public.app_role)
    and (
      (
        old.status = 'draft'::public.timelog_status
        and new.status in ('draft'::public.timelog_status, 'pending_ch'::public.timelog_status)
      )
      or (
        old.status = 'pending_ch'::public.timelog_status
        and new.status in ('pending_ch'::public.timelog_status, 'pending_coo'::public.timelog_status, 'rejected'::public.timelog_status)
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

drop trigger if exists enforce_timelog_update_permissions on public.timelogs;
create trigger enforce_timelog_update_permissions
before update on public.timelogs
for each row
execute function public.enforce_timelog_update_permissions();

revoke all on function public.can_edit_timelog_data(uuid, public.timelog_status) from public;
grant execute on function public.can_edit_timelog_data(uuid, public.timelog_status) to authenticated;

revoke all on function public.timelog_update_is_status_only(public.timelogs, public.timelogs) from public;
grant execute on function public.timelog_update_is_status_only(public.timelogs, public.timelogs) to authenticated;

drop policy if exists "Crew can manage own timelogs" on public.timelogs;
drop policy if exists "COO can manage all timelogs" on public.timelogs;
drop policy if exists "CrewHead and COO can create assignment timelogs" on public.timelogs;
drop policy if exists "CrewHead can submit and update CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can update pending CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can view all timelogs" on public.timelogs;
drop policy if exists "Crew can view own timelogs" on public.timelogs;
drop policy if exists "Crew can create own draft timelogs" on public.timelogs;
drop policy if exists "Crew can update own draft and rejected timelogs" on public.timelogs;
drop policy if exists "Crew can delete own draft and rejected timelogs" on public.timelogs;
drop policy if exists "CrewHead can create assignment draft timelogs" on public.timelogs;
drop policy if exists "CrewHead can update draft and CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can delete draft and CH timelogs" on public.timelogs;
drop policy if exists "COO can view all timelogs" on public.timelogs;
drop policy if exists "COO can status-update COO timelogs" on public.timelogs;

create policy "Crew can view own timelogs"
on public.timelogs
for select
using (contractor_id = public.current_profile_id());

create policy "CrewHead can view all timelogs"
on public.timelogs
for select
using (public.has_role(auth.uid(), 'crewhead'::public.app_role));

create policy "COO can view all timelogs"
on public.timelogs
for select
using (public.has_role(auth.uid(), 'coo'::public.app_role));

create policy "Crew can create own draft timelogs"
on public.timelogs
for insert
with check (
  public.has_role(auth.uid(), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status = 'draft'::public.timelog_status
);

create policy "CrewHead can create assignment draft timelogs"
on public.timelogs
for insert
with check (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  and status = 'draft'::public.timelog_status
);

create policy "Crew can update own draft and rejected timelogs"
on public.timelogs
for update
using (
  public.has_role(auth.uid(), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status)
)
with check (
  public.has_role(auth.uid(), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status, 'pending_ch'::public.timelog_status)
);

create policy "CrewHead can update draft and CH timelogs"
on public.timelogs
for update
using (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  and status in ('draft'::public.timelog_status, 'pending_ch'::public.timelog_status)
)
with check (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  and status in ('draft'::public.timelog_status, 'pending_ch'::public.timelog_status, 'pending_coo'::public.timelog_status, 'rejected'::public.timelog_status)
);

create policy "COO can status-update COO timelogs"
on public.timelogs
for update
using (
  public.has_role(auth.uid(), 'coo'::public.app_role)
  and status in ('pending_coo'::public.timelog_status, 'approved'::public.timelog_status, 'invoiced'::public.timelog_status)
)
with check (
  public.has_role(auth.uid(), 'coo'::public.app_role)
  and status in ('approved'::public.timelog_status, 'rejected'::public.timelog_status, 'invoiced'::public.timelog_status, 'paid'::public.timelog_status)
);

create policy "Crew can delete own draft and rejected timelogs"
on public.timelogs
for delete
using (
  public.has_role(auth.uid(), 'crew'::public.app_role)
  and contractor_id = public.current_profile_id()
  and status in ('draft'::public.timelog_status, 'rejected'::public.timelog_status)
);

create policy "CrewHead can delete draft and CH timelogs"
on public.timelogs
for delete
using (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  and status in ('draft'::public.timelog_status, 'pending_ch'::public.timelog_status)
);

drop policy if exists "Users can manage timelog days via timelog" on public.timelog_days;
drop policy if exists "CrewHead and COO can create assignment timelog days" on public.timelog_days;
drop policy if exists "Users can view timelog days via visible timelog" on public.timelog_days;
drop policy if exists "Users can insert timelog days via editable timelog" on public.timelog_days;
drop policy if exists "Users can update timelog days via editable timelog" on public.timelog_days;
drop policy if exists "Users can delete timelog days via editable timelog" on public.timelog_days;

create policy "Users can view timelog days via visible timelog"
on public.timelog_days
for select
using (
  exists (
    select 1
    from public.timelogs t
    where t.id = timelog_days.timelog_id
      and (
        t.contractor_id = public.current_profile_id()
        or public.has_role(auth.uid(), 'crewhead'::public.app_role)
        or public.has_role(auth.uid(), 'coo'::public.app_role)
      )
  )
);

create policy "Users can insert timelog days via editable timelog"
on public.timelog_days
for insert
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
using (
  exists (
    select 1
    from public.timelogs t
    where t.id = timelog_days.timelog_id
      and public.can_edit_timelog_data(t.contractor_id, t.status)
  )
);

commit;
