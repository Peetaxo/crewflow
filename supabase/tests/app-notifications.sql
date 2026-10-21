-- All fixture writes live inside a deliberately rolled-back PL/pgSQL subtransaction.
-- There is no provider call and no committed notification, auth user, or business row.
do $test$
declare
 u uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); p uuid; manager uuid;
 ev uuid:=gen_random_uuid(); draft_ev uuid:=gen_random_uuid(); application uuid:=gen_random_uuid();
 report uuid:=gen_random_uuid(); n uuid; invoice uuid:=gen_random_uuid(); pref jsonb; data jsonb; claimed jsonb;
 d uuid:=gen_random_uuid(); install uuid:=gen_random_uuid(); secret text; checks integer:=0; starts date:=(clock_timestamp() at time zone 'Europe/Prague')::date+1;
begin
 begin
  update private.notification_control set history_enabled=true,activated_at=clock_timestamp()-interval '3 days',push_enabled=false where singleton;
  insert into auth.users(id,email) values(u,'notification-rollback-'||u||'@example.invalid'),(m,'notification-rollback-'||m||'@example.invalid');
  select id into p from public.profiles where user_id=u limit 1;
  if p is null then p:=gen_random_uuid();insert into public.profiles(id,user_id,first_name,last_name) values(p,u,'Test','Crew'); end if;
  select id into manager from public.profiles where user_id=m limit 1;
  if manager is null then manager:=gen_random_uuid();insert into public.profiles(id,user_id,first_name,last_name) values(manager,m,'Test','Coordinator'); end if;
  delete from public.user_roles where user_id in(u,m);
  insert into public.user_roles(user_id,role) values(u,'crew'),(m,'coo');
  perform set_config('request.jwt.claim.sub',m::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
  insert into public.events(id,name,date_from,date_to,time_from,crew_needed,status,contact_profile_id,coordinator_profile_id)
   values(ev,'DISPOSABLE notification test',starts,starts,to_char(clock_timestamp() at time zone 'Europe/Prague','HH24:MI'),2,'planning',manager,manager);
  if exists(select 1 from public.app_notifications where recipient_user_id=u) then raise exception 'Drafts must not notify crew'; end if; checks:=checks+1;
  update public.events set status='upcoming' where id=ev;
  if (select count(*) from public.app_notifications where recipient_user_id=u and kind='shift_published')<>1 then raise exception 'Publishing must notify crew once'; end if; checks:=checks+1;
  update public.events set status='planning' where id=ev;update public.events set status='upcoming' where id=ev;
  if (select count(*) from public.app_notifications where recipient_user_id=u and kind='shift_published')<>1 then raise exception 'Republishing must not duplicate initial publication'; end if; checks:=checks+1;
  insert into public.event_applications(id,event_id,profile_id,status) values(application,ev,p,'pending');
  if (select count(*) from public.app_notifications where recipient_user_id=m and kind='application_received')<>1 then raise exception 'Coordinator/contact deduplication failed'; end if; checks:=checks+1;
  update public.event_applications set note='Same status' where id=application;
  if (select count(*) from public.app_notifications where recipient_user_id=m and kind='application_received')<>1 then raise exception 'An unchanged application status must not notify'; end if; checks:=checks+1;
  insert into public.event_assignments(event_id,profile_id) values(ev,p);
  if (select count(*) from public.app_notifications where recipient_user_id=u and kind='assignment_confirmed')<>1 then raise exception 'Assignment confirmation missing'; end if; checks:=checks+1;
  update public.events set address='Changed meeting address' where id=ev;
  if (select count(*) from public.app_notifications where recipient_user_id=u and kind='shift_changed')<>1 then raise exception 'Assigned crew must receive shift changes'; end if; checks:=checks+1;
  insert into public.timelogs(id,event_id,contractor_id,status) values(report,ev,p,'draft');
  insert into public.timelog_days(timelog_id,date,time_from,time_to,day_type) values(report,starts,(clock_timestamp() at time zone 'Europe/Prague')::time,'23:59','instal');
  perform private.generate_notification_reminders();perform private.generate_notification_reminders();
  if (select count(*) from public.app_notifications where recipient_user_id=u and kind='shift_reminder')<>1 then raise exception 'One reminder per assigned day is required'; end if; checks:=checks+1;
  if (select private.notification_actionable(a) from public.app_notifications a where recipient_user_id=u and kind='shift_reminder') is distinct from true then raise exception 'Current reminder must be actionable'; end if; checks:=checks+1;
  update public.events set time_from=to_char((clock_timestamp() at time zone 'Europe/Prague')+interval '2 hours','HH24:MI') where id=ev;
  if (select private.notification_actionable(a) from public.app_notifications a where recipient_user_id=u and kind='shift_reminder') is distinct from false then raise exception 'Old reminder remained actionable after time change'; end if; checks:=checks+1;
  update public.events set time_from=to_char(clock_timestamp() at time zone 'Europe/Prague','HH24:MI') where id=ev;
  if (select count(*) from public.app_notifications where recipient_user_id=m and kind='understaffed')<>1 then raise exception 'Understaffing must notify only once'; end if; checks:=checks+1;
  insert into public.receipts(id,contractor_id,event_id,name,status,amount) values(gen_random_uuid(),p,ev,'Test receipt','rejected',1);
  if (select count(*) from public.app_notifications where recipient_user_id=u and kind='receipt_returned')<>1 then raise exception 'Returned receipt notification missing'; end if; checks:=checks+1;
  insert into public.invoices(id,contractor_id,event_id,invoice_number,status,total_amount) values(invoice,p,ev,'ROLLBACK-'||invoice,'paid',1);
  if (select count(*) from public.app_notifications where recipient_user_id=u and kind='invoice_paid')<>1 then raise exception 'Recorded payment notification missing'; end if; checks:=checks+1;
  select id into n from public.app_notifications where recipient_user_id=u and kind='assignment_confirmed';
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  data:=public.get_my_notifications();
  if exists(select 1 from jsonb_array_elements(data->'items') x where x->>'recipient_user_id'<>u::text) then raise exception 'History contains another account'; end if; checks:=checks+1;
  data:=public.open_my_notification(n);
  if data->>'read_at' is null then raise exception 'Opening must mark message as read'; end if; checks:=checks+1;
  pref:=jsonb_build_object('push_enabled',true,'categories',jsonb_build_object('new_shifts',false),'quiet_enabled',false,'quiet_from','22:00','quiet_to','07:00','timezone','Europe/Prague');
  perform public.set_my_notification_preferences(pref);
  if (select categories->>'new_shifts' from public.notification_preferences where user_id=u)<>'false' then raise exception 'Category preference was not saved'; end if; checks:=checks+1;
  begin perform public.set_my_notification_preferences(pref||'{"timezone":"Invalid/Timezone"}'::jsonb);raise exception 'Invalid timezone accepted';
  exception when sqlstate '22023' then checks:=checks+1; end;
  begin perform public.set_my_notification_preferences(pref||'{"categories":{"invoices":"false"}}'::jsonb);raise exception 'String category accepted';
  exception when sqlstate '22023' then checks:=checks+1; end;
  perform public.register_notification_device(install,'ios',repeat('a',64),'development');
  perform public.register_notification_device(install,'ios',repeat('a',64),'development');
  if (select count(*) from private.notification_devices where installation_id=install)<>1 then raise exception 'Device registration must be idempotent'; end if; checks:=checks+1;
  perform set_config('request.jwt.claim.sub',m::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
  begin perform public.open_my_notification(n);raise exception 'Another account opened private history';
  exception when insufficient_privilege then checks:=checks+1; end;
  perform public.register_notification_device(install,'ios',repeat('a',64),'development');
  if (select user_id from private.notification_devices where installation_id=install)<>m then raise exception 'Device ownership did not transfer'; end if; checks:=checks+1;
  if has_table_privilege('authenticated','private.notification_devices','select') or has_table_privilege('authenticated','public.app_notifications','insert') then raise exception 'Browser privileges are too broad'; end if; checks:=checks+1;
  if has_function_privilege('authenticated','public.claim_notification_push(text,text[])','execute') or has_function_privilege('anon','public.get_my_notifications(uuid)','execute') then raise exception 'API privileges are too broad'; end if; checks:=checks+1;
  execute 'set local role authenticated';
  if exists(select 1 from public.app_notifications where recipient_user_id=u) then raise exception 'RLS revealed another account'; end if; checks:=checks+1;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
  begin perform public.get_my_notifications();raise exception 'Anonymous history read was accepted';
  exception when insufficient_privilege then checks:=checks+1; end;
  begin perform public.claim_notification_push('invalid-secret',array['ios']);raise exception 'Invalid worker secret was accepted';
  exception when insufficient_privilege then checks:=checks+1; end;
  perform set_config('request.jwt.claim.sub',m::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
  if not exists(select 1 from public.list_event_notification_contacts() c where c.profile_id=manager and c.can_coordinate and c.can_approve_hours) then raise exception 'Coordinator options do not reflect server roles'; end if; checks:=checks+1;
  perform public.set_my_notification_preferences(pref||'{"categories":{}}'::jsonb);
  update private.notification_control set push_enabled=true where singleton;
  select worker_secret into secret from private.notification_control where singleton;
  perform private.emit_notification(manager,'invoices','invoice_ready','Test delivery','Rollback-only',jsonb_build_object('tab','invoices'),'test-delivery');
  select id into n from public.app_notifications where recipient_user_id=m and dedupe_key='test-delivery';
  update private.notification_push_jobs set available_at=clock_timestamp()-interval '1 second' where notification_id=n;
  claimed:=public.claim_notification_push(secret,array['ios']);
  if jsonb_array_length(claimed)<>1 or claimed#>>'{0,notification,id}'<>n::text then raise exception 'Claim returned the wrong notification'; end if; checks:=checks+1;
  if jsonb_array_length(public.claim_notification_push(secret,array['ios']))<>0 then raise exception 'A running lease was claimed twice'; end if; checks:=checks+1;
  begin perform public.finish_notification_push(n,gen_random_uuid(),'{}','{}',null);raise exception 'Invalid lease was accepted';
  exception when serialization_failure then checks:=checks+1; end;
  d:=(claimed#>>'{0,devices,0,id}')::uuid;
  perform public.finish_notification_push(n,(claimed#>>'{0,lease}')::uuid,array[d],'{}',null);
  if (select status from private.notification_push_jobs where notification_id=n)<>'sent' then raise exception 'Successful delivery did not complete'; end if; checks:=checks+1;
  -- Configuring one platform must not discard a second phone on another platform.
  perform public.register_notification_device(gen_random_uuid(),'android',repeat('b',64),'production');
  perform private.emit_notification(manager,'invoices','invoice_ready','Test both platforms','Rollback-only',jsonb_build_object('tab','invoices'),'test-platforms');
  select id into n from public.app_notifications where recipient_user_id=m and dedupe_key='test-platforms';
  update private.notification_push_jobs set available_at=clock_timestamp()-interval '1 second' where notification_id=n;
  claimed:=public.claim_notification_push(secret,array['ios']);
  perform public.finish_notification_push(n,(claimed#>>'{0,lease}')::uuid,array[(claimed#>>'{0,devices,0,id}')::uuid],'{}',null);
  if (select status from private.notification_push_jobs where notification_id=n)<>'queued' then raise exception 'The unconfigured Android platform was discarded'; end if; checks:=checks+1;
  update private.notification_push_jobs set available_at=clock_timestamp()-interval '1 second' where notification_id=n;
  if jsonb_array_length(public.claim_notification_push(secret,array['ios']))<>0 then raise exception 'The delivered iPhone was sent again'; end if; checks:=checks+1;
  update private.notification_push_jobs set available_at=clock_timestamp()-interval '1 second' where notification_id=n;
  claimed:=public.claim_notification_push(secret,array['android']);
  if jsonb_array_length(claimed)<>1 or claimed#>>'{0,devices,0,platform}'<>'android' then raise exception 'Android could not complete later'; end if; checks:=checks+1;
  perform public.finish_notification_push(n,(claimed#>>'{0,lease}')::uuid,array[(claimed#>>'{0,devices,0,id}')::uuid],'{}',null);
  if (select status from private.notification_push_jobs where notification_id=n)<>'sent' then raise exception 'Both-platform delivery did not complete'; end if; checks:=checks+1;
  perform public.set_my_notification_preferences(pref||jsonb_build_object('categories','{}'::jsonb,'quiet_enabled',true,
   'quiet_from',((clock_timestamp() at time zone 'Europe/Prague')-interval '1 hour')::time,'quiet_to',((clock_timestamp() at time zone 'Europe/Prague')+interval '1 hour')::time));
  perform private.emit_notification(manager,'invoices','invoice_ready','Test quiet time','Rollback-only',jsonb_build_object('tab','invoices'),'test-quiet');
  select id into n from public.app_notifications where recipient_user_id=m and dedupe_key='test-quiet';
  update private.notification_push_jobs set available_at=clock_timestamp()-interval '1 second' where notification_id=n;
  claimed:=public.claim_notification_push(secret,array['ios']);
  if jsonb_array_length(claimed)<>0 or (select available_at from private.notification_push_jobs where notification_id=n)<=clock_timestamp() then
   raise exception 'Quiet time did not defer ordinary delivery (claimed %, job %, preferences %, stamp %)',
    jsonb_array_length(claimed),
    (select jsonb_build_object('status',status,'available_at',available_at) from private.notification_push_jobs where notification_id=n),
    (select to_jsonb(settings)-'user_id' from public.notification_preferences settings where user_id=m),clock_timestamp();
  end if; checks:=checks+1;
  perform private.emit_notification(manager,'shift_changes','shift_changed','Test urgent change','Rollback-only',jsonb_build_object('tab','events','eventId',ev),'test-urgent',null,true);
  claimed:=public.claim_notification_push(secret,array['ios']);
  if jsonb_array_length(claimed)<>1 or claimed#>>'{0,notification,dedupe_key}'<>'test-urgent' then raise exception 'Urgent change was incorrectly deferred'; end if; checks:=checks+1;
  -- The only exception swallowed is our deliberate rollback marker. All assertion
  -- failures propagate, so a failed test can never report success.
  raise exception using errcode='Z0001',message='rollback_notification_fixtures';
 exception when sqlstate 'Z0001' then null;
 end;
 perform set_config('nodu.notification_test_checks',checks::text,true);
 if exists(select 1 from auth.users where id in(u,m)) then raise exception 'Notification fixture rollback failed'; end if;
end
$test$;
select current_setting('nodu.notification_test_checks')::integer as notification_assertions_passed;
