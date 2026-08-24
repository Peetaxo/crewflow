-- Backfill draft timelogs for crew assignments imported from Grason that do
-- not have a real timelog row yet.
--
-- This makes assigned crew behave like normal app assignments: the crew member
-- appears with a timelog row immediately. Exact PowerApps invoice/comment times
-- can still update or approve the draft later.

begin;

with missing_assignments as materialized (
  select
    gen_random_uuid() as timelog_id,
    assignments.event_id,
    assignments.profile_id as contractor_id,
    events.date_from::date as date_from,
    coalesce(events.date_to, events.date_from)::date as date_to,
    events.time_from,
    events.time_to,
    events.day_types
  from public.event_assignments as assignments
  join public.events as events
    on events.id = assignments.event_id
  where events.date_from is not null
    and not exists (
      select 1
      from public.timelogs as existing_timelog
      where existing_timelog.event_id = assignments.event_id
        and existing_timelog.contractor_id = assignments.profile_id
    )
),
inserted_timelogs as (
  insert into public.timelogs (
    id,
    event_id,
    contractor_id,
    km,
    note,
    status,
    created_at,
    updated_at
  )
  select
    timelog_id,
    event_id,
    contractor_id,
    0,
    '',
    'draft'::timelog_status,
    now(),
    now()
  from missing_assignments
  returning id, event_id, contractor_id
),
grason_day_sources as (
  select distinct on (missing_assignments.timelog_id, confirmations.shift_date::date)
    missing_assignments.timelog_id,
    confirmations.shift_date::date as work_date,
    coalesce(missing_assignments.time_from, '08:00') as time_from,
    coalesce(missing_assignments.time_to, '17:00') as time_to,
    confirmations.phase::timelog_type as day_type
  from missing_assignments
  join public.grason_event_confirmations as confirmations
    on confirmations.event_id = missing_assignments.event_id
   and confirmations.profile_id = missing_assignments.contractor_id
   and confirmations.shift_date::date between missing_assignments.date_from and missing_assignments.date_to
  where confirmations.phase in ('instal', 'provoz', 'deinstal')
  order by
    missing_assignments.timelog_id,
    confirmations.shift_date::date,
    confirmations.source_key
),
fallback_day_sources as (
  select
    missing_assignments.timelog_id,
    generated_days.work_date::date as work_date,
    coalesce(missing_assignments.time_from, '08:00') as time_from,
    coalesce(missing_assignments.time_to, '17:00') as time_to,
    coalesce(
      nullif(missing_assignments.day_types->>generated_days.work_date::text, ''),
      'instal'
    )::timelog_type as day_type
  from missing_assignments
  cross join lateral generate_series(
    missing_assignments.date_from,
    missing_assignments.date_to,
    interval '1 day'
  ) as generated_days(work_date)
  where not exists (
    select 1
    from grason_day_sources
    where grason_day_sources.timelog_id = missing_assignments.timelog_id
  )
),
timelog_day_sources as (
  select * from grason_day_sources
  union all
  select * from fallback_day_sources
),
inserted_timelog_days as (
  insert into public.timelog_days (
    id,
    timelog_id,
    date,
    time_from,
    time_to,
    day_type,
    created_at
  )
  select
    gen_random_uuid(),
    timelog_id,
    work_date,
    time_from,
    time_to,
    day_type,
    now()
  from timelog_day_sources
  returning id, timelog_id
),
affected_events as (
  select distinct event_id
  from missing_assignments
),
assignment_counts as (
  select
    affected_events.event_id,
    count(distinct assigned_profiles.profile_id)::integer as assigned_count
  from affected_events
  left join lateral (
    select timelogs.contractor_id as profile_id
    from public.timelogs as timelogs
    where timelogs.event_id = affected_events.event_id
    union
    select assignments.profile_id
    from public.event_assignments as assignments
    where assignments.event_id = affected_events.event_id
  ) as assigned_profiles on true
  group by affected_events.event_id
),
updated_events as (
  update public.events as events
  set
    crew_filled = assignment_counts.assigned_count,
    updated_at = now()
  from assignment_counts
  where events.id = assignment_counts.event_id
  returning events.id
)
select
  (select count(*) from missing_assignments) as missing_assignment_count,
  (select count(*) from inserted_timelogs) as inserted_timelog_count,
  (select count(*) from inserted_timelog_days) as inserted_timelog_day_count,
  (select count(*) from grason_day_sources) as grason_day_source_count,
  (select count(*) from fallback_day_sources) as fallback_day_source_count,
  (select count(*) from updated_events) as updated_event_count;

commit;
