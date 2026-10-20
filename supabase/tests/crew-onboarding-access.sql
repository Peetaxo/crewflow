-- Run only against the disposable local onboarding pilot. The transaction always rolls back.
\set ON_ERROR_STOP on
begin;
do $$
begin
  if pg_catalog.to_regclass('crew_onboarding_private.invitations') is null then
    raise exception 'crew onboarding invitation table is missing';
  end if;
  if not exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='crew_onboarding_private' and c.relname='invitations' and c.relrowsecurity) then
    raise exception 'private invitations must enable RLS';
  end if;
  if pg_catalog.has_schema_privilege('anon','crew_onboarding_private','USAGE') or pg_catalog.has_schema_privilege('authenticated','crew_onboarding_private','USAGE') then
    raise exception 'private schema accessible to client roles';
  end if;
  if pg_catalog.has_table_privilege('anon','crew_onboarding_private.invitations','SELECT') or pg_catalog.has_table_privilege('authenticated','crew_onboarding_private.invitations','SELECT') then
    raise exception 'private invitations readable by client roles';
  end if;
  if not pg_catalog.has_schema_privilege('postgres','crew_onboarding_private','USAGE')
     or not pg_catalog.has_table_privilege('postgres','crew_onboarding_private.invitations','SELECT,UPDATE')
     or not pg_catalog.has_table_privilege('postgres','crew_onboarding_private.trusted_intents','SELECT,DELETE') then
    raise exception 'existing Auth trigger owner cannot read and consume trusted intent';
  end if;
end $$;
do $$
declare f record; r text;
begin
  for f in select p.oid,p.proname,p.proconfig from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'crew_onboarding_%' loop
    if not ('search_path=""'=any(f.proconfig)) then raise exception 'RPC search path must be empty: %',f.proname; end if;
    foreach r in array array['anon','authenticated'] loop
      if pg_catalog.has_function_privilege(r,f.oid,'EXECUTE') then raise exception 'client can execute %',f.proname; end if;
    end loop;
    if not pg_catalog.has_function_privilege('service_role',f.oid,'EXECUTE') then raise exception 'service role cannot execute %',f.proname; end if;
  end loop;
end $$;
set local role anon;
do $$ begin
  begin perform public.crew_onboarding_preview(repeat('a',64)); raise exception 'anon could call preview'; exception when insufficient_privilege then null; end;
  begin perform 1 from crew_onboarding_private.invitations; raise exception 'anon could read invitations'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform public.crew_onboarding_claim(repeat('a',64)); raise exception 'authenticated could claim'; exception when insufficient_privilege then null; end;
  begin perform 1 from crew_onboarding_private.invitations; raise exception 'authenticated could read invitations'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Exercise immutable identity and trigger atomicity without GoTrue or persisted fixtures.
do $$
declare v jsonb; h text; uid uuid; pid uuid; n integer;
begin
  v := public.crew_onboarding_create('sql-access@crewflow-onboarding.test','SQL','Fixture',null,null);
  if v ? 'error' then raise exception 'SQL fixture invitation not created'; end if;
  pid := (v->>'profileId')::uuid;
  h := encode(extensions.digest(v->>'token','sha256'),'hex');
  select reserved_user_id into uid from crew_onboarding_private.invitations where token_hash=h;
  begin
    update crew_onboarding_private.invitations set email='changed@crewflow-onboarding.test' where token_hash=h;
    raise exception 'invitation email was mutable';
  exception when check_violation then null; end;
  begin
    insert into auth.users(id,email,raw_user_meta_data) values(uid,'sql-access@crewflow-onboarding.test',jsonb_build_object('profile_id',pid));
    raise exception 'untrusted metadata bound reserved profile';
  exception when check_violation then null; end;
  if exists(select 1 from auth.users where id=uid) or exists(select 1 from public.profiles where id=pid and user_id is not null) then raise exception 'failed trigger did not roll back'; end if;
  v := public.crew_onboarding_claim(h);
  if v ? 'error' then raise exception 'SQL fixture claim failed'; end if;
  insert into auth.users(id,email) values(uid,'sql-access@crewflow-onboarding.test');
  if public.crew_onboarding_verify(h,uid)->>'status' is distinct from 'active' then raise exception 'trusted intent did not atomically bind'; end if;
  select count(*) into n from public.profiles where user_id=uid;
  if n<>1 then raise exception 'trigger created duplicate profile'; end if;
end $$;
rollback;
