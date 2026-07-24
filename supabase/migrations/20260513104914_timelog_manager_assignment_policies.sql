drop policy if exists "CrewHead and COO can create assignment timelogs" on public.timelogs;

create policy "CrewHead and COO can create assignment timelogs"
on public.timelogs
for insert
with check (
  has_role(auth.uid(), 'crewhead'::app_role)
  or has_role(auth.uid(), 'coo'::app_role)
);

drop policy if exists "CrewHead and COO can create assignment timelog days" on public.timelog_days;

create policy "CrewHead and COO can create assignment timelog days"
on public.timelog_days
for insert
with check (
  has_role(auth.uid(), 'crewhead'::app_role)
  or has_role(auth.uid(), 'coo'::app_role)
);;
