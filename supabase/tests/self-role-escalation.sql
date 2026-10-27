-- Transactional regression; no role or account data is changed.
\set ON_ERROR_STOP on
begin;
do $$
declare f record; r text;
begin
  select p.* into strict f from pg_proc p
  where p.oid='public.set_current_user_role(public.app_role)'::regprocedure;
  if f.prosecdef then raise exception 'self role endpoint is still SECURITY DEFINER'; end if;
  if not ('search_path=""'=any(f.proconfig)) then raise exception 'unsafe role endpoint search path'; end if;
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(r,f.oid,'EXECUTE') then
      raise exception 'self role endpoint executable by %', r;
    end if;
  end loop;
  if exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC execute still granted'; end if;
end $$;
create temporary table role_snapshot on commit drop as select * from public.user_roles;
set local role anon;
do $$ begin
  begin perform public.set_current_user_role('coo'); raise exception 'anon role escalation allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ begin
  begin perform public.set_current_user_role('coo'); raise exception 'authenticated role escalation allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Even an accidental future re-grant cannot make the obsolete function mutate roles.
do $$ begin
  begin perform public.set_current_user_role('coo'); raise exception 'role endpoint still mutates roles';
  exception when insufficient_privilege then null; end;
  if exists((table public.user_roles except table role_snapshot)
    union all (table role_snapshot except table public.user_roles)) then raise exception 'role rows changed'; end if;
end $$;
rollback;
