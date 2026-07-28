do $$
begin
  if exists (
    select 1
    from public.timelogs
    group by event_id, contractor_id
    having count(*) > 1
  ) then
    raise exception 'Cannot add timelogs_event_contractor_unique: duplicate timelogs exist for at least one event and contractor.';
  end if;
end $$;

alter table public.timelogs
  add constraint timelogs_event_contractor_unique
  unique (event_id, contractor_id);

do $$
begin
  if exists (
    with parsed_days as (
      select
        id,
        timelog_id,
        date,
        split_part(time_from, ':', 1)::integer as from_hour,
        split_part(time_from, ':', 2)::integer as from_minute,
        split_part(time_to, ':', 1)::integer as to_hour,
        split_part(time_to, ':', 2)::integer as to_minute
      from public.timelog_days
      where time_from is not null
        and time_to is not null
        and time_from ~ '^\d{1,2}:\d{2}$'
        and time_to ~ '^\d{1,2}:\d{2}$'
    ),
    valid_days as (
      select
        id,
        timelog_id,
        date,
        from_hour * 60 + from_minute as from_minutes,
        to_hour * 60 + to_minute as to_minutes
      from parsed_days
      where from_hour between 0 and 23
        and from_minute between 0 and 59
        and to_hour between 0 and 23
        and to_minute between 0 and 59
    ),
    day_intervals as (
      select
        id,
        timelog_id,
        date::timestamp + make_interval(mins => from_minutes) as starts_at,
        date::timestamp + make_interval(
          mins => case
            when to_minutes < from_minutes then to_minutes + 1440
            else to_minutes
          end
        ) as ends_at
      from valid_days
    )
    select 1
    from day_intervals first_day
    join day_intervals second_day
      on second_day.timelog_id = first_day.timelog_id
      and second_day.id::text > first_day.id::text
      and first_day.starts_at < second_day.ends_at
      and second_day.starts_at < first_day.ends_at
    limit 1
  ) then
    raise exception 'Cannot add trg_prevent_overlapping_timelog_days: overlapping timelog days already exist.';
  end if;
end $$;

create or replace function public.prevent_overlapping_timelog_days()
returns trigger
language plpgsql
as $$
declare
  new_from_hour integer;
  new_from_minute integer;
  new_to_hour integer;
  new_to_minute integer;
  new_from_minutes integer;
  new_to_minutes integer;
  new_start timestamp;
  new_end timestamp;
  overlapping_day record;
begin
  if new.time_from is null or new.time_to is null then
    return new;
  end if;

  if new.time_from !~ '^\d{1,2}:\d{2}$' or new.time_to !~ '^\d{1,2}:\d{2}$' then
    raise exception 'Invalid timelog day time format.';
  end if;

  new_from_hour := split_part(new.time_from, ':', 1)::integer;
  new_from_minute := split_part(new.time_from, ':', 2)::integer;
  new_to_hour := split_part(new.time_to, ':', 1)::integer;
  new_to_minute := split_part(new.time_to, ':', 2)::integer;

  if new_from_hour not between 0 and 23
    or new_from_minute not between 0 and 59
    or new_to_hour not between 0 and 23
    or new_to_minute not between 0 and 59
  then
    raise exception 'Invalid timelog day time value.';
  end if;

  new_from_minutes := new_from_hour * 60 + new_from_minute;
  new_to_minutes := new_to_hour * 60 + new_to_minute;

  new_start := new.date::timestamp + make_interval(mins => new_from_minutes);
  new_end := new.date::timestamp + make_interval(
    mins => case
      when new_to_minutes < new_from_minutes then new_to_minutes + 1440
      else new_to_minutes
    end
  );

  select
    existing.id,
    existing.date,
    existing.time_from,
    existing.time_to
  into overlapping_day
  from public.timelog_days existing
  cross join lateral (
    select
      split_part(existing.time_from, ':', 1)::integer as from_hour,
      split_part(existing.time_from, ':', 2)::integer as from_minute,
      split_part(existing.time_to, ':', 1)::integer as to_hour,
      split_part(existing.time_to, ':', 2)::integer as to_minute
  ) existing_time
  cross join lateral (
    select
      existing_time.from_hour * 60 + existing_time.from_minute as from_minutes,
      existing_time.to_hour * 60 + existing_time.to_minute as to_minutes
  ) existing_minutes
  cross join lateral (
    select
      existing.date::timestamp + make_interval(mins => existing_minutes.from_minutes) as starts_at,
      existing.date::timestamp + make_interval(
        mins => case
          when existing_minutes.to_minutes < existing_minutes.from_minutes then existing_minutes.to_minutes + 1440
          else existing_minutes.to_minutes
        end
      ) as ends_at
  ) existing_interval
  where existing.timelog_id = new.timelog_id
    and existing.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and existing.time_from is not null
    and existing.time_to is not null
    and existing.time_from ~ '^\d{1,2}:\d{2}$'
    and existing.time_to ~ '^\d{1,2}:\d{2}$'
    and existing_time.from_hour between 0 and 23
    and existing_time.from_minute between 0 and 59
    and existing_time.to_hour between 0 and 23
    and existing_time.to_minute between 0 and 59
    and existing_interval.starts_at < new_end
    and new_start < existing_interval.ends_at
  limit 1;

  if found then
    raise exception 'Timelog day overlaps with existing entry %. % %-%',
      overlapping_day.id,
      overlapping_day.date,
      overlapping_day.time_from,
      overlapping_day.time_to;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_overlapping_timelog_days on public.timelog_days;

create trigger trg_prevent_overlapping_timelog_days
before insert or update on public.timelog_days
for each row
execute function public.prevent_overlapping_timelog_days();
