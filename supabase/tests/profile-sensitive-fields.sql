-- Disposable local pilot only. All synthetic identities, history, and writes roll back.
-- Execute with psql -X -v ON_ERROR_STOP=1 as local supabase_admin (SET ROLE harness only).
\set ON_ERROR_STOP on
begin;
set local role postgres;

create temporary table original_profiles on commit drop as table public.profiles;
create temporary table original_roles on commit drop as table public.user_roles;
create temporary table original_timelogs on commit drop as table public.timelogs;
create temporary table original_days on commit drop as table public.timelog_days;
create temporary table profile_safety_fixtures (
  label text primary key, uid uuid not null default gen_random_uuid(), pid uuid
) on commit drop;
insert into profile_safety_fixtures(label) values ('crew'),('foreign'),('crewhead'),('coo'),('attachment');
insert into auth.users(id,email,raw_user_meta_data)
select uid, uid::text || '@crewflow-onboarding.test', '{"role":"coo"}'::jsonb
from profile_safety_fixtures;
update profile_safety_fixtures f set pid=p.id from public.profiles p where p.user_id=f.uid;
insert into public.user_roles(user_id,role)
select uid,label::public.app_role from profile_safety_fixtures where label in ('crewhead','coo');
update public.profiles set hourly_rate=425,note='preserved-profile-history'
where id in (select pid from profile_safety_fixtures);
-- Keep a real Auth UUID without a linked profile for attempted reassignment and service attachment.
delete from public.profiles where id=(select pid from profile_safety_fixtures where label='attachment');
insert into public.profiles(email,first_name,last_name,hourly_rate,note)
values (gen_random_uuid()::text || '@crewflow-onboarding.test','Unlinked','History',510,'keep-history');
insert into profile_safety_fixtures(label,pid)
select 'activation',id from public.profiles where first_name='Unlinked' and note='keep-history'
  and id not in (select id from original_profiles);
-- A genuine work-history foreign key must survive attachment of an existing profile.
with event as (insert into public.events(name) values ('profile-safety-rollback-fixture') returning id)
insert into public.timelogs(event_id,contractor_id,note)
select event.id,f.pid,'preserved-work-history' from event,profile_safety_fixtures f where f.label='activation';
insert into public.timelog_days(timelog_id,date,time_from,time_to,note)
select id,date '2026-10-01','09:00','17:00','preserved-day-history' from public.timelogs
where contractor_id=(select pid from profile_safety_fixtures where label='activation');
create temporary table fixture_timelogs on commit drop as
select * from public.timelogs where contractor_id=(select pid from profile_safety_fixtures where label='activation');
create temporary table fixture_days on commit drop as
select * from public.timelog_days where timelog_id in (select id from fixture_timelogs);
grant select on profile_safety_fixtures to authenticated,service_role;

set local role authenticated;
do $$
declare actor uuid; profile uuid; target uuid; q text; failures text[] := '{}';
begin
  select uid,pid into strict actor,profile from profile_safety_fixtures where label='crew';
  select uid into strict target from profile_safety_fixtures where label='attachment';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  -- A forged metadata/JWT role must not override the effective database role or stored app roles.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','service_role','user_metadata',jsonb_build_object('role','coo'))::text,true);
  if current_user<>'authenticated' or public.has_role(actor,'coo') or public.has_role(actor,'crewhead') then
    raise exception 'crew fixture must execute as ordinary authenticated crew';
  end if;
  foreach q in array array[
    format('update public.profiles set hourly_rate=999 where id=%L',profile),
    format('update public.profiles set hourly_rate=null where id=%L',profile),
    format('update public.profiles set id=%L where id=%L',gen_random_uuid(),profile),
    format('update public.profiles set user_id=null where id=%L',profile),
    format('update public.profiles set user_id=%L where id=%L',target,profile),
    format('update public.profiles set phone=''must-rollback'',hourly_rate=999 where id=%L',profile)
  ] loop
    begin
      execute q;
      -- Roll back any unexpected successful write before reporting every missing boundary.
      raise sqlstate 'P9001';
    exception when insufficient_privilege then null;
      when sqlstate 'P9001' then failures:=array_append(failures,q);
    end;
  end loop;
  if cardinality(failures)>0 then raise exception 'sensitive profile writes allowed: %',failures; end if;

  -- Existing values in a broad form payload remain valid; contact email is an editable personal field.
  update public.profiles set first_name='Personal',last_name='Update',phone='+420123456789',
    email=actor::text||'-contact@crewflow-onboarding.test',bank_account='123/0100',
    billing_street='Test street',billing_city='Test city',billing_zip='10000',ico='12345678',
    hourly_rate=hourly_rate,id=id,user_id=user_id where id=profile;
  if not found or not exists(select 1 from public.profiles where id=profile and phone='+420123456789'
      and first_name='Personal' and email=actor::text||'-contact@crewflow-onboarding.test'
      and bank_account='123/0100' and hourly_rate=425 and user_id=actor) then
    raise exception 'legitimate personal update failed or protected values changed';
  end if;
  update public.profiles set phone='foreign-write' where id=(select pid from profile_safety_fixtures where label='foreign');
  if found then raise exception 'crew updated a foreign profile'; end if;
  update public.profiles set hourly_rate=999 where id=(select pid from profile_safety_fixtures where label='foreign');
  if found then raise exception 'crew changed a foreign rate'; end if;
end $$;

-- Both actual management roles can edit a crew rate and their own rate.
do $$
declare manager record; crew_profile uuid;
begin
  select pid into crew_profile from profile_safety_fixtures where label='crew';
  for manager in select * from profile_safety_fixtures where label in ('crewhead','coo') order by label loop
    perform set_config('request.jwt.claim.sub',manager.uid::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',manager.uid,'role','authenticated')::text,true);
    if not public.has_role(manager.uid,manager.label::public.app_role) then raise exception 'missing actual manager role'; end if;
    update public.profiles set hourly_rate=600 where id=crew_profile;
    if not found then raise exception '% could not edit crew rate',manager.label; end if;
    update public.profiles set hourly_rate=650 where id=manager.pid;
    if not found then raise exception '% could not edit own rate',manager.label; end if;
    begin
      update public.profiles set id=gen_random_uuid() where id=manager.pid;
      raise exception 'manager changed profile ID';
    exception when insufficient_privilege then null; end;
    begin
      update public.profiles set user_id=null where id=manager.pid;
      raise exception 'manager changed Auth binding';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;

-- A service write remains trusted even with a crew subject in the request context.
set local role service_role;
do $$
declare target uuid; profile uuid;
begin
  select uid into target from profile_safety_fixtures where label='attachment';
  select pid into profile from profile_safety_fixtures where label='activation';
  perform set_config('request.jwt.claim.sub',(select uid::text from profile_safety_fixtures where label='crew'),true);
  update public.profiles set user_id=target where id=profile;
  if not found or not exists(select 1 from public.profiles where id=profile and user_id=target and hourly_rate=510 and note='keep-history') then
    raise exception 'service attachment failed or lost existing profile data';
  end if;
  update public.profiles set user_id=null where id=profile;
end $$;
reset role;

-- Real activation RPCs plus the existing postgres-owned Auth trigger must bind this same profile.
set local role service_role;
do $$
declare v jsonb; h text; profile uuid;
begin
  select pid into profile from profile_safety_fixtures where label='activation';
  v:=public.crew_onboarding_create((select email from public.profiles where id=profile),'','',null,profile);
  if v ? 'error' then raise exception 'activation invitation failed'; end if;
  h:=encode(extensions.digest(v->>'token','sha256'),'hex');
  v:=public.crew_onboarding_claim(h);
  if v ? 'error' then raise exception 'activation claim failed'; end if;
  perform set_config('profile_safety.token_hash',h,true);
  perform set_config('profile_safety.reserved_user_id',v->>'reservedUserId',true);
  perform set_config('profile_safety.email',v->>'email',true);
end $$;
reset role;
-- GoTrue writes auth.users as its database role; only handle_new_user is SECURITY DEFINER.
set local role supabase_auth_admin;
insert into auth.users(id,email)
values(current_setting('profile_safety.reserved_user_id')::uuid,current_setting('profile_safety.email'));
reset role;
do $$
declare profile uuid; actor uuid; guard record; client_role text;
begin
  select pid into profile from profile_safety_fixtures where label='activation';
  actor:=current_setting('profile_safety.reserved_user_id')::uuid;
  if public.crew_onboarding_verify(current_setting('profile_safety.token_hash'),actor)->>'status' is distinct from 'active'
    or not exists(select 1 from public.profiles where id=profile and user_id=actor and hourly_rate=510 and note='keep-history') then
    raise exception 'activation failed or altered existing identity, rate, or history';
  end if;
  if exists((table fixture_timelogs except table public.timelogs))
    or exists((table fixture_days except table public.timelog_days)) then
    raise exception 'activation altered work history';
  end if;
  if exists(select 1 from original_profiles o left join public.profiles p on p.id=o.id where to_jsonb(p) is distinct from to_jsonb(o))
    or exists((table original_roles except table public.user_roles))
    or exists(select 1 from public.user_roles r where r.user_id not in (select uid from profile_safety_fixtures)
      and r.user_id<>actor and r.id not in (select id from original_roles))
    or exists((table original_timelogs except table public.timelogs))
    or exists((table original_days except table public.timelog_days)) then
    raise exception 'unrelated profiles, roles, or history changed';
  end if;
  select p.* into strict guard from pg_catalog.pg_proc p
    where p.oid='public.protect_profile_sensitive_fields()'::regprocedure;
  if guard.prosecdef or not ('search_path=""'=any(guard.proconfig)) then
    raise exception 'profile guard must use invoker privileges and an empty search path';
  end if;
  foreach client_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(client_role,guard.oid,'EXECUTE') then
      raise exception 'profile trigger function exposed to %',client_role;
    end if;
  end loop;
  if exists(select 1 from aclexplode(coalesce(guard.proacl,acldefault('f',guard.proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'profile guard grants PUBLIC execute'; end if;
end $$;
rollback;
