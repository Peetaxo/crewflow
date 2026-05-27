create or replace function public.set_current_user_role(p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'User must be authenticated to switch roles.';
  end if;

  delete from public.user_roles
  where user_id = v_user_id;

  insert into public.user_roles (user_id, role)
  values (v_user_id, p_role);
end;
$$;

revoke all on function public.set_current_user_role(public.app_role) from public;
grant execute on function public.set_current_user_role(public.app_role) to authenticated;
