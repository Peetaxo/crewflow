-- Durable, account-bound notification history. No historical business data is replayed.
set lock_timeout = '5s';

alter table public.events add column coordinator_profile_id uuid references public.profiles(id) on delete set null;
create index events_coordinator_profile_idx on public.events(coordinator_profile_id) where coordinator_profile_id is not null;

create table public.app_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in ('new_shifts','applications','shift_changes','reminders','timelogs','invoices','receipts','staffing','system')),
 kind text not null, title text not null, body text not null,
 target jsonb not null default '{}'::jsonb,
 dedupe_key text not null, group_key text, urgent boolean not null default false,
 read_at timestamptz, created_at timestamptz not null default clock_timestamp(),
 unique(recipient_user_id,dedupe_key)
);
create index app_notifications_recipient_idx on public.app_notifications(recipient_user_id,created_at desc,id desc);
create index app_notifications_unread_idx on public.app_notifications(recipient_user_id) where read_at is null;
create index app_notifications_profile_idx on public.app_notifications(recipient_profile_id);

create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 push_enabled boolean not null default true,
 categories jsonb not null default '{}'::jsonb check(jsonb_typeof(categories)='object'),
 quiet_enabled boolean not null default true,
 quiet_from time not null default '22:00', quiet_to time not null default '07:00',
 timezone text not null default 'Europe/Prague'
);

create table private.notification_devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 installation_id uuid not null, platform text not null check(platform in ('ios','android')),
 token text not null check(length(token) between 20 and 4096),
 environment text not null check(environment in ('development','production')),
 enabled boolean not null default true, updated_at timestamptz not null default clock_timestamp(),
 unique(platform,token), unique(installation_id)
);
create index notification_devices_user_idx on private.notification_devices(user_id) where enabled;
create index notification_devices_profile_idx on private.notification_devices(profile_id);
create table private.notification_push_jobs (
 notification_id uuid primary key references public.app_notifications(id) on delete cascade,
 status text not null default 'queued' check(status in ('queued','running','sent','skipped','failed')),
 available_at timestamptz not null default clock_timestamp()+interval '90 seconds',
 attempts integer not null default 0, lease_token uuid, locked_until timestamptz,
 delivered_devices uuid[] not null default '{}', last_error text
);
create index notification_push_jobs_due_idx on private.notification_push_jobs(available_at) where status in ('queued','running');
create table private.notification_control (
 singleton boolean primary key default true check(singleton), activated_at timestamptz not null default clock_timestamp(),
 history_enabled boolean not null default false,
 push_enabled boolean not null default false, push_activated_at timestamptz,
 worker_secret text not null default gen_random_uuid()::text||gen_random_uuid()::text
);
insert into private.notification_control(singleton) values(true);

alter table public.app_notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table private.notification_devices enable row level security;
alter table private.notification_push_jobs enable row level security;
alter table private.notification_control enable row level security;
revoke all on public.app_notifications,public.notification_preferences from public,anon,authenticated;
revoke all on private.notification_devices,private.notification_push_jobs,private.notification_control from public,anon,authenticated;
grant select on public.app_notifications,public.notification_preferences to authenticated;
grant all on public.app_notifications,public.notification_preferences,private.notification_devices,private.notification_push_jobs,private.notification_control to service_role;
create policy notification_history_owner on public.app_notifications for select to authenticated using (
 recipient_user_id=(select auth.uid()) and recipient_profile_id=(select public.current_profile_id())
);
create policy notification_preferences_owner on public.notification_preferences for select to authenticated using(user_id=(select auth.uid()));

-- Privileged writers are internal only. Both profile and auth identity are snapshotted;
-- relinking a profile must never give its new owner the previous owner's messages/tokens.
create function private.emit_notification(p_recipient uuid,p_category text,p_kind text,p_title text,p_body text,
 p_target jsonb,p_key text,p_group text default null,p_urgent boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not exists(select 1 from private.notification_control where singleton and history_enabled) then return; end if;
 insert into public.app_notifications(recipient_profile_id,recipient_user_id,category,kind,title,body,target,dedupe_key,group_key,urgent)
 select p.id,p.user_id,p_category,p_kind,left(p_title,180),left(p_body,1000),p_target,p_key,p_group,p_urgent
 from public.profiles p join auth.users u on u.id=p.user_id
 where p.id=p_recipient and (u.banned_until is null or u.banned_until<=clock_timestamp())
 and exists(select 1 from public.user_roles r where r.user_id=p.user_id)
 on conflict(recipient_user_id,dedupe_key) do nothing returning id into v_id;
 if v_id is not null then
  insert into private.notification_push_jobs(notification_id,available_at)
  values(v_id,clock_timestamp()+case when p_urgent then interval '0' else interval '90 seconds' end);
 end if;
end $$;

create function private.notification_managers(p_event uuid, p_include_contact boolean default true)
returns setof uuid language sql stable security definer set search_path='' as $$
 select p.id from public.profiles p where p.user_id is not null and (
  p.id=(select coordinator_profile_id from public.events where id=p_event)
  or (p_include_contact and p.id=(select contact_profile_id from public.events where id=p_event))
  or ((p_event is null or not exists(select 1 from public.events where id=p_event and coordinator_profile_id is not null))
      and exists(select 1 from public.user_roles r where r.user_id=p.user_id and r.role='coo'))
 )
$$;

create function private.notification_event_group(p_event uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select workflow_id::text from public.shift_workflow_events where event_id=p_event),p_event::text)
$$;
revoke all on function private.notification_event_group(uuid) from public,anon,authenticated;

create function private.notification_event_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' and new.coordinator_profile_id is null then new.coordinator_profile_id:=public.current_profile_id(); end if;
 if new.coordinator_profile_id is not null and (tg_op='INSERT' or new.coordinator_profile_id is distinct from old.coordinator_profile_id)
 and not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id
  where p.id=new.coordinator_profile_id and r.role in ('coo','crewhead')) then
  raise exception 'Koordinátor musí mít účet COO nebo CrewHead.' using errcode='22023';
 end if;
 return new;
end $$;
create trigger notification_event_guard before insert or update on public.events for each row execute function private.notification_event_guard();

create function private.notify_event_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_event public.events; v_recipient uuid; v_target jsonb; v_new boolean:=false; v_cancel boolean:=false; v_changed boolean:=false;
begin
 if tg_op='DELETE' then v_event:=old; v_cancel:=true;
 else
  v_event:=new;
  v_new:=new.status='upcoming' and new.date_to>=(clock_timestamp() at time zone 'Europe/Prague')::date
    and (tg_op='INSERT' or old.status='planning');
  if tg_op='UPDATE' then
   v_cancel:=old.status in ('upcoming','full') and new.status='planning';
   v_changed:=new.status<>'planning' and old.status<>'planning' and
    row(new.date_from,new.date_to,new.time_from,new.time_to,new.address,new.city,new.meeting_point,new.description,new.dresscode,new.contact_person,new.contact_phone,new.phase_schedules,new.free_days)
    is distinct from row(old.date_from,old.date_to,old.time_from,old.time_to,old.address,old.city,old.meeting_point,old.description,old.dresscode,old.contact_person,old.contact_phone,old.phase_schedules,old.free_days);
  end if;
 end if;
 v_target:=jsonb_build_object('tab','events','eventId',v_event.id);
 if v_new then
  for v_recipient in select p.id from public.profiles p where exists(select 1 from public.user_roles r where r.user_id=p.user_id and r.role='crew') loop
   perform private.emit_notification(v_recipient,'new_shifts','shift_published','Nová směna: '||v_event.name,
    to_char(v_event.date_from,'DD. MM. YYYY')||' · '||coalesce(v_event.time_from,'')||' · '||coalesce(v_event.city,''),v_target,
    'published:'||v_event.id,coalesce(v_event.project_id::text,v_event.id::text));
  end loop;
 end if;
 if (v_cancel or v_changed) and v_event.date_to>=(clock_timestamp() at time zone 'Europe/Prague')::date then
  for v_recipient in select a.profile_id from public.event_assignments a where a.event_id=v_event.id loop
   perform private.emit_notification(v_recipient,'shift_changes',case when v_cancel then 'shift_cancelled' else 'shift_changed' end,
    case when v_cancel then 'Zrušená směna: ' else 'Změna směny: ' end||v_event.name,
    case when v_cancel then 'Tato směna už není vypsaná. Zkontrolujte aktuální přehled.' else 'Změnily se údaje směny. Otevřete aktuální pokyny.' end,
    v_target,'event_changed:'||private.notification_event_group(v_event.id)||':'||pg_current_xact_id(),private.notification_event_group(v_event.id),
    ((v_event.date_from+coalesce(nullif(v_event.time_from,'')::time,'09:00'::time)) at time zone 'Europe/Prague')<=clock_timestamp()+interval '24 hours');
  end loop;
 end if;
 return coalesce(new,old);
end $$;
create trigger notifications_event_write after insert or update on public.events for each row execute function private.notify_event_change();
create trigger notifications_event_delete before delete on public.events for each row execute function private.notify_event_change();

create function private.notify_application_change() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.events; p public.profiles; who uuid; target jsonb;
begin
 if tg_op='UPDATE' and new.status=old.status then return new; end if;
 select * into e from public.events where id=new.event_id;
 select * into p from public.profiles where id=new.profile_id;
 target:=jsonb_build_object('tab','events','eventId',e.id,'eventTab','overview');
 if new.status in ('pending','withdrawal_requested') then
  for who in select private.notification_managers(e.id) loop
   perform private.emit_notification(who,'applications',case when new.status='pending' then 'application_received' else 'withdrawal_requested' end,
    case when new.status='pending' then 'Nová přihláška: ' else 'Žádost o odhlášení: ' end||e.name,
    btrim(p.first_name||' '||p.last_name),target,'application:'||private.notification_event_group(e.id)||':'||p.id||':'||new.status||':'||pg_current_xact_id(),private.notification_event_group(e.id));
  end loop;
 elsif new.status='rejected' then
  perform private.emit_notification(p.id,'applications','application_rejected','Přihláška nebyla schválena: '||e.name,
   'Na tuto směnu jste nebyli vybráni.',target,'rejected:'||private.notification_event_group(e.id)||':'||pg_current_xact_id());
 elsif tg_op='UPDATE' and old.status='withdrawal_requested' and new.status in ('approved','withdrawn') then
  perform private.emit_notification(p.id,'applications','withdrawal_resolved','Vyřízení odhlášení: '||e.name,
   case when new.status='withdrawn' then 'Vaše odhlášení bylo schváleno.' else 'Odhlášení nebylo schváleno. Směna vám zůstává přiřazená.' end,
   target,'withdrawal:'||private.notification_event_group(e.id)||':'||pg_current_xact_id());
 end if;
 return new;
end $$;
create trigger notifications_application after insert or update on public.event_applications for each row execute function private.notify_application_change();

create function private.notify_assignment_change() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.event_assignments; e public.events;
begin
 a:=coalesce(new,old); select * into e from public.events where id=a.event_id;
 if e.id is null or e.status='planning' or e.date_to<(clock_timestamp() at time zone 'Europe/Prague')::date then return coalesce(new,old); end if;
 -- Withdrawal approval has its own outcome message; a plain removal still needs one.
 if tg_op='DELETE' and exists(select 1 from public.event_applications where event_id=a.event_id and profile_id=a.profile_id and status='withdrawal_requested') then return old; end if;
 perform private.emit_notification(a.profile_id,'applications',case when tg_op='INSERT' then 'assignment_confirmed' else 'assignment_removed' end,
  case when tg_op='INSERT' then 'Potvrzená směna: ' else 'Odebrání ze směny: ' end||e.name,
  to_char(e.date_from,'DD. MM. YYYY')||' · '||coalesce(e.time_from,''),jsonb_build_object('tab','events','eventId',e.id),
  'assignment:'||tg_op||':'||private.notification_event_group(a.event_id)||':'||a.profile_id||':'||pg_current_xact_id(),private.notification_event_group(e.id));
 return coalesce(new,old);
end $$;
create trigger notifications_assignment after insert or delete on public.event_assignments for each row execute function private.notify_assignment_change();

create function private.notify_timelog_change() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.events; who uuid; title text; kind text;
begin
 if tg_op='UPDATE' and new.status=old.status then return new; end if;
 select * into e from public.events where id=new.event_id;
 if new.status in ('rejected','pending_crew_confirmation','approved') then
  kind:=case new.status when 'rejected' then 'timelog_returned' when 'pending_crew_confirmation' then 'hours_confirmation' else 'timelog_approved' end;
  title:=case new.status when 'rejected' then 'Výkaz vrácen k opravě: ' when 'pending_crew_confirmation' then 'Potvrďte upravené hodiny: ' else 'Výkaz byl schválen: ' end;
  perform private.emit_notification(new.contractor_id,'timelogs',kind,title||e.name,coalesce(nullif(new.review_note,''),'Otevřete výkaz a zkontrolujte jeho aktuální stav.'),
   jsonb_build_object('tab','my-timelogs','timelogId',new.id),'timelog:'||private.notification_event_group(e.id)||':'||new.contractor_id||':'||new.status||':'||pg_current_xact_id(),private.notification_event_group(e.id));
 elsif new.status='pending_ch' then
  for who in select private.notification_managers(e.id) loop
   perform private.emit_notification(who,'timelogs','timelog_review','Výkaz ke kontrole: '||e.name,'Nový výkaz čeká na kontrolu.',
    jsonb_build_object('tab','timelogs','timelogId',new.id),'review:'||private.notification_event_group(e.id)||':'||new.contractor_id||':'||pg_current_xact_id(),private.notification_event_group(e.id));
  end loop;
 end if;
 return new;
end $$;
create trigger notifications_timelog after insert or update on public.timelogs for each row execute function private.notify_timelog_change();
create function private.notify_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='pending' and new.superseded_at is null and (tg_op='INSERT' or old.status<>'pending') then
  perform private.emit_notification(new.approver_profile_id,'timelogs','timelog_approval','Výkazy čekají na schválení','Otevřete schvalování a vyřiďte předané výkazy.',
   jsonb_build_object('tab','timelogs','timelogId',new.timelog_id),'approval:'||new.id,new.handoff_batch_id::text);
 end if;
 return new;
end $$;
create trigger notifications_approval after insert or update on public.timelog_approvals for each row execute function private.notify_approval();

create function private.notify_finance() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; title text;
begin
 if tg_table_name='receipts' then
  if new.status='rejected' and (tg_op='INSERT' or old.status<>'rejected') then
   perform private.emit_notification(new.contractor_id,'receipts','receipt_returned','Účtenka vrácena k opravě',new.name,
    jsonb_build_object('tab','my-receipts','receiptId',new.id),'receipt:'||new.id||':'||pg_current_xact_id());
  end if;
 else
  if new.status='paid' and (tg_op='INSERT' or old.status<>'paid') then kind:='invoice_paid'; title:='Faktura označena jako uhrazená';
  elsif (new.pdf_path is not null and (tg_op='INSERT' or old.pdf_path is null)) or
    (new.status='sent' and (tg_op='INSERT' or old.status='draft') and new.billing_kind='uploaded') then kind:='invoice_ready'; title:='Vaše faktura je připravená';
  else return new; end if;
  perform private.emit_notification(new.contractor_id,'invoices',kind,title,coalesce(new.invoice_number,'Faktura')||' · '||coalesce(new.total_amount,0)||' Kč',
   jsonb_build_object('tab','my-invoices','invoiceId',new.id),kind||':'||new.id);
 end if;
 return new;
end $$;
create trigger notifications_invoice after insert or update on public.invoices for each row execute function private.notify_finance();
create trigger notifications_receipt after insert or update on public.receipts for each row execute function private.notify_finance();
create function private.notify_invoice_failure() returns trigger language plpgsql security definer set search_path='' as $$
declare who uuid;
begin
 if new.status='failed' and old.status<>'failed' then
  for who in select private.notification_managers(null,false) loop
   perform private.emit_notification(who,'system','invoice_failure','Fakturu se nepodařilo vytvořit','Otevřete fakturaci a zkontrolujte neúspěšné zpracování.',
    jsonb_build_object('tab','invoices'),'invoice_failure:'||new.id||':'||new.retry_generation);
  end loop;
 end if;
 return new;
end $$;
create trigger notifications_invoice_failure after update on private.invoice_billing_jobs for each row execute function private.notify_invoice_failure();

create function public.get_my_notifications(p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; actor uuid:=auth.uid(); profile uuid:=public.current_profile_id();
begin
 if actor is null or profile is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id desc),'[]'::jsonb)) into result
 from (select a.* from public.app_notifications a where a.recipient_user_id=actor and a.recipient_profile_id=profile
  and (p_before_id is null or (a.created_at,a.id)<(select x.created_at,x.id from public.app_notifications x where x.id=p_before_id and x.recipient_user_id=actor and x.recipient_profile_id=profile))
  order by a.created_at desc,a.id desc limit 50) n;
 return result||jsonb_build_object('unread',(select count(*) from public.app_notifications where recipient_user_id=actor and recipient_profile_id=profile and read_at is null),
  'asOf',clock_timestamp(),'deliveryReady',(select push_enabled from private.notification_control where singleton),'preferences',coalesce((select to_jsonb(p)-'user_id' from public.notification_preferences p where user_id=actor),
  jsonb_build_object('push_enabled',true,'categories','{}'::jsonb,'quiet_enabled',true,'quiet_from','22:00','quiet_to','07:00','timezone','Europe/Prague')));
end $$;
create function public.read_my_notifications(p_ids uuid[] default null,p_before timestamptz default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_profile_id() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if (p_ids is null)=(p_before is null) or cardinality(p_ids)>100 or p_before>clock_timestamp() then raise exception 'Invalid read request' using errcode='22023'; end if;
 update public.app_notifications set read_at=clock_timestamp() where recipient_user_id=auth.uid() and recipient_profile_id=public.current_profile_id()
 and read_at is null and ((p_ids is not null and id=any(p_ids)) or (p_before is not null and created_at<=p_before));
end $$;
create function public.set_my_notification_preferences(p_settings jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_profile_id() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_settings)<>'object' or exists(select 1 from jsonb_each(p_settings) x where x.key not in ('push_enabled','categories','quiet_enabled','quiet_from','quiet_to','timezone'))
 or jsonb_typeof(p_settings->'categories')<>'object' or exists(select 1 from jsonb_each(p_settings->'categories') x where x.key not in ('new_shifts','applications','shift_changes','reminders','timelogs','invoices','receipts','staffing','system') or jsonb_typeof(x.value)<>'boolean')
 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_settings->>'timezone') then raise exception 'Invalid preferences' using errcode='22023'; end if;
 insert into public.notification_preferences(user_id,push_enabled,categories,quiet_enabled,quiet_from,quiet_to,timezone)
 values(auth.uid(),(p_settings->>'push_enabled')::boolean,p_settings->'categories',(p_settings->>'quiet_enabled')::boolean,(p_settings->>'quiet_from')::time,(p_settings->>'quiet_to')::time,p_settings->>'timezone')
 on conflict(user_id) do update set push_enabled=excluded.push_enabled,categories=excluded.categories,quiet_enabled=excluded.quiet_enabled,quiet_from=excluded.quiet_from,quiet_to=excluded.quiet_to,timezone=excluded.timezone;
end $$;
create function public.register_notification_device(p_installation_id uuid,p_platform text,p_token text,p_environment text default 'production')
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or public.current_profile_id() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_platform not in ('ios','android') or p_environment not in ('development','production') or length(p_token) not between 20 and 4096 then raise exception 'Invalid device' using errcode='22023'; end if;
 -- One physical installation has one current owner, including after account switching.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('notification-installation:'||p_installation_id,0));
 delete from private.notification_devices where installation_id<>p_installation_id and platform=p_platform and token=p_token;
 insert into private.notification_devices(user_id,profile_id,installation_id,platform,token,environment)
 values(auth.uid(),public.current_profile_id(),p_installation_id,p_platform,p_token,p_environment)
 on conflict(installation_id) do update set user_id=excluded.user_id,profile_id=excluded.profile_id,platform=excluded.platform,token=excluded.token,environment=excluded.environment,enabled=true,updated_at=clock_timestamp();
 delete from private.notification_devices where id in(select id from private.notification_devices where user_id=auth.uid() order by updated_at desc,id offset 5);
end $$;
create function public.unregister_notification_device(p_installation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 delete from private.notification_devices where user_id=auth.uid() and installation_id=p_installation_id;
end $$;

-- Client APIs contain explicit identity checks and have narrowly granted EXECUTE.
revoke all on function public.get_my_notifications(uuid),public.read_my_notifications(uuid[],timestamptz),public.set_my_notification_preferences(jsonb),public.register_notification_device(uuid,text,text,text),public.unregister_notification_device(uuid) from public,anon;
grant execute on function public.get_my_notifications(uuid),public.read_my_notifications(uuid[],timestamptz),public.set_my_notification_preferences(jsonb),public.register_notification_device(uuid,text,text,text),public.unregister_notification_device(uuid) to authenticated;
revoke all on function private.emit_notification(uuid,text,text,text,text,jsonb,text,text,boolean),private.notification_managers(uuid,boolean),private.notification_event_guard(),private.notify_event_change(),private.notify_application_change(),private.notify_assignment_change(),private.notify_timelog_change(),private.notify_approval(),private.notify_finance(),private.notify_invoice_failure() from public,anon,authenticated;

-- Each reminder is keyed by the actual assigned day. Only future/due work since
-- activation is considered, so installation cannot send a backlog of old work.
create function private.notification_time(p_value text) returns time language sql stable set search_path='' as $$
 select case when pg_catalog.pg_input_is_valid(p_value,'time without time zone') then p_value::time end
$$;
create function private.notification_assigned_schedule()
returns table(event_id uuid,profile_id uuid,shift_date date,starts_at timestamptz)
language sql stable security definer set search_path='' as $$
 select q.event_id,q.profile_id,q.shift_date,(q.shift_date+min(q.planned_from)) at time zone 'Europe/Prague'
 from (
  select e.id as event_id,a.profile_id,d.date as shift_date,
   coalesce(case when e.allow_crew_time_proposal then private.notification_time(app.planned_from::text) end,
    case when e.show_day_types then
      (select min(private.notification_time(slot->>'from')) from jsonb_each(case when jsonb_typeof(e.phase_schedules)='object' then e.phase_schedules else '{}'::jsonb end) phase
       cross join lateral jsonb_array_elements(case when jsonb_typeof(phase.value)='array' then phase.value else '[]'::jsonb end) slot
       where phase.key=d.day_type::text and (slot->'dates') ? d.date::text)
     when e.date_from=e.date_to then private.notification_time(e.time_from) end,
    case when e.schedule_version=1 and e.show_day_types then private.notification_time(e.phase_times->d.day_type::text->>'from') end,
    case when not coalesce(e.show_day_types,false) or e.schedule_version=1 then private.notification_time(d.time_from::text) end) as planned_from
  from public.events e join public.event_assignments a on a.event_id=e.id
   join public.timelogs t on t.event_id=e.id and t.contractor_id=a.profile_id
   join public.timelog_days d on d.timelog_id=t.id
   left join public.event_applications app on app.event_id=e.id and app.profile_id=a.profile_id
  where e.status in ('upcoming','full') and d.date between e.date_from and e.date_to
   and not (coalesce(e.show_day_types,false) and d.date=any(coalesce(e.free_days,'{}'::date[])))
 ) q where q.planned_from is not null group by q.event_id,q.profile_id,q.shift_date
$$;
revoke all on function private.notification_time(text),private.notification_assigned_schedule() from public,anon,authenticated;
create function private.generate_notification_reminders()
returns void language plpgsql security definer set search_path='' as $$
declare r record; who uuid; activation timestamptz; stamp timestamptz:=clock_timestamp();
begin
 if not exists(select 1 from private.notification_control where singleton and history_enabled) then return; end if;
 select activated_at into activation from private.notification_control where singleton;
 for r in
  select e.*,s.profile_id,s.shift_date as date,s.starts_at
  from private.notification_assigned_schedule() s join public.events e on e.id=s.event_id
  where s.starts_at between stamp and stamp+interval '24 hours'
 loop
  if r.starts_at>stamp and r.starts_at<=stamp+interval '24 hours' and r.starts_at-interval '24 hours'>=activation then
   perform private.emit_notification(r.profile_id,'reminders','shift_reminder','Připomenutí směny: '||r.name,
    to_char(r.date,'DD. MM.')||' · '||to_char(r.starts_at at time zone 'Europe/Prague','HH24:MI')||' · '||coalesce(r.meeting_point,r.address,r.city,''),
    jsonb_build_object('tab','events','eventId',r.id,'scheduledAt',r.starts_at),'reminder:'||r.id||':'||r.profile_id||':'||r.date,r.id::text);
  end if;
 end loop;
 for r in
  select e.id,e.name,a.profile_id,t.id as timelog_id
  from public.events e join public.event_assignments a on a.event_id=e.id
  join public.timelogs t on t.event_id=e.id and t.contractor_id=a.profile_id
  where e.status<>'planning' and t.status='draft' and e.date_to=(stamp at time zone 'Europe/Prague')::date-1
   and ((e.date_to+1)+time '09:00') at time zone 'Europe/Prague' between activation and stamp
 loop
  perform private.emit_notification(r.profile_id,'reminders','missing_timelog','Doplňte výkaz: '||r.name,
   'Směna skončila a váš výkaz ještě nebyl odeslán.',jsonb_build_object('tab','my-timelogs','timelogId',r.timelog_id),
   'missing_timelog:'||r.timelog_id);
 end loop;
 for r in select e.* from public.events e
  where e.status='upcoming' and e.crew_needed>(select count(*) from public.event_assignments a where a.event_id=e.id)
  and (e.date_from+coalesce(nullif(e.time_from,'')::time,'09:00'::time)) at time zone 'Europe/Prague' between stamp and stamp+interval '48 hours'
  and ((e.date_from+coalesce(nullif(e.time_from,'')::time,'09:00'::time)) at time zone 'Europe/Prague')-interval '48 hours'>=activation
 loop
  for who in select private.notification_managers(r.id,false) loop
   perform private.emit_notification(who,'staffing','understaffed','Na směně chybí lidé: '||r.name,
    'Zkontrolujte obsazení směny před jejím začátkem.',jsonb_build_object('tab','events','eventId',r.id,'eventTab','overview'),
    'understaffed:'||r.id||':'||r.date_from,r.id::text);
  end loop;
 end loop;
end $$;

create function private.notification_actionable(n public.app_notifications)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t public.timelogs; event uuid:=(n.target->>'eventId')::uuid;
begin
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id where p.id=n.recipient_profile_id and p.user_id=n.recipient_user_id
  and (u.banned_until is null or u.banned_until<=clock_timestamp()) and exists(select 1 from public.user_roles r where r.user_id=p.user_id)) then return false; end if;
 if n.kind in ('shift_reminder','hours_confirmation','timelog_returned','timelog_approval','timelog_review','missing_timelog') then
  if n.kind='shift_reminder' then return (n.target->>'scheduledAt')::timestamptz>clock_timestamp() and exists(
    select 1 from private.notification_assigned_schedule() s where s.event_id=event and s.profile_id=n.recipient_profile_id
    and s.starts_at=(n.target->>'scheduledAt')::timestamptz); end if;
  select * into t from public.timelogs where id=(n.target->>'timelogId')::uuid;
  return t.id is not null and case n.kind
   when 'missing_timelog' then t.status='draft'
   when 'hours_confirmation' then t.status='pending_crew_confirmation'
   when 'timelog_returned' then t.status='rejected'
   when 'timelog_review' then t.status='pending_ch'
   when 'timelog_approval' then exists(select 1 from public.timelog_approvals a where a.timelog_id=t.id and a.status='pending' and a.superseded_at is null and a.approver_user_id=n.recipient_user_id)
   else false end;
 elsif n.kind='shift_published' then return exists(select 1 from public.events e where e.id=event and e.status='upcoming' and e.crew_filled<e.crew_needed and e.date_to>=(clock_timestamp() at time zone 'Europe/Prague')::date);
 elsif n.kind='understaffed' then return exists(select 1 from public.events e where e.id=event and e.status='upcoming' and e.date_from>=(clock_timestamp() at time zone 'Europe/Prague')::date
   and e.crew_needed>(select count(*) from public.event_assignments a where a.event_id=e.id));
 end if;
 return true;
end $$;

-- Returns one batch per recipient/category/group; concurrent workers use leases.
-- Successful device IDs persist across retries, so a failed second device does
-- not cause repeated sends to the first one. Providers remain at-least-once.
create function public.claim_notification_push(p_secret text,p_platforms text[] default array['ios','android'])
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]'; n public.app_notifications; j private.notification_push_jobs; pref public.notification_preferences;
 v_now timestamptz:=clock_timestamp(); local_time time; delay_until timestamptz; devices jsonb; token uuid; work integer:=0;
begin
 if not exists(select 1 from private.notification_control where singleton and push_enabled and worker_secret=p_secret) then raise exception 'Unauthorized worker' using errcode='42501'; end if;
 for j in select * from private.notification_push_jobs where (status='queued' and available_at<=v_now) or (status='running' and locked_until<v_now)
  order by available_at limit 20 for update skip locked
 loop
  select * into n from public.app_notifications where id=j.notification_id;
  if j.attempts>=8 then update private.notification_push_jobs set status='failed',last_error='retry_budget_exhausted' where notification_id=j.notification_id; continue; end if;
  select * into pref from public.notification_preferences where user_id=n.recipient_user_id;
  if n.created_at<v_now-interval '7 days' or n.created_at<(select coalesce(push_activated_at,activated_at) from private.notification_control where singleton)
   or n.read_at is not null or not private.notification_actionable(n) or coalesce(pref.push_enabled,true)=false or coalesce((pref.categories->>n.category)::boolean,true)=false then
   update private.notification_push_jobs set status='skipped' where notification_id=j.notification_id; continue;
  end if;
  local_time:=(v_now at time zone coalesce(pref.timezone,'Europe/Prague'))::time;
  if not n.urgent and coalesce(pref.quiet_enabled,true) and coalesce(pref.quiet_from,'22:00')<>coalesce(pref.quiet_to,'07:00') and
   (case when coalesce(pref.quiet_from,'22:00')<coalesce(pref.quiet_to,'07:00') then local_time>=coalesce(pref.quiet_from,'22:00') and local_time<coalesce(pref.quiet_to,'07:00')
    else local_time>=coalesce(pref.quiet_from,'22:00') or local_time<coalesce(pref.quiet_to,'07:00') end) then
   delay_until:=(((v_now at time zone coalesce(pref.timezone,'Europe/Prague'))::date+coalesce(pref.quiet_to,'07:00'))
    +case when local_time>=coalesce(pref.quiet_from,'22:00') and coalesce(pref.quiet_from,'22:00')>=coalesce(pref.quiet_to,'07:00') then interval '1 day' else interval '0' end) at time zone coalesce(pref.timezone,'Europe/Prague');
   update private.notification_push_jobs set status='queued',available_at=delay_until where notification_id=j.notification_id; continue;
  end if;
  select coalesce(jsonb_agg(to_jsonb(d)-'user_id'-'profile_id'-'installation_id'-'enabled'-'updated_at'),'[]') into devices
   from private.notification_devices d where d.enabled and d.user_id=n.recipient_user_id and d.profile_id=n.recipient_profile_id and d.platform=any(p_platforms) and not d.id=any(j.delivered_devices);
  if jsonb_array_length(devices)=0 then update private.notification_push_jobs set status='queued',available_at=v_now+interval '1 hour',locked_until=null where notification_id=j.notification_id; continue; end if;
  if work+jsonb_array_length(devices)>16 then exit; end if;
  work:=work+jsonb_array_length(devices);
  -- The worker groups eligible claimed messages by recipient/category/group.
  token:=gen_random_uuid();
  update private.notification_push_jobs set status='running',lease_token=token,locked_until=v_now+interval '3 minutes',attempts=attempts+1 where notification_id=j.notification_id;
  result:=result||jsonb_build_array(jsonb_build_object('notification',to_jsonb(n),'lease',token,'devices',devices));
 end loop;
 return result;
end $$;
create function public.finish_notification_push(p_id uuid,p_lease uuid,p_delivered uuid[],p_invalid uuid[],p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 -- A platform that has not been configured stays pending instead of being lost.
 update private.notification_push_jobs as job set status=case
  when p_error is null and not exists(select 1 from private.notification_devices d join public.app_notifications n on n.id=p_id
   where d.enabled and d.user_id=n.recipient_user_id and d.profile_id=n.recipient_profile_id
    and not d.id=any(job.delivered_devices||coalesce(p_delivered,'{}'::uuid[])||coalesce(p_invalid,'{}'::uuid[]))) then 'sent'
  when attempts>=8 then 'failed' else 'queued' end,
 delivered_devices=array(select distinct unnest(delivered_devices||coalesce(p_delivered,'{}'::uuid[]))),last_error=left(p_error,160),
 available_at=clock_timestamp()+interval '1 minute'*power(2,least(attempts,6)),locked_until=null,lease_token=null
 where notification_id=p_id and status='running' and lease_token=p_lease and locked_until>clock_timestamp();
 if not found then raise exception 'Stale notification lease' using errcode='40001'; end if;
 update private.notification_devices set enabled=false where id=any(coalesce(p_invalid,'{}'::uuid[]));
end $$;

create function private.dispatch_notification_worker() returns void language plpgsql security definer set search_path='' as $$
declare secret text; base_url text;
begin
 perform private.generate_notification_reminders();
 select worker_secret into secret from private.notification_control where singleton and push_enabled;
 if secret is null or not exists(select 1 from private.notification_push_jobs where status='queued' and available_at<=clock_timestamp() or status='running' and locked_until<clock_timestamp()) then return; end if;
 -- Reuse only the existing project URL, never the invoice worker credential.
 select regexp_replace(decrypted_secret,'/functions/v1/[^/]+$','') into base_url from vault.decrypted_secrets where name='invoice_pdf_worker_url' limit 1;
 if base_url is null then return; end if;
 perform net.http_post(url:=rtrim(base_url,'/')||'/functions/v1/send-notifications',headers:=jsonb_build_object('Content-Type','application/json','x-notification-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=5000);
end $$;
revoke all on function private.generate_notification_reminders(),private.notification_actionable(public.app_notifications),private.dispatch_notification_worker(),public.claim_notification_push(text,text[]),public.finish_notification_push(uuid,uuid,uuid[],uuid[],text) from public,anon,authenticated;
grant execute on function public.claim_notification_push(text,text[]),public.finish_notification_push(uuid,uuid,uuid[],uuid[],text) to service_role;
select cron.schedule('nodu-notifications','* * * * *','select private.dispatch_notification_worker()');

create function public.authorize_notification_worker(p_secret text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.notification_control where singleton and worker_secret=p_secret)
$$;
revoke all on function public.authorize_notification_worker(text) from public,anon,authenticated;
grant execute on function public.authorize_notification_worker(text) to service_role;
create function private.activate_notification_push() returns trigger language plpgsql set search_path='' as $$
begin
 if new.push_enabled and not old.push_enabled then new.push_activated_at:=clock_timestamp(); end if;
 return new;
end $$;
revoke all on function private.activate_notification_push() from public,anon,authenticated;
create trigger activate_notification_push before update on private.notification_control for each row execute function private.activate_notification_push();

create function public.open_my_notification(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or public.current_profile_id() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 update public.app_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=p_id and recipient_user_id=auth.uid() and recipient_profile_id=public.current_profile_id()
 returning to_jsonb(app_notifications) into result;
 if result is null then raise exception 'Upozornění není dostupné pro tento účet.' using errcode='42501'; end if;
 return result;
end $$;
revoke all on function public.open_my_notification(uuid) from public,anon;
grant execute on function public.open_my_notification(uuid) to authenticated;

create function public.list_event_notification_contacts()
returns table(profile_id uuid,name text,phone text,can_approve_hours boolean,can_coordinate boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.has_role(auth.uid(),'coo') or public.has_role(auth.uid(),'crewhead')) then
  raise exception 'timelog_approval_unauthorized' using errcode='42501';
 end if;
 return query select p.id,btrim(concat_ws(' ',p.first_name,p.last_name)),p.phone,
  p.user_id is not null and public.has_role(p.user_id,'coo'),
  p.user_id is not null and (public.has_role(p.user_id,'coo') or public.has_role(p.user_id,'crewhead'))
 from public.profiles p order by p.first_name,p.last_name,p.id;
end $$;
revoke all on function public.list_event_notification_contacts() from public,anon;
grant execute on function public.list_event_notification_contacts() to authenticated;
