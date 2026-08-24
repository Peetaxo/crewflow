-- Same audit as powerapps-missing-assigned-timelogs-audit-2026-05.sql,
-- but with the stricter UI matching rule:
-- if both the document comment and the event have a specific event name,
-- date alone is not enough.

with stop_tokens(token) as (
  values
    ('bednak'),
    ('cas'),
    ('deinstal'),
    ('deinstalace'),
    ('dekorater'),
    ('helper'),
    ('instal'),
    ('instalace'),
    ('nakladka'),
    ('pausal'),
    ('provoz'),
    ('ridic'),
    ('uklid'),
    ('upresneno')
),
missing as (
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
    exists (
      select 1
      from regexp_split_to_table(
        translate(lower(e.name), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
        '[^a-z0-9]+'
      ) as token
      where length(token) >= 4
        and token not in (select stop_tokens.token from stop_tokens)
    ) as event_has_specific_name,
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
    ) as comment_token,
    exists (
      select 1
      from regexp_split_to_table(
        translate(lower(coalesce(d.comment, '')), 'áčďéěíňóřšťúůýž', 'acdeeinorstuuyz'),
        '[^a-z0-9]+'
      ) as token
      where length(token) >= 4
        and token not in (select stop_tokens.token from stop_tokens)
    ) as document_has_specific_event_name
  from public.invoice_approval_documents d
  where d.approval_status = 'approved'
),
matches as (
  select
    m.*,
    d.document_name,
    d.invoice_number,
    d.comment,
    d.comment_token,
    d.document_has_specific_event_name,
    (
      d.comment_token <> ''
      and m.event_token <> ''
      and (
        d.comment_token like '%' || m.event_token || '%'
        or m.event_token like '%' || d.comment_token || '%'
      )
    ) as has_name_evidence
  from missing m
  join docs d
    on d.doc_job_token = m.job_token
   and d.doc_token like '%' || m.person_token || '%'
)
select
  event_id,
  event_name,
  job_number,
  date_from,
  person_name,
  document_name,
  invoice_number,
  comment
from matches
where not (
    matches.document_has_specific_event_name
    and matches.event_has_specific_name
    and not matches.has_name_evidence
  )
  and (
    matches.has_name_evidence
    or matches.comment ~* (
      '(^|[^0-9])0?'
      || matches.event_day
      || '\.\s*0?'
      || matches.event_month
      || '(\.|[^0-9]|$)'
    )
  )
order by
  date_from,
  job_number,
  event_name,
  person_name,
  document_name;
