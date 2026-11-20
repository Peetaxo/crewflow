-- A submitted PDF is a private, immutable source document until the hours are approved.
create table private.shift_invoice_uploads (
  id uuid primary key,
  user_id uuid not null,
  profile_id uuid not null,
  timelog_ids uuid[] not null check (cardinality(timelog_ids) > 0),
  customer jsonb not null,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size between 1 and 5242880),
  invoice_number text not null check (char_length(invoice_number) between 1 and 120),
  issue_date date not null,
  due_date date not null check (due_date >= issue_date),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default clock_timestamp()
);

-- A null value records an explicit removal. It must not fall back to an older file.
create table private.shift_invoice_round_files (
  round_id uuid primary key references public.shift_workflow_rounds(id),
  attachment_id uuid references private.shift_invoice_uploads(id)
);
create index shift_invoice_round_files_attachment_idx on private.shift_invoice_round_files(attachment_id);
create table private.shift_invoice_choices (
  request_id uuid primary key,
  round_id uuid not null references public.shift_workflow_rounds(id),
  attachment_id uuid references private.shift_invoice_uploads(id),
  explicit_choice boolean not null
);
create table private.shift_invoice_statement_files (
  statement_id uuid not null references public.invoice_billing_statements(id),
  attachment_id uuid not null references private.shift_invoice_uploads(id),
  reason text check (reason in ('amount_changed','customer_changed','scope_changed','document_unavailable')),
  primary key (statement_id,attachment_id)
);
create index shift_invoice_statement_files_attachment_idx on private.shift_invoice_statement_files(attachment_id);

alter table private.shift_invoice_uploads enable row level security;
alter table private.shift_invoice_round_files enable row level security;
alter table private.shift_invoice_choices enable row level security;
alter table private.shift_invoice_statement_files enable row level security;
revoke all on private.shift_invoice_uploads, private.shift_invoice_round_files, private.shift_invoice_choices,
  private.shift_invoice_statement_files from public, anon, authenticated, service_role;

create function private.shift_invoice_sorted_ids(p_ids uuid[]) returns uuid[]
language sql immutable set search_path = '' as $$
  select array_agg(id order by id) from unnest(p_ids) as input(id)
$$;

create function private.shift_invoice_customer(p_ids uuid[]) returns jsonb
language sql stable set search_path = '' as $$
  select case when count(distinct customer) = 1 then (jsonb_agg(customer)->0) end
  from (
    select private.invoice_billing_customer(t.event_id) as customer
    from public.timelogs t where t.id = any(p_ids)
  ) as sources
$$;

create function private.shift_invoice_scope_owned(p_user_id uuid,p_profile_id uuid,p_ids uuid[]) returns boolean
language sql stable set search_path = '' as $$
  select p_user_id is not null
    and public.has_role(p_user_id,'crew')
    and exists (select 1 from public.profiles p where p.id=p_profile_id and p.user_id=p_user_id)
    and cardinality(p_ids) between 1 and 200
    and cardinality(p_ids) = (
      select count(*) from public.timelogs t
      where t.id=any(p_ids) and t.contractor_id=p_profile_id
    )
$$;

create function private.shift_invoice_editable(p_profile_id uuid,p_ids uuid[]) returns boolean
language sql stable set search_path = '' as $$
  select not exists (select 1 from public.invoice_billing_consents where contractor_id=p_profile_id and enabled)
    and not exists (
      select 1 from public.timelogs t where t.id=any(p_ids)
      and (t.status not in ('draft','rejected','pending_crew_confirmation') or not exists (
        select 1 from public.event_assignments a where a.event_id=t.event_id and a.profile_id=p_profile_id
      ))
    )
$$;

create function private.shift_invoice_last_round(p_user_id uuid,p_profile_id uuid,p_ids uuid[],p_except uuid default null)
returns uuid language sql stable set search_path = '' as $$
  select r.id
  from public.shift_workflow_rounds r
  join private.shift_invoice_round_files f on f.round_id=r.id
  where r.contractor_user_id=p_user_id and r.contractor_id=p_profile_id and r.id is distinct from p_except
    and exists (
      select 1 from public.shift_workflow_round_items i where i.round_id=r.id and i.timelog_id=any(p_ids)
    )
  order by r.created_at desc,r.id desc limit 1
$$;

create function private.shift_invoice_document_available(p_path text,p_size bigint) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from storage.objects o where o.bucket_id='invoice-pdfs' and o.name=p_path
      and o.metadata->>'mimetype'='application/pdf' and o.metadata->>'size'=p_size::text
  )
$$;

create function public.get_shift_invoice_attachment(p_timelog_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_profile uuid := public.current_profile_id();
  v_customer jsonb;
  v_attachment jsonb;
begin
  if not coalesce(private.shift_invoice_scope_owned(v_actor,v_profile,p_timelog_ids),false) then
    raise exception 'shift_invoice_attachment_not_eligible' using errcode='42501';
  end if;
  v_customer:=private.shift_invoice_customer(p_timelog_ids);
  select jsonb_build_object('id',a.id,'invoice_number',a.invoice_number,'issue_date',a.issue_date,'due_date',a.due_date,
    'total_amount',a.total_amount,'storage_path',a.storage_path)
  into v_attachment
  from private.shift_invoice_round_files f join private.shift_invoice_uploads a on a.id=f.attachment_id
  where f.round_id=private.shift_invoice_last_round(v_actor,v_profile,p_timelog_ids);
  return jsonb_build_object(
    'eligible',v_customer->>'clientId' is not null and private.shift_invoice_editable(v_profile,p_timelog_ids),
    'customer_id',v_customer->>'clientId','customer_name',v_customer->>'name','attachment',v_attachment
  );
end $$;

create function public.get_shift_invoice_upload(p_user_id uuid,p_request_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('attachment_id',a.id) from private.shift_invoice_uploads a where a.id=p_request_id and a.user_id=p_user_id
$$;

create function public.register_shift_invoice_upload(
  p_user_id uuid,p_timelog_ids uuid[],p_customer_id uuid,p_request_id uuid,p_storage_path text,p_sha256 text,
  p_byte_size bigint,p_invoice_number text,p_issue_date date,p_due_date date,p_total_amount numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_existing private.shift_invoice_uploads%rowtype;
  v_ids uuid[] := private.shift_invoice_sorted_ids(p_timelog_ids);
  v_profile uuid;
  v_customer jsonb;
  v_invoice_number text := btrim(p_invoice_number);
begin
  if p_user_id is null or p_request_id is null or p_customer_id is null or v_ids is null
    or p_storage_path is distinct from 'billing-statements/'||p_request_id||'/documents/'||p_request_id||'.pdf'
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_size is null or p_byte_size not between 1 and 5242880
    or v_invoice_number is null or char_length(v_invoice_number) not between 1 and 120
    or p_issue_date is null or p_due_date is null or not isfinite(p_issue_date) or not isfinite(p_due_date) or p_due_date<p_issue_date
    or p_total_amount is null or p_total_amount not between 0 and 9999999999.99 or round(p_total_amount,2)<>p_total_amount then
    raise exception 'invoice_billing_document_invalid' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shift-invoice-staged:'||p_request_id,0));
  select * into v_existing from private.shift_invoice_uploads where id=p_request_id;
  if found then
    if (v_existing.user_id,v_existing.timelog_ids,v_existing.customer->>'clientId',v_existing.storage_path,v_existing.sha256,
        v_existing.byte_size,v_existing.invoice_number,v_existing.issue_date,v_existing.due_date,v_existing.total_amount)
      is distinct from (p_user_id,v_ids,p_customer_id::text,p_storage_path,p_sha256,
        p_byte_size,v_invoice_number,p_issue_date,p_due_date,p_total_amount) then
      raise exception 'invoice_billing_request_reuse' using errcode='22023';
    end if;
    return jsonb_build_object('attachment_id',p_request_id);
  end if;
  if exists(select 1 from public.invoice_billing_statements where id=p_request_id) then
    raise exception 'invoice_billing_request_reuse' using errcode='22023';
  end if;
  select id into v_profile from public.profiles where user_id=p_user_id;
  v_customer:=private.shift_invoice_customer(v_ids);
  if not coalesce(private.shift_invoice_scope_owned(p_user_id,v_profile,v_ids),false)
    or not private.shift_invoice_editable(v_profile,v_ids)
    or v_customer->>'clientId' is distinct from p_customer_id::text then
    raise exception 'shift_invoice_attachment_not_eligible' using errcode='42501';
  end if;
  if not private.shift_invoice_document_available(p_storage_path,p_byte_size) then
    raise exception 'invoice_billing_upload_unverified' using errcode='22023';
  end if;
  insert into private.shift_invoice_uploads(id,user_id,profile_id,timelog_ids,customer,storage_path,sha256,byte_size,invoice_number,issue_date,due_date,total_amount)
  values(p_request_id,p_user_id,v_profile,v_ids,v_customer,p_storage_path,p_sha256,p_byte_size,v_invoice_number,p_issue_date,p_due_date,p_total_amount);
  return jsonb_build_object('attachment_id',p_request_id);
end $$;

create function private.can_read_shift_invoice_upload(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.shift_invoice_uploads a
    where a.storage_path=p_path and a.user_id=(select auth.uid()) and a.profile_id=(select public.current_profile_id())
      and public.has_role((select auth.uid()),'crew')
  )
$$;
create policy "Crew can read their staged invoice PDFs"
on storage.objects for select to authenticated
using (bucket_id='invoice-pdfs' and name like 'billing-statements/%' and private.can_read_shift_invoice_upload(name));

create function private.record_shift_invoice_choice(
  p_request_id uuid,p_round_id uuid,p_attachment_id uuid,p_explicit boolean,p_refuse_existing boolean
) returns void language plpgsql set search_path = '' as $$
declare
  v_round public.shift_workflow_rounds%rowtype;
  v_previous private.shift_invoice_choices%rowtype;
  v_ids uuid[];
  v_attachment_id uuid:=p_attachment_id;
begin
  select * into strict v_round from public.shift_workflow_rounds where id=p_round_id for update;
  select * into v_previous from private.shift_invoice_choices where request_id=p_request_id;
  if found then
    if v_previous.round_id<>p_round_id or v_previous.explicit_choice<>p_explicit
      or (p_explicit and v_previous.attachment_id is distinct from p_attachment_id) then
      raise exception 'invoice_billing_request_reuse' using errcode='22023';
    end if;
    return;
  end if;
  if p_refuse_existing and p_explicit then
    raise exception 'invoice_billing_request_reuse' using errcode='22023';
  end if;
  select array_agg(timelog_id order by timelog_id) into v_ids from public.shift_workflow_round_items where round_id=p_round_id;
  if p_explicit and p_attachment_id is not null and not exists (
    select 1 from private.shift_invoice_uploads a where a.id=p_attachment_id and a.user_id=v_round.contractor_user_id
      and a.profile_id=v_round.contractor_id and a.timelog_ids=v_ids
      and private.shift_invoice_document_available(a.storage_path,a.byte_size)
      and not exists (
        select 1 from public.invoice_billing_consents consent where consent.contractor_id=v_round.contractor_id and consent.enabled
      )
  ) then
    raise exception 'shift_invoice_attachment_not_eligible' using errcode='42501';
  end if;
  if not p_explicit then
    -- A historic replay can lack a choice receipt. Never overwrite its stored round.
    if exists (select 1 from private.shift_invoice_round_files where round_id=p_round_id) then return; end if;
    select a.id into v_attachment_id
    from private.shift_invoice_round_files f join private.shift_invoice_uploads a on a.id=f.attachment_id
    where f.round_id=private.shift_invoice_last_round(v_round.contractor_user_id,v_round.contractor_id,v_ids,p_round_id)
      and a.timelog_ids=v_ids;
    -- Keep constituent attachments available for verification on a changed
    -- scope. Only an explicit removal creates a null round pointer.
    if v_attachment_id is null then return; end if;
  end if;
  insert into private.shift_invoice_round_files(round_id,attachment_id) values(p_round_id,v_attachment_id)
  on conflict(round_id) do update set attachment_id=excluded.attachment_id;
  insert into private.shift_invoice_choices(request_id,round_id,attachment_id,explicit_choice)
  values(p_request_id,p_round_id,v_attachment_id,p_explicit);
end $$;

create function private.submit_shift_workflow_with_invoice(
  p_request_id uuid,p_round_id uuid,p_workflow_id uuid,p_contractor_id uuid,p_anchor_event_id uuid,p_timelogs jsonb,
  p_attachment_id uuid,p_explicit boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_existing boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('shift-invoice-choice:'||coalesce(p_request_id::text,''),0));
  v_existing:=exists(select 1 from public.shift_workflow_requests where request_id=p_request_id);
  v_result:=private.save_shift_drafts_or_submit(p_request_id,p_round_id,p_workflow_id,p_contractor_id,p_anchor_event_id,p_timelogs,true);
  -- Requests recorded before this migration have no attachment choice to reconstruct.
  if not v_existing or p_explicit or exists(select 1 from private.shift_invoice_choices where request_id=p_request_id) then
    perform private.record_shift_invoice_choice(p_request_id,p_round_id,p_attachment_id,p_explicit,v_existing);
  end if;
  return v_result;
end $$;

create or replace function public.submit_shift_workflow_round_atomic(
  p_request_id uuid,p_round_id uuid,p_workflow_id uuid,p_contractor_id uuid,p_anchor_event_id uuid,p_timelogs jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.submit_shift_workflow_with_invoice(p_request_id,p_round_id,p_workflow_id,p_contractor_id,p_anchor_event_id,p_timelogs,null,false)
$$;

create function public.submit_shift_workflow_invoice_atomic(
  p_request_id uuid,p_round_id uuid,p_workflow_id uuid,p_contractor_id uuid,p_anchor_event_id uuid,p_timelogs jsonb,p_attachment_id uuid
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.submit_shift_workflow_with_invoice(p_request_id,p_round_id,p_workflow_id,p_contractor_id,p_anchor_event_id,p_timelogs,p_attachment_id,true)
$$;

create function public.transition_shift_workflow_invoice_atomic(
  p_request_id uuid,p_round_id uuid,p_expected_round_updated_at timestamptz,p_targets jsonb,p_action text,p_note text,
  p_affected_event_id uuid,p_corrections jsonb,p_attachment_id uuid,p_billing_quote uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_existing boolean;
begin
  if p_action is distinct from 'confirm' or p_billing_quote is not null then
    raise exception 'shift_invoice_attachment_not_eligible' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,721));
  v_existing:=exists(select 1 from public.shift_workflow_requests where request_id=p_request_id);
  v_result:=private.invoice_billing_transition_round(p_request_id,p_round_id,p_expected_round_updated_at,p_targets,p_action,p_note,p_affected_event_id,p_corrections,null);
  perform private.record_shift_invoice_choice(p_request_id,p_round_id,p_attachment_id,true,v_existing);
  return v_result;
end $$;

revoke all on function private.shift_invoice_sorted_ids(uuid[]),private.shift_invoice_customer(uuid[]),
  private.shift_invoice_scope_owned(uuid,uuid,uuid[]),private.shift_invoice_editable(uuid,uuid[]),
  private.shift_invoice_last_round(uuid,uuid,uuid[],uuid),private.shift_invoice_document_available(text,bigint),
  private.record_shift_invoice_choice(uuid,uuid,uuid,boolean,boolean),private.can_read_shift_invoice_upload(text),
  private.submit_shift_workflow_with_invoice(uuid,uuid,uuid,uuid,uuid,jsonb,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.can_read_shift_invoice_upload(text),
  private.submit_shift_workflow_with_invoice(uuid,uuid,uuid,uuid,uuid,jsonb,uuid,boolean) to authenticated;

revoke all on function public.get_shift_invoice_attachment(uuid[]),public.get_shift_invoice_upload(uuid,uuid),
  public.register_shift_invoice_upload(uuid,uuid[],uuid,uuid,text,text,bigint,text,date,date,numeric),
  public.submit_shift_workflow_invoice_atomic(uuid,uuid,uuid,uuid,uuid,jsonb,uuid),
  public.transition_shift_workflow_invoice_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_shift_invoice_attachment(uuid[]),
  public.submit_shift_workflow_invoice_atomic(uuid,uuid,uuid,uuid,uuid,jsonb,uuid),
  public.transition_shift_workflow_invoice_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb,uuid,uuid) to authenticated;
grant execute on function public.get_shift_invoice_upload(uuid,uuid),
  public.register_shift_invoice_upload(uuid,uuid[],uuid,uuid,text,text,bigint,text,date,date,numeric) to service_role;

create function private.shift_invoice_statement_reason(p_reason text) returns text
language sql immutable set search_path = '' as $$
  select case p_reason
    when 'amount_changed' then 'Částka přiložené faktury se liší od schváleného výkazu. Nahrajte opravené PDF.'
    when 'customer_changed' then 'Odběratel se od odeslání změnil. Zkontrolujte podklad a nahrajte opravené PDF.'
    when 'scope_changed' then 'Změnil se výběr směn. Zkontrolujte podklad a nahrajte odpovídající PDF.'
    else 'Přiložený doklad není k dispozici pro kontrolu. Zkontrolujte podklad a nahrajte PDF znovu.'
  end
$$;

create function private.shift_invoice_statement_attachments(p_ids uuid[],p_profile_id uuid,p_user_id uuid)
returns uuid[] language sql stable set search_path = '' as $$
  select array_agg(distinct candidate.attachment_id order by candidate.attachment_id)
  from unnest(p_ids) as t(timelog_id)
  cross join lateral (
    select f.attachment_id
    from public.shift_workflow_round_items i
    join public.shift_workflow_rounds r on r.id=i.round_id
    join private.shift_invoice_round_files f on f.round_id=r.id
    where i.timelog_id=t.timelog_id and r.contractor_id=p_profile_id and r.contractor_user_id=p_user_id
    order by r.created_at desc,r.id desc limit 1
  ) as candidate
  where candidate.attachment_id is not null
$$;

create function private.reconcile_shift_invoice_document(p_statement_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_statement public.invoice_billing_statements%rowtype;
  v_upload private.shift_invoice_uploads%rowtype;
  v_ids uuid[];
  v_attachments uuid[];
  v_reason text;
  v_document uuid;
begin
  select * into strict v_statement from public.invoice_billing_statements where id=p_statement_id for update;
  if v_statement.status not in ('blocked','ready') or v_statement.superseded_by_statement_id is not null then return; end if;
  select array_agg(timelog_id order by timelog_id) into v_ids
  from public.invoice_billing_sources where statement_id=p_statement_id;
  v_attachments:=private.shift_invoice_statement_attachments(v_ids,v_statement.contractor_id,v_statement.contractor_user_id);

  for v_upload in
    select a.* from private.shift_invoice_uploads a where a.id=any(v_attachments)
      and a.user_id=v_statement.contractor_user_id and a.profile_id=v_statement.contractor_id
  loop
    v_reason:=null;
    if v_statement.status='ready' then
      v_reason:=case
        when cardinality(v_attachments)<>1 or v_upload.timelog_ids is distinct from v_ids
          or v_upload.id<>v_statement.id then 'scope_changed'
        when v_upload.customer->>'clientId' is distinct from v_statement.customer_snapshot->>'clientId'
          or (nullif(v_upload.customer->>'ico','') is not null
            and v_upload.customer->>'ico' is distinct from v_statement.customer_snapshot->>'ico') then 'customer_changed'
        when v_upload.total_amount is distinct from v_statement.total_amount then 'amount_changed'
        when not private.shift_invoice_document_available(v_upload.storage_path,v_upload.byte_size)
          or exists (select 1 from public.invoices where contractor_id=v_statement.contractor_id and invoice_number=v_upload.invoice_number)
          then 'document_unavailable'
      end;
    end if;
    -- An original already reviewed or returned uses the existing document history.
    if cardinality(v_attachments)=1 and v_reason is distinct from 'scope_changed'
      and exists (select 1 from public.invoice_billing_documents where request_id=v_upload.id) then
      continue;
    end if;
    insert into private.shift_invoice_statement_files(statement_id,attachment_id,reason)
    values(p_statement_id,v_upload.id,v_reason)
    on conflict(statement_id,attachment_id) do update set reason=excluded.reason;
    if v_statement.status='blocked' then continue; end if;
    if v_reason is not null then
      perform private.emit_notification(v_statement.contractor_id,'invoices','invoice_preliminary_document_mismatch',
        'Zkontrolujte přiloženou fakturu',private.shift_invoice_statement_reason(v_reason),
        jsonb_build_object('tab','my-invoices','billingStatementId',p_statement_id),
        'invoice:preliminary:'||p_statement_id||':'||v_reason);
      continue;
    end if;
    insert into public.invoice_billing_documents(
      statement_id,request_id,uploader_user_id,statement_updated_at,financial_version,identity_version,
      storage_path,sha256,byte_size,external_invoice_number,issue_date,due_date,total_amount
    ) values (
      p_statement_id,v_upload.id,v_upload.user_id,v_statement.updated_at,v_statement.financial_version,v_statement.identity_version,
      v_upload.storage_path,v_upload.sha256,v_upload.byte_size,v_upload.invoice_number,v_upload.issue_date,v_upload.due_date,v_upload.total_amount
    ) returning id into v_document;
    update public.invoice_billing_statements set status='document_pending',active_document_id=v_document,
      updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond')
    where id=p_statement_id;
  end loop;
end $$;

create function private.reconcile_unblocked_shift_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status='blocked' and new.status='ready' then
    perform private.reconcile_shift_invoice_document(new.id);
  end if;
  return new;
end $$;
create trigger invoice_billing_reconcile_unblocked_shift_invoice
after update of status on public.invoice_billing_statements for each row
when (old.status='blocked' and new.status='ready')
execute function private.reconcile_unblocked_shift_invoice();

create function private.notify_shift_invoice_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_ch uuid;
begin
  select p.id into v_ch
  from public.shift_workflow_round_actions a
  join public.profiles p on p.user_id=a.actor_id
  where a.round_id=new.round_id and a.from_status='pending_ch' and a.to_status='pending_coo'
    and public.has_role(p.user_id,'crewhead')
  order by a.created_at desc,a.id desc limit 1;
  if v_ch is null then
    select case when count(distinct p.id)=1 then (array_agg(distinct p.id))[1] end into v_ch
    from public.invoice_billing_sources s join public.profiles p
      on p.id::text=s.source_snapshot#>>'{approval,requested_by_profile_id}'
      and p.user_id::text=s.source_snapshot#>>'{approval,requested_by_user_id}'
    where s.statement_id=new.id and public.has_role(p.user_id,'crewhead');
  end if;
  if v_ch is not null then
    perform private.emit_notification(v_ch,'invoices','invoice_document_review',
      'Faktura čeká na kontrolu','Crew přiložil vlastní fakturu. Otevřete podklad a zkontrolujte originál.',
      jsonb_build_object('tab','invoices','billingStatementId',new.id),
      'invoice:review:'||new.active_document_id);
  end if;
  return new;
end $$;
create trigger invoice_billing_notify_original_review
after update of status,active_document_id on public.invoice_billing_statements for each row
when (new.status='document_pending' and new.active_document_id is not null
  and new.active_document_id is distinct from old.active_document_id)
execute function private.notify_shift_invoice_review();

create function private.notify_returned_invoice_document() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_statement public.invoice_billing_statements%rowtype;
begin
  select * into strict v_statement from public.invoice_billing_statements where id=new.statement_id;
  if exists (select 1 from public.profiles where id=v_statement.contractor_id and user_id=v_statement.contractor_user_id) then
    perform private.emit_notification(v_statement.contractor_id,'invoices','invoice_document_returned',
      'Originál faktury byl vrácen',new.note,
      jsonb_build_object('tab','my-invoices','billingStatementId',new.statement_id),
      'invoice:return:'||new.document_id);
  end if;
  return new;
end $$;
create trigger invoice_billing_notify_returned_original
after insert on public.invoice_billing_document_decisions for each row
when (new.decision='return') execute function private.notify_returned_invoice_document();

create function private.add_billing_action_to_approved_notifications(p_statement_id uuid,p_ids uuid[]) returns void
language sql set search_path = '' as $$
  update public.app_notifications n set
    body='Podklad je připravený. Nahrajte vlastní PDF nebo potvrďte vystavení faktury v nodu.',
    target=jsonb_build_object('tab','my-invoices','billingStatementId',s.id)
  from public.invoice_billing_statements s
  where s.id=p_statement_id and s.status='ready' and s.consent_grant_id is null
    and not exists(select 1 from private.shift_invoice_statement_files f where f.statement_id=s.id)
    and n.kind='timelog_approved' and n.recipient_user_id=s.contractor_user_id and n.recipient_profile_id=s.contractor_id
    and n.dedupe_key in (
      select 'timelog:'||private.notification_event_group(t.event_id)||':'||t.contractor_id||':approved:'||pg_current_xact_id()
      from public.timelogs t where t.id=any(p_ids)
    )
$$;

-- Preserve the v1 billing response for installed clients with strict parsing.
create function private.shift_invoice_add_history(p_statement jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select p_statement||coalesce((
    select jsonb_build_object('preliminary_documents',jsonb_agg(jsonb_build_object(
      'id',a.id,'invoice_number',a.invoice_number,'total_amount',a.total_amount,'reason',f.reason,
      'storage_path',case when private.shift_invoice_document_available(a.storage_path,a.byte_size) then a.storage_path end
    ) order by a.created_at,a.id))
    from private.shift_invoice_statement_files f join private.shift_invoice_uploads a on a.id=f.attachment_id
    where f.statement_id=(p_statement->>'id')::uuid and f.reason is not null and a.user_id=auth.uid()
      and a.profile_id=public.current_profile_id() and a.user_id::text=p_statement->>'contractor_user_id'
      and a.profile_id::text=p_statement->>'contractor_id'
    having count(*)>0
  ),'{}'::jsonb)
$$;

create function public.get_invoice_billing_snapshot_with_preliminary() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb:=private.get_invoice_billing_snapshot();
  v_key text;
  v_statements jsonb;
begin
  foreach v_key in array array['statements','superseded_statements'] loop
    select coalesce(jsonb_agg(private.shift_invoice_add_history(item.value) order by item.ordinality),'[]'::jsonb)
    into v_statements from jsonb_array_elements(v_snapshot->v_key) with ordinality as item(value,ordinality);
    v_snapshot:=jsonb_set(v_snapshot,array[v_key],v_statements);
  end loop;
  return v_snapshot;
end $$;
revoke all on function public.get_invoice_billing_snapshot_with_preliminary() from public,anon,authenticated,service_role;
grant execute on function public.get_invoice_billing_snapshot_with_preliminary() to authenticated;

revoke all on function private.shift_invoice_statement_reason(text),private.reconcile_shift_invoice_document(uuid),
  private.shift_invoice_statement_attachments(uuid[],uuid,uuid),private.shift_invoice_add_history(jsonb),
  private.reconcile_unblocked_shift_invoice(),private.notify_shift_invoice_review(),private.notify_returned_invoice_document(),
  private.add_billing_action_to_approved_notifications(uuid,uuid[]) from public,anon,authenticated,service_role;

create or replace function private.invoice_billing_capture(p_ids uuid[],p_round uuid,p_kind text,p_force boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_profile uuid;v_preview jsonb;v_quote jsonb;v_reason text;v_user uuid;v_approved timestamptz;v_grant uuid;v_attachments uuid[];v_reserved_id uuid;
begin
 if cardinality(p_ids) is null or cardinality(p_ids)=0 then raise exception 'invoice_billing_source_invalid' using errcode='22023'; end if;
 if (select count(distinct contractor_id) from public.timelogs where id=any(p_ids))<>1
  or (select count(*) from public.timelogs where id=any(p_ids) and status='approved')<>cardinality(p_ids)
  or exists(select 1 from public.invoice_timelogs where timelog_id=any(p_ids)) then raise exception 'invoice_billing_source_conflict' using errcode='PT409'; end if;
 select contractor_id,max(approved_at) into v_profile,v_approved from public.timelogs where id=any(p_ids) group by contractor_id;
 perform id from public.profiles where id=v_profile for update;
 select user_id into v_user from public.profiles where id=v_profile;
 if exists(select 1 from public.invoice_billing_sources where timelog_id=any(p_ids)) then raise exception 'invoice_billing_source_reserved' using errcode='PT409'; end if;
 select q.preview into v_quote from private.invoice_billing_quotes q join private.invoice_billing_quote_permits p on p.quote_id=q.id
  where p.transaction_id=pg_current_xact_id() and p.actor_id=auth.uid() and p.consumed;
 if v_quote is not null and not p_force then
  select jsonb_build_object('currency','CZK','reports',jsonb_agg(r||jsonb_build_object('quoted_report_updated_at',r->'report_updated_at','report_updated_at',t.updated_at,'status',t.status) order by r->>'timelog_id'),'total_amount',sum((r->>'total_amount')::numeric)) into v_preview
   from jsonb_array_elements(v_quote->'reports')r join public.timelogs t on t.id=(r->>'timelog_id')::uuid where t.id=any(p_ids);
 else v_preview:=private.invoice_billing_preview(p_ids); end if;
 v_reason:=private.invoice_billing_reason(v_preview);
 if not p_force and v_quote is null and v_reason is null then v_reason:='approval_quote_required'; end if;
 v_approved:=coalesce(v_approved,clock_timestamp());
 v_attachments:=private.shift_invoice_statement_attachments(p_ids,v_profile,v_user);
 if cardinality(v_attachments)=1 then
  -- Reserve the final statement ID in the staged path so clients can use
  -- the original PDF with the existing canonical document-path contract.
  select a.id into v_reserved_id from private.shift_invoice_uploads a
   where a.id=v_attachments[1] and a.timelog_ids=private.shift_invoice_sorted_ids(p_ids)
    and not exists(select 1 from public.invoice_billing_statements s where s.id=a.id);
 end if;
 if p_kind='approval' and v_quote is not null and v_attachments is null then
  select c.active_grant_id into v_grant from public.invoice_billing_consents c join public.invoice_billing_consent_history h on h.id=c.active_grant_id
   where c.contractor_id=v_profile and c.enabled and h.actor_id=v_user and h.created_at<v_approved;
 end if;
 insert into public.invoice_billing_statements(id,contractor_id,contractor_user_id,round_id,status,blocked_reason,capture_kind,financial_snapshot,supplier_snapshot,customer_snapshot,total_amount,approved_by,approved_at,consent_grant_id,financial_verified)
 values(coalesce(v_reserved_id,gen_random_uuid()),v_profile,v_user,p_round,case when v_reason is null then 'ready' else 'blocked' end,v_reason,p_kind,v_preview,
  v_preview->'reports'->0->'supplier_snapshot',v_preview->'reports'->0->'customer_snapshot',(v_preview->>'total_amount')::numeric,auth.uid(),v_approved,v_grant,(p_force or v_quote is not null) and v_reason is distinct from 'financial_data_incomplete') returning id into v_id;
 insert into public.invoice_billing_sources(statement_id,timelog_id,event_id,report_updated_at,round_id,source_snapshot)
 select v_id,t.id,t.event_id,t.updated_at,coalesce(p_round,latest_round.id),
  r||jsonb_build_object('status',t.status,'report_updated_at',t.updated_at,'approved_at',t.approved_at,'approved_by',case when p_kind='approval' then auth.uid() else (select a.approver_user_id from public.timelog_approvals a where a.timelog_id=t.id and a.superseded_at is null and a.status='approved') end,'billing_prepared_by',case when p_kind='selection' then auth.uid() end,
   'approval',(select to_jsonb(a) from public.timelog_approvals a where a.timelog_id=t.id and a.superseded_at is null and a.status='approved'),
   'workflow_round_id',coalesce(p_round,latest_round.id),'workflow_round_updated_at',latest_round.updated_at)
 from public.timelogs t left join lateral (select round.* from public.shift_workflow_round_items i join public.shift_workflow_rounds round on round.id=i.round_id
  where i.timelog_id=t.id and round.status='approved' order by round.created_at desc limit 1) latest_round on true join jsonb_array_elements(v_preview->'reports')r on (r->>'timelog_id')::uuid=t.id where t.id=any(p_ids);
 perform private.invoice_billing_record_version(v_id,p_kind);
 if v_grant is not null then insert into private.invoice_billing_jobs(kind,statement_id,consent_grant_id) values('issue',v_id,v_grant); end if;
 perform private.reconcile_shift_invoice_document(v_id);
 perform private.add_billing_action_to_approved_notifications(v_id,p_ids);
 return v_id;
end $$;

create or replace function private.prepare_invoice_billing_selection(p_request_id uuid,p_timelog_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_profile uuid;v_payload jsonb;v_result jsonb;v_ids uuid[];v_events uuid[];v_existing uuid[];v_reserved uuid[];v_unverified uuid[];v_round uuid;
 v_id uuid;v_owner uuid;v_user uuid;v_preview jsonb;v_fresh jsonb;v_reports jsonb;v_reason text;v_approved timestamptz;v_statement public.invoice_billing_statements%rowtype;
begin
 v_profile:=private.invoice_billing_actor('coo');
 select array_agg(distinct id order by id) into v_ids from unnest(p_timelog_ids)id;
 if cardinality(v_ids) is null or cardinality(v_ids)=0 or cardinality(v_ids)<>cardinality(p_timelog_ids) then raise exception 'invoice_billing_source_invalid' using errcode='22023'; end if;
 v_payload:=jsonb_build_object('timelog_ids',v_ids);v_result:=private.invoice_billing_replay(p_request_id,auth.uid(),'selection',v_payload);if v_result is not null then return v_result; end if;
 select array_agg(distinct statement_id order by statement_id) into v_reserved from public.invoice_billing_sources where timelog_id=any(v_ids);
 -- Existing statement locks precede all dependency locks; shared lifecycle
 -- wrappers separately preserve their singleton→event→report→profile order.
 perform locked.id from public.invoice_billing_statements locked where locked.id=any(v_reserved) order by locked.id for update;
 select array_agg(distinct event_id order by event_id) into v_events from public.timelogs where id=any(v_ids);
 perform private.invoice_billing_lock_events(v_events);
 perform id from public.timelogs where id=any(v_ids) order by id for update;
 select array_agg(distinct statement_id order by statement_id) into v_existing from public.invoice_billing_sources where timelog_id=any(v_ids);
 if v_existing is distinct from v_reserved then raise exception 'invoice_billing_source_reservation_conflict' using errcode='PT409'; end if;
 if (select count(*) from public.timelogs where id=any(v_ids) and status='approved')<>cardinality(v_ids)
  or exists(select 1 from public.invoice_timelogs where timelog_id=any(v_ids)) then raise exception 'invoice_billing_source_conflict' using errcode='PT409'; end if;
 if (select count(distinct contractor_id) from public.timelogs where id=any(v_ids))<>1 then raise exception 'invoice_billing_mixed_supplier' using errcode='22023'; end if;
 select contractor_id,max(approved_at) into v_owner,v_approved from public.timelogs where id=any(v_ids) group by contractor_id;
 perform id from public.profiles where id=v_owner for update;
 select user_id into v_user from public.profiles where id=v_owner;
 for v_round in select distinct i.round_id from public.shift_workflow_round_items i join public.shift_workflow_rounds r on r.id=i.round_id where i.timelog_id=any(v_ids) and r.status='approved' loop
  if exists(select 1 from public.shift_workflow_round_items where round_id=v_round and not timelog_id=any(v_ids)) then raise exception 'invoice_billing_complete_round_required' using errcode='22023'; end if;
 end loop;
 if exists(select 1 from public.shift_workflow_round_items i join public.shift_workflow_rounds r on r.id=i.round_id where i.timelog_id=any(v_ids) and r.status not in('approved','rejected')) then raise exception 'invoice_billing_complete_round_required' using errcode='22023'; end if;
 select array_agg(distinct statement_id order by statement_id) into v_existing from public.invoice_billing_sources where timelog_id=any(v_ids);
 if exists(select 1 from public.invoice_billing_sources x where x.statement_id=any(v_existing) and not x.timelog_id=any(v_ids)) then raise exception 'invoice_billing_complete_statement_required' using errcode='22023'; end if;
 if exists(select 1 from public.invoice_billing_statements existing where existing.id=any(v_existing)
  and (existing.contractor_id<>v_owner or existing.contractor_user_id is distinct from v_user or existing.superseded_by_statement_id is not null
   or existing.status not in('ready','blocked','document_returned'))) then raise exception 'invoice_billing_source_reserved' using errcode='PT409'; end if;
 if v_existing is null then
  v_id:=private.invoice_billing_capture(v_ids,null,'selection',true);
 elsif cardinality(v_existing)=1 and (select array_agg(timelog_id order by timelog_id) from public.invoice_billing_sources where statement_id=v_existing[1])=v_ids then
  select * into strict v_statement from public.invoice_billing_statements where id=v_existing[1];
  if not v_statement.financial_verified then
   v_preview:=private.invoice_billing_preview(v_ids);
  elsif v_statement.status='blocked' or not private.invoice_billing_identity_matches(v_statement.id) or not private.invoice_billing_preview_is_current(v_statement.id) then
   select jsonb_set(v_statement.financial_snapshot,'{reports}',jsonb_agg(
    jsonb_set(jsonb_set(r,'{supplier_snapshot}',private.invoice_billing_supplier(v_owner)),
     '{customer_snapshot}',private.invoice_billing_customer((r->>'event_id')::uuid)) order by r->>'timelog_id')) into v_preview
    from jsonb_array_elements(v_statement.financial_snapshot->'reports')r;
  end if;
  if v_preview is not null then
   v_reason:=private.invoice_billing_reason(v_preview);
   update public.invoice_billing_statements set financial_snapshot=v_preview,supplier_snapshot=v_preview->'reports'->0->'supplier_snapshot',customer_snapshot=v_preview->'reports'->0->'customer_snapshot',
    total_amount=(v_preview->>'total_amount')::numeric,financial_verified=v_reason is distinct from 'financial_data_incomplete',financial_version=financial_version+case when v_statement.financial_verified then 0 else 1 end,
    identity_version=identity_version+1,status=case when v_reason is null then 'ready' else 'blocked' end,blocked_reason=v_reason,
    capture_kind=v_statement.capture_kind,consent_grant_id=v_statement.consent_grant_id,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=v_statement.id;
   update public.invoice_billing_sources x set report_updated_at=case when v_statement.financial_verified then x.report_updated_at else (r->>'report_updated_at')::timestamptz end,
    source_snapshot=x.source_snapshot||r||jsonb_build_object('status',x.source_snapshot->'status','report_updated_at',case when v_statement.financial_verified then x.source_snapshot->'report_updated_at' else r->'report_updated_at' end)
    from jsonb_array_elements(v_preview->'reports')r where x.statement_id=v_statement.id and x.timelog_id=(r->>'timelog_id')::uuid;
   perform private.invoice_billing_record_version(v_statement.id,case when v_statement.financial_verified then 'explicit_identity_resolution' else 'explicit_selection' end);
  end if;
  v_id:=v_statement.id;
 else
  -- Explicit complete-source consolidation: each verified monetary report is
  -- copied verbatim. Only previously unverified legacy sources use a current
  -- checked preview; identities are shown in a new explicit selection version.
  select array_agg(t.id order by t.id) into v_unverified from public.timelogs t
   left join public.invoice_billing_sources x on x.timelog_id=t.id left join public.invoice_billing_statements original on original.id=x.statement_id
   where t.id=any(v_ids) and (original.id is null or not original.financial_verified);
  v_fresh:=private.invoice_billing_preview(v_unverified);
  select jsonb_agg(jsonb_set(jsonb_set(r,'{supplier_snapshot}',private.invoice_billing_supplier(v_owner)),
   '{customer_snapshot}',private.invoice_billing_customer((r->>'event_id')::uuid)) order by r->>'timelog_id') into v_reports
   from (
    select r from public.invoice_billing_statements original cross join jsonb_array_elements(original.financial_snapshot->'reports')r
     where original.id=any(v_existing) and original.financial_verified
    union all select r from jsonb_array_elements(v_fresh->'reports')r
   ) reports;
  v_preview:=jsonb_build_object('currency','CZK','reports',v_reports,'total_amount',(select sum((r->>'total_amount')::numeric) from jsonb_array_elements(v_reports)r));
  if jsonb_array_length(v_reports)<>cardinality(v_ids) then raise exception 'invoice_billing_source_conflict' using errcode='PT409'; end if;
  v_reason:=private.invoice_billing_reason(v_preview);
  insert into public.invoice_billing_statements(contractor_id,contractor_user_id,status,blocked_reason,capture_kind,financial_verified,financial_snapshot,supplier_snapshot,customer_snapshot,total_amount,approved_by,approved_at)
   values(v_owner,v_user,case when v_reason is null then 'ready' else 'blocked' end,v_reason,'selection',v_reason is distinct from 'financial_data_incomplete',v_preview,
    v_reports->0->'supplier_snapshot',v_reports->0->'customer_snapshot',(v_preview->>'total_amount')::numeric,auth.uid(),coalesce(v_approved,clock_timestamp())) returning id into v_id;
  update public.invoice_billing_sources x set statement_id=v_id,source_snapshot=x.source_snapshot||r||jsonb_build_object('status',x.source_snapshot->'status','report_updated_at',x.source_snapshot->'report_updated_at')
   from jsonb_array_elements(v_reports)r where x.timelog_id=(r->>'timelog_id')::uuid and x.timelog_id=any(v_ids);
  insert into public.invoice_billing_sources(statement_id,timelog_id,event_id,report_updated_at,round_id,source_snapshot)
   select v_id,t.id,t.event_id,t.updated_at,latest.id,
    r||jsonb_build_object('status',t.status,'report_updated_at',t.updated_at,'approved_at',t.approved_at,'billing_prepared_by',auth.uid(),
     'approval',(select to_jsonb(a) from public.timelog_approvals a where a.timelog_id=t.id and a.superseded_at is null and a.status='approved'),
     'workflow_round_id',latest.id,'workflow_round_updated_at',latest.updated_at)
   from public.timelogs t join jsonb_array_elements(v_reports)r on (r->>'timelog_id')::uuid=t.id
   left join lateral(select round.* from public.shift_workflow_round_items i join public.shift_workflow_rounds round on round.id=i.round_id
    where i.timelog_id=t.id and round.status='approved' order by round.created_at desc limit 1)latest on true
   where t.id=any(v_ids) and not exists(select 1 from public.invoice_billing_sources x where x.timelog_id=t.id);
  update public.invoice_billing_statements set status='blocked',blocked_reason='statement_consolidated',superseded_by_statement_id=v_id,consent_grant_id=null,
   updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=any(v_existing);
  perform private.invoice_billing_record_version(v_id,'explicit_consolidation');
 end if;
 perform private.reconcile_shift_invoice_document(v_id);
 v_result:=jsonb_build_object('statement',private.invoice_billing_result(v_id));
 insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'selection',v_payload,v_result,clock_timestamp());return v_result;
end $$;
