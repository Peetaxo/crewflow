alter table public.candidates
  add column if not exists cal_booking_uid text,
  add column if not exists cal_booking_status text,
  add column if not exists cal_event_type text,
  add column if not exists cal_raw_payload jsonb;

create index if not exists candidates_cal_booking_uid_idx
  on public.candidates (cal_booking_uid);

create index if not exists candidates_cal_booking_status_idx
  on public.candidates (cal_booking_status);
