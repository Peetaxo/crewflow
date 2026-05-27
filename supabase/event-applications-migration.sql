create table if not exists public.event_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'withdrawal_requested')),
  note text,
  planned_from time,
  planned_to time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

create index if not exists event_applications_event_id_idx
  on public.event_applications (event_id);

create index if not exists event_applications_profile_id_idx
  on public.event_applications (profile_id);

create index if not exists event_applications_status_idx
  on public.event_applications (status);

alter table public.events
add column if not exists allow_crew_time_proposal boolean not null default false;

alter table public.event_applications enable row level security;

drop policy if exists "Crew can view own event applications" on public.event_applications;
drop policy if exists "Crew can create own event applications" on public.event_applications;
drop policy if exists "Crew can renew own event applications" on public.event_applications;
drop policy if exists "CrewHead and COO can manage event applications" on public.event_applications;

create policy "Crew can view own event applications"
on public.event_applications
for select
using (profile_id = public.current_profile_id());

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

create policy "Crew can renew own event applications"
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

create policy "CrewHead and COO can manage event applications"
on public.event_applications
for all
using (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  or public.has_role(auth.uid(), 'coo'::public.app_role)
)
with check (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  or public.has_role(auth.uid(), 'coo'::public.app_role)
);

drop policy if exists "Crew can view assigned events" on public.events;

create policy "Crew can view assigned events"
on public.events
for select
using (
  public.has_role(auth.uid(), 'crew'::public.app_role)
  or exists (
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
