-- One observed foreground-use timestamp; never inferred from profile updates/login.
create table public.profile_activity (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  last_active_at timestamptz not null
);

alter table public.profile_activity enable row level security;
revoke all on public.profile_activity from public, anon, authenticated;
grant select on public.profile_activity to authenticated;
grant all on public.profile_activity to service_role;

create policy "Managers and own profile can read activity"
on public.profile_activity for select to authenticated using (
  (select public.has_role(auth.uid(), 'crewhead'::public.app_role))
  or (select public.has_role(auth.uid(), 'coo'::public.app_role))
  or profile_id in (select p.id from public.profiles p where p.user_id = (select auth.uid()))
);

-- Definer is required for a server-owned timestamp with no direct client writes.
-- No parameters: callers cannot choose another profile or forge the time.
create function public.record_my_activity()
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  observed_at timestamptz := statement_timestamp();
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.profile_activity as activity (profile_id, last_active_at)
  select p.id, observed_at from public.profiles p where p.user_id = actor
  on conflict (profile_id) do update set last_active_at = excluded.last_active_at
  where activity.last_active_at < excluded.last_active_at - interval '1 minute';
end;
$$;
revoke all on function public.record_my_activity() from public, anon;
grant execute on function public.record_my_activity() to authenticated;
comment on table public.profile_activity is 'Last observed foreground app use, collected from this migration onward.';
