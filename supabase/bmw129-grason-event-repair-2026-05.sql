-- Doplnuje chybejici Grason akci BMW129 z květnoveho screenshotu.
-- Bez teto akce PowerApps dokument "Tucek - 20260041.pdf" nema v NODU cil pro timelog.

with target_profile as (
  select id
  from public.profiles
  where first_name = 'Ladislav'
    and last_name = 'Tuček'
  limit 1
),
inserted_event as (
  insert into public.events (
    id,
    name,
    job_number,
    client_name,
    date_from,
    date_to,
    time_from,
    time_to,
    city,
    crew_needed,
    crew_filled,
    status,
    description,
    show_day_types,
    day_types,
    phase_times,
    phase_schedules
  )
  select
    'e5e56528-9fa6-4b3b-8b55-ffdd11c022e1'::uuid,
    'Převoz a zapojení loga',
    'BMW129',
    'NEXT LEVEL',
    '2026-05-25'::date,
    '2026-05-26'::date,
    '09:00'::time,
    '14:00'::time,
    '',
    1,
    1,
    'past',
    'Doplněno podle Grason screenshotu 2026-05: Řidič B, Ladislav Tuček.',
    true,
    '{"2026-05-25":"provoz","2026-05-26":"provoz"}'::jsonb,
    '{"provoz":{"from":"09:00","to":"14:00"}}'::jsonb,
    '{"provoz":[{"id":"bmw129-2026-05-25-day","dates":["2026-05-25"],"from":"09:00","to":"14:00"},{"id":"bmw129-2026-05-25-night","dates":["2026-05-25"],"from":"23:00","to":"04:00"},{"id":"bmw129-2026-05-26-day","dates":["2026-05-26"],"from":"09:00","to":"14:00"}]}'::jsonb
  where not exists (
    select 1
    from public.events
    where job_number = 'BMW129'
      and date_from = '2026-05-25'
      and name = 'Převoz a zapojení loga'
  )
  returning id
),
target_event as (
  select id from inserted_event
  union all
  select id
  from public.events
  where job_number = 'BMW129'
    and date_from = '2026-05-25'
    and name = 'Převoz a zapojení loga'
  limit 1
)
insert into public.event_assignments (event_id, profile_id)
select target_event.id, target_profile.id
from target_event
cross join target_profile
where not exists (
  select 1
  from public.event_assignments
  where event_id = target_event.id
    and profile_id = target_profile.id
);

with target_profile as (
  select id
  from public.profiles
  where first_name = 'Ladislav'
    and last_name = 'Tuček'
  limit 1
),
target_event as (
  select id
  from public.events
  where job_number = 'BMW129'
    and date_from = '2026-05-25'
    and name = 'Převoz a zapojení loga'
  limit 1
)
insert into public.grason_event_confirmations (
  source,
  source_month,
  source_key,
  event_id,
  profile_id,
  shift_date,
  source_title,
  event_name,
  job_number,
  phase,
  confirmed_name,
  source_occurrence_count,
  raw_payload
)
select
  'grason',
  '2026-05',
  'manual-2026-05-bmw129-logo-driver-b',
  target_event.id,
  target_profile.id,
  '2026-05-25'::date,
  'Řidič B',
  'Převoz a zapojení loga',
  'BMW129',
  'provoz',
  'Ladislav Tuček',
  1,
  '{"source":"manual_repair","reason":"missing_from_may_grason_import","powerapps_document":"Tucek - 20260041.pdf"}'::jsonb
from target_event
cross join target_profile
where not exists (
  select 1
  from public.grason_event_confirmations
  where source = 'grason'
    and source_key = 'manual-2026-05-bmw129-logo-driver-b'
    and confirmed_name = 'Ladislav Tuček'
);
