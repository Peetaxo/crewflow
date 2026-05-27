create or replace function public.list_event_crew_assignments()
returns table (
  event_id uuid,
  profile_id uuid,
  first_name text,
  last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    timelogs.event_id,
    profiles.id as profile_id,
    profiles.first_name,
    profiles.last_name
from public.timelogs
join public.profiles on profiles.id = timelogs.contractor_id
order by profiles.last_name, profiles.first_name;
$$;

revoke all on function public.list_event_crew_assignments() from public;
grant execute on function public.list_event_crew_assignments() to authenticated;
