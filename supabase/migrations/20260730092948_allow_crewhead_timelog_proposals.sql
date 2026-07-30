begin;

drop policy if exists "CrewHead can create timelog proposals for Crew confirmation" on public.timelogs;

create policy "CrewHead can create timelog proposals for Crew confirmation"
on public.timelogs
for insert
with check (
  public.has_role(auth.uid(), 'crewhead'::public.app_role)
  and status = 'pending_ch'::public.timelog_status
);

commit;
