-- Acceptance fixtures are transaction-only. No existing accounts, roles or
-- activity records are changed. The auth trigger creates profiles/default crew roles.
begin;
create temporary table qa_activity_users on commit drop as
select gen_random_uuid() as user_id,kind from (values ('crew1'),('crew2'),('manager')) as actors(kind);
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
select user_id,'authenticated','authenticated','crew-activity-qa-' || user_id::text || '@example.invalid',
  '{"first_name":"Activity","last_name":"QA"}'::jsonb,now(),now() from qa_activity_users;
insert into public.user_roles(user_id,role) select user_id,'crewhead'::public.app_role from qa_activity_users where kind='manager';
create temporary table qa_activity_actors on commit drop as
select p.id,p.user_id,u.kind from public.profiles p join qa_activity_users u using(user_id);
grant select on qa_activity_actors to authenticated,anon;
do $$ begin if (select count(*) from qa_activity_actors) <> 3 then raise exception 'Fixture profiles missing'; end if; end $$;
insert into public.profile_activity(profile_id,last_active_at) select id,now()-interval '2 days' from qa_activity_actors;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select user_id::text from qa_activity_actors where kind='manager'),true);
do $$ begin if (select count(*) from public.profile_activity where profile_id in(select id from qa_activity_actors)) <> 3 then raise exception 'Manager cannot read crew activity'; end if; end $$;
select set_config('request.jwt.claim.sub',(select user_id::text from qa_activity_actors where kind='crew1'),true);
do $$ begin
  if (select count(*) from public.profile_activity where profile_id in(select id from qa_activity_actors)) <> 1 then raise exception 'Crew can see another person'; end if;
  begin
    insert into public.profile_activity(profile_id,last_active_at) select id,now() from qa_activity_actors where kind='crew2';
    raise exception 'Direct write permitted';
  exception when insufficient_privilege then null; end;
end $$;
select public.record_my_activity();
create temporary table qa_first_activity as select last_active_at from public.profile_activity where profile_id=(select id from qa_activity_actors where kind='crew1');
select public.record_my_activity();
do $$ begin
  if not exists(select 1 from public.profile_activity where profile_id=(select id from qa_activity_actors where kind='crew1') and last_active_at between now()-interval '5 seconds' and clock_timestamp()+interval '1 second') then raise exception 'Own server timestamp missing'; end if;
  if (select last_active_at from public.profile_activity where profile_id=(select id from qa_activity_actors where kind='crew1')) <> (select last_active_at from qa_first_activity) then raise exception 'Server throttle failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  begin perform public.record_my_activity(); raise exception 'Missing identity accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.profile_activity where profile_id in(select id from qa_activity_actors where kind<>'crew1') and last_active_at>now()-interval '1 day') then raise exception 'Other activity changed'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.record_my_activity(); raise exception 'Anonymous RPC permitted';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.profile_activity; raise exception 'Anonymous read permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: server-owned self-only activity, throttling, manager/self reads, denied client writes/anonymous/missing identity; all fixtures rolled back' as verification;
