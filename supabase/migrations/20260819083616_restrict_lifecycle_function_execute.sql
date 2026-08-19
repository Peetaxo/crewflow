begin;

do $$
declare
  v_service_role_oid oid;
  function_signature text;
  v_function_oid oid;
  v_function_acl aclitem[];
  v_function_owner oid;
  v_function_signatures constant text[] := array[
    'public.assign_event_crew(uuid,uuid,uuid,jsonb)',
    'public.remove_event_crew(uuid,uuid)',
    'public.approve_event_withdrawal(uuid,uuid,uuid)',
    'public.save_timelog_atomic(uuid,uuid,uuid,timestamptz,public.timelog_status,numeric,text,public.timelog_status,jsonb)',
    'public.transition_timelog_statuses_atomic(jsonb,public.timelog_status,public.timelog_status)',
    'public.transition_receipt_statuses_atomic(jsonb,public.receipt_status,public.receipt_status)',
    'public.delete_timelog_atomic(uuid,timestamptz,public.timelog_status)',
    'public.import_approved_timelog_atomic(uuid,uuid,uuid,timestamptz,public.timelog_status,numeric,text,jsonb)',
    'public.delete_event_atomic(uuid,timestamptz)',
    'public.create_invoice_atomic(jsonb,jsonb,jsonb,jsonb)',
    'public.mark_invoice_sent_atomic(uuid,timestamptz,timestamptz)',
    'public.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz)',
    'public.delete_invoice_atomic(uuid,public.invoice_status,timestamptz)',
    'public.can_edit_timelog_data(uuid,public.timelog_status)',
    'public.enforce_event_application_lifecycle_update()',
    'public.enforce_timelog_update_permissions()',
    'public.enforce_receipt_lifecycle_update()',
    'public.handle_timelog_approved()'
  ];
begin
  select role_row.oid
  into v_service_role_oid
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'service_role';

  if v_service_role_oid is null then
    raise exception 'required database role service_role is missing';
  end if;

  foreach function_signature in array v_function_signatures loop
    v_function_oid := pg_catalog.to_regprocedure(function_signature);

    if v_function_oid is null then
      raise exception 'required lifecycle function is missing: %', function_signature;
    end if;

    execute 'revoke all on function ' || function_signature || ' from service_role';

    select function_row.proacl, function_row.proowner
    into v_function_acl, v_function_owner
    from pg_catalog.pg_proc function_row
    where function_row.oid = v_function_oid;

    if exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(v_function_acl, pg_catalog.acldefault('f', v_function_owner))
      ) acl
      where acl.grantee = v_service_role_oid
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'lifecycle function still grants execute to service_role: %',
        function_signature;
    end if;
  end loop;
end
$$;

commit;
