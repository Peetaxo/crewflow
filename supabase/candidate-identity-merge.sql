begin;

create unique index if not exists candidates_cal_booking_uid_key
  on public.candidates (cal_booking_uid)
  where cal_booking_uid is not null;

create index if not exists candidates_name_lookup_idx
  on public.candidates (lower(trim(first_name)), lower(trim(last_name)));

with candidate_pairs as (
  select
    tally.id as tally_id,
    cal.id as cal_id
  from public.candidates tally
  join public.candidates cal
    on lower(trim(tally.first_name)) = lower(trim(cal.first_name))
    and lower(trim(tally.last_name)) = lower(trim(cal.last_name))
    and tally.id <> cal.id
  where tally.tally_submission_id is not null
    and tally.cal_booking_uid is null
    and cal.cal_booking_uid is not null
    and cal.tally_submission_id is null
    and not exists (
      select 1
      from public.candidates other
      where lower(trim(other.first_name)) = lower(trim(tally.first_name))
        and lower(trim(other.last_name)) = lower(trim(tally.last_name))
        and other.id not in (tally.id, cal.id)
    )
),
merged as (
  update public.candidates tally
  set
    email = coalesce(nullif(cal.email, ''), tally.email),
    phone = coalesce(nullif(tally.phone, ''), cal.phone),
    cal_booking_url = cal.cal_booking_url,
    cal_booking_uid = cal.cal_booking_uid,
    cal_booking_status = cal.cal_booking_status,
    cal_event_type = cal.cal_event_type,
    interview_date = cal.interview_date,
    stage = case
      when cal.stage in ('interview_scheduled', 'decision', 'accepted', 'rejected') then cal.stage
      else tally.stage
    end,
    cal_raw_payload = cal.cal_raw_payload,
    updated_at = now()
  from candidate_pairs pairs
  join public.candidates cal
    on cal.id = pairs.cal_id
  where tally.id = pairs.tally_id
  returning pairs.cal_id
)
delete from public.candidates candidate
using merged
where candidate.id = merged.cal_id;

commit;
