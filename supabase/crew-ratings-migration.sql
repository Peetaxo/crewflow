begin;

alter table public.profiles
  drop constraint if exists profiles_rating_range;

alter table public.profiles
  alter column rating type numeric(3,1);

alter table public.profiles
  add constraint profiles_rating_range
  check (rating is null or (rating >= 0.0 and rating <= 10.0));

create table if not exists public.crew_ratings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid null references public.events(id) on delete cascade,
  source text not null,
  rating smallint not null,
  note text,
  rated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crew_ratings_source_check check (source in ('initial', 'event')),
  constraint crew_ratings_rating_check check (rating between 0 and 10),
  constraint crew_ratings_source_event_check check (
    (source = 'initial' and event_id is null)
    or (source = 'event' and event_id is not null)
  )
);

create unique index if not exists crew_ratings_one_initial_per_profile
on public.crew_ratings (profile_id)
where source = 'initial';

create unique index if not exists crew_ratings_one_event_rating_per_profile
on public.crew_ratings (profile_id, event_id)
where source = 'event';

create index if not exists crew_ratings_event_id_idx
on public.crew_ratings (event_id);

create or replace function public.recalculate_profile_rating(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    rating = (
      select round(avg(crew_ratings.rating)::numeric, 1)
      from public.crew_ratings
      where crew_ratings.profile_id = p_profile_id
    ),
    updated_at = now()
  where profiles.id = p_profile_id;
end;
$$;

create or replace function public.handle_crew_rating_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalculate_profile_rating(new.profile_id);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform public.recalculate_profile_rating(new.profile_id);
    if old.profile_id is distinct from new.profile_id then
      perform public.recalculate_profile_rating(old.profile_id);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.recalculate_profile_rating(old.profile_id);
    return old;
  end if;

  return null;
end;
$$;

create or replace function public.touch_crew_rating_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crew_ratings_recalculate_profile_rating on public.crew_ratings;
drop trigger if exists crew_ratings_touch_updated_at on public.crew_ratings;

create trigger crew_ratings_touch_updated_at
before update on public.crew_ratings
for each row execute function public.touch_crew_rating_updated_at();

create trigger crew_ratings_recalculate_profile_rating
after insert or update or delete on public.crew_ratings
for each row execute function public.handle_crew_rating_change();

insert into public.crew_ratings (profile_id, event_id, source, rating, note, rated_by_profile_id)
select
  profiles.id,
  null,
  'initial',
  least(10, greatest(0, round(profiles.rating * 2)::int)),
  'Migrated from previous 1-5 profile rating.',
  null
from public.profiles
where profiles.rating is not null
on conflict do nothing;

do $$
declare
  profile_record record;
begin
  for profile_record in select id from public.profiles loop
    perform public.recalculate_profile_rating(profile_record.id);
  end loop;
end;
$$;

alter table public.crew_ratings enable row level security;

drop policy if exists "CrewHead and COO can read crew ratings" on public.crew_ratings;
drop policy if exists "CrewHead and COO can manage crew ratings" on public.crew_ratings;

create policy "CrewHead and COO can read crew ratings"
on public.crew_ratings
for select
to authenticated
using (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  or public.has_role(auth.uid(), 'coo'::public.app_role)
);

create policy "CrewHead and COO can manage crew ratings"
on public.crew_ratings
for all
to authenticated
using (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  or public.has_role(auth.uid(), 'coo'::public.app_role)
)
with check (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  or public.has_role(auth.uid(), 'coo'::public.app_role)
);

comment on table public.crew_ratings is
  'Interni hodnoceni clenu crew na skale 0 az 10. Jednotlive zaznamy tvori historii, profiles.rating drzi prumer.';

comment on column public.profiles.rating is
  'Agregovane interni hodnoceni clena crew na skale 0.0 az 10.0.';

commit;
