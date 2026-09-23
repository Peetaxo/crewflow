-- Shared draft writes and frozen rounds. No business data is backfilled.
begin;

alter table public.shift_workflow_requests drop constraint shift_workflow_requests_kind_check;
alter table public.shift_workflow_requests add constraint shift_workflow_requests_kind_check
  check(kind in ('save_membership','save_drafts','submit_round','transition_round'));
alter table public.shift_workflow_round_actions add column before_snapshot jsonb
  check(before_snapshot is null or jsonb_typeof(before_snapshot)='array');

-- These permits exist only while one verified operation executes. They are not
-- API tables and no caller can manufacture a permit through a GUC or JWT claim.
create table private.shift_workflow_write_permits (
  transaction_id xid8 not null,
  actor_id uuid not null,
  timelog_id uuid not null,
  operation text not null check(operation in ('save','submit','correct','confirm','handoff','approve','return')),
  from_status public.timelog_status not null,
  to_status public.timelog_status not null,
  edit_days boolean not null,
  primary key(transaction_id,actor_id,timelog_id)
);
create table private.shift_workflow_assignment_permits (
  transaction_id xid8 not null,
  actor_id uuid not null,
  event_id uuid not null,
  contractor_id uuid not null,
  operation text not null check(operation in ('assign','remove')),
  timelog_id uuid,
  primary key(transaction_id,actor_id,event_id,contractor_id)
);
alter table private.shift_workflow_write_permits enable row level security;
alter table private.shift_workflow_assignment_permits enable row level security;
create policy shift_workflow_write_permits_deny on private.shift_workflow_write_permits
 as restrictive for all to authenticated using(false) with check(false);
create policy shift_workflow_assignment_permits_deny on private.shift_workflow_assignment_permits
 as restrictive for all to authenticated using(false) with check(false);
revoke all on private.shift_workflow_write_permits,private.shift_workflow_assignment_permits
  from public,anon,authenticated,service_role;

create function private.guard_shared_shift_timelog() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 v_id uuid; v_event uuid; v_contractor uuid; v_has_history boolean;
 v_permit private.shift_workflow_write_permits%rowtype;
begin
 if tg_op='INSERT' then v_id:=new.id; v_event:=new.event_id; v_contractor:=new.contractor_id;
 else v_id:=old.id; v_event:=old.event_id; v_contractor:=old.contractor_id; end if;
 select exists(select 1 from public.shift_workflow_round_items i where i.timelog_id=v_id) into v_has_history;
 if not v_has_history and not exists(select 1 from public.shift_workflow_events e where e.event_id=v_event) then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='UPDATE' then
  select * into v_permit from private.shift_workflow_write_permits p
   where p.transaction_id=pg_current_xact_id() and p.actor_id=auth.uid() and p.timelog_id=old.id;
  if found and old.status=v_permit.from_status and new.status in(v_permit.from_status,v_permit.to_status)
    and new.id=old.id and new.event_id=old.event_id and new.contractor_id=old.contractor_id
    and new.created_at=old.created_at then return new; end if;
  -- Keep explicit billing transitions after a completed approval. Data remains
  -- immutable, and the existing role guard still authorizes the transition.
  if old.status in('approved','invoiced') and new.status in('approved','invoiced','paid')
    and (to_jsonb(new)-array['status','updated_at'])=(to_jsonb(old)-array['status','updated_at']) then return new; end if;
 elsif not v_has_history and exists(
  select 1 from private.shift_workflow_assignment_permits p
   where p.transaction_id=pg_current_xact_id() and p.actor_id=auth.uid()
    and p.event_id=v_event and p.contractor_id=v_contractor
    and ((tg_op='INSERT' and p.operation='assign' and p.timelog_id is null)
      or (tg_op='DELETE' and p.operation='remove' and p.timelog_id=old.id))
 ) then
  if tg_op='INSERT' then
   if new.status<>'draft' or coalesce(new.km,0)<>0 or coalesce(new.note,'')<>'' then
    raise exception 'shared_shift_write_required' using errcode='42501';
   end if;
   update private.shift_workflow_assignment_permits set timelog_id=new.id
    where transaction_id=pg_current_xact_id() and actor_id=auth.uid()
     and event_id=v_event and contractor_id=v_contractor and operation='assign';
   return new;
  elsif old.status='draft' then return old;
  end if;
 end if;
 raise exception 'shared_shift_write_required' using errcode='42501';
end $$;
create trigger a_shared_shift_timelog_write before insert or update or delete on public.timelogs
 for each row execute function private.guard_shared_shift_timelog();

create function private.guard_shared_shift_day() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_ids uuid[]; v_parent public.timelogs%rowtype; v_check integer;
begin
 if tg_op='INSERT' then v_ids:=array[new.timelog_id];
 elsif tg_op='DELETE' then v_ids:=array[old.timelog_id];
 else v_ids:=array[old.timelog_id,new.timelog_id]; end if;
 for v_id in select distinct x from unnest(v_ids) x order by x loop
  -- A raw UPDATE can already hold a day tuple before BEFORE ROW triggers run.
  -- Deny known shared writes before waiting on a parent held by the legitimate
  -- parent-first batch. Then lock/recheck to also close concurrent linking races.
  select * into v_parent from public.timelogs where id=v_id;
  if not found and tg_op='DELETE' then continue; end if;
  for v_check in 1..2 loop
  if exists(select 1 from public.shift_workflow_round_items i where i.timelog_id=v_id)
   or exists(select 1 from public.shift_workflow_events e where e.event_id=v_parent.event_id) then
   if not exists(select 1 from private.shift_workflow_write_permits p
     where p.transaction_id=pg_current_xact_id() and p.actor_id=auth.uid() and p.timelog_id=v_id and p.edit_days
       and v_parent.status in(p.from_status,p.to_status))
    and not exists(select 1 from private.shift_workflow_assignment_permits p
     where p.transaction_id=pg_current_xact_id() and p.actor_id=auth.uid() and p.timelog_id=v_id
       and p.event_id=v_parent.event_id and p.contractor_id=v_parent.contractor_id
       and p.operation='assign' and v_parent.status='draft') then
    raise exception 'shared_shift_write_required' using errcode='42501';
   end if;
  end if;
   if v_check=1 then
    select * into v_parent from public.timelogs where id=v_id for update;
    if not found and tg_op='DELETE' then exit; end if;
   end if;
  end loop;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger a_shared_shift_day_write before insert or update or delete on public.timelog_days
 for each row execute function private.guard_shared_shift_day();

create function private.guard_active_shift_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.event_id=old.event_id and new.profile_id=old.profile_id then return new; end if;
 if exists(select 1 from public.shift_workflow_round_items i
   join public.shift_workflow_rounds r on r.id=i.round_id
   where i.event_id=old.event_id and r.contractor_id=old.profile_id and i.released_at is null) then
  raise exception 'shared_shift_assignment_locked' using errcode='55000';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger guard_active_shift_assignment before update or delete on public.event_assignments
 for each row execute function private.guard_active_shift_assignment();

-- Preserve both canonical assignment implementations, but make their only API
-- entrances verify the exact operation before staging an initialization permit.
alter function public.assign_event_crew(uuid,uuid,uuid,jsonb) set schema private;
alter function private.assign_event_crew(uuid,uuid,uuid,jsonb) rename to assign_event_crew_before_shared_rounds;
alter function public.remove_event_crew(uuid,uuid) set schema private;
alter function private.remove_event_crew(uuid,uuid) rename to remove_event_crew_before_shared_rounds;
revoke all on function private.assign_event_crew_before_shared_rounds(uuid,uuid,uuid,jsonb),
 private.remove_event_crew_before_shared_rounds(uuid,uuid) from public,anon,authenticated,service_role;
create function private.shift_workflow_assignment(p_event_id uuid,p_profile_id uuid,p_application_id uuid,p_days jsonb,p_remove boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_timelog uuid;
begin
 if auth.uid() is null or not(public.has_role(auth.uid(),'crewhead') or public.has_role(auth.uid(),'coo')) then
  raise exception 'crew_lifecycle_unauthorized' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text||':'||p_profile_id::text,0));
 perform id from public.events where id=p_event_id for update;
 select id into v_timelog from public.timelogs where event_id=p_event_id and contractor_id=p_profile_id for update;
 insert into private.shift_workflow_assignment_permits(transaction_id,actor_id,event_id,contractor_id,operation,timelog_id)
 values(pg_current_xact_id(),auth.uid(),p_event_id,p_profile_id,case when p_remove then 'remove' else 'assign' end,v_timelog);
 if p_remove then v_result:=private.remove_event_crew_before_shared_rounds(p_event_id,p_profile_id);
 else v_result:=private.assign_event_crew_before_shared_rounds(p_event_id,p_profile_id,p_application_id,p_days); end if;
 delete from private.shift_workflow_assignment_permits where transaction_id=pg_current_xact_id() and actor_id=auth.uid()
  and event_id=p_event_id and contractor_id=p_profile_id;
 return v_result;
end $$;
create function public.assign_event_crew(p_event_id uuid,p_profile_id uuid,p_application_id uuid default null,p_days jsonb default '[]')
returns jsonb language sql security invoker set search_path='' as $$
 select private.shift_workflow_assignment(p_event_id,p_profile_id,p_application_id,p_days,false)
$$;
create function public.remove_event_crew(p_event_id uuid,p_profile_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.shift_workflow_assignment(p_event_id,p_profile_id,null,null,true)
$$;

-- Retain the generic authorization rules. The only new exception is a verified
-- CH correction; a caller cannot obtain this capability via the old endpoints.
create or replace function public.enforce_timelog_update_permissions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Timelog update requires authentication.' using errcode='42501'; end if;
 if new.id is distinct from old.id or new.event_id is distinct from old.event_id
  or new.contractor_id is distinct from old.contractor_id or new.created_at is distinct from old.created_at then
  raise exception 'Timelog identity fields cannot be changed.' using errcode='42501';
 end if;
 if public.has_role(auth.uid(),'crewhead') and old.status='pending_ch'
  and new.status in('pending_ch','pending_crew_confirmation') and exists(
   select 1 from private.shift_workflow_write_permits p where p.transaction_id=pg_current_xact_id()
    and p.actor_id=auth.uid() and p.timelog_id=old.id and p.operation='correct'
    and p.from_status='pending_ch' and p.to_status='pending_crew_confirmation' and p.edit_days
  ) then return new; end if;
 if current_setting('crewflow.approved_timelog_import',true)='on' and public.has_role(auth.uid(),'coo')
  and old.status in('draft','rejected','pending_coo') and new.status in(old.status,'approved') then return new; end if;
 if public.has_role(auth.uid(),'crew') and old.contractor_id=public.current_profile_id()
  and old.status in('draft','rejected','pending_crew_confirmation')
  and new.status in('draft','rejected','pending_crew_confirmation','pending_ch') then return new; end if;
 if public.has_role(auth.uid(),'crewhead') and (
  (old.status='draft' and new.status in('draft','pending_ch'))
  or (old.status='pending_ch' and new.status in('pending_ch','pending_coo','rejected'))
 ) then return new; end if;
 if public.has_role(auth.uid(),'coo') and new.id is not distinct from old.id
  and new.event_id is not distinct from old.event_id and new.contractor_id is not distinct from old.contractor_id
  and new.km is not distinct from old.km and new.note is not distinct from old.note and new.created_at is not distinct from old.created_at
  and ((old.status='pending_coo' and new.status in('approved','rejected'))
   or (old.status='approved' and new.status in('invoiced','paid'))
   or (old.status='invoiced' and new.status in('approved','paid'))) then return new; end if;
 raise exception 'Timelog update is not allowed for this role and status.' using errcode='42501';
end $$;

-- now() is constant within a transaction. Shared operation versions must still
-- advance when a correction/save/confirmation occurs in the same transaction.
create function private.version_shared_shift_timelog() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.shift_workflow_write_permits p where p.transaction_id=pg_current_xact_id()
   and p.actor_id=auth.uid() and p.timelog_id=old.id)
  or exists(select 1 from public.shift_workflow_round_items i where i.timelog_id=old.id)
  or exists(select 1 from public.shift_workflow_events e where e.event_id=old.event_id) then
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 end if;
 return new;
end $$;
create trigger zz_shared_shift_version before update on public.timelogs
 for each row execute function private.version_shared_shift_timelog();

create function private.validate_shift_timelog_payload(p_timelogs jsonb,p_complete boolean) returns void
language plpgsql set search_path='' as $$
declare v_row jsonb; v_day jsonb; v_status public.timelog_status; v_days uuid[]:='{}'::uuid[]; v_day_id uuid;
begin
 if p_timelogs is null or jsonb_typeof(p_timelogs)<>'array' or jsonb_array_length(p_timelogs) not between 1 and 200 then
  raise exception 'shift_workflow_invalid' using errcode='22023';
 end if;
 for v_row in select value from jsonb_array_elements(p_timelogs) loop
  if jsonb_typeof(v_row)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(v_row) k)
    is distinct from array['days','event_id','expected_status','expected_updated_at','id','km','note']::text[] then
   raise exception 'shift_workflow_invalid' using errcode='22023';
  end if;
  if (v_row->>'id')::uuid is null or (v_row->>'event_id')::uuid is null
   or (v_row->>'expected_updated_at')::timestamptz is null or not isfinite((v_row->>'expected_updated_at')::timestamptz)
   or (v_row->>'expected_status')::public.timelog_status is null
   or jsonb_typeof(v_row->'km')<>'number' or (v_row->>'km')::numeric<0
   or jsonb_typeof(v_row->'note')<>'string' or jsonb_typeof(v_row->'days')<>'array'
   or jsonb_array_length(v_row->'days')>500 then raise exception 'shift_workflow_invalid' using errcode='22023'; end if;
  v_status:=(v_row->>'expected_status')::public.timelog_status;
  if jsonb_array_length(v_row->'days')=0 and (p_complete or v_status<>'draft') then
   raise exception 'shift_workflow_incomplete' using errcode='22023';
  end if;
  for v_day in select value from jsonb_array_elements(v_row->'days') loop
   if jsonb_typeof(v_day)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(v_day) k)
    is distinct from array['date','day_type','id','meal','meals','note','time_from','time_to']::text[] then
    raise exception 'shift_workflow_day_invalid' using errcode='22023';
   end if;
   v_day_id:=(v_day->>'id')::uuid;
   if v_day_id is null or v_day_id=any(v_days) or nullif(v_day->>'date','') is null
    or not isfinite((v_day->>'date')::date) or (v_day->>'day_type')::public.timelog_type is null
    or (v_day->>'meal' is not null and v_day->>'meal' not in('obed','vecere'))
    or jsonb_typeof(v_day->'meals')<>'array'
    or exists(select 1 from jsonb_array_elements(v_day->'meals') m where jsonb_typeof(m)<>'string' or m#>>'{}' not in('obed','vecere'))
    or jsonb_typeof(v_day->'note') not in('null','string')
    or jsonb_typeof(v_day->'time_from') not in('null','string') or jsonb_typeof(v_day->'time_to') not in('null','string')
    or (nullif(v_day->>'time_from','') is not null and not public.is_valid_timelog_time(v_day->>'time_from'))
    or (nullif(v_day->>'time_to','') is not null and not public.is_valid_timelog_time(v_day->>'time_to')) then
    raise exception 'shift_workflow_day_invalid' using errcode='22023';
   end if;
   if p_complete and (not public.is_valid_timelog_time(v_day->>'time_from') or not public.is_valid_timelog_time(v_day->>'time_to')
    or (v_day->>'time_from')::time=(v_day->>'time_to')::time) then
    raise exception 'shift_workflow_incomplete' using errcode='22023';
   end if;
   v_days:=array_append(v_days,v_day_id);
  end loop;
 end loop;
 if jsonb_array_length(p_timelogs)<>(select count(distinct (x->>'id')::uuid) from jsonb_array_elements(p_timelogs) x)
  or jsonb_array_length(p_timelogs)<>(select count(distinct (x->>'event_id')::uuid) from jsonb_array_elements(p_timelogs) x) then
  raise exception 'shift_workflow_set_invalid' using errcode='22023';
 end if;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
 raise exception 'shift_workflow_invalid' using errcode='22023';
end $$;

create function private.write_shift_timelog_payload(p_timelogs jsonb) returns void
language plpgsql set search_path='' as $$
declare v_row jsonb; v_id uuid;
begin
 for v_row in select value from jsonb_array_elements(p_timelogs) order by (value->>'id')::uuid loop
  v_id:=(v_row->>'id')::uuid;
  if exists(select 1 from public.timelog_days d join jsonb_array_elements(v_row->'days') x on d.id=(x->>'id')::uuid
    where d.timelog_id<>v_id) then raise exception 'shift_workflow_day_invalid' using errcode='22023'; end if;
  update public.timelogs set km=(v_row->>'km')::numeric,note=v_row->>'note' where id=v_id;
  delete from public.timelog_days d where d.timelog_id=v_id
   and not exists(select 1 from jsonb_array_elements(v_row->'days') x where (x->>'id')::uuid=d.id);
  insert into public.timelog_days(id,timelog_id,date,time_from,time_to,day_type,note,meal,meals)
  select (x->>'id')::uuid,v_id,(x->>'date')::date,x->>'time_from',x->>'time_to',
   (x->>'day_type')::public.timelog_type,x->>'note',x->>'meal',array(select jsonb_array_elements_text(x->'meals'))
  from jsonb_array_elements(v_row->'days') x
  on conflict(id) do update set date=excluded.date,time_from=excluded.time_from,time_to=excluded.time_to,
   day_type=excluded.day_type,note=excluded.note,meal=excluded.meal,meals=excluded.meals;
 end loop;
end $$;

create function private.shift_round_result(p_request_id uuid,p_workflow_id uuid,p_round_id uuid,p_ids uuid[]) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('request_id',p_request_id,'workflow_id',p_workflow_id,'round',(
  select jsonb_build_object('id',r.id,'workflow_id',r.workflow_id,'contractor_id',r.contractor_id,'status',r.status,
   'event_ids',(select jsonb_agg(i.event_id order by i.position) from public.shift_workflow_round_items i where i.round_id=r.id),
   'timelog_ids',(select jsonb_agg(i.timelog_id order by i.position) from public.shift_workflow_round_items i where i.round_id=r.id),
   'note',r.note,'updated_at',r.updated_at) from public.shift_workflow_rounds r where r.id=p_round_id),
  'timelogs',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'event_id',t.event_id,'contractor_id',t.contractor_id,
   'status',t.status,'updated_at',t.updated_at,'km',t.km,'note',t.note,'review_note',t.review_note,
   'crew_confirmation_snapshot',t.crew_confirmation_snapshot,'submitted_at',t.submitted_at,'approved_at',t.approved_at,
   'days',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'date',d.date,'time_from',d.time_from,'time_to',d.time_to,
    'day_type',d.day_type,'note',d.note,'meal',d.meal,'meals',d.meals) order by d.date,d.created_at,d.id)
    from public.timelog_days d where d.timelog_id=t.id),'[]'::jsonb),
   'approval',(select jsonb_build_object('id',a.id,'approval_round_id',a.approval_round_id,
    'status',a.status,'updated_at',a.updated_at,'approver_profile_id',a.approver_profile_id,'approver_user_id',a.approver_user_id)
    from public.timelog_approvals a where a.timelog_id=t.id and a.superseded_at is null)) order by t.id)
   from public.timelogs t where t.id=any(p_ids)),'[]'::jsonb))
$$;

create function private.save_shift_drafts_or_submit(p_request_id uuid,p_round_id uuid,p_workflow_id uuid,
 p_contractor_id uuid,p_anchor_event_id uuid,p_timelogs jsonb,p_submit boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_payload jsonb; v_previous public.shift_workflow_requests%rowtype;
 v_kind text:=case when p_submit then 'submit_round' else 'save_drafts' end;
 v_events uuid[]; v_expected uuid[]; v_ids uuid[]; v_actual uuid[]; v_frozen uuid; v_result jsonb;
 v_count integer; v_resubmit boolean; v_round public.shift_workflow_rounds%rowtype;
begin
 if v_actor is null or (select count(*) from public.profiles where user_id=v_actor)<>1
  or public.current_profile_id() is distinct from p_contractor_id or not public.has_role(v_actor,'crew') then
  raise exception 'shift_workflow_unauthorized' using errcode='42501';
 end if;
 if p_request_id is null or p_anchor_event_id is null or p_submit is null or (p_submit and p_round_id is null)
  then raise exception 'shift_workflow_invalid' using errcode='22023'; end if;
 v_payload:=jsonb_build_object('round_id',p_round_id,'workflow_id',p_workflow_id,'contractor_id',p_contractor_id,
  'anchor_event_id',p_anchor_event_id,'timelogs',p_timelogs);
 -- Membership, new submissions, and request IDs share one serialization point.
 perform singleton from public.shift_workflow_state where singleton for update;
 select * into v_previous from public.shift_workflow_requests where request_id=p_request_id;
 if found then
  if v_previous.actor_id<>v_actor or v_previous.kind<>v_kind or v_previous.payload is distinct from v_payload then
   raise exception 'shift_workflow_request_conflict' using errcode='22023'; end if;
  return v_previous.result;
 end if;
 perform private.validate_shift_timelog_payload(p_timelogs,p_submit);
 select array_agg((x->>'id')::uuid order by (x->>'id')::uuid),array_agg((x->>'event_id')::uuid order by (x->>'event_id')::uuid)
  into v_ids,v_actual from jsonb_array_elements(p_timelogs) x;
 if p_workflow_id is null then
  if exists(select 1 from public.shift_workflow_events where event_id=p_anchor_event_id) then
   raise exception 'shift_workflow_set_invalid' using errcode='22023'; end if;
  v_events:=array[p_anchor_event_id];
 else
  select array_agg(event_id order by event_id) into v_events from public.shift_workflow_events where workflow_id=p_workflow_id;
  if v_events is null or not p_anchor_event_id=any(v_events) then raise exception 'shift_workflow_set_invalid' using errcode='22023'; end if;
 end if;
 perform id from public.events where id=any(v_events) order by id for update;
 get diagnostics v_count=row_count;
 if v_count<>cardinality(v_events) then raise exception 'shift_workflow_event_not_found' using errcode='P0002'; end if;
 -- The strong event locks serialize FK insertions. Row locks serialize removal
 -- of existing assignments without making old event-first RPCs lock singleton.
 perform id from public.event_assignments where event_id=any(v_events) and profile_id=p_contractor_id order by event_id,id for share;
 select array_agg(event_id order by event_id) into v_expected from public.event_assignments
  where event_id=any(v_events) and profile_id=p_contractor_id;
 if not coalesce(p_anchor_event_id=any(v_expected),false) then raise exception 'shift_workflow_unauthorized' using errcode='42501'; end if;
 if p_submit and exists(select 1 from public.shift_workflow_rounds r
  where r.contractor_id=p_contractor_id and r.workflow_id is not distinct from p_workflow_id
   and r.status in('pending_ch','pending_crew_confirmation','pending_coo')
   and (p_workflow_id is not null or exists(select 1 from public.shift_workflow_round_items i where i.round_id=r.id and i.event_id=p_anchor_event_id))) then
  raise exception 'shift_workflow_round_conflict' using errcode='40001';
 end if;
 if not p_submit and p_round_id is not null then
  select * into v_round from public.shift_workflow_rounds where id=p_round_id for update;
  if not found or v_round.contractor_id<>p_contractor_id or v_round.contractor_user_id<>v_actor
   or v_round.workflow_id is distinct from p_workflow_id or v_round.status<>'pending_crew_confirmation'
   or not exists(select 1 from public.shift_workflow_round_items where round_id=p_round_id and event_id=p_anchor_event_id) then
   raise exception 'shift_workflow_round_conflict' using errcode='40001'; end if;
  v_frozen:=p_round_id;
  select array_agg(event_id order by event_id) into v_expected from public.shift_workflow_round_items where round_id=v_frozen;
  if cardinality(v_expected)<>v_round.expected_item_count then raise exception 'shift_workflow_round_invalid' using errcode='22023'; end if;
 else
  -- Completed historical sections are displayed separately by the client.
  -- Every assigned eligible draft is required, including empty later sections.
  -- Missing canonical reports fail closed rather than disappearing in this join.
  if exists(select 1 from public.event_assignments a left join public.timelogs t
    on t.event_id=a.event_id and t.contractor_id=a.profile_id
    where a.event_id=any(v_events) and a.profile_id=p_contractor_id and t.id is null) then
   raise exception 'shift_workflow_timelog_missing' using errcode='P0002'; end if;
  select array_agg(a.event_id order by a.event_id) into v_expected from public.event_assignments a
   join public.timelogs t on t.event_id=a.event_id and t.contractor_id=a.profile_id
   where a.event_id=any(v_events) and a.profile_id=p_contractor_id and t.status in('draft','rejected')
    and not exists(select 1 from public.shift_workflow_round_items i where i.timelog_id=t.id and i.released_at is null);
 end if;
 if v_actual is distinct from v_expected then raise exception 'shift_workflow_set_invalid' using errcode='22023'; end if;
 perform id from public.timelogs where id=any(v_ids) order by id for update;
 get diagnostics v_count=row_count;
 if v_count<>cardinality(v_ids) then raise exception 'shift_workflow_timelog_missing' using errcode='P0002'; end if;
 if exists(select 1 from jsonb_array_elements(p_timelogs) x join public.timelogs t on t.id=(x->>'id')::uuid
  where t.event_id<>(x->>'event_id')::uuid or t.contractor_id<>p_contractor_id
   or t.updated_at is distinct from (x->>'expected_updated_at')::timestamptz or t.status::text<>x->>'expected_status'
   or (v_frozen is null and t.status not in('draft','rejected'))
   or (v_frozen is not null and (t.status<>'pending_crew_confirmation'
    or not exists(select 1 from public.shift_workflow_round_items i where i.round_id=v_frozen and i.timelog_id=t.id and i.event_id=t.event_id and i.released_at is null)))
   or exists(select 1 from public.shift_workflow_round_items i where i.timelog_id=t.id and i.released_at is null and i.round_id is distinct from v_frozen)
 ) then raise exception 'shift_workflow_timelog_conflict' using errcode='40001'; end if;
 -- Identity changes are serialized with targeted approval's final profile locks.
 perform id from public.profiles where id=p_contractor_id for update;
 if not exists(select 1 from public.profiles where id=p_contractor_id and user_id=v_actor) then
  raise exception 'shift_workflow_unauthorized' using errcode='42501'; end if;
 if exists(select 1 from public.shift_workflow_round_items i join public.shift_workflow_rounds r on r.id=i.round_id
   where i.timelog_id=any(v_ids) and r.contractor_user_id<>v_actor) then
  raise exception 'shift_workflow_unauthorized' using errcode='42501'; end if;
 select exists(select 1 from public.shift_workflow_round_items where timelog_id=any(v_ids)) into v_resubmit;
 insert into private.shift_workflow_write_permits(transaction_id,actor_id,timelog_id,operation,from_status,to_status,edit_days)
 select pg_current_xact_id(),v_actor,t.id,case when p_submit then 'submit' else 'save' end,t.status,
  case when p_submit then 'pending_ch'::public.timelog_status else t.status end,true from public.timelogs t where t.id=any(v_ids);
 perform private.write_shift_timelog_payload(p_timelogs);
 if p_submit then
  if exists(select 1 from public.shift_workflow_rounds where id=p_round_id) then raise exception 'shift_workflow_round_conflict' using errcode='40001'; end if;
  insert into public.shift_workflow_rounds(id,workflow_id,contractor_id,contractor_user_id,expected_item_count,status,created_by)
   values(p_round_id,p_workflow_id,p_contractor_id,v_actor,cardinality(v_ids),'pending_ch',v_actor);
  insert into public.shift_workflow_round_items(round_id,timelog_id,event_id,position)
   select p_round_id,t.id,t.event_id,(row_number() over(order by coalesce(e.position,0),t.event_id)-1)::integer
   from public.timelogs t left join public.shift_workflow_events e on e.event_id=t.event_id where t.id=any(v_ids);
  update public.timelogs set status='pending_ch',submitted_at=clock_timestamp(),approved_at=null,review_note=null,crew_confirmation_snapshot=null where id=any(v_ids);
  insert into public.shift_workflow_round_actions(round_id,actor_id,action,to_status)
   values(p_round_id,v_actor,case when v_resubmit then 'resubmitted' else 'submitted' end,'pending_ch');
  v_frozen:=p_round_id;
 elsif v_frozen is not null then
  update public.shift_workflow_rounds set updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=v_frozen;
 end if;
 v_result:=private.shift_round_result(p_request_id,p_workflow_id,v_frozen,v_ids);
 insert into public.shift_workflow_requests(request_id,actor_id,kind,payload,result) values(p_request_id,v_actor,v_kind,v_payload,v_result);
 delete from private.shift_workflow_write_permits where transaction_id=pg_current_xact_id() and actor_id=v_actor and timelog_id=any(v_ids);
 return v_result;
end $$;

create function private.transition_shift_workflow_round_atomic(p_request_id uuid,p_round_id uuid,p_expected_round_updated_at timestamptz,
 p_targets jsonb,p_action text,p_note text,p_affected_event_id uuid,p_corrections jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_profile uuid; v_payload jsonb; v_previous public.shift_workflow_requests%rowtype;
 v_round public.shift_workflow_rounds%rowtype; v_ids uuid[]; v_expected uuid[]; v_events uuid[];
 v_next text; v_result jsonb; v_before jsonb; v_internal jsonb; v_count integer; v_note text:=btrim(coalesce(p_note,''));
begin
 if v_actor is null or (select count(*) from public.profiles where user_id=v_actor)<>1 then
  raise exception 'shift_workflow_unauthorized' using errcode='42501'; end if;
 v_profile:=public.current_profile_id();
 if p_request_id is null or p_round_id is null or p_expected_round_updated_at is null or not isfinite(p_expected_round_updated_at)
  or p_action is null or p_action not in('approve','handoff','return','correct','confirm') then
  raise exception 'shift_workflow_invalid' using errcode='22023'; end if;
 v_payload:=jsonb_build_object('round_id',p_round_id,'expected_round_updated_at',p_expected_round_updated_at,
  'targets',p_targets,'action',p_action,'note',p_note,'affected_event_id',p_affected_event_id,'corrections',p_corrections);
 perform singleton from public.shift_workflow_state where singleton for update;
 select * into v_previous from public.shift_workflow_requests where request_id=p_request_id;
 if found then
  if v_previous.actor_id<>v_actor or v_previous.kind<>'transition_round' or v_previous.payload is distinct from v_payload then
   raise exception 'shift_workflow_request_conflict' using errcode='22023'; end if;
  return v_previous.result;
 end if;
 select * into v_round from public.shift_workflow_rounds where id=p_round_id;
 if not found then raise exception 'shift_workflow_round_not_found' using errcode='P0002'; end if;
 select array_agg(i.timelog_id order by i.timelog_id),array_agg(i.event_id order by i.event_id) into v_expected,v_events
  from public.shift_workflow_round_items i where i.round_id=p_round_id;
 if cardinality(v_expected) is distinct from v_round.expected_item_count then raise exception 'shift_workflow_round_invalid' using errcode='22023'; end if;
 perform id from public.events where id=any(v_events) order by id for update;
 select * into v_round from public.shift_workflow_rounds where id=p_round_id for update;
 if v_round.updated_at is distinct from p_expected_round_updated_at then raise exception 'shift_workflow_round_conflict' using errcode='40001'; end if;
 if p_targets is null or jsonb_typeof(p_targets)<>'array' or jsonb_array_length(p_targets)<>v_round.expected_item_count then
  raise exception 'shift_workflow_set_invalid' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_targets) x where case when jsonb_typeof(x)<>'object' then true
  else (select array_agg(k order by k) from jsonb_object_keys(x) k) is distinct from array['expected_status','expected_updated_at','id']::text[] end) then
  raise exception 'shift_workflow_invalid' using errcode='22023'; end if;
 begin
  select array_agg((x->>'id')::uuid order by (x->>'id')::uuid) into v_ids from jsonb_array_elements(p_targets) x;
  if exists(select 1 from jsonb_array_elements(p_targets) x where (x->>'expected_updated_at')::timestamptz is null
    or not isfinite((x->>'expected_updated_at')::timestamptz) or (x->>'expected_status')::public.timelog_status is null) then
   raise exception 'shift_workflow_invalid' using errcode='22023'; end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'shift_workflow_invalid' using errcode='22023'; end;
 if v_ids is distinct from v_expected then raise exception 'shift_workflow_set_invalid' using errcode='22023'; end if;
 perform id from public.timelogs where id=any(v_ids) order by id for update;
 get diagnostics v_count=row_count;
 if v_count<>v_round.expected_item_count or exists(
  select 1 from public.shift_workflow_round_items i join public.timelogs t on t.id=i.timelog_id
   join jsonb_array_elements(p_targets) x on (x->>'id')::uuid=t.id
  where i.round_id=p_round_id and (i.released_at is not null or t.event_id<>i.event_id or t.contractor_id<>v_round.contractor_id
   or t.status::text<>v_round.status or t.status::text<>x->>'expected_status'
   or t.updated_at is distinct from (x->>'expected_updated_at')::timestamptz)
 ) then raise exception 'shift_workflow_timelog_conflict' using errcode='40001'; end if;
 if p_action in('return','correct') then
  if v_note='' or p_affected_event_id is null or not p_affected_event_id=any(v_events) then
   raise exception 'shift_workflow_note_required' using errcode='22023'; end if;
 elsif p_affected_event_id is not null or v_note<>'' then raise exception 'shift_workflow_invalid' using errcode='22023'; end if;
 if p_action<>'correct' and p_corrections is not null then raise exception 'shift_workflow_invalid' using errcode='22023'; end if;
 if v_round.status='pending_ch' and public.has_role(v_actor,'crewhead') and p_action in('approve','handoff','return','correct') then
  v_next:=case when p_action in('approve','handoff') then 'pending_coo' when p_action='correct' then 'pending_crew_confirmation' else 'rejected' end;
 elsif v_round.status='pending_coo' and public.has_role(v_actor,'coo') and p_action in('approve','return') then
  v_next:=case when p_action='approve' then 'approved' else 'rejected' end;
 elsif v_round.status='pending_crew_confirmation' and p_action='confirm' and v_round.contractor_id=v_profile
  and v_round.contractor_user_id=v_actor and public.has_role(v_actor,'crew') then v_next:='pending_ch';
 else raise exception 'shift_workflow_unauthorized' using errcode='42501'; end if;
 -- Lock every profile the existing targeted helpers will touch, in their UUID
 -- order. Checking the frozen author without this lock could race a profile
 -- relink while handoff/resolution subsequently waits for that same profile.
 perform p.id from public.profiles p where p.id in(v_profile,v_round.contractor_id)
  or p.id in(select case when e.contact_approves_hours then e.contact_profile_id else e.timelog_approver_profile_id end
    from public.events e where e.id=any(v_events))
  or p.id in(select a.approver_profile_id from public.timelog_approvals a where a.timelog_id=any(v_ids) and a.superseded_at is null)
  or p.id in(select a.requested_by_profile_id from public.timelog_approvals a where a.timelog_id=any(v_ids) and a.superseded_at is null)
  order by p.id for update;
 -- Every decision also checks the frozen author binding, including managers.
 if not exists(select 1 from public.profiles where id=v_round.contractor_id and user_id=v_round.contractor_user_id)
  or not exists(select 1 from public.profiles where id=v_profile and user_id=v_actor)
  or (select count(*) from public.profiles where user_id=v_actor)<>1 then
  raise exception 'shift_workflow_unauthorized' using errcode='42501'; end if;
 if v_next='pending_coo' then
  if exists(select 1 from public.events e where e.id=any(v_events)
    and (case when e.contact_approves_hours then e.contact_profile_id else e.timelog_approver_profile_id end) is null)
   or (select count(distinct case when e.contact_approves_hours then e.contact_profile_id else e.timelog_approver_profile_id end)
    from public.events e where e.id=any(v_events))<>1 then
   raise exception 'shift_workflow_approver_mismatch' using errcode='22023'; end if;
 end if;
 if p_action='correct' then
  perform private.validate_shift_timelog_payload(p_corrections,false);
  if (select array_agg((x->>'id')::uuid order by (x->>'id')::uuid) from jsonb_array_elements(p_corrections) x) is distinct from v_ids
    or exists(select 1 from jsonb_array_elements(p_corrections) x join public.timelogs t on t.id=(x->>'id')::uuid
      where t.event_id<>(x->>'event_id')::uuid or t.updated_at is distinct from (x->>'expected_updated_at')::timestamptz or t.status::text<>x->>'expected_status') then
   raise exception 'shift_workflow_set_invalid' using errcode='22023'; end if;
  select jsonb_agg(x-'crew_confirmation_snapshot' order by x->>'id') into v_before
   from jsonb_array_elements(private.shift_round_result(p_request_id,v_round.workflow_id,p_round_id,v_ids)->'timelogs') x;
 end if;
 insert into private.shift_workflow_write_permits(transaction_id,actor_id,timelog_id,operation,from_status,to_status,edit_days)
 select pg_current_xact_id(),v_actor,id,case when v_next='pending_coo' then 'handoff' else p_action end,status,v_next::public.timelog_status,p_action='correct'
  from public.timelogs where id=any(v_ids);
 if v_next='pending_coo' then
  select jsonb_agg(jsonb_build_object('id',t.id,'expected_updated_at',t.updated_at,'approval_id',gen_random_uuid(),'approval_round_id',gen_random_uuid()) order by t.id)
   into v_internal from public.timelogs t where t.id=any(v_ids);
  perform private.handoff_timelogs_for_approval_atomic(v_internal);
 elsif v_round.status='pending_coo' then
  if (select count(*) from public.timelog_approvals a where a.timelog_id=any(v_ids) and a.superseded_at is null and a.status='pending')<>v_round.expected_item_count then
   raise exception 'shift_workflow_round_invalid' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('id',t.id,'expected_updated_at',t.updated_at,'approval_id',a.id,'approval_updated_at',a.updated_at) order by t.id)
   into v_internal from public.timelogs t join public.timelog_approvals a on a.timelog_id=t.id and a.superseded_at is null and a.status='pending' where t.id=any(v_ids);
  perform private.resolve_timelog_approvals_atomic(v_internal,case when p_action='approve' then 'approved' else 'returned' end,v_note);
 else
  if p_action='correct' then
   update public.timelogs t set crew_confirmation_snapshot=(select x from jsonb_array_elements(v_before) x where (x->>'id')::uuid=t.id) where t.id=any(v_ids);
   perform private.write_shift_timelog_payload(p_corrections);
  end if;
  update public.timelogs set status=v_next::public.timelog_status,
   review_note=case when p_action in('return','correct') then v_note else review_note end where id=any(v_ids);
  if p_action='confirm' then perform private.assert_timelog_complete(id) from unnest(v_ids) id; end if;
 end if;
 update public.shift_workflow_rounds set status=v_next,note=case when p_action in('return','correct') then v_note else note end,
  updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=p_round_id;
 if v_next in('approved','rejected') then update public.shift_workflow_round_items set released_at=clock_timestamp() where round_id=p_round_id; end if;
 insert into public.shift_workflow_round_actions(round_id,actor_id,event_id,action,from_status,to_status,note,before_snapshot)
  values(p_round_id,v_actor,p_affected_event_id,p_action,v_round.status,v_next,v_note,v_before);
 v_result:=private.shift_round_result(p_request_id,v_round.workflow_id,p_round_id,v_ids);
 insert into public.shift_workflow_requests(request_id,actor_id,kind,payload,result) values(p_request_id,v_actor,'transition_round',v_payload,v_result);
 delete from private.shift_workflow_write_permits where transaction_id=pg_current_xact_id() and actor_id=v_actor and timelog_id=any(v_ids);
 return v_result;
end $$;

create function public.save_shift_workflow_drafts_atomic(p_request_id uuid,p_workflow_id uuid,p_contractor_id uuid,p_anchor_event_id uuid,p_timelogs jsonb,p_round_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_shift_drafts_or_submit(p_request_id,p_round_id,p_workflow_id,p_contractor_id,p_anchor_event_id,p_timelogs,false)
$$;
create function public.submit_shift_workflow_round_atomic(p_request_id uuid,p_round_id uuid,p_workflow_id uuid,p_contractor_id uuid,p_anchor_event_id uuid,p_timelogs jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_shift_drafts_or_submit(p_request_id,p_round_id,p_workflow_id,p_contractor_id,p_anchor_event_id,p_timelogs,true)
$$;
create function public.transition_shift_workflow_round_atomic(p_request_id uuid,p_round_id uuid,p_expected_round_updated_at timestamptz,
 p_targets jsonb,p_action text,p_note text,p_affected_event_id uuid,p_corrections jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.transition_shift_workflow_round_atomic(p_request_id,p_round_id,p_expected_round_updated_at,p_targets,p_action,p_note,p_affected_event_id,p_corrections)
$$;

revoke all on function private.guard_shared_shift_timelog(),private.guard_shared_shift_day(),private.guard_active_shift_assignment(),
 private.version_shared_shift_timelog(),private.validate_shift_timelog_payload(jsonb,boolean),private.write_shift_timelog_payload(jsonb),
 private.shift_round_result(uuid,uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
revoke all on function private.shift_workflow_assignment(uuid,uuid,uuid,jsonb,boolean),
 private.save_shift_drafts_or_submit(uuid,uuid,uuid,uuid,uuid,jsonb,boolean),
 private.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb),
 public.assign_event_crew(uuid,uuid,uuid,jsonb),public.remove_event_crew(uuid,uuid),
 public.save_shift_workflow_drafts_atomic(uuid,uuid,uuid,uuid,jsonb,uuid),
 public.submit_shift_workflow_round_atomic(uuid,uuid,uuid,uuid,uuid,jsonb),
 public.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function private.shift_workflow_assignment(uuid,uuid,uuid,jsonb,boolean),
 private.save_shift_drafts_or_submit(uuid,uuid,uuid,uuid,uuid,jsonb,boolean),
 private.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb),
 public.assign_event_crew(uuid,uuid,uuid,jsonb),public.remove_event_crew(uuid,uuid),
 public.save_shift_workflow_drafts_atomic(uuid,uuid,uuid,uuid,jsonb,uuid),
 public.submit_shift_workflow_round_atomic(uuid,uuid,uuid,uuid,uuid,jsonb),
 public.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb) to authenticated;

commit;
