begin;

drop policy if exists "Crew can update own draft, rejected, and correction timelogs"
on public.timelogs;

drop policy if exists "CrewHead can create timelog proposals for Crew confirmation"
on public.timelogs;

do $$
declare
  v_policy_count integer;
begin
  select pg_catalog.count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.timelogs'::pg_catalog.regclass;

  if v_policy_count <> 11 or exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.timelogs'::pg_catalog.regclass
      and policy.polname in (
        'Crew can update own draft, rejected, and correction timelogs',
        'CrewHead can create timelog proposals for Crew confirmation'
      )
  ) then
    raise exception 'timelog workflow policy cleanup left an unexpected catalog';
  end if;
end
$$;

commit;
