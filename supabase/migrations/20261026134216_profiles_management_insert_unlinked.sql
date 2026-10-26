-- Management creates crew records before an Auth account is invited or bound.
-- This INSERT permission cannot bind an Auth account to the new profile.
create policy "CrewHead and COO can insert unlinked profiles"
on public.profiles
for insert
to authenticated
with check (
  user_id is null
  and (
    public.has_role((select auth.uid()), 'crewhead'::public.app_role)
    or public.has_role((select auth.uid()), 'coo'::public.app_role)
  )
);
