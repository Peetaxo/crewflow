-- Run on the disposable local invoice demo. Every fixture is rolled back.
\set ON_ERROR_STOP on
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_function('public','get_shift_invoice_attachment',array['uuid[]'],'owner-scoped invoice attachment lookup');
select has_function('public','submit_shift_workflow_invoice_atomic',array['uuid','uuid','uuid','uuid','uuid','jsonb','uuid'],'the invoice PDF can be bound in the report submission');
select has_function('public','register_shift_invoice_upload',array['uuid','uuid[]','uuid','uuid','text','text','bigint','text','date','date','numeric'],'verified staged upload registration');
select ok(not has_function_privilege('authenticated','public.get_shift_invoice_upload(uuid,uuid)','execute'),'only upload service may read a staging receipt');

do $test$
declare
  v_crew uuid:=gen_random_uuid();
  v_other_crew uuid:=gen_random_uuid();
  v_ch uuid:=gen_random_uuid();
  v_coo uuid:=gen_random_uuid();
  v_crew_profile uuid;
  v_ch_profile uuid;
  v_coo_profile uuid;
  v_client uuid:=gen_random_uuid();
  v_project uuid:=gen_random_uuid();
  v_date date:=current_date-1;
  v_event uuid;
  v_report uuid;
  v_upload uuid;
  v_submit uuid;
  v_round uuid;
  v_path text;
  v_payload jsonb;
  v_state jsonb;
  v_quote uuid;
  v_statement uuid;
  v_document uuid;
  v_grant jsonb;
  v_amount numeric;
  v_scoped jsonb;
  v_merge_ids uuid[]:=array[]::uuid[];
  v_statement_version timestamptz;
  v_index integer;
begin
  for v_index in 1..4 loop
    insert into auth.users(id,email,raw_user_meta_data)
    values((array[v_crew,v_other_crew,v_ch,v_coo])[v_index], 'invoice-hours-fixture-'||v_index||'@example.invalid','{}');
  end loop;
  select id into strict v_crew_profile from public.profiles where user_id=v_crew;
  select id into strict v_ch_profile from public.profiles where user_id=v_ch;
  select id into strict v_coo_profile from public.profiles where user_id=v_coo;
  update public.profiles set first_name='Syntetický',last_name='Dodavatel',hourly_rate=250,ico='12345678',bank_account='123/0800',
    billing_street='Testovací 1',billing_zip='10000',billing_city='Praha',billing_country='CZ'
  where id=v_crew_profile;
  delete from public.user_roles where user_id in(v_ch,v_coo);
  insert into public.user_roles(user_id,role) values(v_ch,'crewhead'),(v_coo,'coo');
  insert into public.clients(id,name,ico,street,zip,city,country)
  values(v_client,'Local invoice buyer','87654321','Testovací 2','10000','Praha','CZ');
  insert into public.projects(id,job_number,name,client_id) values(v_project,'HOURS-SQL','Local invoice hours',v_client);
  update private.notification_control set history_enabled=true,push_enabled=false where singleton;

  -- Matching PDF and resubmission, mismatched PDF, ordinary auto-issue, ordinary manual billing.
  for v_index in 1..4 loop
    v_event:=gen_random_uuid();
    v_upload:=gen_random_uuid();
    v_submit:=gen_random_uuid();
    v_round:=gen_random_uuid();
    v_amount:=case when v_index=2 then 1000 else 1750 end;
    v_path:='billing-statements/'||v_upload||'/documents/'||v_upload||'.pdf';
    insert into public.events(id,name,project_id,job_number,date_from,date_to,time_from,time_to,status,
      schedule_version,crew_needed,coordinator_profile_id,contact_profile_id,contact_approves_hours,timelog_approver_profile_id,meal_allowance_enabled)
    values(v_event,'Local invoice hours '||v_index,v_project,'HOURS-SQL-'||v_index,v_date,v_date,'08:00','15:00','upcoming',
      2,1,v_ch_profile,v_coo_profile,true,v_ch_profile,false);

    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ch,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    perform public.assign_event_crew(v_event,v_crew_profile,null,jsonb_build_array(
      jsonb_build_object('date',v_date,'time_from','08:00','time_to','15:00','day_type','provoz')));
    execute 'reset role';
    select id into strict v_report from public.timelogs where event_id=v_event and contractor_id=v_crew_profile;

    if v_index in (1,2) then
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_crew,'role','authenticated')::text,true);
      execute 'set local role authenticated';
      v_scoped:=public.get_shift_invoice_attachment(array[v_report]);
      if v_scoped->>'eligible'<>'true' or v_scoped->>'customer_id'<>v_client::text then
        raise exception 'Own draft was not eligible for PDF';
      end if;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other_crew,'role','authenticated')::text,true);
      begin
        perform public.get_shift_invoice_attachment(array[v_report]);
        raise exception 'A different Crew could query the attachment scope';
      exception when insufficient_privilege then null; end;
      execute 'reset role';

      -- The Edge handler validates actual bytes; this rollback fixture supplies a verified Storage receipt.
      insert into storage.objects(bucket_id,name,metadata)
      values('invoice-pdfs',v_path,'{"size":91,"mimetype":"application/pdf"}');
      execute 'set local role service_role';
      if public.register_shift_invoice_upload(v_crew,array[v_report],v_client,v_upload,v_path,repeat('a',64),91,
        'HOURS-INVOICE-'||v_index,v_date,v_date+14,v_amount)->>'attachment_id' is distinct from v_upload::text then
        raise exception 'Staging receipt did not match the uploaded PDF';
      end if;
      execute 'reset role';
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other_crew,'role','authenticated')::text,true);
      execute 'set local role authenticated';
      if exists(select 1 from storage.objects where bucket_id='invoice-pdfs' and name=v_path) then
        raise exception 'A different Crew could read a staged PDF';
      end if;
      execute 'reset role';
    end if;

    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_crew,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select jsonb_build_array(jsonb_build_object(
      'id',t.id,'event_id',t.event_id,'expected_updated_at',t.updated_at,'expected_status',t.status,'km',0,'note','Testovací hodiny',
      'days',(select jsonb_agg(jsonb_build_object('id',d.id,'date',d.date,'time_from',d.time_from,'time_to',d.time_to,
        'day_type',d.day_type,'note','','meal',null,'meals','[]'::jsonb)) from public.timelog_days d where d.timelog_id=t.id)
    )) into v_payload from public.timelogs t where id=v_report;

    if v_index in (1,2) then
      v_state:=public.submit_shift_workflow_invoice_atomic(v_submit,v_round,null,v_crew_profile,v_event,v_payload,v_upload);
      if public.submit_shift_workflow_invoice_atomic(v_submit,v_round,null,v_crew_profile,v_event,v_payload,v_upload) is distinct from v_state then
        raise exception 'Report retry did not preserve the first attachment and result';
      end if;
      if not exists(select 1 from storage.objects where bucket_id='invoice-pdfs' and name=v_path) then
        raise exception 'The original Crew cannot read a submitted attachment';
      end if;
    else
      v_state:=public.submit_shift_workflow_round_atomic(v_submit,v_round,null,v_crew_profile,v_event,v_payload);
    end if;
    execute 'reset role';

    if v_index=1 then
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ch,'role','authenticated')::text,true);
      execute 'set local role authenticated';
      perform public.transition_shift_workflow_round_atomic(gen_random_uuid(),v_round,(v_state#>>'{round,updated_at}')::timestamptz,
        jsonb_build_array(jsonb_build_object('id',v_report,'expected_updated_at',v_state#>>'{timelogs,0,updated_at}',
         'expected_status',v_state#>>'{timelogs,0,status}')),'return','Prosím o doplnění poznámky',v_event,null);
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_crew,'role','authenticated')::text,true);
      v_round:=gen_random_uuid();
      select jsonb_set(jsonb_set(jsonb_set(v_payload,'{0,expected_updated_at}',to_jsonb(t.updated_at)),
        '{0,expected_status}',to_jsonb(t.status)),'{0,note}',to_jsonb('Doplněná poznámka'::text))
      into v_payload from public.timelogs t where id=v_report;
      v_state:=public.submit_shift_workflow_round_atomic(gen_random_uuid(),v_round,null,v_crew_profile,v_event,v_payload);
      if public.get_shift_invoice_attachment(array[v_report])#>>'{attachment,id}' is distinct from v_upload::text then
        raise exception 'PDF did not survive the return and resubmission';
      end if;
      v_grant:=public.set_self_billing_consent(gen_random_uuid(),true,null,true);
      execute 'reset role';
    end if;

    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ch,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    v_state:=public.transition_shift_workflow_round_atomic(gen_random_uuid(),v_round,(v_state#>>'{round,updated_at}')::timestamptz,
      jsonb_build_array(jsonb_build_object('id',v_report,'expected_updated_at',v_state#>>'{timelogs,0,updated_at}',
       'expected_status',v_state#>>'{timelogs,0,status}')),'handoff','',null,null);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_coo,'role','authenticated')::text,true);
    v_quote:=(public.get_invoice_billing_quote(array[v_report])->>'id')::uuid;
    perform public.transition_shift_workflow_round_atomic(gen_random_uuid(),v_round,(v_state#>>'{round,updated_at}')::timestamptz,
      jsonb_build_array(jsonb_build_object('id',v_report,'expected_updated_at',v_state#>>'{timelogs,0,updated_at}',
       'expected_status',v_state#>>'{timelogs,0,status}')),'approve','',null,null,v_quote);
    execute 'reset role';

    select statement_id into strict v_statement from public.invoice_billing_sources where timelog_id=v_report;
    if v_index in (2,4) then v_merge_ids:=array_append(v_merge_ids,v_report); end if;
    if (select total_amount from public.invoice_billing_statements where id=v_statement) is distinct from 1750::numeric then
      raise exception 'Fixture did not capture the intended approved total';
    end if;
    if v_index=1 then
      select active_document_id into v_document from public.invoice_billing_statements
      where id=v_statement and id=v_upload and status='document_pending' and consent_grant_id is null;
      if v_document is null or exists(select 1 from private.invoice_billing_jobs where statement_id=v_statement and kind='issue') then
        raise exception 'Matching attachment did not win over later standing consent';
      end if;
      if (select count(*) from public.app_notifications where recipient_user_id=v_ch and kind='invoice_document_review'
          and target->>'billingStatementId'=v_statement::text)<>1 then
        raise exception 'The actual handoff CH did not receive one review notification';
      end if;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ch,'role','authenticated')::text,true);
      execute 'set local role authenticated';
      perform public.review_invoice_billing_document(gen_random_uuid(),v_statement,v_document,
        (select updated_at from public.invoice_billing_statements where id=v_statement),'accept','');
      if (select status from public.timelogs where id=v_report)<>'invoiced' then
        raise exception 'Accepting the actual original did not mark the report invoiced';
      end if;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_crew,'role','authenticated')::text,true);
      perform public.set_self_billing_consent(gen_random_uuid(),false,
        (public.get_invoice_billing_snapshot()#>>'{consent,updated_at}')::timestamptz,false);
      execute 'reset role';
    elsif v_index=2 then
      if not exists(select 1 from private.shift_invoice_statement_files where statement_id=v_statement and reason='amount_changed')
        or not exists(select 1 from public.app_notifications where recipient_user_id=v_crew and kind='invoice_preliminary_document_mismatch'
          and target->>'billingStatementId'=v_statement::text)
        or exists(select 1 from public.invoice_billing_documents where request_id=v_upload) then
        raise exception 'Mismatched amount went to review or did not notify Crew';
      end if;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_crew,'role','authenticated')::text,true);
      execute 'set local role authenticated';
      if exists(select 1 from jsonb_array_elements(public.get_invoice_billing_snapshot()->'statements') s
        where s->>'id'=v_statement::text and s ? 'preliminary_documents') then
        raise exception 'The v1 snapshot must preserve its strict legacy statement shape';
      end if;
      if not exists(select 1 from jsonb_array_elements(public.get_invoice_billing_snapshot_with_preliminary()->'statements') s
        where s->>'id'=v_statement::text and s#>>'{preliminary_documents,0,storage_path}'=v_path) then
        raise exception 'The owner cannot access the earlier PDF in the statement history';
      end if;
      perform public.set_self_billing_consent(gen_random_uuid(),true,
        (public.get_invoice_billing_snapshot()#>>'{consent,updated_at}')::timestamptz,true);
      execute 'reset role';
    elsif v_index=3 then
      if not exists(select 1 from private.invoice_billing_jobs where statement_id=v_statement and kind='issue')
        or exists(select 1 from public.app_notifications where recipient_user_id=v_crew and kind='timelog_approved'
         and target->>'billingStatementId'=v_statement::text) then
        raise exception 'Ordinary standing consent did not retain automatic issuance';
      end if;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_crew,'role','authenticated')::text,true);
      execute 'set local role authenticated';
      perform public.set_self_billing_consent(gen_random_uuid(),false,
        (public.get_invoice_billing_snapshot()#>>'{consent,updated_at}')::timestamptz,false);
      execute 'reset role';
    elsif not exists(select 1 from public.app_notifications where recipient_user_id=v_crew and kind='timelog_approved'
        and target->>'billingStatementId'=v_statement::text) then
      raise exception 'Ordinary manual billing did not offer a link to the approved statement';
    end if;
  end loop;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_coo,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  v_statement:=(public.prepare_invoice_billing_selection(gen_random_uuid(),v_merge_ids)#>>'{statement,id}')::uuid;
  execute 'reset role';
  if not exists(select 1 from private.shift_invoice_statement_files where statement_id=v_statement and reason='scope_changed')
    or (select count(*) from public.app_notifications where recipient_user_id=v_crew and kind='invoice_preliminary_document_mismatch'
          and target->>'billingStatementId'=v_statement::text)<>1 then
    raise exception 'Consolidating two approved sources did not preserve the earlier invoice and notify Crew once';
  end if;

  -- An ordinary later upload for a consolidated statement has no round id.
  -- Both frozen sources point to the same handing-off CH.
  v_upload:=gen_random_uuid();
  v_path:='billing-statements/'||v_statement||'/documents/'||v_upload||'.pdf';
  select updated_at into strict v_statement_version from public.invoice_billing_statements where id=v_statement;
  insert into storage.objects(bucket_id,name,metadata) values('invoice-pdfs',v_path,'{"size":91,"mimetype":"application/pdf"}');
  execute 'set local role service_role';
  perform public.register_invoice_billing_document(v_upload,v_crew,v_statement,v_statement_version,v_path,
    repeat('a',64),91,'HOURS-MERGED',v_date,v_date+14,3500);
  execute 'reset role';
  if (select count(*) from public.app_notifications where recipient_user_id=v_ch and kind='invoice_document_review'
      and target->>'billingStatementId'=v_statement::text)<>1 then
    raise exception 'Late upload did not notify the CH identified by frozen source approvals';
  end if;
end
$test$;
select pass('real shared-round state transitions cover retained, mismatched, and ordinary invoice flows');
select * from finish();
rollback;
