alter table public.timelogs
  add column if not exists review_note text;

comment on column public.timelogs.review_note is
  'CH/COO review note shown to Crew during returned or corrected timelog approval workflows.';
