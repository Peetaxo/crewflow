begin;

alter table public.events enable row level security;

drop policy if exists "Crew can view assigned events" on public.events;

create policy "Crew can view assigned events"
on public.events
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and (
    events.status in ('upcoming'::public.event_status, 'full'::public.event_status)
    or exists (
      select 1
      from public.event_assignments assignment
      where assignment.event_id = events.id
        and assignment.profile_id = public.current_profile_id()
    )
    or exists (
      select 1
      from public.timelogs timelog
      where timelog.event_id = events.id
        and timelog.contractor_id = public.current_profile_id()
    )
    or exists (
      select 1
      from public.event_applications application
      where application.event_id = events.id
        and application.profile_id = public.current_profile_id()
    )
  )
);

commit;
