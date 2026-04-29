import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const shifts = [
  ['2026-04-16', '20:00', '23:00', 'Ploom PopUp - Westfield Chodov', 'JT1001', ['Jan Dubský', 'Ondřej Novotný']],
  ['2026-04-16', '20:00', '23:00', 'Ploom PopUp - Metropole Zličín', 'JT1001', ['Marek Rebros', 'Jaroslav Macháč']],
  ['2026-04-16', '20:00', '23:00', 'Ploom PopUp - Westfield Černý Most', 'JT1001', ['Tomáš Macášek', 'Vilém Cibulka']],
  ['2026-04-20', '20:00', '23:00', 'Ploom PopUp - Westfield Chodov', 'JT1001', ['Jan Dubský', 'Ondřej Novotný']],
  ['2026-04-20', '20:00', '23:00', 'Ploom PopUp - Metropole Zličín', 'JT1001', ['Marek Rebros', 'Jaroslav Macháč']],
  ['2026-04-20', '20:00', '23:00', 'Ploom PopUp - Westfield Černý Most', 'JT1001', ['Tomáš Macášek', 'Jakub Škorec']],
  ['2026-04-22', '08:00', '15:00', 'Převoz tisku do Estila', null, ['Michal Balner', 'Ondřej Šafařík']],
  ['2026-04-22', '08:30', '13:00', 'Otevření Riegrovy sady', 'JT1001', ['Jakub Škorec', 'Albert Cibulka', 'Vilém Cibulka', 'Jan Ledvina']],
  ['2026-04-23', '08:00', '12:00', 'hosteska / ČS Beroun', 'ORL001', ['Klára Staňková']],
  ['2026-04-23', '08:00', '15:00', 'Převoz tisku do Estila', null, ['Michal Balner', 'Ondřej Šafařík']],
  ['2026-04-24', '09:00', '14:00', 'Mercedes Benz Prague Fashion Week', 'JT1001', ['Marek Rebros', 'Jaroslav Macháč']],
  ['2026-04-25', '11:00', '20:00', 'Otevření Riegrovy sady', 'JT1001', ['Jan Dubský', 'Ondřej Novotný']],
  ['2026-04-26', '20:00', '23:00', 'Mercedes Benz Prague Fashion Week', 'JT1001', ['Marek Rebros']],
  ['2026-04-26', '23:00', '01:00', 'Mercedes Benz Prague Fashion Week', 'JT1001', ['Jaroslav Macháč', 'Marek Rebros']],
  ['2026-04-29', '09:00', '17:00', 'EIT018', 'EIT018', ['Michal Balner', 'Ondřej Šafařík']],
  ['2026-04-30', '09:00', '17:00', 'EIT018', 'EIT018', ['Michal Balner', 'Ondřej Šafařík']],
  ['2026-04-30', '09:00', '14:00', 'Mladí ladí Jazz', 'JT1001', ['Marek Rebros', 'Jaroslav Macháč']],
  ['2026-04-30', '13:00', '18:00', 'RS - Čarodějnice a 1. Máj', 'JTI001', ['Albert Cibulka']],
  ['2026-04-30', '22:00', '01:00', 'Mladí ladí Jazz', 'JT1001', ['Marek Rebros', 'Jaroslav Macháč']],
];

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const normalized = ((value % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function durationHours(timeFrom, timeTo) {
  let minutes = timeToMinutes(timeTo) - timeToMinutes(timeFrom);
  if (minutes < 0) minutes += 1440;
  return minutes / 60;
}

function ensureMinimumFiveHours(timeFrom, timeTo) {
  return durationHours(timeFrom, timeTo) < 5
    ? minutesToTime(timeToMinutes(timeFrom) + 5 * 60)
    : timeTo;
}

function sqlLiteral(value) {
  if (value == null) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function splitName(name) {
  const parts = name.trim().split(/\s+/);
  return [parts.slice(0, -1).join(' ') || parts[0], parts.length > 1 ? parts.at(-1) : ''];
}

const normalizedShifts = shifts.map(([date, timeFrom, timeTo, name, job, crew]) => [
  date,
  timeFrom,
  ensureMinimumFiveHours(timeFrom, timeTo),
  name,
  job,
  crew,
  timeTo,
]);

const eventRows = normalizedShifts.map(([date, timeFrom, timeTo, name, job], index) => (
  `  (${index + 1}, ${sqlLiteral(name)}, ${sqlLiteral(job)}, ${sqlLiteral(date)}, ${sqlLiteral(timeFrom)}, ${sqlLiteral(timeTo)}, ${normalizedShifts[index][5].length})`
));

const assignmentRows = normalizedShifts.flatMap((shift, shiftIndex) => (
  shift[5].map((crewName) => {
    const [firstName, lastName] = splitName(crewName);
    return `  (${shiftIndex + 1}, ${sqlLiteral(firstName)}, ${sqlLiteral(lastName)})`;
  })
));

const standaloneMissingProfileRows = Array.from(new Set(
  normalizedShifts.flatMap((shift) => shift[5]),
)).map((crewName) => {
  const [firstName, lastName] = splitName(crewName);
  return `  (${sqlLiteral(firstName)}, ${sqlLiteral(lastName)})`;
});

const sql = `-- Generated from GrasonPlan screenshots with green confirmation marks only.
-- Timelog status is intentionally draft: Grason confirmation means staffing confirmation, not Crewflow approval.
-- RS - Carodejnice corrected by user to 2026-04-30 13:00-18:00, job JTI001.
-- Minimum billing/import duration: shifts shorter than 5h have time_to adjusted to 5h after time_from.
-- Klara Stankova is included by name only; make sure her profile exists before running this import.

with incoming_events (shift_key, name, job_number, date_from, time_from, time_to, crew_needed) as (
values
${eventRows.join(',\n')}
), upserted_events as (
  update public.events as target set
    crew_needed = incoming_events.crew_needed,
    crew_filled = incoming_events.crew_needed,
    status = (
      case
        when incoming_events.date_from::date < current_date then 'past'
        else 'upcoming'
      end
    )::event_status,
    updated_at = now()
  from incoming_events
  where target.name = incoming_events.name
    and coalesce(target.job_number, '') = coalesce(incoming_events.job_number, '')
    and target.date_from = incoming_events.date_from::date
    and target.time_from = incoming_events.time_from
    and target.time_to = incoming_events.time_to
  returning
    incoming_events.shift_key,
    target.id
), inserted_events as (
  insert into public.events (
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
    show_day_types,
    day_types
  )
  select
    incoming_events.name,
    incoming_events.job_number,
    'NEXT LEVEL',
    incoming_events.date_from::date,
    incoming_events.date_from::date,
    incoming_events.time_from,
    incoming_events.time_to,
    '',
    incoming_events.crew_needed,
    incoming_events.crew_needed,
    (
      case
        when incoming_events.date_from::date < current_date then 'past'
        else 'upcoming'
      end
    )::event_status,
    true,
    jsonb_build_object(incoming_events.date_from, 'provoz')
  from incoming_events
  where not exists (
    select 1
    from public.events as target
    where target.name = incoming_events.name
      and coalesce(target.job_number, '') = coalesce(incoming_events.job_number, '')
      and target.date_from = incoming_events.date_from::date
      and target.time_from = incoming_events.time_from
      and target.time_to = incoming_events.time_to
  )
  returning id
), event_ids as (
  select incoming_events.shift_key, events.id
  from incoming_events
  join public.events as events
    on events.name = incoming_events.name
   and coalesce(events.job_number, '') = coalesce(incoming_events.job_number, '')
   and events.date_from = incoming_events.date_from::date
   and events.time_from = incoming_events.time_from
   and events.time_to = incoming_events.time_to
), incoming_assignments (shift_key, first_name, last_name) as (
values
${assignmentRows.join(',\n')}
), resolved_assignments as (
  select
    event_ids.id as event_id,
    profiles.id as profile_id,
    incoming_events.date_from::date as date_from,
    incoming_events.time_from as time_from,
    incoming_events.time_to as time_to
  from incoming_assignments
  join event_ids on event_ids.shift_key = incoming_assignments.shift_key
  join incoming_events on incoming_events.shift_key = incoming_assignments.shift_key
  join public.profiles as profiles
    on lower(profiles.first_name) = lower(incoming_assignments.first_name)
   and lower(profiles.last_name) = lower(incoming_assignments.last_name)
), missing_profiles as (
  select incoming_assignments.first_name, incoming_assignments.last_name
  from incoming_assignments
  left join public.profiles as profiles
    on lower(profiles.first_name) = lower(incoming_assignments.first_name)
   and lower(profiles.last_name) = lower(incoming_assignments.last_name)
  where profiles.id is null
), inserted_timelogs as (
  insert into public.timelogs (event_id, contractor_id, km, note, status)
  select
    resolved_assignments.event_id,
    resolved_assignments.profile_id,
    0,
    '',
    'draft'
  from resolved_assignments
  where not exists (
    select 1
    from public.timelogs as existing
    where existing.event_id = resolved_assignments.event_id
      and existing.contractor_id = resolved_assignments.profile_id
  )
  returning id, event_id, contractor_id
)
insert into public.timelog_days (timelog_id, date, time_from, time_to, day_type)
select
  timelogs.id,
  resolved_assignments.date_from,
  resolved_assignments.time_from,
  resolved_assignments.time_to,
  'provoz'
from resolved_assignments
join public.timelogs as timelogs
  on timelogs.event_id = resolved_assignments.event_id
 and timelogs.contractor_id = resolved_assignments.profile_id
where not exists (
  select 1
  from public.timelog_days as existing_day
  where existing_day.timelog_id = timelogs.id
    and existing_day.date = resolved_assignments.date_from
);
`;

const eventsOnlySql = `with incoming_events (shift_key, name, job_number, date_from, time_from, time_to, crew_needed) as (
values
${eventRows.join(',\n')}
), updated_events as (
  update public.events as target set
    crew_needed = incoming_events.crew_needed,
    crew_filled = incoming_events.crew_needed,
    status = (
      case
        when incoming_events.date_from::date < current_date then 'past'
        else 'upcoming'
      end
    )::event_status,
    updated_at = now()
  from incoming_events
  where target.name = incoming_events.name
    and coalesce(target.job_number, '') = coalesce(incoming_events.job_number, '')
    and target.date_from = incoming_events.date_from::date
    and target.time_from = incoming_events.time_from
    and target.time_to = incoming_events.time_to
  returning target.id
)
insert into public.events (
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
  show_day_types,
  day_types
)
select
  incoming_events.name,
  incoming_events.job_number,
  'NEXT LEVEL',
  incoming_events.date_from::date,
  incoming_events.date_from::date,
  incoming_events.time_from,
  incoming_events.time_to,
  '',
  incoming_events.crew_needed,
  incoming_events.crew_needed,
  (
    case
      when incoming_events.date_from::date < current_date then 'past'
      else 'upcoming'
    end
  )::event_status,
  true,
  jsonb_build_object(incoming_events.date_from, 'provoz')
from incoming_events
where not exists (
  select 1
  from public.events as target
  where target.name = incoming_events.name
    and coalesce(target.job_number, '') = coalesce(incoming_events.job_number, '')
    and target.date_from = incoming_events.date_from::date
    and target.time_from = incoming_events.time_from
    and target.time_to = incoming_events.time_to
);
`;

const timelogsOnlySql = `with incoming_events (shift_key, name, job_number, date_from, time_from, time_to, crew_needed) as (
values
${eventRows.join(',\n')}
), event_ids as (
  select incoming_events.shift_key, events.id
  from incoming_events
  join public.events as events
    on events.name = incoming_events.name
   and coalesce(events.job_number, '') = coalesce(incoming_events.job_number, '')
   and events.date_from = incoming_events.date_from::date
   and events.time_from = incoming_events.time_from
   and events.time_to = incoming_events.time_to
), incoming_assignments (shift_key, first_name, last_name) as (
values
${assignmentRows.join(',\n')}
), resolved_assignments as (
  select
    event_ids.id as event_id,
    profiles.id as profile_id,
    incoming_events.date_from::date as date_from,
    incoming_events.time_from as time_from,
    incoming_events.time_to as time_to
  from incoming_assignments
  join event_ids on event_ids.shift_key = incoming_assignments.shift_key
  join incoming_events on incoming_events.shift_key = incoming_assignments.shift_key
  join public.profiles as profiles
    on lower(profiles.first_name) = lower(incoming_assignments.first_name)
   and lower(profiles.last_name) = lower(incoming_assignments.last_name)
), inserted_timelogs as (
  insert into public.timelogs (event_id, contractor_id, km, note, status)
  select
    resolved_assignments.event_id,
    resolved_assignments.profile_id,
    0,
    '',
    'draft'
  from resolved_assignments
  where not exists (
    select 1
    from public.timelogs as existing
    where existing.event_id = resolved_assignments.event_id
      and existing.contractor_id = resolved_assignments.profile_id
  )
  returning id, event_id, contractor_id
)
insert into public.timelog_days (timelog_id, date, time_from, time_to, day_type)
select
  timelogs.id,
  resolved_assignments.date_from,
  resolved_assignments.time_from,
  resolved_assignments.time_to,
  'provoz'
from resolved_assignments
join public.timelogs as timelogs
  on timelogs.event_id = resolved_assignments.event_id
 and timelogs.contractor_id = resolved_assignments.profile_id
where not exists (
  select 1
  from public.timelog_days as existing_day
  where existing_day.timelog_id = timelogs.id
    and existing_day.date = resolved_assignments.date_from
);
`;

const safetySql = `-- Safety check: this should return zero rows. If it returns names, create those profiles and rerun.
with expected_profiles (first_name, last_name) as (
values
${standaloneMissingProfileRows.join(',\n')}
)
select expected_profiles.*
from expected_profiles
left join public.profiles as profiles
  on lower(profiles.first_name) = lower(expected_profiles.first_name)
 and lower(profiles.last_name) = lower(expected_profiles.last_name)
where profiles.id is null;
`;

const outputPath = resolve('supabase/generated/selected-events-timelogs-import.sql');
const eventsOnlyOutputPath = resolve('supabase/generated/selected-events-import.sql');
const timelogsOnlyOutputPath = resolve('supabase/generated/selected-timelogs-import.sql');
const safetyOutputPath = resolve('supabase/generated/selected-events-timelogs-safety-check.sql');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, 'utf8');
await writeFile(eventsOnlyOutputPath, eventsOnlySql, 'utf8');
await writeFile(timelogsOnlyOutputPath, timelogsOnlySql, 'utf8');
await writeFile(safetyOutputPath, safetySql, 'utf8');

console.log(JSON.stringify({
  outputPath,
  eventsOnlyOutputPath,
  timelogsOnlyOutputPath,
  safetyOutputPath,
  shiftCount: normalizedShifts.length,
  timelogCount: assignmentRows.length,
  adjustedShiftCount: normalizedShifts.filter((shift) => shift[2] !== shift[6]).length,
}, null, 2));
