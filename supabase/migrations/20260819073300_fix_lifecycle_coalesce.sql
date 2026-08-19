begin;

do $$
declare
  function_fix record;
  v_signature pg_catalog.regprocedure;
  v_definition text;
  v_invalid_count integer;
begin
  for function_fix in
    select *
    from (values
      ('public.transition_receipt_statuses_atomic(jsonb,public.receipt_status,public.receipt_status)', 1),
      ('public.handle_timelog_approved()', 8),
      ('public.create_invoice_atomic(jsonb,jsonb,jsonb,jsonb)', 2),
      ('public.mark_invoice_sent_atomic(uuid,timestamptz,timestamptz)', 2),
      ('public.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz)', 2),
      ('public.delete_invoice_atomic(uuid,public.invoice_status,timestamptz)', 2)
    ) expected(signature, invalid_count)
  loop
    v_signature := pg_catalog.to_regprocedure(function_fix.signature);

    if v_signature is null then
      raise exception 'lifecycle coalesce repair function is missing: %', function_fix.signature;
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    v_invalid_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, 'pg_catalog.coalesce(', ''))
    ) / pg_catalog.length('pg_catalog.coalesce(');

    if v_invalid_count <> function_fix.invalid_count then
      raise exception 'lifecycle coalesce repair source drift for %: expected %, found %',
        function_fix.signature,
        function_fix.invalid_count,
        v_invalid_count;
    end if;

    execute pg_catalog.replace(
      v_definition,
      'pg_catalog.coalesce(',
      'coalesce('
    );

    v_definition := pg_catalog.pg_get_functiondef(v_signature);

    if pg_catalog.strpos(v_definition, 'pg_catalog.coalesce(') > 0 then
      raise exception 'lifecycle coalesce repair did not remove every invalid expression';
    end if;
  end loop;
end
$$;

commit;
