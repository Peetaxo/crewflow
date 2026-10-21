-- Dedicated disposable pilot only; access/default verification never persists fixtures.
\set ON_ERROR_STOP on
begin;
do $$
declare f record; r text; v_sig text;
begin
  foreach v_sig in array array[
    'public.crew_onboarding_manual_status(uuid)',
    'public.crew_onboarding_manual_prepare(uuid,text,uuid,uuid,boolean)',
    'public.crew_onboarding_manual_capture(uuid,uuid,text)',
    'public.crew_onboarding_manual_cancel(uuid,uuid,text)'
  ] loop
    if pg_catalog.to_regprocedure(v_sig) is null then raise exception 'missing manual invitation helper'; end if;
    select p.* into f from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(v_sig);
    if not f.prosecdef or not ('search_path=""'=any(f.proconfig)) then raise exception 'unsafe helper search path or security'; end if;
    foreach r in array array['anon','authenticated'] loop
      if pg_catalog.has_function_privilege(r,f.oid,'EXECUTE') then raise exception 'client execute granted'; end if;
    end loop;
    if not pg_catalog.has_function_privilege('service_role',f.oid,'EXECUTE') then raise exception 'service execute missing'; end if;
    if exists(select 1 from pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC execute granted'; end if;
  end loop;
  if pg_catalog.has_table_privilege('service_role','crew_onboarding_private.invitations','SELECT,UPDATE') then raise exception 'private direct service access granted'; end if;
  if (select column_default from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='hourly_rate')::numeric <> 250 then raise exception 'new profile default is not 250'; end if;
end $$;
set local role anon;
do $$
begin
  begin perform public.crew_onboarding_manual_status(gen_random_uuid()); raise exception 'anon helper allowed'; exception when insufficient_privilege then null; end;
  begin perform public.crew_onboarding_manual_prepare(gen_random_uuid(),'denied@crewflow-onboarding.test',gen_random_uuid(),null,false); raise exception 'anon prepare allowed'; exception when insufficient_privilege then null; end;
  begin perform public.crew_onboarding_manual_capture(gen_random_uuid(),gen_random_uuid(),repeat('a',64)); raise exception 'anon capture allowed'; exception when insufficient_privilege then null; end;
  begin perform public.crew_onboarding_manual_cancel(gen_random_uuid(),gen_random_uuid(),repeat('a',64)); raise exception 'anon cancel allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
do $$
begin
  begin perform public.crew_onboarding_manual_status(gen_random_uuid()); raise exception 'authenticated helper allowed'; exception when insufficient_privilege then null; end;
  begin perform public.crew_onboarding_manual_prepare(gen_random_uuid(),'denied@crewflow-onboarding.test',gen_random_uuid(),null,false); raise exception 'authenticated prepare allowed'; exception when insufficient_privilege then null; end;
  begin perform public.crew_onboarding_manual_capture(gen_random_uuid(),gen_random_uuid(),repeat('a',64)); raise exception 'authenticated capture allowed'; exception when insufficient_privilege then null; end;
  begin perform public.crew_onboarding_manual_cancel(gen_random_uuid(),gen_random_uuid(),repeat('a',64)); raise exception 'authenticated cancel allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
