-- The foundation suite creates otherwise impossible protected states as DBA.
-- Temporarily disable only the new lifecycle guards for those fixture writes;
-- the original suite's final ROLLBACK restores every trigger. Its original
-- membership/read/RLS tests remain unchanged. shared-shift-rounds.sql separately
-- tests real caller denial with all lifecycle guards enabled.
\set ON_ERROR_STOP on
begin;
alter table public.timelogs disable trigger a_shared_shift_timelog_write;
alter table public.timelog_days disable trigger a_shared_shift_day_write;
\ir shared-shift-workflows.sql
