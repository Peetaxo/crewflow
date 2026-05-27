alter table public.events
add column if not exists allow_crew_time_proposal boolean not null default false;

alter table public.event_applications
add column if not exists planned_from time,
add column if not exists planned_to time;

alter table public.event_applications
drop constraint if exists event_applications_status_check;

alter table public.event_applications
add constraint event_applications_status_check
check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'withdrawal_requested'));

drop policy if exists "Crew can create own event applications" on public.event_applications;
drop policy if exists "Crew can renew own event applications" on public.event_applications;
drop policy if exists "Crew can update own event applications" on public.event_applications;

create policy "Crew can create own event applications"
on public.event_applications
for insert
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

create policy "Crew can update own event applications"
on public.event_applications
for update
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
