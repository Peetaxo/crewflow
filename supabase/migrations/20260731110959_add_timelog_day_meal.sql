alter table public.timelog_days
add column if not exists meal text;

alter table public.timelog_days
drop constraint if exists timelog_days_meal_check;

alter table public.timelog_days
add constraint timelog_days_meal_check
check (meal is null or meal in ('obed', 'vecere'));
