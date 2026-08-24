-- Repair PowerApps timelogs that were applied to duplicate placeholder events
-- instead of the Grason-imported event where the crew member is explicitly assigned.
--
-- Scope:
-- - approved PowerApps timelogs only
-- - one-day timelogs only
-- - source event has no explicit assignment for the contractor
-- - destination event has the same job/date/contractor assignment
-- - destination event does not already have that contractor's timelog
-- - only unambiguous single-destination matches are changed

with source_timelog_days as (
  select
    t.id as timelog_id,
    t.event_id as source_event_id,
    t.contractor_id,
    t.note,
    td.date,
    td.time_from,
    td.time_to,
    td.day_type,
    e.job_number,
    count(td.id) over (partition by t.id) as day_count
  from public.timelogs t
  join public.timelog_days td on td.timelog_id = t.id
  join public.events e on e.id = t.event_id
  where t.status = 'approved'
    and t.note ilike '%PowerApps:%'
),
candidate_destinations as (
  select
    std.*,
    dest.id as destination_event_id,
    count(dest.id) over (partition by std.timelog_id) as destination_count
  from source_timelog_days std
  join public.events dest
    on dest.id <> std.source_event_id
   and dest.job_number = std.job_number
   and std.date between dest.date_from and dest.date_to
  join public.event_assignments destination_assignment
    on destination_assignment.event_id = dest.id
   and destination_assignment.profile_id = std.contractor_id
  where std.day_count = 1
    and not exists (
      select 1
      from public.event_assignments source_assignment
      where source_assignment.event_id = std.source_event_id
        and source_assignment.profile_id = std.contractor_id
    )
    and not exists (
      select 1
      from public.timelogs existing
      where existing.event_id = dest.id
        and existing.contractor_id = std.contractor_id
    )
),
ranked_repairs as (
  select
    *,
    row_number() over (
      partition by
        destination_event_id,
        contractor_id,
        date,
        time_from,
        time_to,
        day_type,
        note
      order by timelog_id
    ) as duplicate_rank
  from candidate_destinations
  where destination_count = 1
),
moved_timelogs as (
  update public.timelogs t
  set
    event_id = rr.destination_event_id,
    updated_at = now()
  from ranked_repairs rr
  where t.id = rr.timelog_id
    and rr.duplicate_rank = 1
  returning t.id
),
deleted_duplicate_days as (
  delete from public.timelog_days td
  using ranked_repairs rr
  where td.timelog_id = rr.timelog_id
    and rr.duplicate_rank > 1
  returning td.id
),
deleted_duplicate_timelogs as (
  delete from public.timelogs t
  using ranked_repairs rr
  where t.id = rr.timelog_id
    and rr.duplicate_rank > 1
  returning t.id
)
select
  (select count(*) from moved_timelogs) as moved_timelog_count,
  (select count(*) from deleted_duplicate_timelogs) as deleted_duplicate_timelog_count,
  (select count(*) from deleted_duplicate_days) as deleted_duplicate_day_count;
