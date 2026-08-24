-- Find source timelogs for assigned event rows that are missing a timelog
-- but have a matching approved PowerApps document.

with missing as (
  select
    e.id as event_id,
    e.name as event_name,
    e.job_number,
    e.date_from,
    e.date_to,
    ea.profile_id,
    p.first_name || ' ' || p.last_name as person_name,
    regexp_replace(
      translate(lower(p.first_name || p.last_name), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
      '[^a-z0-9]+',
      '',
      'g'
    ) as person_token,
    regexp_replace(
      translate(lower(e.name), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
      '[^a-z0-9]+',
      '',
      'g'
    ) as event_token,
    regexp_replace(
      translate(lower(coalesce(e.job_number, '')), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
      '[^a-z0-9]+',
      '',
      'g'
    ) as job_token,
    extract(day from e.date_from)::int as event_day,
    extract(month from e.date_from)::int as event_month
  from public.events e
  join public.event_assignments ea on ea.event_id = e.id
  join public.profiles p on p.id = ea.profile_id
  left join public.timelogs t
    on t.event_id = e.id
   and t.contractor_id = ea.profile_id
  where t.id is null
),
docs as (
  select
    d.*,
    regexp_replace(
      translate(
        lower(coalesce(d.supplier_name, '') || ' ' || coalesce(d.document_name, '') || ' ' || coalesce(d.comment, '')),
        'áčďéěíňóřšťúůýž',
        'acdeeinorstuuyz'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ) as doc_token,
    regexp_replace(
      translate(lower(coalesce(d.job_number, '')), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
      '[^a-z0-9]+',
      '',
      'g'
    ) as doc_job_token,
    regexp_replace(
      translate(lower(coalesce(d.comment, '')), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
      '[^a-z0-9]+',
      '',
      'g'
    ) as comment_token
  from public.invoice_approval_documents d
  where d.approval_status = 'approved'
),
matches as (
  select
    m.*,
    d.id as document_id,
    d.document_name,
    d.invoice_number,
    d.comment
  from missing m
  join docs d
    on d.doc_job_token = m.job_token
   and d.doc_token like '%' || m.person_token || '%'
   and (
     d.comment ~* (
       '(^|[^0-9])0?'
       || m.event_day
       || '\.\s*0?'
       || m.event_month
       || '(\.|[^0-9]|$)'
     )
     or d.comment_token like '%' || m.event_token || '%'
   )
),
source_timelogs as (
  select
    m.*,
    t.id as source_timelog_id,
    t.event_id as source_event_id,
    source_event.name as source_event_name,
    td.id as source_day_id,
    td.date as source_day_date,
    td.time_from as source_time_from,
    td.time_to as source_time_to,
    td.day_type as source_day_type
  from matches m
  left join public.timelogs t
    on t.contractor_id = m.profile_id
   and t.note ilike '%' || m.document_name || '%'
  left join public.events source_event on source_event.id = t.event_id
  left join public.timelog_days td
    on td.timelog_id = t.id
   and td.date between m.date_from and m.date_to
)
select
  event_id,
  event_name,
  job_number,
  date_from,
  person_name,
  document_name,
  source_timelog_id,
  source_event_id,
  source_event_name,
  source_day_date,
  source_time_from,
  source_time_to,
  source_day_type
from source_timelogs
order by
  date_from,
  job_number,
  event_name,
  person_name,
  document_name,
  source_timelog_id;
