-- Audit assigned crew rows where the event detail can show an approved
-- PowerApps document for the person, but the assigned event has no timelog.

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
)
select
  m.event_id,
  m.event_name,
  m.job_number,
  m.date_from,
  m.person_name,
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
order by
  m.date_from,
  m.job_number,
  m.event_name,
  m.person_name,
  d.document_name;
