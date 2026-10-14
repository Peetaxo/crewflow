-- Authoritative source reservations, explicit non-VAT consent, immutable document
-- versions and durable issuance/PDF jobs. No historical capture/backfill.
create table public.invoice_billing_statements (
 id uuid primary key default gen_random_uuid(), contractor_id uuid not null references public.profiles(id) on delete restrict,
 contractor_user_id uuid, round_id uuid references public.shift_workflow_rounds(id) on delete restrict,
 status text not null check(status in('ready','blocked','document_pending','document_returned','issued')),
 blocked_reason text, capture_kind text not null check(capture_kind in('approval','selection')),
 financial_verified boolean not null default true, financial_version integer not null default 1, identity_version integer not null default 1,
 financial_snapshot jsonb not null, supplier_snapshot jsonb not null, customer_snapshot jsonb not null,
 preview_issue_date date not null, preview_due_date date not null, preview_taxable_supply_date date, preview_valid_until timestamptz not null,
 total_amount numeric(14,2) not null check(total_amount>=0), currency text not null default 'CZK' check(currency='CZK'),
 approved_by uuid, approved_at timestamptz not null, consent_grant_id uuid,
 superseded_by_statement_id uuid references public.invoice_billing_statements(id) on delete restrict, active_document_id uuid, invoice_id uuid references public.invoices(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 check((status='issued')=(invoice_id is not null)), check((status='blocked')=(blocked_reason is not null))
);
create index invoice_billing_statements_superseded_idx on public.invoice_billing_statements(superseded_by_statement_id) where superseded_by_statement_id is not null;
create index invoice_billing_statements_contractor_idx on public.invoice_billing_statements(contractor_id,created_at desc);
create index invoice_billing_statements_round_idx on public.invoice_billing_statements(round_id) where round_id is not null;
create index invoice_billing_statements_invoice_idx on public.invoice_billing_statements(invoice_id) where invoice_id is not null;
create table public.invoice_billing_sources (
 statement_id uuid not null references public.invoice_billing_statements(id) on delete restrict,
 timelog_id uuid primary key references public.timelogs(id) on delete restrict,
 event_id uuid not null references public.events(id) on delete restrict,
 report_updated_at timestamptz not null, round_id uuid references public.shift_workflow_rounds(id) on delete restrict,
 source_snapshot jsonb not null
);
create index invoice_billing_sources_statement_idx on public.invoice_billing_sources(statement_id);
create index invoice_billing_sources_event_idx on public.invoice_billing_sources(event_id);
create index invoice_billing_sources_round_idx on public.invoice_billing_sources(round_id) where round_id is not null;
create table public.invoice_billing_source_history (
 statement_id uuid not null references public.invoice_billing_statements(id) on delete restrict,
 financial_version integer not null, identity_version integer not null,
 timelog_id uuid not null references public.timelogs(id) on delete restrict, event_id uuid not null references public.events(id) on delete restrict,
 report_updated_at timestamptz not null, round_id uuid references public.shift_workflow_rounds(id) on delete restrict,
 source_snapshot jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(statement_id,financial_version,identity_version,timelog_id)
);
create index invoice_billing_source_history_timelog_idx on public.invoice_billing_source_history(timelog_id);
create index invoice_billing_source_history_event_idx on public.invoice_billing_source_history(event_id);
create index invoice_billing_source_history_round_idx on public.invoice_billing_source_history(round_id) where round_id is not null;
create table public.invoice_billing_statement_versions (
 statement_id uuid not null references public.invoice_billing_statements(id) on delete restrict,
 financial_version integer not null, identity_version integer not null, actor_id uuid,
 reason text not null, snapshot jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(statement_id,financial_version,identity_version)
);
create table public.invoice_billing_consent_history (
 id uuid primary key default gen_random_uuid(), contractor_id uuid not null references public.profiles(id) on delete restrict,
 actor_id uuid not null, enabled boolean not null, non_vat_confirmed boolean not null,
 wording_version integer not null default 1 check(wording_version=1),
 wording text not null default 'Prohlasuji, že nejsem plátcem DPH. Souhlasím, aby CrewFlow vystavoval faktury mým jménem za nově schválené výkazy.',
 created_at timestamptz not null default clock_timestamp(), check(not enabled or non_vat_confirmed)
);
create index invoice_billing_consent_history_contractor_idx on public.invoice_billing_consent_history(contractor_id,created_at);
create table public.invoice_billing_consents (
 contractor_id uuid primary key references public.profiles(id) on delete restrict,
 enabled boolean not null default false, active_grant_id uuid references public.invoice_billing_consent_history(id) on delete restrict,
 updated_at timestamptz not null default clock_timestamp(), check(enabled=(active_grant_id is not null))
);
alter table public.invoice_billing_statements add foreign key(consent_grant_id) references public.invoice_billing_consent_history(id) on delete restrict;
create index invoice_billing_statements_consent_idx on public.invoice_billing_statements(consent_grant_id) where consent_grant_id is not null;
create index invoice_billing_consents_grant_idx on public.invoice_billing_consents(active_grant_id) where active_grant_id is not null;
create table public.invoice_billing_documents (
 id uuid primary key default gen_random_uuid(), statement_id uuid not null references public.invoice_billing_statements(id) on delete restrict,
 request_id uuid not null unique, uploader_user_id uuid not null, statement_updated_at timestamptz not null,
 financial_version integer not null, identity_version integer not null,
 storage_bucket text not null default 'invoice-pdfs' check(storage_bucket='invoice-pdfs'), storage_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), byte_size bigint not null check(byte_size>0 and byte_size<=5242880),
 content_type text not null default 'application/pdf' check(content_type='application/pdf'),
 external_invoice_number text not null check(btrim(external_invoice_number)<>''),
 issue_date date not null, due_date date not null, total_amount numeric(14,2) not null check(total_amount>=0),
 created_at timestamptz not null default clock_timestamp(), check(due_date>=issue_date)
);
create index invoice_billing_documents_statement_idx on public.invoice_billing_documents(statement_id,created_at);
alter table public.invoice_billing_statements add foreign key(active_document_id) references public.invoice_billing_documents(id) on delete restrict;
create index invoice_billing_statements_document_idx on public.invoice_billing_statements(active_document_id) where active_document_id is not null;
create table public.invoice_billing_document_decisions (
 id uuid primary key default gen_random_uuid(), document_id uuid not null unique references public.invoice_billing_documents(id) on delete restrict,
 statement_id uuid not null references public.invoice_billing_statements(id) on delete restrict,
 actor_id uuid not null, decision text not null check(decision in('accept','return')), note text not null,
 created_at timestamptz not null default clock_timestamp(), check(decision<>'return' or btrim(note)<>'')
);
create index invoice_billing_decisions_statement_idx on public.invoice_billing_document_decisions(statement_id);
create table private.invoice_billing_requests (
 request_id uuid primary key, actor_id uuid not null, kind text not null, payload jsonb not null,
 result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table private.invoice_billing_quotes (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null, actor_profile_id uuid not null, timelog_ids uuid[] not null,
 fingerprint text not null, preview jsonb not null, approval_payload jsonb, approval_result jsonb, created_at timestamptz not null default clock_timestamp()
);
create table private.invoice_billing_quote_permits (
 transaction_id xid8 primary key, actor_id uuid not null, quote_id uuid not null references private.invoice_billing_quotes(id), consumed boolean not null default false
);
create index invoice_billing_quote_permits_quote_idx on private.invoice_billing_quote_permits(quote_id);
create table private.invoice_billing_write_permits (
 transaction_id xid8 not null, timelog_id uuid not null, invoice_id uuid not null, actor_id uuid,
 primary key(transaction_id,timelog_id)
);
create table private.invoice_billing_repair_permits (
 transaction_id xid8 not null,timelog_id uuid not null,statement_id uuid not null,actor_id uuid not null,actor_profile_id uuid not null,
 report_updated_at timestamptz not null,new_km numeric(10,2) not null check(new_km>=0),primary key(transaction_id,timelog_id)
);
create table private.invoice_billing_jobs (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in('issue','pdf')),
 statement_id uuid not null references public.invoice_billing_statements(id) on delete restrict,
 invoice_id uuid references public.invoices(id) on delete restrict, consent_grant_id uuid references public.invoice_billing_consent_history(id) on delete restrict,
 status text not null default 'queued' check(status in('queued','running','completed','cancelled','failed')),
 attempts integer not null default 0, available_at timestamptz not null default clock_timestamp(), lease_token uuid, locked_until timestamptz,
 last_error text, result jsonb, retry_generation integer not null default 0,failed_at timestamptz,failure_code text check(failure_code in('transient_failure','retry_budget_exhausted','lease_expired_budget')), created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(statement_id,kind), check((kind='pdf')=(invoice_id is not null))
);
create index invoice_billing_jobs_claim_idx on private.invoice_billing_jobs(available_at,id) where status in('queued','running');
create index invoice_billing_jobs_invoice_idx on private.invoice_billing_jobs(invoice_id) where invoice_id is not null;
create index invoice_billing_jobs_consent_idx on private.invoice_billing_jobs(consent_grant_id) where consent_grant_id is not null;
alter table public.invoices add column billing_kind text not null default 'self_billing' check(billing_kind in('self_billing','uploaded')),
 add column billing_statement_id uuid references public.invoice_billing_statements(id) on delete restrict,
 add column billing_document_id uuid references public.invoice_billing_documents(id) on delete restrict,
 add column paid_by_user_id uuid, add column paid_by_profile_id uuid, add column payment_recorded_at timestamptz;
create unique index invoices_billing_statement_idx on public.invoices(billing_statement_id) where billing_statement_id is not null;
create unique index invoices_billing_document_idx on public.invoices(billing_document_id) where billing_document_id is not null;
-- Preserve every existing number. Supplier-scoped uniqueness also applies to originals.
drop index if exists public.invoices_invoice_number_key;
create unique index invoices_supplier_invoice_number_key on public.invoices(contractor_id,invoice_number) where invoice_number is not null;

create function private.invoice_billing_actor(p_capability text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or (select count(*) from public.profiles where user_id=auth.uid())<>1 then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 select id into v_id from public.profiles where user_id=auth.uid();
 if v_id is distinct from public.current_profile_id() or (p_capability is not null and not public.has_role(auth.uid(),p_capability::public.app_role)) then
  raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 return v_id;
end $$;
create function private.invoice_billing_supplier(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('profileId',p.id,'name',btrim(p.first_name||' '||p.last_name),'ico',coalesce(p.ico,''),'dic',nullif(p.dic,''),
  'bankAccount',coalesce(p.bank_account,''),'iban',p.iban,'billingStreet',coalesce(p.billing_street,''),'billingZip',coalesce(p.billing_zip,''),
  'billingCity',coalesce(p.billing_city,''),'billingCountry',coalesce(nullif(p.billing_country,''),'CZ'),'vatPayer',false)
 from public.profiles p where id=p_id
$$;
create function private.invoice_billing_customer(p_event uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('clientId',c.id,'name',coalesce(c.name,''),'ico',coalesce(c.ico,''),'dic',nullif(c.dic,''),
  'street',coalesce(c.street,''),'zip',coalesce(c.zip,''),'city',coalesce(c.city,''),'country',coalesce(nullif(c.country,''),'CZ'))
 from public.events e left join public.projects p on p.id=e.project_id left join public.clients c on c.id=p.client_id where e.id=p_event
$$;
create function private.invoice_billing_lock_events(p_events uuid[]) returns void language plpgsql set search_path='' as $$
begin
 -- Lifecycle-compatible dependency order: event→project→client→report→profile.
 -- Shared approval callers acquire their existing singleton state lock first.
 -- Non-key locks protect billing identity edits without blocking unrelated
 -- FK references created by the established handoff/capture helpers.
 perform e.id from public.events e where e.id=any(p_events) order by e.id for no key update;
 perform p.id from public.projects p where p.id in(select e.project_id from public.events e where e.id=any(p_events)) order by p.id for no key update;
 perform c.id from public.clients c where c.id in(select p.client_id from public.projects p join public.events e on e.project_id=p.id where e.id=any(p_events)) order by c.id for no key update;
end $$;
create function private.invoice_billing_lock_statement_sources(p_statement uuid) returns void language plpgsql set search_path='' as $$
declare v_events uuid[];
begin
 select array_agg(event_id order by event_id) into v_events from public.invoice_billing_sources where statement_id=p_statement;
 perform private.invoice_billing_lock_events(v_events);
 perform t.id from public.timelogs t join public.invoice_billing_sources x on x.timelog_id=t.id where x.statement_id=p_statement order by t.id for update of t;
 perform p.id from public.profiles p join public.invoice_billing_statements s on s.contractor_id=p.id where s.id=p_statement for update of p;
end $$;
create function private.invoice_billing_identity_matches(p_statement uuid) returns boolean language sql stable set search_path='' as $$
 select s.supplier_snapshot=private.invoice_billing_supplier(s.contractor_id)
  and not exists(select 1 from jsonb_array_elements(s.financial_snapshot->'reports')r where r->'customer_snapshot' is distinct from private.invoice_billing_customer((r->>'event_id')::uuid))
 from public.invoice_billing_statements s where s.id=p_statement
$$;
-- Exact individual self-billing previews own their dates, including Prague/DST
-- midnight expiry. Any explicit financial/identity preview version renews dates.
create function private.invoice_billing_preview_dates() returns trigger language plpgsql set search_path='' as $$
declare v_date date:=(transaction_timestamp() at time zone 'Europe/Prague')::date;
begin
 if tg_op='INSERT' or new.financial_version is distinct from old.financial_version or new.identity_version is distinct from old.identity_version or new.preview_issue_date is null then
  new.preview_issue_date:=v_date;new.preview_due_date:=v_date+14;
  new.preview_taxable_supply_date:=(select max((d->>'date')::date) from jsonb_array_elements(new.financial_snapshot->'reports')r cross join jsonb_array_elements(r->'days')d);
  new.preview_valid_until:=(v_date+1)::timestamp at time zone 'Europe/Prague';
 end if;
 return new;
end $$;
create trigger invoice_billing_preview_dates before insert or update on public.invoice_billing_statements for each row execute function private.invoice_billing_preview_dates();
create function private.invoice_billing_preview_is_current(p_statement uuid) returns boolean language sql set search_path='' as $$
 select s.preview_issue_date=(transaction_timestamp() at time zone 'Europe/Prague')::date and s.preview_valid_until>transaction_timestamp()
 from public.invoice_billing_statements s where s.id=p_statement
$$;

create function private.invoice_billing_payment_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare v_profile uuid;
begin
 if old.billing_statement_id is null then return new; end if;
 if old.paid_by_user_id is not null and (new.paid_by_user_id is distinct from old.paid_by_user_id
  or new.paid_by_profile_id is distinct from old.paid_by_profile_id or new.payment_recorded_at is distinct from old.payment_recorded_at) then
  raise exception 'invoice_billing_payment_audit_immutable' using errcode='42501'; end if;
 if old.status<>'paid' and new.status='paid' then
  v_profile:=private.invoice_billing_actor('coo');
  new.paid_by_user_id:=auth.uid();new.paid_by_profile_id:=v_profile;new.payment_recorded_at:=clock_timestamp();
 elsif old.paid_by_user_id is null and (new.paid_by_user_id is not null or new.paid_by_profile_id is not null or new.payment_recorded_at is not null) then
  raise exception 'invoice_billing_payment_audit_immutable' using errcode='42501';
 end if;
 return new;
end $$;

create function private.invoice_billing_preview(p_ids uuid[]) returns jsonb language plpgsql set search_path='' as $$
declare v_reports jsonb;
begin
 select jsonb_agg(jsonb_build_object(
  'timelog_id',t.id,'report_updated_at',t.updated_at,'status',t.status,'contractor_id',t.contractor_id,'contractor_user_id',p.user_id,
  'event_id',e.id,'event_name',e.name,'event_updated_at',e.updated_at,'job_number',e.job_number,'project_id',e.project_id,
  'date_from',e.date_from,'date_to',e.date_to,'meal_allowance_enabled',e.meal_allowance_enabled,
  'hourly_rate',p.hourly_rate,'km_rate',5.60,'meal_rate',250,'km',t.billing_km,'hours',d.hours,
  'amount_hours',round(d.hours*coalesce(p.hourly_rate,0),2),'amount_km',round(coalesce(t.billing_km,0)*5.60,2),
  'amount_meals',d.meals,'amount_receipts',0,'total_amount',round(d.hours*coalesce(p.hourly_rate,0),2)+round(coalesce(t.billing_km,0)*5.60,2)+d.meals,
  'days',d.days,'supplier_snapshot',private.invoice_billing_supplier(p.id),
  'customer_snapshot',jsonb_build_object('clientId',c.id,'name',coalesce(c.name,''),'ico',coalesce(c.ico,''),'dic',nullif(c.dic,''),
   'street',coalesce(c.street,''),'zip',coalesce(c.zip,''),'city',coalesce(c.city,''),'country',coalesce(nullif(c.country,''),'CZ'))
 ) order by t.id) into v_reports
 from (select original.*,case when original.km::text in('NaN','Infinity','-Infinity') or original.km<0 then null else original.km end billing_km from public.timelogs original)t
 join (select id,user_id,case when hourly_rate::text in('NaN','Infinity','-Infinity') or hourly_rate<=0 then null else hourly_rate end hourly_rate from public.profiles)p on p.id=t.contractor_id join public.events e on e.id=t.event_id
 left join public.projects pr on pr.id=e.project_id left join public.clients c on c.id=pr.client_id
 cross join lateral (
  select coalesce(sum(x.hours),0) hours,coalesce(sum(x.amount_meals),0) meals,
   coalesce(jsonb_agg(jsonb_build_object('id',x.id,'date',x.date,'time_from',x.time_from,'time_to',x.time_to,'day_type',x.day_type,
    'note',x.note,'meals',x.selected_meals,'hours',x.hours,'amount_meals',x.amount_meals) order by x.date,x.id),'[]'::jsonb) days
  from (
   select b.*,case when e.meal_allowance_enabled=false or cardinality(b.selected_meals)=0 or b.hours<6 then 0
    when b.hours>=12 and cardinality(b.selected_meals)>=2 then 500 when b.hours>=10 and b.hours<12 then 350 else 250 end amount_meals
   from (
    select td.*,mod((split_part(td.time_to,':',1)::integer*60+split_part(td.time_to,':',2)::integer)
     -(split_part(td.time_from,':',1)::integer*60+split_part(td.time_from,':',2)::integer)+1440,1440)::numeric/60 hours,
     array(select distinct meal from unnest(coalesce(td.meals,array[]::text[])||array[td.meal]) meal where meal in('obed','vecere') order by meal) selected_meals
    from public.timelog_days td where td.timelog_id=t.id
   ) b
  ) x
 ) d where t.id=any(p_ids);
 return jsonb_build_object('currency','CZK','reports',coalesce(v_reports,'[]'::jsonb),'total_amount',
  coalesce((select sum((r->>'total_amount')::numeric) from jsonb_array_elements(v_reports)r),0));
end $$;
create function private.invoice_billing_reason(p_preview jsonb) returns text language plpgsql immutable set search_path='' as $$
declare r jsonb; s jsonb; c jsonb;
begin
 if jsonb_array_length(p_preview->'reports')=0 then return 'source_missing'; end if;
 if (select count(distinct x.value->>'contractor_id') from jsonb_array_elements(p_preview->'reports') as x(value))<>1 then return 'mixed_supplier'; end if;
 for r in select value from jsonb_array_elements(p_preview->'reports') loop
  if r->>'contractor_user_id' is null or (r->>'hourly_rate')::numeric is null or (r->>'hourly_rate')::numeric<=0
   or (r->>'km')::numeric is null or (r->>'km')::numeric<0
   or jsonb_array_length(r->'days')=0 then return 'financial_data_incomplete'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_preview->'reports') as x(value) where x.value->'customer_snapshot'->>'clientId' is null) then return 'customer_missing'; end if;
 if (select count(distinct x.value->'customer_snapshot'->>'clientId') from jsonb_array_elements(p_preview->'reports') as x(value))<>1 then return 'mixed_customer'; end if;
 for r in select value from jsonb_array_elements(p_preview->'reports') loop
  s:=r->'supplier_snapshot';c:=r->'customer_snapshot';
  if exists(select 1 from unnest(array['name','ico','bankAccount','billingStreet','billingZip','billingCity']) k where btrim(coalesce(s->>k,''))='') then return 'supplier_data_incomplete'; end if;
  if exists(select 1 from unnest(array['name','ico','street','zip','city']) k where btrim(coalesce(c->>k,''))='') then return 'customer_data_incomplete'; end if;
 end loop;
 return null;
end $$;
create function private.invoice_billing_replay(p_request_id uuid,p_actor uuid,p_kind text,p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r private.invoice_billing_requests%rowtype;
begin
 if p_request_id is null then raise exception 'invoice_billing_request_required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,721));
 select * into r from private.invoice_billing_requests where request_id=p_request_id;
 if found then
  if r.actor_id<>p_actor or r.kind<>p_kind or r.payload is distinct from p_payload then raise exception 'invoice_billing_request_conflict' using errcode='22023'; end if;
  return r.result;
 end if;
 return null;
end $$;
create function private.invoice_billing_result(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('sources',coalesce(
  (select jsonb_agg(to_jsonb(x)||jsonb_build_object('reserved',true) order by x.timelog_id) from public.invoice_billing_sources x where x.statement_id=s.id),
  (select jsonb_agg((to_jsonb(h)-array['financial_version','identity_version','created_at'])||jsonb_build_object('reserved',false) order by h.timelog_id)
   from public.invoice_billing_source_history h where h.statement_id=s.id and h.financial_version=s.financial_version and h.identity_version=s.identity_version),'[]'::jsonb))
 from public.invoice_billing_statements s where s.id=p_id
$$;
create function private.invoice_billing_record_version(p_id uuid,p_reason text) returns void language plpgsql set search_path='' as $$
begin
 insert into public.invoice_billing_source_history(statement_id,financial_version,identity_version,timelog_id,event_id,report_updated_at,round_id,source_snapshot)
 select x.statement_id,s.financial_version,s.identity_version,x.timelog_id,x.event_id,x.report_updated_at,x.round_id,x.source_snapshot
  from public.invoice_billing_sources x join public.invoice_billing_statements s on s.id=x.statement_id where s.id=p_id;
 insert into public.invoice_billing_statement_versions(statement_id,financial_version,identity_version,actor_id,reason,snapshot)
 select id,financial_version,identity_version,auth.uid(),p_reason,private.invoice_billing_result(id) from public.invoice_billing_statements where id=p_id;
end $$;
create function private.get_invoice_billing_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile uuid; v_manager boolean; v_consent jsonb;
begin
 v_profile:=private.invoice_billing_actor();v_manager:=public.has_role(auth.uid(),'crewhead') or public.has_role(auth.uid(),'coo');
 if not v_manager and not public.has_role(auth.uid(),'crew') then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 select to_jsonb(c) into v_consent from public.invoice_billing_consents c where contractor_id=v_profile;
 return jsonb_build_object('version',1,'consent',coalesce(v_consent,jsonb_build_object('contractor_id',v_profile,'enabled',false,'active_grant_id',null,'updated_at',null)),
  'consent_history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.invoice_billing_consent_history h where h.contractor_id=v_profile),'[]'::jsonb),
  'statements',coalesce((select jsonb_agg(private.invoice_billing_result(s.id) order by s.created_at desc,s.id) from public.invoice_billing_statements s
   where s.superseded_by_statement_id is null and (v_manager or (s.contractor_id=v_profile and s.contractor_user_id=auth.uid() and public.has_role(auth.uid(),'crew')))),'[]'::jsonb),
  'superseded_statements',coalesce((select jsonb_agg(private.invoice_billing_result(s.id) order by s.created_at desc,s.id) from public.invoice_billing_statements s
   where s.superseded_by_statement_id is not null and (v_manager or (s.contractor_id=v_profile and s.contractor_user_id=auth.uid() and public.has_role(auth.uid(),'crew')))),'[]'::jsonb),
  'jobs',coalesce((select jsonb_agg(private.invoice_billing_job_result(j.id) order by j.created_at,j.id) from private.invoice_billing_jobs j join public.invoice_billing_statements s on s.id=j.statement_id
   where v_manager or (s.contractor_id=v_profile and s.contractor_user_id=auth.uid() and public.has_role(auth.uid(),'crew'))),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('decision',(select to_jsonb(x) from public.invoice_billing_document_decisions x where document_id=d.id)) order by d.created_at,d.id)
   from public.invoice_billing_documents d join public.invoice_billing_statements s on s.id=d.statement_id
   where v_manager or (s.contractor_id=v_profile and s.contractor_user_id=auth.uid() and public.has_role(auth.uid(),'crew'))),'[]'::jsonb));
end $$;
create function public.get_invoice_billing_snapshot() returns jsonb language sql set search_path='' as $$select private.get_invoice_billing_snapshot()$$;
create function private.set_self_billing_consent(p_request_id uuid,p_enabled boolean,p_expected_updated_at timestamptz,p_non_vat_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile uuid; v_payload jsonb; v_result jsonb; v_current public.invoice_billing_consents%rowtype; v_history uuid;
begin
 v_profile:=private.invoice_billing_actor('crew');
 v_payload:=jsonb_build_object('contractor_id',v_profile,'enabled',p_enabled,'expected_updated_at',p_expected_updated_at,'non_vat_confirmed',p_non_vat_confirmed);
 v_result:=private.invoice_billing_replay(p_request_id,auth.uid(),'consent',v_payload);if v_result is not null then return v_result; end if;
 if p_enabled is null or p_non_vat_confirmed is null or (p_enabled and not p_non_vat_confirmed) then raise exception 'invoice_billing_non_vat_required' using errcode='22023'; end if;
 -- Approval helpers already lock sources then profiles. Consent takes only the
 -- owner profile, never sources/statements/jobs; workers recheck grant under this lock.
 perform id from public.profiles where id=v_profile and user_id=auth.uid() for update;
 if not found or not public.has_role(auth.uid(),'crew') then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 select * into v_current from public.invoice_billing_consents where contractor_id=v_profile for update;
 if v_current.updated_at is distinct from p_expected_updated_at then raise exception 'invoice_billing_conflict' using errcode='PT409'; end if;
 insert into public.invoice_billing_consent_history(contractor_id,actor_id,enabled,non_vat_confirmed) values(v_profile,auth.uid(),p_enabled,p_non_vat_confirmed) returning id into v_history;
 insert into public.invoice_billing_consents(contractor_id,enabled,active_grant_id) values(v_profile,p_enabled,case when p_enabled then v_history end)
 on conflict(contractor_id) do update set enabled=excluded.enabled,active_grant_id=excluded.active_grant_id,updated_at=greatest(clock_timestamp(),public.invoice_billing_consents.updated_at+interval '1 microsecond');
 select to_jsonb(c) into v_result from public.invoice_billing_consents c where contractor_id=v_profile;
 insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'consent',v_payload,v_result,clock_timestamp());
 return v_result;
end $$;
create function public.set_self_billing_consent(p_request_id uuid,p_enabled boolean,p_expected_updated_at timestamptz,p_non_vat_confirmed boolean) returns jsonb language sql set search_path='' as $$select private.set_self_billing_consent(p_request_id,p_enabled,p_expected_updated_at,p_non_vat_confirmed)$$;

create function private.get_invoice_billing_quote(p_timelog_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile uuid; v_ids uuid[]; v_preview jsonb; v_id uuid; v_fingerprint text; v_round uuid;
begin
 v_profile:=private.invoice_billing_actor('coo');
 select array_agg(distinct id order by id) into v_ids from unnest(p_timelog_ids)id;
 if cardinality(v_ids) is null or cardinality(v_ids)=0 or cardinality(v_ids)<>cardinality(p_timelog_ids)
  or (select count(*) from public.timelogs where id=any(v_ids) and status='pending_coo')<>cardinality(v_ids) then raise exception 'invoice_billing_source_invalid' using errcode='22023'; end if;
 if exists(select 1 from public.timelog_approvals a where a.timelog_id=any(v_ids) and a.superseded_at is null
  and (a.status<>'pending' or a.approver_user_id<>auth.uid() or a.approver_profile_id<>v_profile)) then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 for v_round in select distinct i.round_id from public.shift_workflow_round_items i join public.shift_workflow_rounds r on r.id=i.round_id where i.timelog_id=any(v_ids) and r.status='pending_coo' loop
  if exists(select 1 from public.shift_workflow_round_items where round_id=v_round and not timelog_id=any(v_ids)) then raise exception 'invoice_billing_complete_round_required' using errcode='22023'; end if;
 end loop;
 v_preview:=private.invoice_billing_preview(v_ids);v_fingerprint:=md5(v_preview::text);
 insert into private.invoice_billing_quotes(actor_id,actor_profile_id,timelog_ids,fingerprint,preview) values(auth.uid(),v_profile,v_ids,v_fingerprint,v_preview) returning id into v_id;
 return jsonb_build_object('id',v_id,'fingerprint',v_fingerprint,'timelog_ids',v_ids,'preview',v_preview,'created_at',clock_timestamp());
end $$;
create function public.get_invoice_billing_quote(p_timelog_ids uuid[]) returns jsonb language sql set search_path='' as $$select private.get_invoice_billing_quote(p_timelog_ids)$$;
create function private.invoice_billing_set_quote(p_quote uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.invoice_billing_actor('coo');
 if p_quote is not null then
  if not exists(select 1 from private.invoice_billing_quotes where id=p_quote and actor_id=auth.uid() and actor_profile_id=public.current_profile_id()) then raise exception 'invoice_billing_quote_unauthorized' using errcode='42501'; end if;
  insert into private.invoice_billing_quote_permits(transaction_id,actor_id,quote_id) values(pg_current_xact_id(),auth.uid(),p_quote)
   on conflict(transaction_id) do update set quote_id=excluded.quote_id,actor_id=excluded.actor_id,consumed=false;
 end if;
end $$;
create function private.invoice_billing_consume_quote(p_targets jsonb) returns void language plpgsql set search_path='' as $$
declare q private.invoice_billing_quotes%rowtype; v_ids uuid[];
begin
 select z.* into q from private.invoice_billing_quotes z join private.invoice_billing_quote_permits p on p.quote_id=z.id
  where p.transaction_id=pg_current_xact_id() and p.actor_id=auth.uid();
 if not found then return; end if;
 select array_agg((x->>'id')::uuid order by (x->>'id')::uuid) into v_ids from jsonb_array_elements(p_targets)x;
 if q.actor_id<>auth.uid() then raise exception 'invoice_billing_quote_unauthorized' using errcode='42501'; end if;
 if q.timelog_ids is distinct from v_ids or q.preview is distinct from private.invoice_billing_preview(v_ids) then raise exception 'invoice_billing_quote_conflict' using errcode='PT409'; end if;
 update private.invoice_billing_quote_permits set consumed=true where transaction_id=pg_current_xact_id() and actor_id=auth.uid();
end $$;

create function private.invoice_billing_capture(p_ids uuid[],p_round uuid,p_kind text,p_force boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_profile uuid;v_preview jsonb;v_quote jsonb;v_reason text;v_user uuid;v_approved timestamptz;v_grant uuid;
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
  select jsonb_build_object('currency','CZK','reports',jsonb_agg(r order by r->>'timelog_id'),'total_amount',sum((r->>'total_amount')::numeric)) into v_preview
   from jsonb_array_elements(v_quote->'reports')r where (r->>'timelog_id')::uuid=any(p_ids);
 else v_preview:=private.invoice_billing_preview(p_ids); end if;
 v_reason:=private.invoice_billing_reason(v_preview);
 if not p_force and v_quote is null and v_reason is null then v_reason:='approval_quote_required'; end if;
 v_approved:=coalesce(v_approved,clock_timestamp());
 if p_kind='approval' and v_quote is not null then
  select c.active_grant_id into v_grant from public.invoice_billing_consents c join public.invoice_billing_consent_history h on h.id=c.active_grant_id
   where c.contractor_id=v_profile and c.enabled and h.actor_id=v_user and h.created_at<v_approved;
 end if;
 insert into public.invoice_billing_statements(contractor_id,contractor_user_id,round_id,status,blocked_reason,capture_kind,financial_snapshot,supplier_snapshot,customer_snapshot,total_amount,approved_by,approved_at,consent_grant_id,financial_verified)
 values(v_profile,v_user,p_round,case when v_reason is null then 'ready' else 'blocked' end,v_reason,p_kind,v_preview,
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
 return v_id;
end $$;
create function private.invoice_billing_capture_approval() returns trigger language plpgsql security definer set search_path='' as $$
declare v_ids uuid[];
begin
 if current_setting('crewflow.approved_timelog_import',true)='on' then return new; end if;
 if tg_table_name='timelogs' then
  if old.status='approved' or new.status<>'approved' or exists(select 1 from public.shift_workflow_round_items i where i.timelog_id=new.id)
   or exists(select 1 from public.shift_workflow_events e where e.event_id=new.event_id) then return new; end if;
  perform private.invoice_billing_capture(array[new.id],null,'approval');
 else
  if old.status='approved' or new.status<>'approved' then return new; end if;
  select array_agg(i.timelog_id order by i.timelog_id) into v_ids from public.shift_workflow_round_items i where i.round_id=new.id;
  if cardinality(v_ids)<>new.expected_item_count then raise exception 'invoice_billing_complete_round_required' using errcode='22023'; end if;
  perform private.invoice_billing_capture(v_ids,new.id,'approval');
 end if;
 return new;
end $$;
create trigger zz_invoice_billing_capture after update of status on public.timelogs for each row execute function private.invoice_billing_capture_approval();
create trigger zz_invoice_billing_round_capture after update of status on public.shift_workflow_rounds for each row execute function private.invoice_billing_capture_approval();

create function private.invoice_billing_issue(p_statement uuid,p_document uuid default null) returns uuid language plpgsql set search_path='' as $$
declare s public.invoice_billing_statements%rowtype; d public.invoice_billing_documents%rowtype;
 v_ids uuid[];v_invoice uuid:=gen_random_uuid();v_number text;v_sequence integer;v_year integer;v_date date;v_due date;v_path text;
begin
 select * into strict s from public.invoice_billing_statements where id=p_statement for update;
 if s.invoice_id is not null then return s.invoice_id; end if;
 if s.status not in('ready','document_returned','document_pending') or s.blocked_reason is not null then raise exception 'invoice_billing_not_ready' using errcode='22023'; end if;
 if (p_document is null and s.status='document_pending') or (p_document is not null and (s.status<>'document_pending' or s.active_document_id is distinct from p_document)) then
  raise exception 'invoice_billing_document_conflict' using errcode='PT409'; end if;
 select array_agg(timelog_id order by timelog_id) into v_ids from public.invoice_billing_sources where statement_id=s.id;
 perform private.invoice_billing_lock_statement_sources(s.id);
 if not private.invoice_billing_identity_matches(s.id) then raise exception 'invoice_billing_identity_refresh_required' using errcode='PT409'; end if;
 if p_document is null and not private.invoice_billing_preview_is_current(s.id) then raise exception 'invoice_billing_preview_expired' using errcode='PT409'; end if;
 if not exists(select 1 from public.profiles where id=s.contractor_id and user_id=s.contractor_user_id)
  or exists(select 1 from public.timelogs t join public.invoice_billing_sources x on x.timelog_id=t.id where x.statement_id=s.id
   and (t.status<>'approved' or t.contractor_id<>s.contractor_id or t.event_id<>x.event_id or t.updated_at is distinct from x.report_updated_at))
  or exists(select 1 from public.invoice_timelogs where timelog_id=any(v_ids)) then raise exception 'invoice_billing_source_conflict' using errcode='PT409'; end if;
 if p_document is not null then
  select * into strict d from public.invoice_billing_documents where id=p_document and statement_id=s.id;
  v_number:=d.external_invoice_number;v_date:=d.issue_date;v_due:=d.due_date;v_path:=d.storage_path;
  if d.financial_version<>s.financial_version or d.identity_version<>s.identity_version or d.total_amount<>s.total_amount then raise exception 'invoice_billing_document_conflict' using errcode='PT409'; end if;
 else
  v_date:=s.preview_issue_date;v_due:=s.preview_due_date;
  v_year:=extract(year from v_date)::integer;
  loop
   insert into public.invoice_number_sequences(invoice_year,supplier_profile_id,last_number) values(v_year,s.contractor_id,1)
   on conflict(invoice_year,supplier_profile_id) do update set last_number=public.invoice_number_sequences.last_number+1,updated_at=clock_timestamp()
   returning last_number into v_sequence;
   v_number:='SF-'||v_year||'-'||upper(substr(replace(s.contractor_id::text,'-',''),1,8))||'-'||lpad(v_sequence::text,4,'0');
   exit when not exists(select 1 from public.invoices where contractor_id=s.contractor_id and invoice_number=v_number);
  end loop;
 end if;
 if exists(select 1 from public.invoices where contractor_id=s.contractor_id and invoice_number=v_number) then raise exception 'invoice_billing_supplier_number_duplicate' using errcode='23505'; end if;
 insert into public.invoices(id,status,sent_at,contractor_id,event_id,timelog_id,job_number,total_hours,amount_hours,amount_km,amount_meals,amount_receipts,total_amount,
  invoice_number,issue_date,taxable_supply_date,due_date,currency,supplier_snapshot,customer_snapshot,pdf_path,pdf_generated_at,billing_kind,billing_statement_id,billing_document_id)
 select v_invoice,'sent'::public.invoice_status,clock_timestamp(),s.contractor_id,case when cardinality(v_ids)=1 then (r->>'event_id')::uuid end,case when cardinality(v_ids)=1 then v_ids[1] end,
  string_agg(distinct r->>'job_number',', '),sum((r->>'hours')::numeric),sum((r->>'amount_hours')::numeric),sum((r->>'amount_km')::numeric),sum((r->>'amount_meals')::numeric),0,
  sum((r->>'total_amount')::numeric),v_number,v_date,s.preview_taxable_supply_date,v_due,s.currency,s.supplier_snapshot,s.customer_snapshot,v_path,
  case when p_document is not null then clock_timestamp() end,case when p_document is null then 'self_billing' else 'uploaded' end,s.id,p_document
 from jsonb_array_elements(s.financial_snapshot->'reports')r group by case when cardinality(v_ids)=1 then (r->>'event_id')::uuid end;
 insert into public.invoice_items(invoice_id,event_id,job_number,hours,amount_hours,km,amount_km,amount_meals,amount_receipts,total_amount)
 select v_invoice,(r->>'event_id')::uuid,r->>'job_number',(r->>'hours')::numeric,(r->>'amount_hours')::numeric,(r->>'km')::numeric,(r->>'amount_km')::numeric,(r->>'amount_meals')::numeric,0,(r->>'total_amount')::numeric
 from jsonb_array_elements(s.financial_snapshot->'reports')r;
 insert into public.invoice_timelogs(invoice_id,timelog_id) select v_invoice,id from unnest(v_ids)id;
 insert into private.invoice_billing_write_permits(transaction_id,timelog_id,invoice_id,actor_id) select pg_current_xact_id(),id,v_invoice,auth.uid() from unnest(v_ids)id;
 update public.timelogs set status='invoiced' where id=any(v_ids);
 delete from private.invoice_billing_write_permits where transaction_id=pg_current_xact_id();
 update public.invoice_billing_statements set status='issued',invoice_id=v_invoice,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=s.id;
 if p_document is null then insert into private.invoice_billing_jobs(kind,statement_id,invoice_id) values('pdf',s.id,v_invoice) on conflict(statement_id,kind) do nothing; end if;
 return v_invoice;
end $$;
create function private.confirm_invoice_billing(p_request_id uuid,p_statement_id uuid,p_expected_updated_at timestamptz,p_non_vat_confirmed boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile uuid;v_payload jsonb;v_result jsonb;s public.invoice_billing_statements%rowtype;
begin
 v_profile:=private.invoice_billing_actor('crew');
 v_payload:=jsonb_build_object('statement_id',p_statement_id,'expected_updated_at',p_expected_updated_at,'non_vat_confirmed',p_non_vat_confirmed);
 -- Reauthorize ownership before both fresh requests and idempotent replay.
 if not exists(select 1 from public.invoice_billing_statements where id=p_statement_id and contractor_id=v_profile and contractor_user_id=auth.uid()) then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 v_result:=private.invoice_billing_replay(p_request_id,auth.uid(),'confirm',v_payload);if v_result is not null then return v_result; end if;
 if p_non_vat_confirmed is distinct from true then raise exception 'invoice_billing_non_vat_required' using errcode='22023'; end if;
 select * into s from public.invoice_billing_statements where id=p_statement_id for update;
 if s.updated_at is distinct from p_expected_updated_at then raise exception 'invoice_billing_conflict' using errcode='PT409'; end if;
 if s.status not in('ready','document_returned') then raise exception 'invoice_billing_not_ready' using errcode='22023'; end if;
 perform private.invoice_billing_issue(s.id);
 v_result:=jsonb_build_object('statement',private.invoice_billing_result(s.id));
 insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'confirm',v_payload,v_result,clock_timestamp());
 return v_result;
end $$;
create function public.confirm_invoice_billing(p_request_id uuid,p_statement_id uuid,p_expected_updated_at timestamptz,p_non_vat_confirmed boolean) returns jsonb language sql set search_path='' as $$select private.confirm_invoice_billing(p_request_id,p_statement_id,p_expected_updated_at,p_non_vat_confirmed)$$;

create function private.prepare_invoice_billing_selection(p_request_id uuid,p_timelog_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
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
 v_result:=jsonb_build_object('statement',private.invoice_billing_result(v_id));
 insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'selection',v_payload,v_result,clock_timestamp());return v_result;
end $$;

create function public.prepare_invoice_billing_selection(p_request_id uuid,p_timelog_ids uuid[]) returns jsonb language sql set search_path='' as $$select private.prepare_invoice_billing_selection(p_request_id,p_timelog_ids)$$;

-- A billing-identity refresh is explicit; monetary items remain frozen. It
-- invalidates old upload/preview versions. Customer changes require COO review.
create function private.refresh_invoice_billing_preview(p_request_id uuid,p_statement_id uuid,p_expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile uuid;v_payload jsonb;v_result jsonb;s public.invoice_billing_statements%rowtype;v_supplier jsonb;v_preview jsonb;v_reason text;
begin
 v_profile:=private.invoice_billing_actor('crew');
 if not exists(select 1 from public.invoice_billing_statements where id=p_statement_id and contractor_id=v_profile and contractor_user_id=auth.uid()) then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 v_payload:=jsonb_build_object('statement_id',p_statement_id,'expected_updated_at',p_expected_updated_at);
 v_result:=private.invoice_billing_replay(p_request_id,auth.uid(),'refresh_identity',v_payload);if v_result is not null then return v_result; end if;
 select * into s from public.invoice_billing_statements where id=p_statement_id for update;
 if s.updated_at is distinct from p_expected_updated_at then raise exception 'invoice_billing_conflict' using errcode='PT409'; end if;
 if s.status in('issued','document_pending') then raise exception 'invoice_billing_not_ready' using errcode='22023'; end if;
 perform private.invoice_billing_lock_statement_sources(s.id);
 perform id from public.profiles where id=v_profile and user_id=auth.uid() for update;
 v_supplier:=private.invoice_billing_supplier(v_profile);
 select jsonb_set(s.financial_snapshot,'{reports}',jsonb_agg(jsonb_set(r,'{supplier_snapshot}',v_supplier) order by r->>'timelog_id')) into v_preview from jsonb_array_elements(s.financial_snapshot->'reports')r;
 v_reason:=private.invoice_billing_reason(v_preview);
 if exists(select 1 from jsonb_array_elements(v_preview->'reports')r where r->'customer_snapshot' is distinct from private.invoice_billing_customer((r->>'event_id')::uuid)) then v_reason:='customer_identity_refresh_required'; end if;
 if not s.financial_verified and v_reason is null then v_reason:='approval_quote_required'; end if;
 update public.invoice_billing_statements set supplier_snapshot=v_supplier,financial_snapshot=v_preview,identity_version=identity_version+1,active_document_id=null,
  status=case when v_reason is null then 'ready' else 'blocked' end,blocked_reason=v_reason,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=s.id;
 update public.invoice_billing_sources set source_snapshot=jsonb_set(source_snapshot,'{supplier_snapshot}',v_supplier) where statement_id=s.id;
 perform private.invoice_billing_record_version(s.id,'supplier_identity_refresh');v_result:=jsonb_build_object('statement',private.invoice_billing_result(s.id));
 insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'refresh_identity',v_payload,v_result,clock_timestamp());return v_result;
end $$;
create function public.refresh_invoice_billing_preview(p_request_id uuid,p_statement_id uuid,p_expected_updated_at timestamptz) returns jsonb language sql set search_path='' as $$select private.refresh_invoice_billing_preview(p_request_id,p_statement_id,p_expected_updated_at)$$;

create function private.register_invoice_billing_document(p_request_id uuid,p_uploader_user_id uuid,p_statement_id uuid,p_expected_updated_at timestamptz,p_storage_path text,p_sha256 text,p_byte_size bigint,p_invoice_number text,p_issue_date date,p_due_date date,p_total_amount numeric) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb;v_result jsonb;s public.invoice_billing_statements%rowtype;v_document uuid;
begin
 if p_uploader_user_id is null or not public.has_role(p_uploader_user_id,'crew') or (select count(*) from public.profiles where user_id=p_uploader_user_id)<>1 then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 if not exists(select 1 from public.invoice_billing_statements owned_statement join public.profiles p on p.id=owned_statement.contractor_id
  where owned_statement.id=p_statement_id and owned_statement.contractor_user_id=p_uploader_user_id and p.user_id=p_uploader_user_id) then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 v_payload:=jsonb_build_object('statement_id',p_statement_id,'expected_updated_at',p_expected_updated_at,'path',p_storage_path,'sha256',p_sha256,'byte_size',p_byte_size,'invoice_number',p_invoice_number,'issue_date',p_issue_date,'due_date',p_due_date,'total_amount',p_total_amount);
 v_result:=private.invoice_billing_replay(p_request_id,p_uploader_user_id,'upload',v_payload);if v_result is not null then return v_result; end if;
 select * into s from public.invoice_billing_statements where id=p_statement_id for update;
 if s.updated_at is distinct from p_expected_updated_at then raise exception 'invoice_billing_conflict' using errcode='PT409'; end if;
 if s.status not in('ready','document_returned') then raise exception 'invoice_billing_not_ready' using errcode='22023'; end if;
 perform private.invoice_billing_lock_statement_sources(s.id);
 if not private.invoice_billing_identity_matches(s.id) then raise exception 'invoice_billing_identity_refresh_required' using errcode='PT409'; end if;
 perform id from public.profiles where id=s.contractor_id and user_id=p_uploader_user_id for update;
 if not found then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 if p_storage_path is distinct from 'billing-statements/'||s.id||'/documents/'||p_request_id||'.pdf'
  or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_size is null or p_byte_size<=0 or p_byte_size>5242880
  or btrim(coalesce(p_invoice_number,''))='' or p_issue_date is null or p_due_date is null or p_due_date<p_issue_date
  or p_total_amount is distinct from s.total_amount then raise exception 'invoice_billing_document_invalid' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id='invoice-pdfs' and name=p_storage_path
  and coalesce((metadata->>'size')::bigint,0)=p_byte_size and metadata->>'mimetype'='application/pdf') then raise exception 'invoice_billing_upload_unverified' using errcode='22023'; end if;
 if exists(select 1 from public.invoices where contractor_id=s.contractor_id and invoice_number=btrim(p_invoice_number)) then raise exception 'invoice_billing_supplier_number_duplicate' using errcode='23505'; end if;
 insert into public.invoice_billing_documents(statement_id,request_id,uploader_user_id,statement_updated_at,financial_version,identity_version,storage_path,sha256,byte_size,external_invoice_number,issue_date,due_date,total_amount)
 values(s.id,p_request_id,p_uploader_user_id,p_expected_updated_at,s.financial_version,s.identity_version,p_storage_path,p_sha256,p_byte_size,btrim(p_invoice_number),p_issue_date,p_due_date,p_total_amount) returning id into v_document;
 update public.invoice_billing_statements set status='document_pending',active_document_id=v_document,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=s.id;
 v_result:=jsonb_build_object('statement',private.invoice_billing_result(s.id),'document',(select to_jsonb(d) from public.invoice_billing_documents d where id=v_document));
 insert into private.invoice_billing_requests values(p_request_id,p_uploader_user_id,'upload',v_payload,v_result,clock_timestamp());return v_result;
end $$;
create function public.register_invoice_billing_document(p_request_id uuid,p_uploader_user_id uuid,p_statement_id uuid,p_expected_updated_at timestamptz,p_storage_path text,p_sha256 text,p_byte_size bigint,p_invoice_number text,p_issue_date date,p_due_date date,p_total_amount numeric) returns jsonb language sql set search_path='' as $$select private.register_invoice_billing_document(p_request_id,p_uploader_user_id,p_statement_id,p_expected_updated_at,p_storage_path,p_sha256,p_byte_size,p_invoice_number,p_issue_date,p_due_date,p_total_amount)$$;
create function private.review_invoice_billing_document(p_request_id uuid,p_statement_id uuid,p_document_id uuid,p_expected_updated_at timestamptz,p_decision text,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile uuid;v_payload jsonb;v_result jsonb;s public.invoice_billing_statements%rowtype;
begin
 v_profile:=private.invoice_billing_actor('crewhead');
 v_payload:=jsonb_build_object('statement_id',p_statement_id,'document_id',p_document_id,'expected_updated_at',p_expected_updated_at,'decision',p_decision,'note',p_note);
 v_result:=private.invoice_billing_replay(p_request_id,auth.uid(),'review',v_payload);if v_result is not null then return v_result; end if;
 if p_decision is null or p_decision not in('accept','return') or (p_decision='return' and btrim(coalesce(p_note,''))='') then raise exception 'invoice_billing_document_decision_invalid' using errcode='22023'; end if;
 select * into s from public.invoice_billing_statements where id=p_statement_id for update;
 if not found then raise exception 'invoice_billing_not_found' using errcode='P0002'; end if;
 if s.updated_at is distinct from p_expected_updated_at or s.status<>'document_pending' or s.active_document_id is distinct from p_document_id then raise exception 'invoice_billing_document_conflict' using errcode='PT409'; end if;
 if p_decision='accept' then perform private.invoice_billing_issue(s.id,p_document_id);
 else update public.invoice_billing_statements set status='document_returned',updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=s.id; end if;
 insert into public.invoice_billing_document_decisions(document_id,statement_id,actor_id,decision,note) values(p_document_id,s.id,auth.uid(),p_decision,coalesce(p_note,''));
 v_result:=jsonb_build_object('statement',private.invoice_billing_result(s.id),'decision',(select to_jsonb(d) from public.invoice_billing_document_decisions d where document_id=p_document_id));
 insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'review',v_payload,v_result,clock_timestamp());return v_result;
end $$;
create function public.review_invoice_billing_document(p_request_id uuid,p_statement_id uuid,p_document_id uuid,p_expected_updated_at timestamptz,p_decision text,p_note text) returns jsonb language sql set search_path='' as $$select private.review_invoice_billing_document(p_request_id,p_statement_id,p_document_id,p_expected_updated_at,p_decision,p_note)$$;

create function private.claim_invoice_billing_jobs(p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 -- Eight delivery attempts per explicit recovery generation. Abandoned eighth
 -- leases become reviewable terminal failures, never an automatic ninth claim.
 with exhausted as (
  select id,status from private.invoice_billing_jobs where attempts>=8 and ((status='queued' and available_at<=clock_timestamp()) or (status='running' and locked_until<clock_timestamp())) for update skip locked
 ) update private.invoice_billing_jobs j set status='failed',failed_at=clock_timestamp(),failure_code=case when e.status='running' then 'lease_expired_budget' else 'retry_budget_exhausted' end,
  locked_until=null,lease_token=null,updated_at=clock_timestamp() from exhausted e where j.id=e.id;
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invoice_billing_job_limit_invalid' using errcode='22023'; end if;
 with selected as (
  select id from private.invoice_billing_jobs where attempts<8 and ((status='queued' and available_at<=clock_timestamp()) or (status='running' and locked_until<clock_timestamp()))
  order by available_at,id limit p_limit for update skip locked
 ), claimed as (
  update private.invoice_billing_jobs j set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),locked_until=clock_timestamp()+interval '5 minutes',updated_at=clock_timestamp()
  from selected where j.id=selected.id returning j.*
 ) select coalesce(jsonb_agg(to_jsonb(c) order by c.available_at,c.id),'[]'::jsonb) into v_result from claimed c;
 return jsonb_build_object('jobs',v_result);
end $$;
create function public.claim_invoice_billing_jobs(p_limit integer default 10) returns jsonb language sql set search_path='' as $$select private.claim_invoice_billing_jobs(p_limit)$$;
create function private.process_invoice_billing_job(p_job_id uuid,p_lease_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.invoice_billing_jobs%rowtype;s public.invoice_billing_statements%rowtype;v_invoice uuid;v_result jsonb;v_block_reason text;
begin
 select * into j from private.invoice_billing_jobs where id=p_job_id for update;
 if found and j.status in('completed','cancelled') and j.lease_token=p_lease_token and j.result is not null then return j.result; end if;
 if not found or j.status<>'running' or j.lease_token is distinct from p_lease_token or j.locked_until<clock_timestamp() then raise exception 'invoice_billing_job_conflict' using errcode='PT409'; end if;
 select * into strict s from public.invoice_billing_statements where id=j.statement_id for update;
 if j.kind='issue' then
  -- Match the lifecycle's sources→profiles lock order. Consent never locks jobs
  -- or statements, so revocation cannot deadlock a worker holding this job.
  perform private.invoice_billing_lock_statement_sources(s.id);
  if s.invoice_id is not null then v_invoice:=s.invoice_id;
  elsif (s.status<>'ready' and not (s.status='blocked' and s.blocked_reason in('financial_data_incomplete','supplier_data_incomplete','customer_data_incomplete','customer_missing','mixed_customer','invoice_billing_identity_refresh_required','customer_identity_refresh_required','invoice_billing_preview_expired')))
   or not exists(select 1 from public.invoice_billing_consents c join public.invoice_billing_consent_history h on h.id=c.active_grant_id
    join public.profiles p on p.id=c.contractor_id where c.contractor_id=s.contractor_id and c.enabled and c.active_grant_id=j.consent_grant_id
    and s.consent_grant_id=j.consent_grant_id and h.created_at<s.approved_at and h.actor_id=s.contractor_user_id and p.user_id=s.contractor_user_id
    and public.has_role(p.user_id,'crew')) then
   v_result:=jsonb_build_object('status','cancelled','job_id',j.id);
   update private.invoice_billing_jobs set status='cancelled',attempts=greatest(0,attempts-1),locked_until=null,last_error='consent_or_statement_inactive',result=v_result,updated_at=clock_timestamp() where id=j.id;
   return v_result;
  elsif (s.status='ready' and not private.invoice_billing_identity_matches(s.id))
   or (s.status='blocked' and s.blocked_reason in('financial_data_incomplete','supplier_data_incomplete','customer_data_incomplete','customer_missing','mixed_customer','invoice_billing_identity_refresh_required','customer_identity_refresh_required')) then
   v_block_reason:=coalesce(s.blocked_reason,'invoice_billing_identity_refresh_required');
   update public.invoice_billing_statements set status='blocked',blocked_reason=v_block_reason,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=s.id and status<>'blocked';
   -- Waiting for an owner/customer preview is a known dependency, not a failed
   -- delivery attempt. It must resume after arbitrarily many quiet worker runs.
   update private.invoice_billing_jobs set status='queued',attempts=greatest(0,attempts-1),available_at=clock_timestamp()+interval '1 minute',lease_token=null,locked_until=null,last_error=v_block_reason,updated_at=clock_timestamp() where id=j.id;
   return jsonb_build_object('status','blocked','job_id',j.id,'statement',private.invoice_billing_result(s.id));
  else
   -- Standing consent authorizes automatic issue on the actual transaction's
   -- Czech business date. Renew only date preview metadata; money is frozen.
   if not private.invoice_billing_preview_is_current(s.id) or s.blocked_reason='invoice_billing_preview_expired' then
    update public.invoice_billing_statements set identity_version=identity_version+1,status='ready',blocked_reason=null,
     updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=s.id;
    perform private.invoice_billing_record_version(s.id,'standing_issuance_date_refresh');
   end if;
   v_invoice:=private.invoice_billing_issue(s.id);
  end if;
  v_result:=jsonb_build_object('status','completed','job_id',j.id,'invoice_id',v_invoice,'statement',private.invoice_billing_result(s.id));
  update private.invoice_billing_jobs set status='completed',locked_until=null,last_error=null,failure_code=null,failed_at=null,result=v_result,updated_at=clock_timestamp() where id=j.id;
  return v_result;
 end if;
 if not exists(select 1 from public.invoices where id=j.invoice_id and billing_kind='self_billing' and billing_statement_id=s.id) then raise exception 'invoice_billing_job_invalid' using errcode='22023'; end if;
 return jsonb_build_object('status','render','job_id',j.id,'invoice',(select to_jsonb(i) from public.invoices i where id=j.invoice_id),
  'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.event_id,i.id) from public.invoice_items i where invoice_id=j.invoice_id),'[]'::jsonb),
  'statement',private.invoice_billing_result(s.id),'pdf_path','invoices/'||j.invoice_id||'.pdf');
end $$;
create function public.process_invoice_billing_job(p_job_id uuid,p_lease_token uuid) returns jsonb language sql set search_path='' as $$select private.process_invoice_billing_job(p_job_id,p_lease_token)$$;
create function private.complete_invoice_billing_job(p_job_id uuid,p_lease_token uuid,p_pdf_path text default null,p_error text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.invoice_billing_jobs%rowtype;v_result jsonb;
begin
 select * into j from private.invoice_billing_jobs where id=p_job_id for update;
 if found and j.status='failed' and j.lease_token=p_lease_token and j.last_error=left(p_error,2000) and j.result is not null then return j.result; end if;
 if found and j.status='completed' and j.lease_token=p_lease_token and j.result->>'pdf_path'=p_pdf_path and p_error is null then return j.result; end if;
 if not found or j.status<>'running' or j.lease_token is distinct from p_lease_token or j.locked_until<clock_timestamp() then raise exception 'invoice_billing_job_conflict' using errcode='PT409'; end if;
 if nullif(btrim(p_error),'') is not null then
  v_result:=jsonb_build_object('status',case when j.attempts>=8 then 'failed' else 'queued' end,'job_id',j.id,'attempts',j.attempts,'failure_code',case when j.attempts>=8 then 'retry_budget_exhausted' else 'transient_failure' end);
  update private.invoice_billing_jobs set status=case when j.attempts>=8 then 'failed' else 'queued' end,
   available_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(j.attempts,7)))::integer),failed_at=case when j.attempts>=8 then clock_timestamp() end,
   failure_code=case when j.attempts>=8 then 'retry_budget_exhausted' else 'transient_failure' end,
   last_error=left(p_error,2000),lease_token=case when j.attempts>=8 then j.lease_token end,locked_until=null,result=case when j.attempts>=8 then v_result end,updated_at=clock_timestamp() where id=j.id;
  return v_result;
 end if;
 if j.kind<>'pdf' or p_pdf_path is distinct from 'invoices/'||j.invoice_id||'.pdf'
  or not exists(select 1 from storage.objects where bucket_id='invoice-pdfs' and name=p_pdf_path and metadata->>'mimetype'='application/pdf') then raise exception 'invoice_billing_pdf_unverified' using errcode='22023'; end if;
 update public.invoices set pdf_path=p_pdf_path,pdf_generated_at=clock_timestamp() where id=j.invoice_id and billing_kind='self_billing';
 if not found then raise exception 'invoice_billing_job_invalid' using errcode='22023'; end if;
 v_result:=jsonb_build_object('status','completed','job_id',j.id,'invoice_id',j.invoice_id,'pdf_path',p_pdf_path);
 update private.invoice_billing_jobs set status='completed',locked_until=null,last_error=null,failure_code=null,failed_at=null,result=v_result,updated_at=clock_timestamp() where id=j.id;
 return v_result;
end $$;
create function public.complete_invoice_billing_job(p_job_id uuid,p_lease_token uuid,p_pdf_path text default null,p_error text default null) returns jsonb language sql set search_path='' as $$select private.complete_invoice_billing_job(p_job_id,p_lease_token,p_pdf_path,p_error)$$;

create function private.invoice_billing_job_can_retry(p_id uuid) returns boolean language sql stable set search_path='' as $$
 select (j.status='failed' or (j.status='queued' and j.failure_code='transient_failure' and j.last_error is not null and j.attempts>0 and j.attempts<8)) and s.superseded_by_statement_id is null
  and (public.has_role(auth.uid(),'coo') or (public.has_role(auth.uid(),'crew') and s.contractor_id=public.current_profile_id() and s.contractor_user_id=auth.uid()
   and exists(select 1 from public.profiles p where p.id=s.contractor_id and p.user_id=auth.uid())))
  and (case when j.kind='pdf' then s.status='issued' and s.invoice_id=j.invoice_id and exists(select 1 from public.invoices i where i.id=j.invoice_id and i.billing_statement_id=s.id and i.billing_kind='self_billing')
   else s.invoice_id is null and s.status in('ready','blocked') and s.consent_grant_id=j.consent_grant_id
    and exists(select 1 from public.invoice_billing_consents c join public.invoice_billing_consent_history h on h.id=c.active_grant_id join public.profiles p on p.id=c.contractor_id
     where c.contractor_id=s.contractor_id and c.enabled and c.active_grant_id=j.consent_grant_id and h.actor_id=s.contractor_user_id and h.created_at<s.approved_at
      and p.user_id=s.contractor_user_id and public.has_role(p.user_id,'crew'))
    and not exists(select 1 from public.invoice_billing_sources x join public.timelogs t on t.id=x.timelog_id where x.statement_id=s.id and
     (t.status<>'approved' or t.contractor_id<>s.contractor_id or t.event_id<>x.event_id or t.updated_at is distinct from x.report_updated_at))
    and not exists(select 1 from public.invoice_timelogs l join public.invoice_billing_sources x on x.timelog_id=l.timelog_id where x.statement_id=s.id)
   end)
 from private.invoice_billing_jobs j join public.invoice_billing_statements s on s.id=j.statement_id where j.id=p_id
$$;
create function private.invoice_billing_job_result(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'kind',j.kind,'statement_id',j.statement_id,'invoice_id',j.invoice_id,'status',j.status,'attempts',j.attempts,
  'max_attempts',8,'retry_generation',j.retry_generation,'available_at',j.available_at,'updated_at',j.updated_at,'failed_at',j.failed_at,
  'failure_code',j.failure_code,'can_retry',coalesce(private.invoice_billing_job_can_retry(j.id),false)) from private.invoice_billing_jobs j where j.id=p_id
$$;
create function private.retry_invoice_billing_job(p_request_id uuid,p_statement_id uuid,p_job_id uuid,p_expected_updated_at timestamptz,p_expected_job_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile uuid;v_payload jsonb;v_result jsonb;j private.invoice_billing_jobs%rowtype;s public.invoice_billing_statements%rowtype;
begin
 v_profile:=private.invoice_billing_actor();
 if not (public.has_role(auth.uid(),'coo') or public.has_role(auth.uid(),'crew')) or not exists(select 1 from public.invoice_billing_statements owned
  where owned.id=p_statement_id and (public.has_role(auth.uid(),'coo') or (owned.contractor_id=v_profile and owned.contractor_user_id=auth.uid()))) then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 v_payload:=jsonb_build_object('statement_id',p_statement_id,'job_id',p_job_id,'expected_updated_at',p_expected_updated_at,'expected_job_updated_at',p_expected_job_updated_at);
 v_result:=private.invoice_billing_replay(p_request_id,auth.uid(),'job_retry',v_payload);if v_result is not null then return v_result; end if;
 -- Never invert the worker's job→statement→dependencies/profile lock order.
 select * into j from private.invoice_billing_jobs where id=p_job_id for update;
 if not found or j.statement_id is distinct from p_statement_id then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 select * into strict s from public.invoice_billing_statements where id=p_statement_id for update;
 if s.updated_at is distinct from p_expected_updated_at or j.updated_at is distinct from p_expected_job_updated_at or j.status not in('failed','queued') then raise exception 'invoice_billing_job_conflict' using errcode='PT409'; end if;
 perform private.invoice_billing_lock_statement_sources(s.id);
 if not private.invoice_billing_job_can_retry(j.id) then raise exception 'invoice_billing_job_recovery_inactive' using errcode='22023'; end if;
 update private.invoice_billing_jobs set status='queued',attempts=case when j.status='failed' then 0 else attempts end,retry_generation=retry_generation+case when j.status='failed' then 1 else 0 end,available_at=clock_timestamp(),lease_token=null,locked_until=null,
  failed_at=null,failure_code=null,last_error=null,result=null,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=j.id;
 update public.invoice_billing_statements set updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=s.id;
 v_result:=jsonb_build_object('statement',private.invoice_billing_result(s.id),'job',private.invoice_billing_job_result(j.id),'previous_attempts',j.attempts,'previous_retry_generation',j.retry_generation);
 insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'job_retry',v_payload,v_result,clock_timestamp());return v_result;
end $$;
create function public.retry_invoice_billing_job(p_request_id uuid,p_statement_id uuid,p_job_id uuid,p_expected_updated_at timestamptz,p_expected_job_updated_at timestamptz) returns jsonb language sql set search_path='' as $$select private.retry_invoice_billing_job(p_request_id,p_statement_id,p_job_id,p_expected_updated_at,p_expected_job_updated_at)$$;

create function private.invoice_billing_allow_distance_repair(p_old public.timelogs,p_new public.timelogs) returns boolean language sql stable set search_path='' as $$
 select p_old.status='approved' and p_new.status='approved' and (p_old.km is null or p_old.km::text in('NaN','Infinity','-Infinity') or p_old.km<0)
  and (to_jsonb(p_new)-array['km','updated_at'])=(to_jsonb(p_old)-array['km','updated_at']) and public.has_role(auth.uid(),'coo')
  and exists(select 1 from private.invoice_billing_repair_permits p join public.invoice_billing_sources x on x.timelog_id=p.timelog_id and x.statement_id=p.statement_id
   join public.invoice_billing_statements s on s.id=x.statement_id where p.transaction_id=pg_current_xact_id() and p.actor_id=auth.uid()
    and p.actor_profile_id=public.current_profile_id() and p.timelog_id=p_old.id and p.report_updated_at=p_old.updated_at and p.new_km=p_new.km
    and not s.financial_verified and s.invoice_id is null and s.contractor_id=p_old.contractor_id and x.report_updated_at=p_old.updated_at)
$$;
create function private.invoice_billing_distance_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.invoice_billing_allow_distance_repair(old,new) then new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond'); end if;
 return new;
end $$;
-- Runs after the established now() timestamp trigger, only on exact repairs.
create trigger zz_invoice_billing_distance_version before update of km on public.timelogs for each row execute function private.invoice_billing_distance_version();

create function private.repair_invoice_billing_distance(p_request_id uuid,p_statement_id uuid,p_contractor_id uuid,p_expected_updated_at timestamptz,p_sources jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile uuid;v_payload jsonb;v_result jsonb;s public.invoice_billing_statements%rowtype;v_ids uuid[];v_expected uuid[];v_reports jsonb;v_preview jsonb;v_reason text;v_source record;v_km numeric;v_changed integer:=0;
begin
 v_profile:=private.invoice_billing_actor('coo');
 v_payload:=jsonb_build_object('statement_id',p_statement_id,'contractor_id',p_contractor_id,'expected_updated_at',p_expected_updated_at,'sources',p_sources);
 if not exists(select 1 from public.invoice_billing_statements where id=p_statement_id and contractor_id=p_contractor_id) then raise exception 'invoice_billing_unauthorized' using errcode='42501'; end if;
 v_result:=private.invoice_billing_replay(p_request_id,auth.uid(),'distance_repair',v_payload);if v_result is not null then return v_result; end if;
 if p_sources is null or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources)=0 then raise exception 'invoice_billing_source_invalid' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_sources)x where jsonb_typeof(x)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(x)k) is distinct from array['expected_updated_at','km','timelog_id']::text[] or jsonb_typeof(x->'km')<>'number') then raise exception 'invoice_billing_distance_invalid' using errcode='22023'; end if;
 begin
  select array_agg((x->>'timelog_id')::uuid order by (x->>'timelog_id')::uuid) into v_ids from jsonb_array_elements(p_sources)x;
  if exists(select 1 from jsonb_array_elements(p_sources)x where (x->>'expected_updated_at')::timestamptz is null or not isfinite((x->>'expected_updated_at')::timestamptz)
   or (x->>'km')::numeric<0 or (x->>'km')::numeric>99999999.99 or round((x->>'km')::numeric,2)<>(x->>'km')::numeric) then raise exception 'invoice_billing_distance_invalid' using errcode='22023'; end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'invoice_billing_source_invalid' using errcode='22023'; end;
 select * into strict s from public.invoice_billing_statements where id=p_statement_id for update;
 if s.updated_at is distinct from p_expected_updated_at then raise exception 'invoice_billing_conflict' using errcode='PT409'; end if;
 if s.financial_verified or s.invoice_id is not null or s.status<>'blocked' or s.superseded_by_statement_id is not null then raise exception 'invoice_billing_distance_not_repairable' using errcode='22023'; end if;
 select array_agg(timelog_id order by timelog_id) into v_expected from public.invoice_billing_sources where statement_id=s.id;
 if v_ids is distinct from v_expected then raise exception 'invoice_billing_complete_statement_required' using errcode='22023'; end if;
 perform private.invoice_billing_lock_statement_sources(s.id);
 if not exists(select 1 from public.profiles p where p.id=s.contractor_id and p.user_id=s.contractor_user_id)
  or exists(select 1 from public.timelogs t join public.invoice_billing_sources x on x.timelog_id=t.id join jsonb_array_elements(p_sources)r on (r->>'timelog_id')::uuid=t.id
   where x.statement_id=s.id and (t.status<>'approved' or t.contractor_id<>p_contractor_id or t.event_id<>x.event_id or t.updated_at is distinct from x.report_updated_at or t.updated_at is distinct from (r->>'expected_updated_at')::timestamptz))
  or exists(select 1 from public.invoice_timelogs where timelog_id=any(v_ids)) then raise exception 'invoice_billing_source_conflict' using errcode='PT409'; end if;
 if exists(select 1 from public.invoice_billing_sources x join public.shift_workflow_rounds r on r.id=x.round_id where x.statement_id=s.id and
  (r.status<>'approved' or exists(select 1 from public.shift_workflow_round_items i where i.round_id=r.id and not i.timelog_id=any(v_ids)))) then raise exception 'invoice_billing_complete_round_required' using errcode='22023'; end if;
 for v_source in select t.*,r->>'km' proposed from public.timelogs t join jsonb_array_elements(p_sources)r on (r->>'timelog_id')::uuid=t.id order by t.id loop
  v_km:=v_source.proposed::numeric;
  if v_source.km is not null and v_source.km::text not in('NaN','Infinity','-Infinity') and v_source.km>=0 then
   if v_km is distinct from v_source.km then raise exception 'invoice_billing_verified_distance_immutable' using errcode='22023'; end if;
  else
   insert into private.invoice_billing_repair_permits(transaction_id,timelog_id,statement_id,actor_id,actor_profile_id,report_updated_at,new_km)
    values(pg_current_xact_id(),v_source.id,s.id,auth.uid(),v_profile,v_source.updated_at,v_km);
   update public.timelogs set km=v_km where id=v_source.id;
   v_changed:=v_changed+1;
  end if;
 end loop;
 if v_changed=0 then raise exception 'invoice_billing_distance_not_repairable' using errcode='22023'; end if;
 delete from private.invoice_billing_repair_permits where transaction_id=pg_current_xact_id();
 -- Only the invalid input and its monetary subtotal change. Approved days,
 -- hours/rates/meals, approval identity, and every old version remain frozen.
 select jsonb_agg(r||jsonb_build_object('km',t.km,'report_updated_at',t.updated_at,'status',t.status,
  'amount_km',round(t.km*(r->>'km_rate')::numeric,2),'total_amount',(r->>'amount_hours')::numeric+round(t.km*(r->>'km_rate')::numeric,2)+(r->>'amount_meals')::numeric+(r->>'amount_receipts')::numeric) order by t.id)
  into v_reports from jsonb_array_elements(s.financial_snapshot->'reports')r join public.timelogs t on t.id=(r->>'timelog_id')::uuid;
 v_preview:=jsonb_build_object('currency',s.currency,'reports',v_reports,'total_amount',(select sum((r->>'total_amount')::numeric) from jsonb_array_elements(v_reports)r));
 v_reason:=private.invoice_billing_reason(v_preview);
 update public.invoice_billing_statements set financial_snapshot=v_preview,total_amount=(v_preview->>'total_amount')::numeric,financial_version=financial_version+1,
  financial_verified=v_reason is distinct from 'financial_data_incomplete',status=case when v_reason is null then 'ready' else 'blocked' end,blocked_reason=v_reason,
  updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=s.id;
 update public.invoice_billing_sources x set report_updated_at=t.updated_at,source_snapshot=x.source_snapshot||r
  from public.timelogs t join jsonb_array_elements(v_reports)r on (r->>'timelog_id')::uuid=t.id where x.statement_id=s.id and x.timelog_id=t.id;
 perform private.invoice_billing_record_version(s.id,'invalid_distance_repair');
 v_result:=jsonb_build_object('statement',private.invoice_billing_result(s.id));
 insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'distance_repair',v_payload,v_result,clock_timestamp());return v_result;
end $$;
create function public.repair_invoice_billing_distance(p_request_id uuid,p_statement_id uuid,p_contractor_id uuid,p_expected_updated_at timestamptz,p_sources jsonb) returns jsonb language sql set search_path='' as $$select private.repair_invoice_billing_distance(p_request_id,p_statement_id,p_contractor_id,p_expected_updated_at,p_sources)$$;

-- Preserve the installed payment implementation and return contract, translating
-- only optimistic conflicts at its public API boundary (PostgREST14 compatibility).
alter function public.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz) set schema private;
alter function private.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz) rename to mark_invoice_paid_before_billing_atomic;
revoke all on function private.mark_invoice_paid_before_billing_atomic(uuid,public.invoice_status,timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.mark_invoice_paid_before_billing_atomic(uuid,public.invoice_status,timestamptz,timestamptz) to authenticated;
create function public.mark_invoice_paid_atomic(p_invoice_id uuid,p_expected_status public.invoice_status,p_expected_updated_at timestamptz,p_paid_at timestamptz)
 returns table(invoice_id uuid,invoice_status public.invoice_status,invoice_updated_at timestamptz,paid_at timestamptz,timelogs jsonb,receipts jsonb)
 language plpgsql set search_path='' as $$
begin
 return query select * from private.mark_invoice_paid_before_billing_atomic(p_invoice_id,p_expected_status,p_expected_updated_at,p_paid_at);
exception when serialization_failure then raise exception '%',sqlerrm using errcode='PT409';
end $$;
revoke all on function public.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz) to authenticated;

-- New invoices must be created through the reserved statement flow. Historical
-- sent/paid/delete operations remain unchanged.
create or replace function public.create_invoice_atomic(p_invoice jsonb,p_items jsonb,p_timelogs jsonb,p_receipts jsonb) returns table(invoice_id uuid,invoice_status public.invoice_status,invoice_updated_at timestamptz,paid_at timestamptz,timelogs jsonb,receipts jsonb) language plpgsql set search_path='' as $$
begin raise exception 'invoice_billing_statement_confirmation_required' using errcode='22023'; end $$;
-- Sequence allocation belongs exclusively to the issuer, never to a browser.
revoke all on function public.next_self_billing_invoice_sequence(integer,uuid) from public,anon,authenticated,service_role;

-- Immutable audit tables also resist accidental privileged updates/deletes.
create function private.invoice_billing_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'invoice_billing_history_immutable' using errcode='42501'; end $$;
create trigger invoice_billing_payment_audit before update on public.invoices for each row execute function private.invoice_billing_payment_audit();
create trigger invoice_billing_source_history_immutable before update or delete on public.invoice_billing_source_history for each row execute function private.invoice_billing_immutable();
create trigger invoice_billing_document_immutable before update or delete on public.invoice_billing_documents for each row execute function private.invoice_billing_immutable();
create trigger invoice_billing_decision_immutable before update or delete on public.invoice_billing_document_decisions for each row execute function private.invoice_billing_immutable();
create trigger invoice_billing_version_immutable before update or delete on public.invoice_billing_statement_versions for each row execute function private.invoice_billing_immutable();
create trigger invoice_billing_consent_history_immutable before update or delete on public.invoice_billing_consent_history for each row execute function private.invoice_billing_immutable();

-- Exposed public metadata is SELECT-only with exact live owner binding.
do $$ declare v_table text; begin
 foreach v_table in array array['invoice_billing_statements','invoice_billing_sources','invoice_billing_source_history','invoice_billing_statement_versions','invoice_billing_documents','invoice_billing_document_decisions','invoice_billing_consents','invoice_billing_consent_history'] loop
  execute format('alter table public.%I enable row level security',v_table);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',v_table);
  execute format('grant select on public.%I to authenticated',v_table);
 end loop;
 foreach v_table in array array['invoice_billing_requests','invoice_billing_quotes','invoice_billing_quote_permits','invoice_billing_write_permits','invoice_billing_repair_permits','invoice_billing_jobs'] loop
  execute format('alter table private.%I enable row level security',v_table);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',v_table);
  execute format('create policy billing_private_deny on private.%I as restrictive for all to public using(false) with check(false)',v_table);
 end loop;
end $$;
create policy billing_statement_read on public.invoice_billing_statements for select to authenticated using (
 public.has_role((select auth.uid()),'crewhead') or public.has_role((select auth.uid()),'coo')
 or (public.has_role((select auth.uid()),'crew') and contractor_id=(select public.current_profile_id()) and contractor_user_id=(select auth.uid())
  and exists(select 1 from public.profiles p where p.id=contractor_id and p.user_id=(select auth.uid())))
);
create policy billing_source_history_read on public.invoice_billing_source_history for select to authenticated using(exists(select 1 from public.invoice_billing_statements s where s.id=statement_id));
create policy billing_source_read on public.invoice_billing_sources for select to authenticated using(exists(select 1 from public.invoice_billing_statements s where s.id=statement_id));
create policy billing_document_read on public.invoice_billing_documents for select to authenticated using(exists(select 1 from public.invoice_billing_statements s where s.id=statement_id));
create policy billing_decision_read on public.invoice_billing_document_decisions for select to authenticated using(exists(select 1 from public.invoice_billing_statements s where s.id=statement_id));
create policy billing_version_read on public.invoice_billing_statement_versions for select to authenticated using(exists(select 1 from public.invoice_billing_statements s where s.id=statement_id));
create policy billing_consent_read on public.invoice_billing_consents for select to authenticated using (
 public.has_role((select auth.uid()),'crewhead') or public.has_role((select auth.uid()),'coo')
 or (public.has_role((select auth.uid()),'crew') and contractor_id=(select public.current_profile_id()) and exists(select 1 from public.profiles p where p.id=contractor_id and p.user_id=(select auth.uid())))
);
create policy billing_consent_history_read on public.invoice_billing_consent_history for select to authenticated using (
 public.has_role((select auth.uid()),'crewhead') or public.has_role((select auth.uid()),'coo')
 or (public.has_role((select auth.uid()),'crew') and contractor_id=(select public.current_profile_id()) and actor_id=(select auth.uid()))
);

-- Preserve every existing non-billing role and lifecycle guard.
CREATE OR REPLACE FUNCTION public.enforce_timelog_update_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if private.invoice_billing_allow_distance_repair(old,new) then return new; end if;
 if old.status='approved' and new.status='invoiced'
  and (to_jsonb(new)-array['status','updated_at'])=(to_jsonb(old)-array['status','updated_at'])
  and exists(select 1 from private.invoice_billing_write_permits p
   join public.invoice_timelogs l on l.invoice_id=p.invoice_id and l.timelog_id=p.timelog_id
   join public.invoices i on i.id=p.invoice_id and i.billing_statement_id is not null
   where p.transaction_id=pg_current_xact_id() and p.timelog_id=old.id and p.actor_id is not distinct from auth.uid()) then return new; end if;
 if old.status='approved' and new.status='invoiced' then raise exception 'invoice_billing_statement_confirmation_required' using errcode='42501'; end if;
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
end $function$
;

-- Validate supplied quotes after existing complete-set/source/profile authorization and locks.
CREATE OR REPLACE FUNCTION private.resolve_timelog_approvals_atomic(p_targets jsonb, p_resolution text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_target_count integer;
  v_targeted_count integer;
  v_locked_count integer;
  v_changed_count integer;
  v_actor_profile_id uuid;
  v_actor_user_id uuid := auth.uid();
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_result jsonb;
  v_target record;
  v_parent public.timelogs%rowtype;
  v_approval public.timelog_approvals%rowtype;
  v_contractor_user_id uuid;
begin
  if v_actor_user_id is null
    or not public.has_role(v_actor_user_id, 'coo'::public.app_role) then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  select p.id
  into v_actor_profile_id
  from public.profiles p
  where p.user_id = v_actor_user_id;

  if v_actor_profile_id is null then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  if p_resolution is null
    or p_resolution not in ('approved', 'returned')
    or (p_resolution = 'returned' and v_note = '')
    or p_targets is null
    or pg_catalog.jsonb_typeof(p_targets) <> 'array'
    or pg_catalog.jsonb_array_length(p_targets) = 0
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_targets) target
      where case
        when pg_catalog.jsonb_typeof(target) <> 'object' then true
        else (
          select pg_catalog.array_agg(key order by key)
          from pg_catalog.jsonb_object_keys(target) key
        ) is distinct from array[
          'approval_id',
          'approval_updated_at',
          'expected_updated_at',
          'id'
        ]::text[]
      end
    ) then
    raise exception 'timelog_approval_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_targets) target
    where nullif(target->>'id', '') is null
      or nullif(target->>'expected_updated_at', '') is null
      or ((target->>'approval_id') is null) <> ((target->>'approval_updated_at') is null)
  ) then
    raise exception 'timelog_approval_invalid' using errcode = '22023';
  end if;

  begin
    perform
      (target->>'id')::uuid,
      (target->>'expected_updated_at')::timestamptz,
      case when (target->>'approval_id') is null then null
        else (target->>'approval_id')::uuid end,
      case when (target->>'approval_updated_at') is null then null
        else (target->>'approval_updated_at')::timestamptz end
    from pg_catalog.jsonb_array_elements(p_targets) target;
  exception
    when invalid_text_representation
      or invalid_datetime_format
      or datetime_field_overflow then
      raise exception 'timelog_approval_invalid' using errcode = '22023';
  end;

  select pg_catalog.jsonb_array_length(p_targets) into v_target_count;
  select pg_catalog.count(*)::integer
  into v_targeted_count
  from pg_catalog.jsonb_array_elements(p_targets) target
  where (target->>'approval_id') is not null;

  if v_target_count is distinct from (
    select pg_catalog.count(distinct (target->>'id')::uuid)::integer
    from pg_catalog.jsonb_array_elements(p_targets) target
  ) or v_targeted_count is distinct from (
    select pg_catalog.count(distinct (target->>'approval_id')::uuid)::integer
    from pg_catalog.jsonb_array_elements(p_targets) target
    where (target->>'approval_id') is not null
  ) then
    raise exception 'timelog_approval_invalid' using errcode = '22023';
  end if;

  -- Parent lock order is shared with handoff; approval rows are locked second.
  perform t.id
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelogs t on t.id = (target->>'id')::uuid
  order by t.id
  for update of t;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_target_count then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
  end if;

  perform a.id
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelog_approvals a on a.id = (target->>'approval_id')::uuid
  where (target->>'approval_id') is not null
  order by a.id
  for update of a;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_targeted_count then
    raise exception 'timelog_approval_conflict' using errcode = '40001';
  end if;

  -- Freeze all mutable profile-to-auth bindings after parent/approval locks,
  -- using UUID order shared by every resolver batch.
  perform p.id
  from public.profiles p
  where p.id = v_actor_profile_id
    or p.id in (
      select t.contractor_id
      from pg_catalog.jsonb_array_elements(p_targets) target
      join public.timelogs t on t.id = (target->>'id')::uuid
    )
    or p.id in (
      select a.approver_profile_id
      from pg_catalog.jsonb_array_elements(p_targets) target
      join public.timelog_approvals a on a.id = (target->>'approval_id')::uuid
      where (target->>'approval_id') is not null
    )
    or p.id in (
      select a.requested_by_profile_id
      from pg_catalog.jsonb_array_elements(p_targets) target
      join public.timelog_approvals a on a.id = (target->>'approval_id')::uuid
      where (target->>'approval_id') is not null
    )
  order by p.id
  for update;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor_profile_id and p.user_id = v_actor_user_id
  ) or not public.has_role(v_actor_user_id, 'coo'::public.app_role) then
    raise exception 'timelog_approval_unauthorized' using errcode = '42501';
  end if;

  -- Validate the entire mixed targeted/legacy batch before changing either table.
  for v_target in
    select
      (target->>'id')::uuid as id,
      (target->>'expected_updated_at')::timestamptz as expected_updated_at,
      case when (target->>'approval_id') is null then null
        else (target->>'approval_id')::uuid end as approval_id,
      case when (target->>'approval_updated_at') is null then null
        else (target->>'approval_updated_at')::timestamptz end as approval_updated_at
    from pg_catalog.jsonb_array_elements(p_targets) target
    order by (target->>'id')::uuid
  loop
    select t.* into strict v_parent
    from public.timelogs t
    where t.id = v_target.id;

    select p.user_id into v_contractor_user_id
    from public.profiles p
    where p.id = v_parent.contractor_id;

    if v_target.approval_id is null then
      if exists (
        select 1 from public.timelog_approvals a
        where a.timelog_id = v_target.id
      ) then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;

      if v_parent.status <> 'pending_coo'::public.timelog_status
        or v_parent.updated_at is distinct from v_target.expected_updated_at then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;
    else
      select a.* into strict v_approval
      from public.timelog_approvals a
      where a.id = v_target.approval_id;

      if v_approval.timelog_id <> v_target.id
        or v_approval.superseded_at is not null then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;

      if v_approval.approver_profile_id <> v_actor_profile_id
        or v_approval.approver_user_id <> v_actor_user_id
        or v_approval.requested_by_profile_id = v_actor_profile_id
        or v_approval.requested_by_user_id = v_actor_user_id
        or v_parent.contractor_id = v_actor_profile_id
        or v_contractor_user_id is not distinct from v_actor_user_id then
        raise exception 'timelog_approval_unauthorized' using errcode = '42501';
      end if;

      if v_approval.status = p_resolution
        and v_approval.note = v_note then
        if v_approval.resolved_timelog_expected_updated_at is distinct from v_target.expected_updated_at
          or v_approval.resolved_approval_expected_updated_at is distinct from v_target.approval_updated_at then
          raise exception 'timelog_approval_conflict' using errcode = '40001';
        end if;
        continue;
      end if;

      if v_approval.status <> 'pending'
        or v_parent.status <> 'pending_coo'::public.timelog_status
        or v_parent.updated_at is distinct from v_target.expected_updated_at
        or v_approval.updated_at is distinct from v_target.approval_updated_at then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;
    end if;
  end loop;

  if p_resolution='approved' then perform private.invoice_billing_consume_quote(p_targets); end if;

  for v_target in
    select
      (target->>'id')::uuid as id,
      (target->>'expected_updated_at')::timestamptz as expected_updated_at,
      case when (target->>'approval_id') is null then null
        else (target->>'approval_id')::uuid end as approval_id,
      case when (target->>'approval_updated_at') is null then null
        else (target->>'approval_updated_at')::timestamptz end as approval_updated_at
    from pg_catalog.jsonb_array_elements(p_targets) target
    order by (target->>'id')::uuid
  loop
    if v_target.approval_id is not null then
      select a.* into strict v_approval
      from public.timelog_approvals a
      where a.id = v_target.approval_id;

      if v_approval.status = p_resolution and v_approval.note = v_note then
        continue;
      end if;

      update public.timelog_approvals a
      set status = p_resolution,
          note = v_note,
          resolved_at = clock_timestamp(),
          resolved_timelog_expected_updated_at = v_target.expected_updated_at,
          resolved_approval_expected_updated_at = v_target.approval_updated_at,
          updated_at = clock_timestamp()
      where a.id = v_target.approval_id
        and a.status = 'pending'
        and a.superseded_at is null;
      get diagnostics v_changed_count = row_count;
      if v_changed_count <> 1 then
        raise exception 'timelog_approval_conflict' using errcode = '40001';
      end if;
    end if;

    update public.timelogs t
    set status = case p_resolution
          when 'approved' then 'approved'::public.timelog_status
          else 'rejected'::public.timelog_status
        end,
        review_note = case when p_resolution = 'returned' then v_note else null end,
        approved_at = case when p_resolution = 'approved' then clock_timestamp() else null end
    where t.id = v_target.id;
    get diagnostics v_changed_count = row_count;
    if v_changed_count <> 1 then
      raise exception 'timelog_approval_conflict' using errcode = '40001';
    end if;
  end loop;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', t.id,
      'updated_at', t.updated_at,
      'status', t.status
    ) order by t.id
  )
  into v_result
  from pg_catalog.jsonb_array_elements(p_targets) target
  join public.timelogs t on t.id = (target->>'id')::uuid;

  return v_result;
end;
$function$
;

create function private.invoice_billing_resolve_approvals(p_targets jsonb,p_resolution text,p_note text,p_billing_quote uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_payload jsonb;q private.invoice_billing_quotes%rowtype;v_events uuid[];
begin
 perform private.invoice_billing_actor('coo');
 if p_billing_quote is not null then
  if p_resolution<>'approved' then raise exception 'invoice_billing_quote_invalid' using errcode='22023'; end if;
  perform private.invoice_billing_set_quote(p_billing_quote);
  select * into strict q from private.invoice_billing_quotes where id=p_billing_quote for update;
  v_payload:=jsonb_build_object('targets',p_targets,'resolution',p_resolution,'note',p_note);
  if q.approval_result is not null then
   if q.approval_payload is distinct from v_payload then raise exception 'invoice_billing_quote_request_conflict' using errcode='22023'; end if;
   -- A quote is the immutable idempotency key for this old approval RPC, which
   -- has no request ID. Reauthorize actor and every frozen report owner binding.
   if (select count(*) from jsonb_array_elements(q.preview->'reports')r
    join public.timelogs t on t.id=(r->>'timelog_id')::uuid and t.contractor_id=(r->>'contractor_id')::uuid and t.event_id=(r->>'event_id')::uuid
    join public.profiles p on p.id=t.contractor_id and p.user_id=(r->>'contractor_user_id')::uuid)<>cardinality(q.timelog_ids) then
    raise exception 'invoice_billing_quote_unauthorized' using errcode='42501'; end if;
   delete from private.invoice_billing_quote_permits where transaction_id=pg_current_xact_id() and actor_id=auth.uid();
   return q.approval_result;
  end if;
 end if;
 if jsonb_typeof(p_targets)='array' then
  begin
   select array_agg(distinct t.event_id order by t.event_id) into v_events from jsonb_array_elements(p_targets)x join public.timelogs t on t.id=(x->>'id')::uuid;
  exception when invalid_text_representation then raise exception 'timelog_approval_invalid' using errcode='22023'; end;
  perform private.invoice_billing_lock_events(v_events);
 end if;
 v_result:=private.resolve_timelog_approvals_atomic(p_targets,p_resolution,p_note);
 if p_billing_quote is not null then update private.invoice_billing_quotes set approval_payload=v_payload,approval_result=v_result where id=p_billing_quote; end if;
 delete from private.invoice_billing_quote_permits where transaction_id=pg_current_xact_id() and actor_id=auth.uid();return v_result;
exception when serialization_failure then
 raise exception '%',sqlerrm using errcode='PT409';
end $$;
-- Replace, never overload: old callers remain valid through the trailing default.
drop function public.resolve_timelog_approvals_atomic(jsonb,text,text);
create function public.resolve_timelog_approvals_atomic(p_targets jsonb,p_resolution text,p_note text default '',p_billing_quote uuid default null) returns jsonb language sql set search_path='' as $$select private.invoice_billing_resolve_approvals(p_targets,p_resolution,p_note,p_billing_quote)$$;
create function private.invoice_billing_transition_round(p_request_id uuid,p_round_id uuid,p_expected_round_updated_at timestamptz,p_targets jsonb,p_action text,p_note text,p_affected_event_id uuid,p_corrections jsonb,p_billing_quote uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_payload jsonb;v_events uuid[];
begin
 if p_billing_quote is not null then
  if p_action<>'approve' then raise exception 'invoice_billing_quote_invalid' using errcode='22023'; end if;
  perform private.invoice_billing_set_quote(p_billing_quote);
 end if;
 perform private.invoice_billing_actor();
 v_payload:=jsonb_build_object('round_id',p_round_id,'expected_updated_at',p_expected_round_updated_at,'targets',p_targets,'action',p_action,'note',p_note,'affected_event_id',p_affected_event_id,'corrections',p_corrections,'billing_quote',p_billing_quote);
 v_result:=private.invoice_billing_replay(p_request_id,auth.uid(),'round_transition',v_payload);
 if v_result is null then
  perform singleton from public.shift_workflow_state where singleton for update;
  select array_agg(event_id order by event_id) into v_events from public.shift_workflow_round_items where round_id=p_round_id;
  perform private.invoice_billing_lock_events(v_events);
  v_result:=private.transition_shift_workflow_round_atomic(p_request_id,p_round_id,p_expected_round_updated_at,p_targets,p_action,p_note,p_affected_event_id,p_corrections);
  insert into private.invoice_billing_requests values(p_request_id,auth.uid(),'round_transition',v_payload,v_result,clock_timestamp());
 else
  -- The authoritative lifecycle helper reauthorizes historical replay against
  -- current roles and the frozen round owner before returning our saved result.
  perform private.transition_shift_workflow_round_atomic(p_request_id,p_round_id,p_expected_round_updated_at,p_targets,p_action,p_note,p_affected_event_id,p_corrections);
 end if;
 delete from private.invoice_billing_quote_permits where transaction_id=pg_current_xact_id() and actor_id=auth.uid();return v_result;
exception when serialization_failure then
 raise exception '%',sqlerrm using errcode='PT409';
end $$;
drop function public.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb);
create function public.transition_shift_workflow_round_atomic(p_request_id uuid,p_round_id uuid,p_expected_round_updated_at timestamptz,p_targets jsonb,p_action text,p_note text,p_affected_event_id uuid,p_corrections jsonb,p_billing_quote uuid default null) returns jsonb language sql set search_path='' as $$select private.invoice_billing_transition_round(p_request_id,p_round_id,p_expected_round_updated_at,p_targets,p_action,p_note,p_affected_event_id,p_corrections,p_billing_quote)$$;

grant usage on schema private to service_role;

CREATE OR REPLACE FUNCTION private.guard_shared_shift_timelog()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_id uuid; v_event uuid; v_contractor uuid; v_has_history boolean;
 v_permit private.shift_workflow_write_permits%rowtype;
begin
 if tg_op='UPDATE' and private.invoice_billing_allow_distance_repair(old,new) then return new; end if;
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
end $function$;

-- Default function grants are explicitly removed. Only narrow authenticated or
-- service-only entry points can call the private helpers; no generic bypass.
do $$ declare f record; v_name text; begin
 for f in select p.oid::regprocedure proc,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and (p.proname like '%invoice_billing%' or p.proname='set_self_billing_consent') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.proc);
  if f.proname in('get_invoice_billing_snapshot','set_self_billing_consent','confirm_invoice_billing','review_invoice_billing_document','prepare_invoice_billing_selection','refresh_invoice_billing_preview','get_invoice_billing_quote','retry_invoice_billing_job','repair_invoice_billing_distance','invoice_billing_resolve_approvals','invoice_billing_transition_round') then
   execute format('grant execute on function %s to authenticated',f.proc);
  elsif f.proname in('register_invoice_billing_document','claim_invoice_billing_jobs','process_invoice_billing_job','complete_invoice_billing_job') then
   execute format('grant execute on function %s to service_role',f.proc);
  end if;
 end loop;
end $$;
revoke all on function public.resolve_timelog_approvals_atomic(jsonb,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_timelog_approvals_atomic(jsonb,text,text,uuid) to authenticated;
revoke all on function public.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.transition_shift_workflow_round_atomic(uuid,uuid,timestamptz,jsonb,text,text,uuid,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
