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
