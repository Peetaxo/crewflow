alter table public.events
  add column if not exists meal_allowance_enabled boolean not null default false;

alter table public.timelog_days
  add column if not exists meals text[] not null default '{}'::text[];

update public.timelog_days
set meals = array[meal]::text[]
where meal is not null
  and cardinality(meals) = 0;

alter table public.timelog_days
  alter column meals set default '{}'::text[],
  alter column meals set not null;

alter table public.timelog_days
  drop constraint if exists timelog_days_meals_check;

alter table public.timelog_days
  add constraint timelog_days_meals_check
  check (meals <@ array['obed', 'vecere']::text[]);
