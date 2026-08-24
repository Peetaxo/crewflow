-- Move/update a draft timelog that blocks a clear PowerApps match because it
-- lives on an unassigned duplicate event.

with target as (
  select
    'd59a312d-2c29-46fe-9406-1e412780b43a'::uuid as timelog_id,
    '44a7d3d8-5bb1-4ca3-92d5-0aed29c2f312'::uuid as source_event_id,
    'd4e82e37-b528-4a8a-8c0a-c705eac9154c'::uuid as target_event_id,
    '58de7385-56e1-4c22-b610-ab6be7933ca3'::uuid as contractor_id,
    '2026-05-14'::date as work_date,
    '07:00'::text as time_from,
    '22:00'::text as time_to,
    'instal'::timelog_type as day_type,
    'PowerApps: Rebros-2026-016.pdf'::text as note
),
updated_timelog as (
  update public.timelogs t
  set
    event_id = target.target_event_id,
    note = case
      when t.note ilike '%' || target.note || '%' then t.note
      when nullif(trim(t.note), '') is null then target.note
      else trim(t.note) || chr(10) || target.note
    end,
    status = 'approved'::timelog_status,
    submitted_at = coalesce(t.submitted_at, now()),
    approved_at = now(),
    updated_at = now()
  from target
  where t.id = target.timelog_id
    and t.event_id = target.source_event_id
    and t.contractor_id = target.contractor_id
    and not exists (
      select 1
      from public.event_assignments source_assignment
      where source_assignment.event_id = target.source_event_id
        and source_assignment.profile_id = target.contractor_id
    )
    and exists (
      select 1
      from public.event_assignments target_assignment
      where target_assignment.event_id = target.target_event_id
        and target_assignment.profile_id = target.contractor_id
    )
    and not exists (
      select 1
      from public.timelogs existing
      where existing.event_id = target.target_event_id
        and existing.contractor_id = target.contractor_id
        and existing.id <> target.timelog_id
    )
  returning t.id
),
updated_days as (
  update public.timelog_days td
  set
    date = target.work_date,
    time_from = target.time_from,
    time_to = target.time_to,
    day_type = target.day_type
  from target
  where td.timelog_id = target.timelog_id
  returning td.id
)
select
  (select count(*) from updated_timelog) as updated_timelog_count,
  (select count(*) from updated_days) as updated_day_count;
