drop policy if exists "CrewHead can update pending CH timelogs" on public.timelogs;
drop policy if exists "CrewHead can submit and update CH timelogs" on public.timelogs;

create policy "CrewHead can submit and update CH timelogs"
on public.timelogs
for update
using (
  has_role(auth.uid(), 'crewhead'::app_role)
  and status in ('draft'::timelog_status, 'pending_ch'::timelog_status)
)
with check (
  has_role(auth.uid(), 'crewhead'::app_role)
  and status in ('pending_ch'::timelog_status, 'pending_coo'::timelog_status, 'rejected'::timelog_status)
);
