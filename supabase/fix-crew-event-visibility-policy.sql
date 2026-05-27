drop policy if exists "Crew can view assigned events" on public.events;

create policy "Crew can view assigned events"
on public.events
for select
using (
  exists (
    select 1
    from public.event_assignments ea
    where ea.event_id = events.id
      and ea.profile_id = public.current_profile_id()
  )
  or exists (
    select 1
    from public.timelogs t
    where t.event_id = events.id
      and t.contractor_id = public.current_profile_id()
  )
);
