const JOB_NUMBER_PATTERN = /\b(?:ORL\s*\d{3}|JTI\s*\d{3}|JT\s*\d{3,4}|EIT\s*\d{3}|BTL\s*\d{3}|KCG\s*\d{3}|AKV\s*\d{3}|BNZ\s*\d{3}|\d{3}ADM)\b/i;
const PHASE_WORDS_PATTERN = /\b(instalace|instal|provoz|deinstalace|deinstal|nakladka|nakládka|stavba|priprava|příprava|vyroba|výroba)\b/gi;

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeJobNumber(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();
}

function cleanEventName(value) {
  return String(value ?? '')
    .replace(/\s*[|]\s*/g, ' ')
    .replace(/\s+\/\s+/g, ' ')
    .replace(/\s+\/\s*$/g, '')
    .replace(/\s+-\s*$/g, '')
    .replace(/^\s*[-|/]\s*/g, '')
    .replace(PHASE_WORDS_PATTERN, '')
    .replace(/\s+-\s*$/g, '')
    .replace(/-\s+-/g, '-')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([-/|])\s*$/g, '')
    .trim();
}

function inferPhase(title) {
  const normalized = normalizeText(title);
  if (/\bdeinstal/.test(normalized)) return 'deinstal';
  if (/\b(instal|nakladka|stavba|priprava|vyroba)/.test(normalized)) return 'instal';
  return 'provoz';
}

function sqlLiteral(value) {
  if (value == null || value === '') return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextLiteral(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function sqlJsonbLiteral(value) {
  return `${sqlTextLiteral(JSON.stringify(value))}::jsonb`;
}

function buildPeopleDirectory(users = []) {
  return new Map(
    users
      .filter((user) => user?.name)
      .map((user) => [normalizeText(user.name), user]),
  );
}

function personWithDirectoryData(name, occurrenceCount, peopleByName) {
  const user = peopleByName.get(normalizeText(name));
  return {
    name,
    occurrenceCount,
    ...(user?.email ? { email: user.email } : {}),
    ...(user?.phone ? { phone: user.phone } : {}),
  };
}

export function parseGrasonShiftTitle(title) {
  const sourceTitle = String(title ?? '').trim();
  const jobMatch = sourceTitle.match(JOB_NUMBER_PATTERN);
  const jobNumber = normalizeJobNumber(jobMatch?.[0] ?? '');
  const phase = inferPhase(sourceTitle);
  const withoutJob = jobMatch ? sourceTitle.replace(jobMatch[0], ' ') : sourceTitle;
  const cleanedName = cleanEventName(withoutJob);

  return {
    sourceTitle,
    jobNumber,
    eventName: cleanedName || sourceTitle,
    phase,
  };
}

export function buildGrasonImportRows(occurrences, options = {}) {
  const sourceMonth = options.sourceMonth
    ?? occurrences.find((item) => item?.date)?.date.slice(0, 7)
    ?? '';
  const peopleByName = buildPeopleDirectory(options.users ?? []);
  const groups = new Map();

  occurrences.forEach((occurrence) => {
    if (!occurrence?.date || !occurrence?.shiftTitle || !occurrence?.name) return;

    const sourceKey = `${occurrence.date}|${occurrence.shiftTitle}`;
    const group = groups.get(sourceKey) ?? {
      sourceKey,
      sourceMonth,
      date: occurrence.date,
      sourceTitle: occurrence.shiftTitle,
      people: new Map(),
    };
    group.people.set(occurrence.name, (group.people.get(occurrence.name) ?? 0) + 1);
    groups.set(sourceKey, group);
  });

  return [...groups.values()]
    .sort((left, right) => `${left.date}|${left.sourceTitle}`.localeCompare(`${right.date}|${right.sourceTitle}`, 'cs'))
    .map((group) => {
      const parsed = parseGrasonShiftTitle(group.sourceTitle);
      const confirmedPeople = [...group.people.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'cs'))
        .map(([name, occurrenceCount]) => personWithDirectoryData(name, occurrenceCount, peopleByName));

      return {
        sourceKey: group.sourceKey,
        sourceMonth: group.sourceMonth,
        date: group.date,
        sourceTitle: group.sourceTitle,
        eventName: parsed.eventName,
        jobNumber: parsed.jobNumber,
        phase: parsed.phase,
        confirmedCount: confirmedPeople.length,
        confirmedPeople,
      };
    });
}

export function compareGrasonRowsToExistingEvents(rows, existingEvents = []) {
  const normalizedEvents = existingEvents.map((event) => ({
    id: event.id,
    name: event.name,
    job: event.job ?? event.job_number ?? '',
    startDate: event.startDate ?? event.date_from ?? '',
    endDate: event.endDate ?? event.date_to ?? event.startDate ?? event.date_from ?? '',
  }));

  const exactMatches = [];
  const fuzzyMatches = [];
  const unmatched = [];

  rows.forEach((row) => {
    const candidates = normalizedEvents.filter((event) => (
      event.startDate <= row.date && event.endDate >= row.date
    ));
    const jobMatches = candidates.filter((event) => (
      row.jobNumber && normalizeJobNumber(event.job) === row.jobNumber
    ));
    const nameMatches = candidates.filter((event) => {
      const eventName = normalizeText(event.name).replace(/[^a-z0-9]+/g, '');
      const rowName = normalizeText(row.eventName).replace(/[^a-z0-9]+/g, '');
      return eventName && rowName && (eventName.includes(rowName) || rowName.includes(eventName));
    });
    const jobAndNameMatches = jobMatches.filter((event) => nameMatches.includes(event));

    if (jobAndNameMatches.length > 0 || jobMatches.length > 0) {
      exactMatches.push({ row, matches: jobAndNameMatches.length > 0 ? jobAndNameMatches : jobMatches });
      return;
    }
    if (nameMatches.length > 0) {
      fuzzyMatches.push({ row, matches: nameMatches });
      return;
    }
    unmatched.push(row);
  });

  return { exactMatches, fuzzyMatches, unmatched };
}

export function buildGrasonImportReport({ rows, occurrences = [], existingEvents = [] }) {
  const comparison = compareGrasonRowsToExistingEvents(rows, existingEvents);
  const mayEvents = existingEvents.filter((event) => String(event.startDate ?? event.date_from ?? '').startsWith('2026-05'));
  const throughMay14 = mayEvents.filter((event) => String(event.startDate ?? event.date_from ?? '') <= '2026-05-14');

  return {
    source: 'grason',
    sourceMonth: rows[0]?.sourceMonth ?? '2026-05',
    grasonConfirmationOccurrences: occurrences.length,
    grasonEventRows: rows.length,
    existingMayEventRows: mayEvents.length,
    existingThroughMay14Rows: throughMay14.length,
    matchedByJobOrJobAndName: comparison.exactMatches.length,
    fuzzyNameOnlyMatches: comparison.fuzzyMatches.length,
    unmatchedRows: comparison.unmatched.length,
    unmatched: comparison.unmatched.map((row) => ({
      date: row.date,
      sourceTitle: row.sourceTitle,
      eventName: row.eventName,
      jobNumber: row.jobNumber,
      phase: row.phase,
      confirmedCount: row.confirmedCount,
    })),
    fuzzy: comparison.fuzzyMatches.map(({ row, matches }) => ({
      date: row.date,
      sourceTitle: row.sourceTitle,
      eventName: row.eventName,
      jobNumber: row.jobNumber,
      matches: matches.map((event) => ({
        id: event.id,
        name: event.name,
        job: event.job,
        startDate: event.startDate,
        endDate: event.endDate,
      })),
    })),
  };
}

export function buildGrasonEventsImportSql(rows) {
  if (rows.length === 0) {
    return '-- No Grason rows to import.\n';
  }
  const sourceMonth = rows[0]?.sourceMonth ?? '';

  const eventRows = rows.map((row) => [
    row.sourceKey,
    row.sourceMonth,
    row.date,
    row.sourceTitle,
    row.eventName,
    row.jobNumber,
    row.phase,
    row.confirmedCount,
    row.confirmedPeople,
  ]);

  const valuesSql = eventRows
    .map(([sourceKey, sourceMonth, date, sourceTitle, eventName, jobNumber, phase, confirmedCount, confirmedPeople]) => (
      `  (${sqlTextLiteral(sourceKey)}, ${sqlTextLiteral(sourceMonth)}, ${sqlTextLiteral(date)}, ${sqlTextLiteral(sourceTitle)}, ${sqlTextLiteral(eventName)}, ${sqlLiteral(jobNumber)}, ${sqlTextLiteral(phase)}, ${confirmedCount}, ${sqlJsonbLiteral(confirmedPeople)})`
    ))
    .join(',\n');

  return `-- Generated Grason May import.
-- Imports events, confirmed Grason metadata, and matched people as event crew assignments.
-- Does not create timelogs, timelog days, invoices, or paid statuses.

begin;

create table if not exists public.grason_event_confirmations (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'grason',
  source_month text not null,
  source_key text not null,
  event_id uuid null references public.events(id) on delete set null,
  profile_id uuid null references public.profiles(id) on delete set null,
  shift_date date not null,
  source_title text not null,
  event_name text not null,
  job_number text null,
  phase text not null,
  confirmed_name text not null,
  source_occurrence_count integer not null default 1,
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_grason_event_confirmations_source_key_name
  on public.grason_event_confirmations(source, source_key, confirmed_name);

create index if not exists idx_grason_event_confirmations_event_id
  on public.grason_event_confirmations(event_id);

create index if not exists idx_grason_event_confirmations_profile_id
  on public.grason_event_confirmations(profile_id);

alter table public.grason_event_confirmations enable row level security;

drop policy if exists "authenticated users can read grason confirmations"
  on public.grason_event_confirmations;

create policy "authenticated users can read grason confirmations"
  on public.grason_event_confirmations
  for select to authenticated
  using (true);

grant select on public.grason_event_confirmations to authenticated;

with incoming_events (
  source_key,
  source_month,
  shift_date,
  source_title,
  event_name,
  job_number,
  phase,
  confirmed_count,
  confirmed_people
) as (
values
${valuesSql}
), matched_events as (
  select
    incoming_events.source_key,
    (
      select events.id
      from public.events as events
      where events.date_from = incoming_events.shift_date::date
        and lower(events.name) = lower(incoming_events.event_name)
        and regexp_replace(upper(coalesce(events.job_number, '')), '\\s+', '', 'g')
          = regexp_replace(upper(coalesce(incoming_events.job_number, '')), '\\s+', '', 'g')
        and coalesce(events.day_types->>incoming_events.shift_date, incoming_events.phase) = incoming_events.phase
      order by events.created_at
      limit 1
    ) as event_id
  from incoming_events
), updated_events as (
  update public.events as target set
    crew_needed = greatest(coalesce(target.crew_needed, 0), incoming_events.confirmed_count),
    show_day_types = true,
    day_types = coalesce(target.day_types, '{}'::jsonb) || jsonb_build_object(incoming_events.shift_date, incoming_events.phase),
    updated_at = now()
  from incoming_events
  join matched_events on matched_events.source_key = incoming_events.source_key
  where target.id = matched_events.event_id
  returning incoming_events.source_key, target.id as event_id
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
    description,
    show_day_types,
    day_types
  )
  select
    incoming_events.event_name,
    incoming_events.job_number,
    'NEXT LEVEL',
    incoming_events.shift_date::date,
    incoming_events.shift_date::date,
    null,
    null,
    '',
    incoming_events.confirmed_count,
    0,
    (
      case
        when incoming_events.shift_date::date < current_date then 'past'
        else 'upcoming'
      end
    )::event_status,
    null,
    true,
    jsonb_build_object(incoming_events.shift_date, incoming_events.phase)
  from incoming_events
  join matched_events on matched_events.source_key = incoming_events.source_key
  where matched_events.event_id is null
  returning id, name, job_number, date_from, day_types
), inserted_event_ids as (
  select
    incoming_events.source_key,
    inserted_events.id as event_id
  from incoming_events
  join inserted_events
    on inserted_events.date_from = incoming_events.shift_date::date
   and lower(inserted_events.name) = lower(incoming_events.event_name)
   and regexp_replace(upper(coalesce(inserted_events.job_number, '')), '\\s+', '', 'g')
     = regexp_replace(upper(coalesce(incoming_events.job_number, '')), '\\s+', '', 'g')
   and coalesce(inserted_events.day_types->>incoming_events.shift_date, incoming_events.phase) = incoming_events.phase
), upserted_event_ids as (
  select source_key, event_id
  from updated_events
  union all
  select source_key, event_id
  from inserted_event_ids
), incoming_confirmations as (
  select
    incoming_events.source_month,
    incoming_events.source_key,
    upserted_event_ids.event_id,
    incoming_events.shift_date,
    incoming_events.source_title,
    incoming_events.event_name,
    incoming_events.job_number,
    incoming_events.phase,
    person->>'name' as confirmed_name,
    coalesce((person->>'occurrenceCount')::integer, 1) as source_occurrence_count,
    jsonb_build_object(
      'sourceTitle', incoming_events.source_title,
      'eventName', incoming_events.event_name,
      'jobNumber', incoming_events.job_number,
      'phase', incoming_events.phase,
      'confirmedPerson', person
    ) as raw_payload,
    person
  from incoming_events
  join upserted_event_ids on upserted_event_ids.source_key = incoming_events.source_key
  cross join lateral jsonb_array_elements(incoming_events.confirmed_people) as person
), resolved_confirmations as (
  select
    incoming_confirmations.*,
    profile_match.id as profile_id
  from incoming_confirmations
  left join lateral (
    select profiles.id
    from public.profiles as profiles
    where (
        incoming_confirmations.person ? 'email'
        and incoming_confirmations.person->>'email' <> ''
        and profiles.email is not null
        and lower(profiles.email) = lower(incoming_confirmations.person->>'email')
      )
      or (
        incoming_confirmations.person ? 'phone'
        and incoming_confirmations.person->>'phone' <> ''
        and profiles.phone is not null
        and regexp_replace(profiles.phone, '\\D', '', 'g') = regexp_replace(incoming_confirmations.person->>'phone', '\\D', '', 'g')
      )
      or lower(concat_ws(' ', profiles.first_name, profiles.last_name)) = lower(incoming_confirmations.confirmed_name)
    order by
      case
        when incoming_confirmations.person ? 'email'
          and profiles.email is not null
          and lower(profiles.email) = lower(incoming_confirmations.person->>'email') then 1
        when incoming_confirmations.person ? 'phone'
          and profiles.phone is not null
          and regexp_replace(profiles.phone, '\\D', '', 'g') = regexp_replace(incoming_confirmations.person->>'phone', '\\D', '', 'g') then 2
        else 3
      end,
      profiles.created_at
    limit 1
  ) as profile_match on true
), inserted_event_assignments as (
  insert into public.event_assignments (event_id, profile_id)
  select distinct
    resolved_confirmations.event_id,
    resolved_confirmations.profile_id
  from resolved_confirmations
  where resolved_confirmations.profile_id is not null
    and not exists (
      select 1
      from public.event_assignments as existing_assignment
      where existing_assignment.event_id = resolved_confirmations.event_id
        and existing_assignment.profile_id = resolved_confirmations.profile_id
    )
  returning event_id, profile_id
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
  source_month,
  source_key,
  event_id,
  profile_id,
  shift_date::date,
  source_title,
  event_name,
  job_number,
  phase,
  confirmed_name,
  source_occurrence_count,
  raw_payload
from resolved_confirmations
cross join (select count(*) as inserted_assignment_count from inserted_event_assignments) as assignment_insert_checkpoint
on conflict (source, source_key, confirmed_name) do update set
  event_id = excluded.event_id,
  profile_id = excluded.profile_id,
  source_month = excluded.source_month,
  shift_date = excluded.shift_date,
  source_title = excluded.source_title,
  event_name = excluded.event_name,
  job_number = excluded.job_number,
  phase = excluded.phase,
  source_occurrence_count = excluded.source_occurrence_count,
  raw_payload = excluded.raw_payload,
  updated_at = now();

update public.events as target
set
  crew_filled = coalesce(assignment_counts.assigned_count, 0),
  description = nullif(
    btrim(
      regexp_replace(
        coalesce(target.description, ''),
        E'(^|\\n)Grason import: [^\\n]* \\\\| potvrzeni: [^\\n]*(\\n|$)',
        E'\\1',
        'g'
      ),
      E'\\n'
    ),
    ''
  ),
  updated_at = now()
from (
  select
    confirmations.event_id,
    count(distinct assignments.profile_id)::integer as assigned_count
  from public.grason_event_confirmations as confirmations
  left join public.event_assignments as assignments
    on assignments.event_id = confirmations.event_id
  where confirmations.source = 'grason'
    and confirmations.source_month = ${sqlTextLiteral(sourceMonth)}
    and confirmations.event_id is not null
  group by confirmations.event_id
) as assignment_counts
where target.id = assignment_counts.event_id;

commit;
`;
}

export function buildGrasonSafetyCheckSql(sourceMonth = '2026-05') {
  return `select
  '${sourceMonth}' as source_month,
  count(*) as imported_confirmations,
  count(distinct source_key) as imported_event_rows,
  count(*) filter (where event_id is null) as confirmations_without_event,
  count(*) filter (where profile_id is null) as confirmations_without_profile
from public.grason_event_confirmations
where source = 'grason'
  and source_month = '${sourceMonth.replaceAll("'", "''")}';

select
  shift_date,
  source_title,
  event_name,
  job_number,
  phase,
  count(*) as confirmed_people,
  count(*) filter (where profile_id is null) as missing_profiles
from public.grason_event_confirmations
where source = 'grason'
  and source_month = '${sourceMonth.replaceAll("'", "''")}'
group by shift_date, source_title, event_name, job_number, phase
order by shift_date, source_title;
`;
}
