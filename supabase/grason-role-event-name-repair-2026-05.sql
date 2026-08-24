begin;

-- Repair May 2026 Grason imports where the scraper captured the role label
-- (Ridic B, Dekorater/ka) instead of the actual shift/action title.

-- 8. 5. was already present as a proper event; move the imported crew there.
update public.events
set
  time_from = '14:00',
  time_to = '17:00',
  crew_needed = greatest(coalesce(crew_needed, 0), 1),
  crew_filled = greatest(coalesce(crew_filled, 0), 1),
  show_day_types = true,
  day_types = coalesce(day_types, '{}'::jsonb) || jsonb_build_object('2026-05-08', 'provoz'),
  updated_at = now()
where id = '74bc72f4-9a20-4ea6-a052-a25038fce78c';

update public.event_assignments
set event_id = '74bc72f4-9a20-4ea6-a052-a25038fce78c'
where event_id = 'b76c564b-070e-4520-af93-04af424e3727';

update public.grason_event_confirmations
set
  event_id = '74bc72f4-9a20-4ea6-a052-a25038fce78c',
  source_key = '2026-05-08|Riegrovy sady - Úklid / JTI001',
  source_title = 'Riegrovy sady - Úklid / JTI001',
  event_name = 'Riegrovy sady - Úklid',
  job_number = 'JTI001',
  phase = 'provoz',
  raw_payload = coalesce(raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'sourceTitle', 'Riegrovy sady - Úklid / JTI001',
      'eventName', 'Riegrovy sady - Úklid',
      'jobNumber', 'JTI001',
      'phase', 'provoz',
      'repairedFromRoleTitle', true
    ),
  updated_at = now()
where event_id = 'b76c564b-070e-4520-af93-04af424e3727';

delete from public.events
where id = 'b76c564b-070e-4520-af93-04af424e3727';

-- 11. 5. and 15. 5. were matched to the right event, but the confirmation
-- metadata still carried the generic role title.
update public.grason_event_confirmations
set
  source_key = shift_date || '|Riegrovy sady - Úklid / JTI001',
  source_title = 'Riegrovy sady - Úklid / JTI001',
  event_name = 'Riegrovy sady - Úklid',
  job_number = 'JTI001',
  phase = 'provoz',
  raw_payload = coalesce(raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'sourceTitle', 'Riegrovy sady - Úklid / JTI001',
      'eventName', 'Riegrovy sady - Úklid',
      'jobNumber', 'JTI001',
      'phase', 'provoz',
      'repairedFromRoleTitle', true
    ),
  updated_at = now()
where event_id in (
  'ac203d6f-d1e2-4556-a5bf-f2f86c4de4af',
  'ea17de99-d370-49e0-a1d5-8cc63c513e40'
)
and source_title = 'Dekoratér/ka';

-- 16. 5. was already present as Koncert Rene Dang; move the imported driver
-- confirmations and crew assignments into that event.
update public.events
set
  time_from = '15:00',
  time_to = '07:00',
  date_to = date '2026-05-17',
  crew_needed = greatest(coalesce(crew_needed, 0), 2),
  crew_filled = greatest(coalesce(crew_filled, 0), 2),
  show_day_types = true,
  day_types = coalesce(day_types, '{}'::jsonb)
    || jsonb_build_object('2026-05-16', 'provoz', '2026-05-17', 'provoz'),
  updated_at = now()
where id = 'a1340f4f-2019-49f1-a3d3-739b2896cd4d';

update public.event_assignments
set event_id = 'a1340f4f-2019-49f1-a3d3-739b2896cd4d'
where event_id = '08f55ed4-c37b-4187-a2f3-3390a11c49ea';

update public.grason_event_confirmations
set
  event_id = 'a1340f4f-2019-49f1-a3d3-739b2896cd4d',
  source_key = '2026-05-16|Koncert Rene Dang (paušál) / JTI001',
  source_title = 'Koncert Rene Dang (paušál) / JTI001',
  event_name = 'Koncert Rene Dang (paušál)',
  job_number = 'JTI001',
  phase = 'provoz',
  raw_payload = coalesce(raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'sourceTitle', 'Koncert Rene Dang (paušál) / JTI001',
      'eventName', 'Koncert Rene Dang (paušál)',
      'jobNumber', 'JTI001',
      'phase', 'provoz',
      'repairedFromRoleTitle', true
    ),
  updated_at = now()
where event_id = '08f55ed4-c37b-4187-a2f3-3390a11c49ea';

delete from public.events
where id = '08f55ed4-c37b-4187-a2f3-3390a11c49ea';

-- Straight renames where the generic event represents one known Grason row.
with event_repairs(event_id, new_name, new_job_number, shift_date, new_phase, time_from, time_to, source_title) as (
  values
    ('9bc08f0e-ebb8-4c10-a4f7-9100e1de4f65'::uuid, 'Riegrovy sady - Úklid', 'JTI001', '2026-05-18', 'provoz', '14:00', '17:00', 'Riegrovy sady - Úklid / JTI001'),
    ('a7d0045b-8357-4699-bf12-9970f7a62621'::uuid, 'ORL065 | nakládka', 'ORL065', '2026-05-20', 'provoz', '15:00', '18:00', 'ORL065 | nakládka'),
    ('89f5ec64-18b2-488d-9f21-64359727c09e'::uuid, 'ORL065 | Nadace Most', 'ORL065', '2026-05-21', 'provoz', '06:30', '18:00', 'ORL065 | Nadace Most'),
    ('6d0594fd-c2bc-4662-b58a-42e4b6717f8b'::uuid, 'Instal Pivní slavnosti Třebíč', 'JTI001', '2026-05-22', 'instal', '07:30', '16:00', 'Instal Pivní slavnosti Třebíč / JTI001'),
    ('a29ba913-0425-4067-854c-9f7add665b9d'::uuid, 'SpartaFest (čas - bude upřesněno)', 'JTI001', '2026-05-23', 'provoz', '09:00', '00:30', 'SpartaFest (čas - bude upřesněno) / JTI001'),
    ('f75cb1b1-9100-4d0f-ad0d-a7f6ab621cd7'::uuid, 'Deinstal Pivní slavnosti Třebíč', 'JTI001', '2026-05-24', 'deinstal', '01:00', '06:00', 'Deinstal Pivní slavnosti Třebíč / JTI001'),
    ('97aac1dd-fd19-445f-8c51-79348b356a51'::uuid, 'Riegrovy sady - Úklid', 'JTI001', '2026-05-25', 'provoz', '14:00', '17:00', 'Riegrovy sady - Úklid / JTI001'),
    ('e704e494-244b-4bf1-b382-35fd4abfa211'::uuid, 'Třídění věcí ze skladu', 'ROH013', '2026-05-29', 'provoz', '09:30', '15:00', 'Třídění věcí ze skladu / ROH013')
)
update public.events as events
set
  name = event_repairs.new_name,
  job_number = event_repairs.new_job_number,
  time_from = event_repairs.time_from,
  time_to = event_repairs.time_to,
  show_day_types = true,
  day_types = coalesce(events.day_types, '{}'::jsonb)
    || jsonb_build_object(event_repairs.shift_date, event_repairs.new_phase),
  updated_at = now()
from event_repairs
where events.id = event_repairs.event_id;

with event_repairs(event_id, new_name, new_job_number, shift_date, new_phase, source_title) as (
  values
    ('9bc08f0e-ebb8-4c10-a4f7-9100e1de4f65'::uuid, 'Riegrovy sady - Úklid', 'JTI001', '2026-05-18', 'provoz', 'Riegrovy sady - Úklid / JTI001'),
    ('a7d0045b-8357-4699-bf12-9970f7a62621'::uuid, 'ORL065 | nakládka', 'ORL065', '2026-05-20', 'provoz', 'ORL065 | nakládka'),
    ('89f5ec64-18b2-488d-9f21-64359727c09e'::uuid, 'ORL065 | Nadace Most', 'ORL065', '2026-05-21', 'provoz', 'ORL065 | Nadace Most'),
    ('6d0594fd-c2bc-4662-b58a-42e4b6717f8b'::uuid, 'Instal Pivní slavnosti Třebíč', 'JTI001', '2026-05-22', 'instal', 'Instal Pivní slavnosti Třebíč / JTI001'),
    ('a29ba913-0425-4067-854c-9f7add665b9d'::uuid, 'SpartaFest (čas - bude upřesněno)', 'JTI001', '2026-05-23', 'provoz', 'SpartaFest (čas - bude upřesněno) / JTI001'),
    ('f75cb1b1-9100-4d0f-ad0d-a7f6ab621cd7'::uuid, 'Deinstal Pivní slavnosti Třebíč', 'JTI001', '2026-05-24', 'deinstal', 'Deinstal Pivní slavnosti Třebíč / JTI001'),
    ('97aac1dd-fd19-445f-8c51-79348b356a51'::uuid, 'Riegrovy sady - Úklid', 'JTI001', '2026-05-25', 'provoz', 'Riegrovy sady - Úklid / JTI001'),
    ('e704e494-244b-4bf1-b382-35fd4abfa211'::uuid, 'Třídění věcí ze skladu', 'ROH013', '2026-05-29', 'provoz', 'Třídění věcí ze skladu / ROH013')
)
update public.grason_event_confirmations as confirmations
set
  source_key = event_repairs.shift_date || '|' || event_repairs.source_title,
  source_title = event_repairs.source_title,
  event_name = event_repairs.new_name,
  job_number = event_repairs.new_job_number,
  phase = event_repairs.new_phase,
  raw_payload = coalesce(confirmations.raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'sourceTitle', event_repairs.source_title,
      'eventName', event_repairs.new_name,
      'jobNumber', event_repairs.new_job_number,
      'phase', event_repairs.new_phase,
      'repairedFromRoleTitle', true
    ),
  updated_at = now()
from event_repairs
where confirmations.event_id = event_repairs.event_id;

-- 22. 5. had two separate Dekorater/ka rows in Grason, but the first import
-- collapsed them into one event. Keep Jan Dubsky on SpartaFest and split Vit
-- Kratochvil into a separate Riegrovy sady event.
update public.events
set
  name = 'SpartaFest (čas - bude upřesněno)',
  job_number = 'JTI001',
  time_from = '09:00',
  time_to = '00:30',
  crew_needed = 1,
  crew_filled = 1,
  show_day_types = true,
  day_types = coalesce(day_types, '{}'::jsonb) || jsonb_build_object('2026-05-22', 'provoz'),
  updated_at = now()
where id = '8dddbcb4-b508-4a58-9a23-5e8520ae28b3';

update public.grason_event_confirmations
set
  source_key = '2026-05-22|SpartaFest (čas - bude upřesněno) / JTI001',
  source_title = 'SpartaFest (čas - bude upřesněno) / JTI001',
  event_name = 'SpartaFest (čas - bude upřesněno)',
  job_number = 'JTI001',
  phase = 'provoz',
  raw_payload = coalesce(raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'sourceTitle', 'SpartaFest (čas - bude upřesněno) / JTI001',
      'eventName', 'SpartaFest (čas - bude upřesněno)',
      'jobNumber', 'JTI001',
      'phase', 'provoz',
      'repairedFromRoleTitle', true
    ),
  updated_at = now()
where event_id = '8dddbcb4-b508-4a58-9a23-5e8520ae28b3'
  and confirmed_name = 'Jan Dubský';

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
  day_types
)
values (
  'c7e8a7c7-2e25-42ed-ae09-9e91d5b49d85',
  'Riegrovy sady - Úklid',
  'JTI001',
  'NEXT LEVEL',
  date '2026-05-22',
  date '2026-05-22',
  '14:00',
  '17:00',
  '',
  1,
  1,
  'past'::event_status,
  'Oprava importu Grasonu: původně sloučeno pod Dekoratér/ka.',
  true,
  jsonb_build_object('2026-05-22', 'provoz')
);

update public.event_assignments
set event_id = 'c7e8a7c7-2e25-42ed-ae09-9e91d5b49d85'
where event_assignments.event_id = '8dddbcb4-b508-4a58-9a23-5e8520ae28b3'
  and event_assignments.profile_id = 'c44b4d05-739d-48cd-90f6-f4152b090cce';

update public.grason_event_confirmations
set
  event_id = 'c7e8a7c7-2e25-42ed-ae09-9e91d5b49d85',
  source_key = '2026-05-22|Riegrovy sady - Úklid / JTI001',
  source_title = 'Riegrovy sady - Úklid / JTI001',
  event_name = 'Riegrovy sady - Úklid',
  job_number = 'JTI001',
  phase = 'provoz',
  raw_payload = coalesce(raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'sourceTitle', 'Riegrovy sady - Úklid / JTI001',
      'eventName', 'Riegrovy sady - Úklid',
      'jobNumber', 'JTI001',
      'phase', 'provoz',
      'repairedFromRoleTitle', true
    ),
  updated_at = now()
where grason_event_confirmations.event_id = '8dddbcb4-b508-4a58-9a23-5e8520ae28b3'
  and grason_event_confirmations.confirmed_name = 'Vít Kratochvíl';

commit;
