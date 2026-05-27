alter table public.candidates
  add column if not exists tally_submission_id text,
  add column if not exists tally_respondent_id text,
  add column if not exists submitted_at timestamptz,
  add column if not exists is_adult boolean,
  add column if not exists has_ico boolean,
  add column if not exists has_driving_license boolean,
  add column if not exists can_drive_van boolean,
  add column if not exists has_event_experience boolean,
  add column if not exists utm_source text,
  add column if not exists utm_content text,
  add column if not exists raw_payload jsonb;

create unique index if not exists candidates_tally_submission_id_key
  on public.candidates (tally_submission_id);

create index if not exists candidates_submitted_at_idx
  on public.candidates (submitted_at desc);

create index if not exists candidates_stage_submitted_at_idx
  on public.candidates (stage, submitted_at desc);
