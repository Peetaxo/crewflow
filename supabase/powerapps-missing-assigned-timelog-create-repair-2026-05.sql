-- Create missing approved PowerApps timelogs for assigned event rows where the
-- document/event/person/time match is clear and there is no overlapping timelog.

with proposals as (
  select
    gen_random_uuid() as timelog_id,
    *
  from (
    values
      (
        '33bcf650-8f92-49ab-981e-d0d9421ea19f'::uuid,
        '4cdb0844-88db-4ba1-aa97-b9368eaefc0e'::uuid,
        '2026-04-24'::date,
        '09:00'::text,
        '14:00'::text,
        'instal'::timelog_type,
        'PowerApps: Rebros-2026-013.pdf'::text
      ),
      (
        'c06e08bd-2354-492b-8f1d-570080f9a1d1'::uuid,
        '4cdb0844-88db-4ba1-aa97-b9368eaefc0e'::uuid,
        '2026-04-26'::date,
        '23:00'::text,
        '04:00'::text,
        'deinstal'::timelog_type,
        'PowerApps: Rebros-2026-013.pdf'::text
      ),
      (
        'ad81d9bf-0e6e-467b-95a8-79f3ef59d566'::uuid,
        '4cdb0844-88db-4ba1-aa97-b9368eaefc0e'::uuid,
        '2026-05-12'::date,
        '22:30'::text,
        '03:30'::text,
        'deinstal'::timelog_type,
        'PowerApps: Rebros-2026-015.pdf'::text
      ),
      (
        'd4e82e37-b528-4a8a-8c0a-c705eac9154c'::uuid,
        '58de7385-56e1-4c22-b610-ab6be7933ca3'::uuid,
        '2026-05-14'::date,
        '07:00'::text,
        '22:00'::text,
        'instal'::timelog_type,
        'PowerApps: Rebros-2026-016.pdf'::text
      )
  ) as value(event_id, contractor_id, work_date, time_from, time_to, day_type, note)
),
proposal_intervals as (
  select
    *,
    (
      extract(epoch from work_date::timestamp) / 60
      + split_part(time_from, ':', 1)::int * 60
      + split_part(time_from, ':', 2)::int
    ) as start_minute,
    (
      extract(epoch from work_date::timestamp) / 60
      + split_part(time_to, ':', 1)::int * 60
      + split_part(time_to, ':', 2)::int
      + case
        when time_to <= time_from then 1440
        else 0
      end
    ) as end_minute
  from proposals
),
existing_intervals as (
  select
    t.id as timelog_id,
    t.event_id,
    t.contractor_id,
    td.date as work_date,
    (
      extract(epoch from td.date::timestamp) / 60
      + split_part(td.time_from, ':', 1)::int * 60
      + split_part(td.time_from, ':', 2)::int
    ) as start_minute,
    (
      extract(epoch from td.date::timestamp) / 60
      + split_part(td.time_to, ':', 1)::int * 60
      + split_part(td.time_to, ':', 2)::int
      + case
        when td.time_to <= td.time_from then 1440
        else 0
      end
    ) as end_minute
  from public.timelogs t
  join public.timelog_days td on td.timelog_id = t.id
),
safe_proposals as (
  select p.*
  from proposal_intervals p
  where not exists (
    select 1
    from public.timelogs existing
    where existing.event_id = p.event_id
      and existing.contractor_id = p.contractor_id
  )
    and not exists (
      select 1
      from existing_intervals existing
      where existing.contractor_id = p.contractor_id
        and existing.event_id <> p.event_id
        and p.start_minute < existing.end_minute
        and existing.start_minute < p.end_minute
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
    submitted_at,
    approved_at,
    created_at,
    updated_at
  )
  select
    timelog_id,
    event_id,
    contractor_id,
    0,
    note,
    'approved'::timelog_status,
    now(),
    now(),
    now(),
    now()
  from safe_proposals
  returning id
),
inserted_days as (
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
  from safe_proposals
  returning id
)
select
  (select count(*) from proposals) as proposed_count,
  (select count(*) from safe_proposals) as safe_count,
  (select count(*) from inserted_timelogs) as inserted_timelog_count,
  (select count(*) from inserted_days) as inserted_day_count,
  (
    select json_agg(json_build_object(
      'event_id', event_id,
      'contractor_id', contractor_id,
      'date', work_date,
      'time_from', time_from,
      'time_to', time_to,
      'note', note
    ) order by work_date, note)
    from proposal_intervals
    where timelog_id not in (select timelog_id from safe_proposals)
  ) as skipped_proposals;
