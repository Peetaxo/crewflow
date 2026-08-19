alter table public.timelogs
  add column if not exists crew_confirmation_snapshot jsonb;

comment on column public.timelogs.crew_confirmation_snapshot is
  'Snapshot of the timelog before CH/COO changes that require Crew confirmation.';
