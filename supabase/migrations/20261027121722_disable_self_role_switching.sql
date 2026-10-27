-- Retain the old signature for older clients, but never allow self-service role writes.
-- Administrative role provisioning continues through its existing authorized path.
create or replace function public.set_current_user_role(p_role public.app_role)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Self-service role changes are disabled.' using errcode = '42501';
end;
$$;

revoke all on function public.set_current_user_role(public.app_role)
from public, anon, authenticated, service_role;

-- The earlier onboarding migration was applied only to the local pilot.
-- Deploy its reviewed, unlinked-only management permission idempotently here.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'profiles' and policyname = 'CrewHead and COO can insert unlinked profiles') then
    create policy "CrewHead and COO can insert unlinked profiles"
    on public.profiles for insert to authenticated
    with check (
      user_id is null
      and (
        public.has_role((select auth.uid()), 'crewhead'::public.app_role)
        or public.has_role((select auth.uid()), 'coo'::public.app_role)
      )
    );
  end if;
end;
$$;
