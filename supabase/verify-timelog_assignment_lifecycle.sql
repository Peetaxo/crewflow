begin;

create temporary table expected_lifecycle_function_contract (
  signature text primary key,
  is_endpoint boolean not null,
  is_security_definer boolean not null,
  execute_scope text not null check (execute_scope in ('authenticated', 'owner'))
) on commit drop;

insert into expected_lifecycle_function_contract (
  signature,
  is_endpoint,
  is_security_definer,
  execute_scope
) values
  ('public.assign_event_crew(uuid, uuid, uuid, jsonb)', true, true, 'authenticated'),
  ('public.remove_event_crew(uuid, uuid)', true, true, 'authenticated'),
  ('public.approve_event_withdrawal(uuid, uuid, uuid)', true, true, 'authenticated'),
  ('public.save_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, public.timelog_status, jsonb)', true, false, 'authenticated'),
  ('public.transition_timelog_statuses_atomic(jsonb, public.timelog_status, public.timelog_status)', true, false, 'authenticated'),
  ('public.transition_receipt_statuses_atomic(jsonb, public.receipt_status, public.receipt_status)', true, false, 'authenticated'),
  ('public.delete_timelog_atomic(uuid, timestamptz, public.timelog_status)', true, false, 'authenticated'),
  ('public.import_approved_timelog_atomic(uuid, uuid, uuid, timestamptz, public.timelog_status, numeric, text, jsonb)', true, true, 'authenticated'),
  ('public.delete_event_atomic(uuid)', true, true, 'authenticated'),
  ('public.create_invoice_atomic(jsonb, jsonb, jsonb, jsonb)', true, true, 'authenticated'),
  ('public.mark_invoice_sent_atomic(uuid, timestamptz, timestamptz)', true, true, 'authenticated'),
  ('public.mark_invoice_paid_atomic(uuid, public.invoice_status, timestamptz, timestamptz)', true, true, 'authenticated'),
  ('public.delete_invoice_atomic(uuid, public.invoice_status, timestamptz)', true, true, 'authenticated'),
  ('public.can_edit_timelog_data(uuid, public.timelog_status)', false, false, 'authenticated'),
  ('public.enforce_event_application_lifecycle_update()', false, true, 'owner'),
  ('public.enforce_timelog_update_permissions()', false, true, 'owner'),
  ('public.enforce_receipt_lifecycle_update()', false, true, 'owner'),
  ('public.handle_timelog_approved()', false, true, 'owner');

do $$
declare
  v_authenticated_role_oid oid;
  v_function_signature pg_catalog.regprocedure;
  v_function_owner_oid oid;
  v_authenticated_can_execute boolean;
  v_has_unexpected_execute_grantee boolean;
  v_non_owner_can_execute boolean;
  v_function_contract record;
  v_manager_user_id uuid;
  v_crew_user_id uuid;
  v_profile_id uuid;
  v_event_id uuid;
  v_other_event_id uuid;
  v_race_event_id uuid;
  v_application_id uuid;
  v_race_application_id uuid;
  v_assignment_id uuid;
  v_first_timelog_id uuid;
  v_second_timelog_id uuid;
  v_blocked_timelog_id uuid;
  v_result jsonb;
  v_error_message text;
  v_expected_error boolean;
  v_count integer;
  v_reset_count integer;
  v_status_count integer;
  v_status public.timelog_status;
  v_application_status text;
  v_disallowed_approval_statuses text[] := array[
    'rejected', 'withdrawn', 'withdrawal_requested'
  ];
  v_disallowed_withdrawal_statuses text[] := array[
    'pending', 'approved', 'rejected'
  ];
  v_non_disposable_statuses public.timelog_status[] := array[
    'pending_ch'::public.timelog_status,
    'pending_crew_confirmation'::public.timelog_status,
    'pending_coo'::public.timelog_status,
    'approved'::public.timelog_status,
    'invoiced'::public.timelog_status,
    'paid'::public.timelog_status
  ];
  v_toggle_update_trigger boolean;
  v_assignment_before jsonb;
  v_timelog_before jsonb;
  v_application_before jsonb;
  v_event_before jsonb;
  v_days_before jsonb;
  v_assignment_after jsonb;
  v_timelog_after jsonb;
  v_application_after jsonb;
  v_atomic_event_id uuid;
  v_atomic_first_timelog_id uuid;
  v_atomic_second_timelog_id uuid;
  v_atomic_third_timelog_id uuid;
  v_atomic_fourth_timelog_id uuid;
  v_atomic_delete_timelog_id uuid;
  v_delete_event_id uuid;
  v_protected_event_id uuid;
  v_event_receipt_id uuid;
  v_second_receipt_id uuid;
  v_second_receipt_updated_at timestamptz;
  v_invoice_event_id uuid;
  v_invoice_id uuid;
  v_delete_invoice_id uuid;
  v_invoice_timelog_id uuid;
  v_delete_invoice_timelog_id uuid;
  v_invoice_receipt_id uuid;
  v_delete_invoice_receipt_id uuid;
  v_atomic_updated_at timestamptz;
  v_atomic_second_updated_at timestamptz;
  v_atomic_third_updated_at timestamptz;
  v_atomic_fourth_updated_at timestamptz;
  v_atomic_delete_updated_at timestamptz;
  v_invoice_updated_at timestamptz;
  v_delete_invoice_updated_at timestamptz;
  v_invoice_timelog_updated_at timestamptz;
  v_delete_invoice_timelog_updated_at timestamptz;
  v_invoice_receipt_updated_at timestamptz;
  v_delete_invoice_receipt_updated_at timestamptz;
  v_invoice_paid_at timestamptz;
  v_event_after jsonb;
  v_days_after jsonb;
  v_receipt_before jsonb;
  v_receipt_after jsonb;
  v_invoice_relation_before jsonb;
  v_invoice_relation_after jsonb;
begin
  select oid into v_authenticated_role_oid
  from pg_catalog.pg_roles
  where rolname = 'authenticated';

  if v_authenticated_role_oid is null then
    raise exception 'verification failed: authenticated role does not exist';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute local_column
      on local_column.attrelid = c.conrelid
      and local_column.attname = 'timelog_id'
      and not local_column.attisdropped
    join pg_catalog.pg_attribute referenced_column
      on referenced_column.attrelid = c.confrelid
      and referenced_column.attname = 'id'
      and not referenced_column.attisdropped
    where c.conrelid = 'public.timelog_days'::pg_catalog.regclass
      and c.contype = 'f'
      and c.conkey = array[local_column.attnum]
      and c.confrelid = 'public.timelogs'::pg_catalog.regclass
      and c.confkey = array[referenced_column.attnum]
      and c.confdeltype = 'c'
  ) then
    raise exception 'verification failed: timelog day cascade constraint is incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.event_assignments'::pg_catalog.regclass
      and c.contype = 'u'
      and pg_catalog.pg_get_constraintdef(c.oid) = 'UNIQUE (event_id, profile_id)'
  ) then
    raise exception 'verification failed: assignment event/profile uniqueness is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('invoices', 'invoice_number', 'text', 'YES', null::integer, null::integer),
        ('invoices', 'issue_date', 'date', 'YES', null::integer, null::integer),
        ('invoices', 'taxable_supply_date', 'date', 'YES', null::integer, null::integer),
        ('invoices', 'due_date', 'date', 'YES', null::integer, null::integer),
        ('invoices', 'currency', 'text', 'NO', null::integer, null::integer),
        ('invoices', 'supplier_snapshot', 'jsonb', 'YES', null::integer, null::integer),
        ('invoices', 'customer_snapshot', 'jsonb', 'YES', null::integer, null::integer),
        ('invoices', 'pdf_path', 'text', 'YES', null::integer, null::integer),
        ('invoices', 'pdf_generated_at', 'timestamptz', 'YES', null::integer, null::integer),
        ('invoice_items', 'id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_items', 'invoice_id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_items', 'job_number', 'text', 'NO', null::integer, null::integer),
        ('invoice_items', 'event_id', 'uuid', 'YES', null::integer, null::integer),
        ('invoice_items', 'hours', 'numeric', 'NO', 10, 2),
        ('invoice_items', 'amount_hours', 'numeric', 'NO', 12, 2),
        ('invoice_items', 'km', 'numeric', 'NO', 10, 2),
        ('invoice_items', 'amount_km', 'numeric', 'NO', 12, 2),
        ('invoice_items', 'amount_receipts', 'numeric', 'NO', 12, 2),
        ('invoice_items', 'amount_meals', 'numeric', 'NO', null::integer, null::integer),
        ('invoice_items', 'total_amount', 'numeric', 'NO', 12, 2),
        ('invoice_items', 'created_at', 'timestamptz', 'NO', null::integer, null::integer),
        ('invoice_timelogs', 'id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_timelogs', 'invoice_id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_timelogs', 'timelog_id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_timelogs', 'created_at', 'timestamptz', 'NO', null::integer, null::integer),
        ('invoice_receipts', 'id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_receipts', 'invoice_id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_receipts', 'receipt_id', 'uuid', 'NO', null::integer, null::integer),
        ('invoice_receipts', 'created_at', 'timestamptz', 'NO', null::integer, null::integer)
    ) required_columns (
      table_name,
      column_name,
      udt_name,
      is_nullable,
      numeric_precision,
      numeric_scale
    )
    left join information_schema.columns c
      on c.table_schema = 'public'
      and c.table_name = required_columns.table_name
      and c.column_name = required_columns.column_name
    where c.column_name is null
      or c.udt_name <> required_columns.udt_name
      or c.is_nullable <> required_columns.is_nullable
      or c.numeric_precision is distinct from required_columns.numeric_precision
      or c.numeric_scale is distinct from required_columns.numeric_scale
  ) or not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoices'
      and c.column_name = 'currency'
      and c.column_default = '''CZK''::text'
  ) or exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'invoice_items'
      and c.column_name in (
        'hours',
        'amount_hours',
        'km',
        'amount_km',
        'amount_receipts',
        'amount_meals',
        'total_amount'
      )
      and c.column_default is distinct from '0'
  ) or exists (
    select 1
    from (
      values
        ('invoice_items', 'id', 'gen_random_uuid()'),
        ('invoice_items', 'created_at', 'now()'),
        ('invoice_timelogs', 'id', 'gen_random_uuid()'),
        ('invoice_timelogs', 'created_at', 'now()'),
        ('invoice_receipts', 'id', 'gen_random_uuid()'),
        ('invoice_receipts', 'created_at', 'now()')
    ) expected_defaults (table_name, column_name, column_default)
    left join information_schema.columns c
      on c.table_schema = 'public'
      and c.table_name = expected_defaults.table_name
      and c.column_name = expected_defaults.column_name
    where c.column_name is null
      or c.column_default is distinct from expected_defaults.column_default
  ) then
    raise exception 'verification failed: invoice core column catalog is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.invoice_items'::pg_catalog.regclass, 'p'::"char", 'PRIMARY KEY (id)'),
        ('public.invoice_items'::pg_catalog.regclass, 'f'::"char", 'FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE'),
        ('public.invoice_items'::pg_catalog.regclass, 'f'::"char", 'FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL'),
        ('public.invoice_timelogs'::pg_catalog.regclass, 'p'::"char", 'PRIMARY KEY (id)'),
        ('public.invoice_timelogs'::pg_catalog.regclass, 'u'::"char", 'UNIQUE (invoice_id, timelog_id)'),
        ('public.invoice_timelogs'::pg_catalog.regclass, 'u'::"char", 'UNIQUE (timelog_id)'),
        ('public.invoice_timelogs'::pg_catalog.regclass, 'f'::"char", 'FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE'),
        ('public.invoice_timelogs'::pg_catalog.regclass, 'f'::"char", 'FOREIGN KEY (timelog_id) REFERENCES timelogs(id) ON DELETE CASCADE'),
        ('public.invoice_receipts'::pg_catalog.regclass, 'p'::"char", 'PRIMARY KEY (id)'),
        ('public.invoice_receipts'::pg_catalog.regclass, 'u'::"char", 'UNIQUE (invoice_id, receipt_id)'),
        ('public.invoice_receipts'::pg_catalog.regclass, 'u'::"char", 'UNIQUE (receipt_id)'),
        ('public.invoice_receipts'::pg_catalog.regclass, 'f'::"char", 'FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE'),
        ('public.invoice_receipts'::pg_catalog.regclass, 'f'::"char", 'FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE'),
        ('public.invoices'::pg_catalog.regclass, 'f'::"char", 'FOREIGN KEY (timelog_id) REFERENCES timelogs(id) ON DELETE SET NULL')
    ) expected_constraints (relation_id, constraint_type, definition)
    left join pg_catalog.pg_constraint c
      on c.conrelid = expected_constraints.relation_id
      and c.contype = expected_constraints.constraint_type
      and pg_catalog.pg_get_constraintdef(c.oid) = expected_constraints.definition
    where c.oid is null
  ) then
    raise exception 'verification failed: invoice relation constraints are incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class index_relation on index_relation.oid = i.indexrelid
    join pg_catalog.pg_attribute indexed_column
      on indexed_column.attrelid = i.indrelid
      and indexed_column.attname = 'invoice_number'
      and not indexed_column.attisdropped
    where i.indrelid = 'public.invoices'::pg_catalog.regclass
      and index_relation.relname = 'invoices_invoice_number_key'
      and i.indisunique
      and i.indnkeyatts = 1
      and i.indkey[0] = indexed_column.attnum
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) = '(invoice_number IS NOT NULL)'
  ) or not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class index_relation on index_relation.oid = i.indexrelid
    join pg_catalog.pg_attribute indexed_column
      on indexed_column.attrelid = i.indrelid
      and indexed_column.attname = 'pdf_path'
      and not indexed_column.attisdropped
    where i.indrelid = 'public.invoices'::pg_catalog.regclass
      and index_relation.relname = 'idx_invoices_pdf_path'
      and not i.indisunique
      and i.indnkeyatts = 1
      and i.indkey[0] = indexed_column.attnum
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) = '(pdf_path IS NOT NULL)'
  ) then
    raise exception 'verification failed: invoice billing indexes are incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.timelogs'::pg_catalog.regclass),
        ('public.timelog_days'::pg_catalog.regclass),
        ('public.events'::pg_catalog.regclass),
        ('public.receipts'::pg_catalog.regclass),
        ('public.invoices'::pg_catalog.regclass),
        ('public.invoice_items'::pg_catalog.regclass),
        ('public.invoice_timelogs'::pg_catalog.regclass),
        ('public.invoice_receipts'::pg_catalog.regclass)
    ) required_tables (relation_id)
    join pg_catalog.pg_class relation on relation.oid = required_tables.relation_id
    where not relation.relrowsecurity or relation.relforcerowsecurity
  ) then
    raise exception 'verification failed: required workflow RLS configuration is incompatible';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.timelogs', 'SELECT,INSERT,UPDATE,DELETE')
    or pg_catalog.has_table_privilege('anon', 'public.timelog_days', 'SELECT,INSERT,UPDATE,DELETE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.timelogs', 'SELECT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.timelogs', 'INSERT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.timelogs', 'UPDATE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.timelogs', 'DELETE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.timelog_days', 'SELECT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.timelog_days', 'INSERT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.timelog_days', 'UPDATE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.timelog_days', 'DELETE')
    or pg_catalog.has_table_privilege('authenticated', 'public.timelogs', 'TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_table_privilege('authenticated', 'public.timelog_days', 'TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'verification failed: timelog table ACL is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.invoice_items'::pg_catalog.regclass),
        ('public.invoice_timelogs'::pg_catalog.regclass),
        ('public.invoice_receipts'::pg_catalog.regclass)
    ) required_tables (relation_id)
    where pg_catalog.has_table_privilege('anon', relation_id, 'SELECT,INSERT,UPDATE,DELETE')
      or not pg_catalog.has_table_privilege('authenticated', relation_id, 'SELECT')
      or pg_catalog.has_table_privilege(
        'authenticated',
        relation_id,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
  ) then
    raise exception 'verification failed: invoice link table ACL is incompatible';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.events', 'SELECT,INSERT,UPDATE,DELETE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.events', 'SELECT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.events', 'INSERT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.events', 'UPDATE')
    or pg_catalog.has_table_privilege(
      'authenticated',
      'public.events',
      'DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) then
    raise exception 'verification failed: event table ACL is incompatible';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.receipts', 'SELECT,INSERT,UPDATE,DELETE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.receipts', 'SELECT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.receipts', 'INSERT')
    or not pg_catalog.has_table_privilege('authenticated', 'public.receipts', 'UPDATE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.receipts', 'DELETE')
    or pg_catalog.has_table_privilege(
      'authenticated',
      'public.receipts',
      'TRUNCATE,REFERENCES,TRIGGER'
    ) then
    raise exception 'verification failed: receipt table ACL is incompatible';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.invoices', 'SELECT,INSERT,UPDATE,DELETE')
    or not pg_catalog.has_table_privilege('authenticated', 'public.invoices', 'SELECT')
    or pg_catalog.has_table_privilege(
      'authenticated',
      'public.invoices',
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) then
    raise exception 'verification failed: invoice table ACL is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('Crew can view own timelogs', 'r'::"char", true, false),
        ('Crew can create own draft timelogs', 'a'::"char", false, true),
        ('Crew can update own editable timelogs', 'w'::"char", true, true),
        ('Crew can delete own draft and rejected timelogs', 'd'::"char", true, false),
        ('CrewHead can view all timelogs', 'r'::"char", true, false),
        ('CrewHead can create assignment draft timelogs', 'a'::"char", false, true),
        ('CrewHead can create proposed timelogs', 'a'::"char", false, true),
        ('CrewHead can update draft and CH timelogs', 'w'::"char", true, true),
        ('CrewHead can delete disposable timelogs', 'd'::"char", true, false),
        ('COO can view all timelogs', 'r'::"char", true, false),
        ('COO can status-update COO timelogs', 'w'::"char", true, true)
    ) expected_policy (policy_name, command, needs_qual, needs_check)
    left join pg_catalog.pg_policy policy
      on policy.polrelid = 'public.timelogs'::pg_catalog.regclass
      and policy.polname = expected_policy.policy_name
      and policy.polcmd = expected_policy.command
      and policy.polroles = array[v_authenticated_role_oid]
      and policy.polpermissive
    where policy.oid is null
      or (policy.polqual is not null) is distinct from expected_policy.needs_qual
      or (policy.polwithcheck is not null) is distinct from expected_policy.needs_check
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.timelogs'::pg_catalog.regclass
  ) <> 11 then
    raise exception 'verification failed: timelog workflow policy catalog is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('Users can view timelog days via visible timelog', 'r'::"char", true, false),
        ('Users can insert timelog days via editable timelog', 'a'::"char", false, true),
        ('Users can update timelog days via editable timelog', 'w'::"char", true, true),
        ('Users can delete timelog days via editable timelog', 'd'::"char", true, false)
    ) expected_policy (policy_name, command, needs_qual, needs_check)
    left join pg_catalog.pg_policy policy
      on policy.polrelid = 'public.timelog_days'::pg_catalog.regclass
      and policy.polname = expected_policy.policy_name
      and policy.polcmd = expected_policy.command
      and policy.polroles = array[v_authenticated_role_oid]
      and policy.polpermissive
    where policy.oid is null
      or (policy.polqual is not null) is distinct from expected_policy.needs_qual
      or (policy.polwithcheck is not null) is distinct from expected_policy.needs_check
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.timelog_days'::pg_catalog.regclass
  ) <> 4 then
    raise exception 'verification failed: timelog-day workflow policy catalog is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('Crew can view assigned events', 'r'::"char", true, false),
        ('CrewHead and COO can view events', 'r'::"char", true, false),
        ('CrewHead and COO can create events', 'a'::"char", false, true),
        ('CrewHead and COO can update events', 'w'::"char", true, true)
    ) expected_policy (policy_name, command, needs_qual, needs_check)
    left join pg_catalog.pg_policy policy
      on policy.polrelid = 'public.events'::pg_catalog.regclass
      and policy.polname = expected_policy.policy_name
      and policy.polcmd = expected_policy.command
      and policy.polroles = array[v_authenticated_role_oid]
      and policy.polpermissive
    where policy.oid is null
      or (policy.polqual is not null) is distinct from expected_policy.needs_qual
      or (policy.polwithcheck is not null) is distinct from expected_policy.needs_check
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.events'::pg_catalog.regclass
  ) <> 4 then
    raise exception 'verification failed: event policy catalog is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('Crew can view own receipts', 'r'::"char", true, false),
        ('CrewHead and COO can view all receipts', 'r'::"char", true, false),
        ('Crew can create own draft receipts', 'a'::"char", false, true),
        ('CrewHead and COO can create draft receipts', 'a'::"char", false, true),
        ('Crew can update own editable receipts', 'w'::"char", true, true),
        ('CrewHead and COO can review submitted receipts', 'w'::"char", true, true),
        ('COO can update invoice receipt status', 'w'::"char", true, true),
        ('Crew can delete own disposable receipts', 'd'::"char", true, false),
        ('CrewHead and COO can delete disposable receipts', 'd'::"char", true, false)
    ) expected_policy (policy_name, command, needs_qual, needs_check)
    left join pg_catalog.pg_policy policy
      on policy.polrelid = 'public.receipts'::pg_catalog.regclass
      and policy.polname = expected_policy.policy_name
      and policy.polcmd = expected_policy.command
      and policy.polroles = array[v_authenticated_role_oid]
      and policy.polpermissive
    where policy.oid is null
      or (policy.polqual is not null) is distinct from expected_policy.needs_qual
      or (policy.polwithcheck is not null) is distinct from expected_policy.needs_check
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.receipts'::pg_catalog.regclass
  ) <> 9 then
    raise exception 'verification failed: receipt workflow policy catalog is incompatible';
  end if;

  if exists (
    select 1
    from (
      values
        ('Crew can view own invoices', 'r'::"char", true, false),
        ('CrewHead and COO can view all invoices', 'r'::"char", true, false)
    ) expected_policy (policy_name, command, needs_qual, needs_check)
    left join pg_catalog.pg_policy policy
      on policy.polrelid = 'public.invoices'::pg_catalog.regclass
      and policy.polname = expected_policy.policy_name
      and policy.polcmd = expected_policy.command
      and policy.polroles = array[v_authenticated_role_oid]
      and policy.polpermissive
    where policy.oid is null
      or (policy.polqual is not null) is distinct from expected_policy.needs_qual
      or (policy.polwithcheck is not null) is distinct from expected_policy.needs_check
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.invoices'::pg_catalog.regclass
  ) <> 2 then
    raise exception 'verification failed: invoice policy catalog is incompatible';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      'public.invoice_items'::pg_catalog.regclass,
      'public.invoice_timelogs'::pg_catalog.regclass,
      'public.invoice_receipts'::pg_catalog.regclass
    )
      and policy.polcmd <> 'r'::"char"
  ) then
    raise exception 'verification failed: invoice link write policy exists';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.invoice_items'::pg_catalog.regclass, 'invoice_items'),
        ('public.invoice_timelogs'::pg_catalog.regclass, 'invoice_timelogs'),
        ('public.invoice_receipts'::pg_catalog.regclass, 'invoice_receipts')
    ) required_tables (relation_id, policy_prefix)
    cross join (
      values
        ('_select_management', 'r'::"char", true, false)
    ) expected_policy (name_suffix, command, needs_qual, needs_check)
    left join pg_catalog.pg_policy policy
      on policy.polrelid = required_tables.relation_id
      and policy.polname = required_tables.policy_prefix || expected_policy.name_suffix
      and policy.polcmd = expected_policy.command
      and policy.polroles = array[v_authenticated_role_oid]
      and policy.polpermissive
    where policy.oid is null
      or (policy.polqual is not null) is distinct from expected_policy.needs_qual
      or (policy.polwithcheck is not null) is distinct from expected_policy.needs_check
      or pg_catalog.strpos(
        pg_catalog.coalesce(
          pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
          ''
        ),
        'coo'
      ) = 0
      or pg_catalog.strpos(
        pg_catalog.coalesce(
          pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
          ''
        ),
        'crewhead'
      ) = 0
  ) or exists (
    select 1
    from (
      values
        ('public.invoice_items'::pg_catalog.regclass),
        ('public.invoice_timelogs'::pg_catalog.regclass),
        ('public.invoice_receipts'::pg_catalog.regclass)
    ) required_tables (relation_id)
    where (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy policy
      where policy.polrelid = required_tables.relation_id
    ) <> 1
  ) then
    raise exception 'verification failed: invoice link policy catalog is incompatible';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace function_schema
      on function_schema.oid = function_row.pronamespace
    where function_schema.nspname = 'public'
      and function_row.prokind = 'f'::"char"
      and function_row.proname in (
        select pg_catalog.split_part(
          pg_catalog.split_part(contract.signature, '.', 2),
          '(',
          1
        )
        from expected_lifecycle_function_contract contract
        where contract.is_endpoint
      )
  ) <> 13 then
    raise exception 'verification failed: public lifecycle endpoint catalog is incompatible';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace function_schema
      on function_schema.oid = function_row.pronamespace
    where function_schema.nspname = 'public'
      and function_row.prokind = 'f'::"char"
      and function_row.proname in (
        select pg_catalog.split_part(
          pg_catalog.split_part(contract.signature, '.', 2),
          '(',
          1
        )
        from expected_lifecycle_function_contract contract
      )
  ) <> 18 then
    raise exception 'verification failed: installed lifecycle helper catalog is incompatible';
  end if;

  for v_function_contract in
    select contract.*
    from expected_lifecycle_function_contract contract
    order by contract.signature
  loop
    v_function_signature := pg_catalog.to_regprocedure(v_function_contract.signature);

    if v_function_signature is null then
      raise exception 'verification failed: lifecycle function signature is missing or incompatible: %',
        v_function_contract.signature;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_proc function_row
      where function_row.oid = v_function_signature::oid
        and (
          function_row.prosecdef is distinct from v_function_contract.is_security_definer
          or not (
            'search_path=""' = any(
              pg_catalog.coalesce(function_row.proconfig, array[]::text[])
            )
          )
          or (
            select pg_catalog.count(*)
            from pg_catalog.unnest(
              pg_catalog.coalesce(function_row.proconfig, array[]::text[])
            ) config_value
            where config_value like 'search_path=%'
          ) <> 1
        )
    ) then
      raise exception 'verification failed: lifecycle function mode or search path is incompatible: %',
        v_function_contract.signature;
    end if;

    select
      p.proowner,
      pg_catalog.coalesce(
        pg_catalog.bool_or(
          acl.privilege_type = 'EXECUTE'
          and acl.grantee = v_authenticated_role_oid
        ),
        false
      ),
      pg_catalog.coalesce(
        pg_catalog.bool_or(
          acl.privilege_type = 'EXECUTE'
          and acl.grantee <> p.proowner
          and acl.grantee <> v_authenticated_role_oid
        ),
        false
      ),
      pg_catalog.coalesce(
        pg_catalog.bool_or(
          acl.privilege_type = 'EXECUTE'
          and acl.grantee <> p.proowner
        ),
        false
      )
    into
      v_function_owner_oid,
      v_authenticated_can_execute,
      v_has_unexpected_execute_grantee,
      v_non_owner_can_execute
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      pg_catalog.coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_function_signature::oid
    group by p.proowner;

    if v_function_owner_oid is null then
      raise exception 'verification failed: lifecycle function does not exist: %',
        v_function_contract.signature;
    end if;

    if v_function_contract.execute_scope = 'authenticated' then
      if not v_authenticated_can_execute then
        raise exception 'verification failed: authenticated lacks EXECUTE on %',
          v_function_contract.signature;
      end if;
      if v_has_unexpected_execute_grantee then
        raise exception 'verification failed: unexpected EXECUTE grantee on %',
          v_function_contract.signature;
      end if;
    elsif v_non_owner_can_execute then
      raise exception 'verification failed: non-callable lifecycle helper is directly executable: %',
        v_function_contract.signature;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.event_applications'::pg_catalog.regclass
      and trigger_row.tgname = 'enforce_event_application_lifecycle_update'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then
    raise exception 'verification failed: event application lifecycle trigger is missing or disabled';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.timelogs'::pg_catalog.regclass
      and trigger_row.tgname = 'enforce_timelog_update_permissions'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then
    raise exception 'verification failed: timelog permission trigger is missing or disabled';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.receipts'::pg_catalog.regclass
      and trigger_row.tgname = 'enforce_receipt_lifecycle_update'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.timelogs'::pg_catalog.regclass
      and trigger_row.tgname = 'trg_timelog_approved'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) then
    raise exception 'verification failed: receipt or invoice trigger is missing or disabled';
  end if;

  select p.id, p.user_id
  into v_profile_id, v_crew_user_id
  from public.profiles p
  where p.user_id is not null
    and exists (
      select 1
      from public.user_roles crew_role
      where crew_role.user_id = p.user_id
        and crew_role.role = 'crew'::public.app_role
    )
    and not exists (
      select 1
      from public.user_roles manager_role
      where manager_role.user_id = p.user_id
        and manager_role.role in ('crewhead'::public.app_role, 'coo'::public.app_role)
    )
  order by p.id
  limit 1;

  if v_profile_id is null or v_crew_user_id is null then
    raise exception 'verification fixture missing: no crew-only profile exists';
  end if;

  v_manager_user_id := v_crew_user_id;
  perform pg_catalog.set_config('request.jwt.claim.sub', v_manager_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_manager_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'crewhead'::public.app_role);

  insert into public.events (name, status)
  values (
    'Crew lifecycle verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_event_id;

  insert into public.events (name, status)
  values (
    'Crew lifecycle identity target ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_other_event_id;

  insert into public.event_applications (event_id, profile_id, status, note)
  values (v_event_id, v_profile_id, 'pending', 'crew lifecycle verification')
  returning id into v_application_id;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_manager_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_manager_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  v_result := public.assign_event_crew(
    v_event_id,
    v_profile_id,
    v_application_id,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'date', '2099-01-01',
        'time_from', '08:00',
        'time_to', '16:00',
        'day_type', 'instal',
        'note', 'original assignment day'
      )
    )
  );
  v_assignment_id := (v_result->>'assignment_id')::uuid;
  v_first_timelog_id := (v_result->>'timelog_id')::uuid;

  if (v_result->>'timelog_created')::boolean is not true
    or v_assignment_id is null
    or v_first_timelog_id is null then
    raise exception 'verification failed: first assignment did not create its rows';
  end if;

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'crewhead'::public.app_role;
  get diagnostics v_status_count = row_count;
  if v_status_count <> 1 then
    raise exception 'verification failed: temporary CrewHead role was not removed';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'coo'::public.app_role);

  v_result := public.assign_event_crew(
    v_event_id,
    v_profile_id,
    v_application_id,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'date', '2099-01-02',
        'time_from', '09:00',
        'time_to', '17:00',
        'day_type', 'provoz',
        'note', 'must not replace original day'
      )
    )
  );

  if (v_result->>'timelog_created')::boolean is not false
    or (v_result->>'assignment_id')::uuid is distinct from v_assignment_id
    or (v_result->>'timelog_id')::uuid is distinct from v_first_timelog_id then
    raise exception 'verification failed: repeated assignment was not idempotent';
  end if;

  select count(*) into v_count
  from public.event_assignments
  where event_id = v_event_id and profile_id = v_profile_id;
  if v_count <> 1 then
    raise exception 'verification failed: repeated assignment changed assignment count';
  end if;

  select count(*) into v_count
  from public.timelogs
  where event_id = v_event_id and contractor_id = v_profile_id;
  if v_count <> 1 then
    raise exception 'verification failed: repeated assignment changed timelog count';
  end if;

  select count(*) into v_count
  from public.timelog_days
  where timelog_id = v_first_timelog_id;
  if v_count <> 1 or not exists (
    select 1
    from public.timelog_days
    where timelog_id = v_first_timelog_id
      and date = '2099-01-01'::date
      and time_from = '08:00'
      and time_to = '16:00'
      and day_type = 'instal'::public.timelog_type
      and note = 'original assignment day'
  ) then
    raise exception 'verification failed: repeated assignment replaced original timelog days';
  end if;

  if not exists (
    select 1
    from public.event_applications
    where id = v_application_id and status = 'approved'
  ) then
    raise exception 'verification failed: assignment did not approve the application';
  end if;

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'coo'::public.app_role;
  get diagnostics v_status_count = row_count;
  if v_status_count <> 1 then
    raise exception 'verification failed: temporary COO role was not removed';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'crewhead'::public.app_role);

  perform pg_catalog.set_config('request.jwt.claim.sub', v_manager_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_manager_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  v_result := public.remove_event_crew(v_event_id, v_profile_id);
  if (v_result->>'assignment_removed')::boolean is not true
    or (v_result->>'timelog_removed')::boolean is not true then
    raise exception 'verification failed: draft removal result did not report both deletions';
  end if;

  if exists (
    select 1 from public.event_assignments
    where event_id = v_event_id and profile_id = v_profile_id
  ) or exists (
    select 1 from public.timelogs
    where event_id = v_event_id and contractor_id = v_profile_id
  ) or exists (
    select 1 from public.timelog_days where timelog_id = v_first_timelog_id
  ) then
    raise exception 'verification failed: draft removal left lifecycle rows behind';
  end if;

  if not exists (
    select 1 from public.event_applications
    where id = v_application_id and status = 'withdrawn'
  ) or not exists (
    select 1 from public.events where id = v_event_id and crew_filled = 0
  ) then
    raise exception 'verification failed: draft removal did not update application and event';
  end if;

  update public.event_applications
  set status = 'pending'
  where id = v_application_id and status = 'withdrawn';
  if not found then
    raise exception 'verification failed: manager could not renew withdrawn application';
  end if;

  v_result := public.assign_event_crew(
    v_event_id,
    v_profile_id,
    v_application_id,
    '[{"date":"2099-01-03","time_from":"10:00","time_to":"18:00","day_type":"deinstal","note":"clean reapply day"}]'::jsonb
  );
  v_second_timelog_id := (v_result->>'timelog_id')::uuid;

  if (v_result->>'timelog_created')::boolean is not true
    or v_second_timelog_id is null
    or v_second_timelog_id = v_first_timelog_id then
    raise exception 'verification failed: reapply did not create a new timelog';
  end if;

  select count(*) into v_count
  from public.timelog_days
  where timelog_id = v_second_timelog_id;
  if v_count <> 1 or not exists (
    select 1
    from public.timelog_days
    where timelog_id = v_second_timelog_id
      and date = '2099-01-03'::date
      and time_from = '10:00'
      and time_to = '18:00'
      and day_type = 'deinstal'::public.timelog_type
      and note = 'clean reapply day'
  ) then
    raise exception 'verification failed: reapply did not create one clean day';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.timelogs'::pg_catalog.regclass
      and trigger_row.tgname = 'enforce_timelog_update_permissions'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  ) into v_toggle_update_trigger;

  if v_toggle_update_trigger then
    execute 'alter table public.timelogs disable trigger enforce_timelog_update_permissions';
  end if;
  update public.timelogs
  set status = 'rejected'::public.timelog_status
  where id = v_second_timelog_id;
  if v_toggle_update_trigger then
    execute 'alter table public.timelogs enable trigger enforce_timelog_update_permissions';
  end if;

  v_result := public.remove_event_crew(v_event_id, v_profile_id);
  if (v_result->>'assignment_removed')::boolean is not true
    or (v_result->>'timelog_removed')::boolean is not true
    or exists (
      select 1 from public.event_assignments
      where event_id = v_event_id and profile_id = v_profile_id
    )
    or exists (
      select 1 from public.timelogs
      where event_id = v_event_id and contractor_id = v_profile_id
    )
    or exists (
      select 1 from public.timelog_days where timelog_id = v_second_timelog_id
    )
    or not exists (
      select 1 from public.event_applications
      where id = v_application_id and status = 'withdrawn'
    )
    or not exists (
      select 1 from public.events where id = v_event_id and crew_filled = 0
    ) then
    raise exception 'verification failed: rejected removal was not atomic and disposable';
  end if;

  v_expected_error := false;
  begin
    perform public.assign_event_crew(
      v_event_id,
      v_profile_id,
      pg_catalog.gen_random_uuid(),
      '[{"date":"2099-01-04","time_from":"08:00","time_to":"12:00","day_type":"provoz"}]'::jsonb
    );
  exception
    when sqlstate 'P0002' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_lifecycle_not_found' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error
    or exists (
      select 1 from public.event_assignments
      where event_id = v_event_id and profile_id = v_profile_id
    )
    or exists (
      select 1 from public.timelogs
      where event_id = v_event_id and contractor_id = v_profile_id
    )
    or not exists (
      select 1 from public.event_applications
      where id = v_application_id and status = 'withdrawn'
    ) then
    raise exception 'verification failed: bad application id did not roll back assignment';
  end if;

  update public.event_applications
  set status = 'pending'
  where id = v_application_id and status = 'withdrawn';
  if not found then
    raise exception 'verification failed: manager could not prepare invalid-days fixture';
  end if;

  v_expected_error := false;
  begin
    perform public.assign_event_crew(
      v_event_id,
      v_profile_id,
      v_application_id,
      '[{"date":"not-a-date","time_from":"08:00","time_to":"12:00","day_type":"provoz"}]'::jsonb
    );
  exception
    when sqlstate '22023' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_assignment_invalid_days' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error
    or exists (
      select 1 from public.event_assignments
      where event_id = v_event_id and profile_id = v_profile_id
    )
    or exists (
      select 1 from public.timelogs
      where event_id = v_event_id and contractor_id = v_profile_id
    ) then
    raise exception 'verification failed: invalid days did not roll back cleanly';
  end if;

  v_result := public.assign_event_crew(
    v_event_id,
    v_profile_id,
    v_application_id,
    '[{"date":"2099-01-05","time_from":"07:30","time_to":"15:30","day_type":"provoz","note":"blocked status day"}]'::jsonb
  );
  v_assignment_id := (v_result->>'assignment_id')::uuid;
  v_blocked_timelog_id := (v_result->>'timelog_id')::uuid;

  foreach v_status in array v_non_disposable_statuses loop
    if v_toggle_update_trigger then
      execute 'alter table public.timelogs disable trigger enforce_timelog_update_permissions';
    end if;
    update public.timelogs
    set status = 'draft'::public.timelog_status
    where id = v_blocked_timelog_id;
    get diagnostics v_reset_count = row_count;

    update public.timelogs set status = v_status where id = v_blocked_timelog_id;
    get diagnostics v_status_count = row_count;
    if v_toggle_update_trigger then
      execute 'alter table public.timelogs enable trigger enforce_timelog_update_permissions';
    end if;
    if v_reset_count <> 1 then
      raise exception 'verification failed: blocking-loop timelog reset failed before %', v_status;
    end if;
    if v_status_count <> 1 then
      raise exception 'verification failed: blocking-loop timelog status update failed before %', v_status;
    end if;

    v_expected_error := false;
    begin
      perform public.remove_event_crew(v_event_id, v_profile_id);
    exception
      when sqlstate 'P0001' then
        get stacked diagnostics v_error_message = message_text;
        if v_error_message <> 'crew_removal_blocked' then
          raise;
        end if;
        v_expected_error := true;
    end;

    if not v_expected_error then
      raise exception 'verification failed: removal did not block status %', v_status;
    end if;

    if not exists (
      select 1 from public.event_assignments
      where id = v_assignment_id
        and event_id = v_event_id
        and profile_id = v_profile_id
    ) or not exists (
      select 1 from public.timelogs
      where id = v_blocked_timelog_id
        and event_id = v_event_id
        and contractor_id = v_profile_id
        and status = v_status
    ) or not exists (
      select 1 from public.event_applications
      where id = v_application_id and status = 'approved'
    ) or not exists (
      select 1 from public.events where id = v_event_id and crew_filled = 1
    ) then
      raise exception 'verification failed: blocked removal changed lifecycle state for %', v_status;
    end if;

    select count(*) into v_count
    from public.timelog_days
    where timelog_id = v_blocked_timelog_id;
    if v_count <> 1 or not exists (
      select 1 from public.timelog_days
      where timelog_id = v_blocked_timelog_id
        and date = '2099-01-05'::date
        and time_from = '07:30'
        and time_to = '15:30'
        and day_type = 'provoz'::public.timelog_type
        and note = 'blocked status day'
    ) then
      raise exception 'verification failed: blocked removal changed timelog days for %', v_status;
    end if;
  end loop;

  select pg_catalog.to_jsonb(ea)
  into v_assignment_before
  from public.event_assignments ea
  where ea.id = v_assignment_id;

  select pg_catalog.to_jsonb(t)
  into v_timelog_before
  from public.timelogs t
  where t.id = v_blocked_timelog_id;

  select pg_catalog.to_jsonb(a)
  into v_application_before
  from public.event_applications a
  where a.id = v_application_id;

  select pg_catalog.to_jsonb(e)
  into v_event_before
  from public.events e
  where e.id = v_event_id;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.id)
  into v_days_before
  from public.timelog_days d
  where d.timelog_id = v_blocked_timelog_id;

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'crewhead'::public.app_role;
  get diagnostics v_status_count = row_count;
  if v_status_count <> 1 then
    raise exception 'verification failed: temporary CrewHead role was not removed for Crew checks';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_crew_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_crew_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  v_expected_error := false;
  begin
    perform public.remove_event_crew(v_event_id, v_profile_id);
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: crew-only user could remove event crew';
  end if;

  v_expected_error := false;
  begin
    perform public.assign_event_crew(
      v_event_id,
      v_profile_id,
      v_application_id,
      '[{"date":"2099-01-06","time_from":"06:00","time_to":"14:00","day_type":"instal"}]'::jsonb
    );
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: crew-only user could assign event crew';
  end if;

  v_expected_error := false;
  begin
    perform public.approve_event_withdrawal(
      v_event_id,
      v_profile_id,
      v_application_id
    );
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: crew-only user could approve event withdrawal';
  end if;

  select pg_catalog.to_jsonb(ea)
  into v_assignment_after
  from public.event_assignments ea
  where ea.id = v_assignment_id;

  select pg_catalog.to_jsonb(t)
  into v_timelog_after
  from public.timelogs t
  where t.id = v_blocked_timelog_id;

  select pg_catalog.to_jsonb(a)
  into v_application_after
  from public.event_applications a
  where a.id = v_application_id;

  select pg_catalog.to_jsonb(e)
  into v_event_after
  from public.events e
  where e.id = v_event_id;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.id)
  into v_days_after
  from public.timelog_days d
  where d.timelog_id = v_blocked_timelog_id;

  if v_assignment_after is distinct from v_assignment_before
    or v_timelog_after is distinct from v_timelog_before
    or v_application_after is distinct from v_application_before
    or v_event_after is distinct from v_event_before
    or v_days_after is distinct from v_days_before then
    raise exception 'verification failed: unauthorized calls changed lifecycle state';
  end if;

  v_expected_error := false;
  begin
    update public.event_applications
    set status = 'withdrawn'
    where id = v_application_id;
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: Crew changed approved application directly';
  end if;

  v_expected_error := false;
  begin
    update public.event_applications
    set status = 'pending'
    where id = v_application_id;
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: Crew changed approved application directly';
  end if;

  v_expected_error := false;
  begin
    update public.event_applications
    set event_id = v_other_event_id
    where id = v_application_id;
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: Crew moved application identity';
  end if;

  select pg_catalog.to_jsonb(ea)
  into v_assignment_after
  from public.event_assignments ea
  where ea.id = v_assignment_id;

  select pg_catalog.to_jsonb(t)
  into v_timelog_after
  from public.timelogs t
  where t.id = v_blocked_timelog_id;

  select pg_catalog.to_jsonb(a)
  into v_application_after
  from public.event_applications a
  where a.id = v_application_id;

  select pg_catalog.to_jsonb(e)
  into v_event_after
  from public.events e
  where e.id = v_event_id;

  select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.id)
  into v_days_after
  from public.timelog_days d
  where d.timelog_id = v_blocked_timelog_id;

  if v_assignment_after is distinct from v_assignment_before
    or v_timelog_after is distinct from v_timelog_before
    or v_application_after is distinct from v_application_before
    or v_event_after is distinct from v_event_before
    or v_days_after is distinct from v_days_before then
    raise exception 'verification failed: Crew application attacks changed lifecycle rows';
  end if;

  update public.event_applications
  set status = 'withdrawal_requested'
  where id = v_application_id and status = 'approved';
  if not found then
    raise exception 'verification failed: valid Crew withdrawal request was rejected';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'crewhead'::public.app_role);

  perform pg_catalog.set_config('request.jwt.claim.sub', v_manager_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_manager_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );
  update public.event_applications
  set status = 'approved'
  where id = v_application_id and status = 'withdrawal_requested';
  if not found then
    raise exception 'verification failed: manager could not reset Crew trigger fixture';
  end if;

  insert into public.events (name, status)
  values (
    'Crew lifecycle race verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_race_event_id;

  insert into public.event_applications (event_id, profile_id, status, note)
  values (v_race_event_id, v_profile_id, 'pending', 'crew lifecycle race verification')
  returning id into v_race_application_id;

  foreach v_application_status in array v_disallowed_approval_statuses loop
    update public.event_applications
    set status = v_application_status
    where id = v_race_application_id;

    v_expected_error := false;
    begin
      perform public.assign_event_crew(
        v_race_event_id,
        v_profile_id,
        v_race_application_id,
        '[{"date":"2099-02-01","time_from":"08:00","time_to":"16:00","day_type":"provoz"}]'::jsonb
      );
    exception
      when sqlstate 'P0001' then
        get stacked diagnostics v_error_message = message_text;
        if v_error_message <> 'crew_application_conflict' then
          raise;
        end if;
        v_expected_error := true;
    end;

    if not v_expected_error
      or exists (
        select 1 from public.event_assignments
        where event_id = v_race_event_id and profile_id = v_profile_id
      )
      or exists (
        select 1 from public.timelogs
        where event_id = v_race_event_id and contractor_id = v_profile_id
      ) then
      raise exception 'verification failed: disallowed approval source % changed lifecycle rows',
        v_application_status;
    end if;
  end loop;

  update public.event_applications
  set status = 'pending'
  where id = v_race_application_id;
  update public.event_applications
  set status = 'rejected'
  where id = v_race_application_id and status = 'pending';
  get diagnostics v_status_count = row_count;
  if v_status_count <> 1 then
    raise exception 'verification failed: pending rejection race fixture did not transition';
  end if;

  v_expected_error := false;
  begin
    perform public.assign_event_crew(
      v_race_event_id,
      v_profile_id,
      v_race_application_id,
      '[{"date":"2099-02-02","time_from":"08:00","time_to":"16:00","day_type":"provoz"}]'::jsonb
    );
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_application_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error or not exists (
    select 1 from public.event_applications
    where id = v_race_application_id and status = 'rejected'
  ) then
    raise exception 'verification failed: pending rejection race did not preserve the first transition';
  end if;

  update public.event_applications
  set status = 'pending'
  where id = v_race_application_id;
  v_result := public.assign_event_crew(
    v_race_event_id,
    v_profile_id,
    v_race_application_id,
    '[{"date":"2099-02-03","time_from":"08:00","time_to":"16:00","day_type":"provoz"}]'::jsonb
  );
  v_assignment_id := (v_result->>'assignment_id')::uuid;
  v_second_timelog_id := (v_result->>'timelog_id')::uuid;

  update public.event_applications
  set status = 'rejected'
  where id = v_race_application_id and status = 'pending';
  get diagnostics v_status_count = row_count;
  if v_status_count <> 0 or not exists (
    select 1 from public.event_applications
    where id = v_race_application_id and status = 'approved'
  ) then
    raise exception 'verification failed: pending rejection race did not preserve the first transition';
  end if;

  v_result := public.assign_event_crew(
    v_race_event_id,
    v_profile_id,
    v_race_application_id,
    '[{"date":"2099-02-04","time_from":"09:00","time_to":"17:00","day_type":"provoz"}]'::jsonb
  );
  if (v_result->>'timelog_created')::boolean is not false
    or (v_result->>'assignment_id')::uuid is distinct from v_assignment_id
    or (v_result->>'timelog_id')::uuid is distinct from v_second_timelog_id then
    raise exception 'verification failed: approved assignment exact retry was not idempotent';
  end if;

  delete from public.timelogs where id = v_second_timelog_id;
  delete from public.event_assignments where id = v_assignment_id;
  v_expected_error := false;
  begin
    perform public.assign_event_crew(
      v_race_event_id,
      v_profile_id,
      v_race_application_id,
      '[{"date":"2099-02-05","time_from":"08:00","time_to":"16:00","day_type":"provoz"}]'::jsonb
    );
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_application_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: inconsistent approved application was accepted';
  end if;

  update public.event_applications
  set status = 'pending'
  where id = v_race_application_id;
  v_result := public.assign_event_crew(
    v_race_event_id,
    v_profile_id,
    v_race_application_id,
    '[{"date":"2099-02-06","time_from":"08:00","time_to":"16:00","day_type":"provoz"}]'::jsonb
  );
  v_assignment_id := (v_result->>'assignment_id')::uuid;
  v_second_timelog_id := (v_result->>'timelog_id')::uuid;

  foreach v_application_status in array v_disallowed_withdrawal_statuses loop
    update public.event_applications
    set status = v_application_status
    where id = v_race_application_id;

    v_expected_error := false;
    begin
      perform public.approve_event_withdrawal(
        v_race_event_id,
        v_profile_id,
        v_race_application_id
      );
    exception
      when sqlstate 'P0001' then
        get stacked diagnostics v_error_message = message_text;
        if v_error_message <> 'crew_withdrawal_conflict' then
          raise;
        end if;
        v_expected_error := true;
    end;

    if not v_expected_error
      or not exists (
        select 1 from public.event_assignments where id = v_assignment_id
      )
      or not exists (
        select 1 from public.timelogs where id = v_second_timelog_id
      ) then
      raise exception 'verification failed: disallowed withdrawal source % changed lifecycle rows',
        v_application_status;
    end if;
  end loop;

  update public.event_applications
  set status = 'withdrawal_requested'
  where id = v_race_application_id;
  update public.event_applications
  set status = 'approved'
  where id = v_race_application_id and status = 'withdrawal_requested';
  get diagnostics v_status_count = row_count;
  if v_status_count <> 1 then
    raise exception 'verification failed: withdrawal rejection race fixture did not transition';
  end if;

  v_expected_error := false;
  begin
    perform public.approve_event_withdrawal(
      v_race_event_id,
      v_profile_id,
      v_race_application_id
    );
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_withdrawal_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error
    or not exists (select 1 from public.event_assignments where id = v_assignment_id)
    or not exists (select 1 from public.timelogs where id = v_second_timelog_id) then
    raise exception 'verification failed: withdrawal rejection race did not preserve the first transition';
  end if;

  update public.event_applications
  set status = 'withdrawal_requested'
  where id = v_race_application_id;
  v_result := public.approve_event_withdrawal(
    v_race_event_id,
    v_profile_id,
    v_race_application_id
  );
  if (v_result->>'assignment_removed')::boolean is not true
    or (v_result->>'timelog_removed')::boolean is not true
    or (v_result->>'application_id')::uuid is distinct from v_race_application_id then
    raise exception 'verification failed: withdrawal approval did not remove exact lifecycle rows';
  end if;

  update public.event_applications
  set status = 'approved'
  where id = v_race_application_id and status = 'withdrawal_requested';
  get diagnostics v_status_count = row_count;
  if v_status_count <> 0 or not exists (
    select 1 from public.event_applications
    where id = v_race_application_id and status = 'withdrawn'
  ) then
    raise exception 'verification failed: withdrawal rejection race did not preserve the first transition';
  end if;

  v_result := public.approve_event_withdrawal(
    v_race_event_id,
    v_profile_id,
    v_race_application_id
  );
  if (v_result->>'assignment_removed')::boolean is not false
    or (v_result->>'timelog_removed')::boolean is not false then
    raise exception 'verification failed: withdrawn exact retry was not idempotent';
  end if;

  update public.event_applications
  set status = 'pending'
  where id = v_race_application_id;
  v_result := public.assign_event_crew(
    v_race_event_id,
    v_profile_id,
    v_race_application_id,
    '[{"date":"2099-02-07","time_from":"08:00","time_to":"16:00","day_type":"provoz"}]'::jsonb
  );
  v_assignment_id := (v_result->>'assignment_id')::uuid;
  v_second_timelog_id := (v_result->>'timelog_id')::uuid;
  update public.event_applications
  set status = 'withdrawn'
  where id = v_race_application_id;

  v_expected_error := false;
  begin
    perform public.approve_event_withdrawal(
      v_race_event_id,
      v_profile_id,
      v_race_application_id
    );
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'crew_withdrawal_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error
    or not exists (select 1 from public.event_assignments where id = v_assignment_id)
    or not exists (select 1 from public.timelogs where id = v_second_timelog_id) then
    raise exception 'verification failed: inconsistent withdrawn application was accepted';
  end if;

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'crewhead'::public.app_role;
  get diagnostics v_status_count = row_count;
  if v_status_count <> 1 then
    raise exception 'verification failed: atomic fixture crewhead role was not removed';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_crew_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_crew_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );

  insert into public.events (name, status)
  values (
    'atomic timelog verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_atomic_event_id;

  execute 'set local role authenticated';
  v_result := public.save_timelog_atomic(
    null,
    v_atomic_event_id,
    v_profile_id,
    null,
    null,
    12,
    'atomic first',
    'draft'::public.timelog_status,
    '[{"date":"2099-03-01","time_from":"08:00","time_to":"16:00","day_type":"provoz","note":"first day"}]'::jsonb
  );
  v_atomic_first_timelog_id := (v_result->>'id')::uuid;
  v_atomic_updated_at := (v_result->>'updated_at')::timestamptz;
  execute 'reset role';

  insert into public.events (name, status)
  values (
    'atomic timelog batch peer ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_atomic_event_id;

  execute 'set local role authenticated';
  v_result := public.save_timelog_atomic(
    null,
    v_atomic_event_id,
    v_profile_id,
    null,
    null,
    0,
    'atomic second',
    'draft'::public.timelog_status,
    '[{"date":"2099-03-02","time_from":"09:00","time_to":"17:00","day_type":"instal"}]'::jsonb
  );
  v_atomic_second_timelog_id := (v_result->>'id')::uuid;
  v_atomic_second_updated_at := (v_result->>'updated_at')::timestamptz;
  execute 'reset role';

  if v_atomic_first_timelog_id is null or v_atomic_second_timelog_id is null then
    raise exception 'verification failed: atomic draft create returned no identity';
  end if;

  v_expected_error := false;
  execute 'set local role authenticated';
  begin
    perform public.transition_timelog_statuses_atomic(
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_atomic_first_timelog_id,
          'expected_updated_at', v_atomic_updated_at
        ),
        pg_catalog.jsonb_build_object(
          'id', v_atomic_second_timelog_id,
          'expected_updated_at', '2000-01-01T00:00:00Z'
        )
      ),
      'draft'::public.timelog_status,
      'pending_ch'::public.timelog_status
    );
  exception
    when sqlstate '40001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'timelog_mutation_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  execute 'reset role';
  if not v_expected_error or exists (
    select 1
    from public.timelogs
    where id in (v_atomic_first_timelog_id, v_atomic_second_timelog_id)
      and status <> 'draft'::public.timelog_status
  ) then
    raise exception 'verification failed: atomic batch conflict partially changed rows';
  end if;

  execute 'set local role authenticated';
  v_result := public.transition_timelog_statuses_atomic(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_atomic_first_timelog_id,
        'expected_updated_at', v_atomic_updated_at
      ),
      pg_catalog.jsonb_build_object(
        'id', v_atomic_second_timelog_id,
        'expected_updated_at', v_atomic_second_updated_at
      )
    ),
    'draft'::public.timelog_status,
    'pending_ch'::public.timelog_status
  );
  execute 'reset role';

  select updated_at into v_atomic_updated_at
  from public.timelogs
  where id = v_atomic_first_timelog_id;

  execute 'set local role authenticated';
  update public.timelogs
  set km = km + 1
  where id = v_atomic_first_timelog_id;
  get diagnostics v_status_count = row_count;
  if v_status_count <> 0 or exists (
    select 1
    from public.timelogs
    where id = v_atomic_first_timelog_id
      and km <> 12
  ) then
    raise exception 'verification failed: Crew directly changed protected timelog';
  end if;

  update public.timelog_days
  set note = 'forbidden direct edit'
  where timelog_id = v_atomic_first_timelog_id;
  get diagnostics v_status_count = row_count;
  if v_status_count <> 0 or exists (
    select 1
    from public.timelog_days
    where timelog_id = v_atomic_first_timelog_id
      and note = 'forbidden direct edit'
  ) then
    raise exception 'verification failed: Crew directly changed protected timelog day';
  end if;

  v_expected_error := false;
  begin
    perform public.delete_timelog_atomic(
      v_atomic_first_timelog_id,
      v_atomic_updated_at,
      'pending_ch'::public.timelog_status
    );
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'timelog_mutation_blocked' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error
    or not exists (select 1 from public.timelogs where id = v_atomic_first_timelog_id)
    or not exists (select 1 from public.timelog_days where timelog_id = v_atomic_first_timelog_id) then
    raise exception 'verification failed: pending CH timelog was deleted';
  end if;
  execute 'reset role';

  insert into public.events (name, status)
  values (
    'atomic import verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_atomic_event_id;

  execute 'set local role authenticated';
  v_result := public.save_timelog_atomic(
    null,
    v_atomic_event_id,
    v_profile_id,
    null,
    null,
    5,
    'import source',
    'draft'::public.timelog_status,
    '[{"date":"2099-03-03","time_from":"10:00","time_to":"18:00","day_type":"provoz"}]'::jsonb
  );
  v_atomic_third_timelog_id := (v_result->>'id')::uuid;
  v_atomic_third_updated_at := (v_result->>'updated_at')::timestamptz;

  v_expected_error := false;
  begin
    perform public.import_approved_timelog_atomic(
      v_atomic_third_timelog_id,
      v_atomic_event_id,
      v_profile_id,
      v_atomic_third_updated_at,
      'draft'::public.timelog_status,
      5,
      'import source',
      '[{"date":"2099-03-03","time_from":"10:00","time_to":"18:00","day_type":"provoz"}]'::jsonb
    );
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'timelog_import_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  execute 'reset role';
  if not v_expected_error or not exists (
    select 1 from public.timelogs
    where id = v_atomic_third_timelog_id
      and status = 'draft'::public.timelog_status
      and updated_at = v_atomic_third_updated_at
  ) then
    raise exception 'verification failed: crew-only user imported approved timelog';
  end if;

  insert into public.receipts (contractor_id, name, amount, status)
  values (v_profile_id, 'atomic receipt first', 11, 'draft'::public.receipt_status)
  returning id, updated_at into v_event_receipt_id, v_invoice_receipt_updated_at;

  insert into public.receipts (contractor_id, name, amount, status)
  values (v_profile_id, 'atomic receipt second', 12, 'draft'::public.receipt_status)
  returning id, updated_at into v_second_receipt_id, v_second_receipt_updated_at;

  v_expected_error := false;
  execute 'set local role authenticated';
  begin
    perform public.transition_receipt_statuses_atomic(
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_event_receipt_id,
          'expected_updated_at', v_invoice_receipt_updated_at
        ),
        pg_catalog.jsonb_build_object(
          'id', v_second_receipt_id,
          'expected_updated_at', '2000-01-01T00:00:00Z'
        )
      ),
      'draft'::public.receipt_status,
      'submitted'::public.receipt_status
    );
  exception
    when sqlstate '40001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'receipt_mutation_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  execute 'reset role';
  if not v_expected_error or exists (
    select 1
    from public.receipts
    where id in (v_event_receipt_id, v_second_receipt_id)
      and status <> 'draft'::public.receipt_status
  ) then
    raise exception 'verification failed: atomic receipt transition partially changed rows';
  end if;

  execute 'set local role authenticated';
  v_result := public.transition_receipt_statuses_atomic(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_event_receipt_id,
        'expected_updated_at', v_invoice_receipt_updated_at
      ),
      pg_catalog.jsonb_build_object(
        'id', v_second_receipt_id,
        'expected_updated_at', v_second_receipt_updated_at
      )
    ),
    'draft'::public.receipt_status,
    'submitted'::public.receipt_status
  );
  execute 'reset role';

  if pg_catalog.jsonb_array_length(v_result) <> 2 or exists (
    select 1
    from public.receipts
    where id in (v_event_receipt_id, v_second_receipt_id)
      and status <> 'submitted'::public.receipt_status
  ) then
    raise exception 'verification failed: valid atomic receipt transition failed';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'coo'::public.app_role);

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', r.id,
      'expected_updated_at', r.updated_at
    ) order by r.id
  ) into v_result
  from public.receipts r
  where r.id in (v_event_receipt_id, v_second_receipt_id);

  execute 'set local role authenticated';
  v_result := public.transition_receipt_statuses_atomic(
    v_result,
    'submitted'::public.receipt_status,
    'approved'::public.receipt_status
  );
  execute 'reset role';

  if pg_catalog.jsonb_array_length(v_result) <> 2 then
    raise exception 'verification failed: manager atomic receipt review failed';
  end if;

  v_expected_error := false;
  execute 'set local role authenticated';
  begin
    update public.timelogs
    set km = 99,
      status = 'approved'::public.timelog_status
    where id = v_atomic_third_timelog_id;
  exception
    when sqlstate '42501' then
      v_expected_error := true;
  end;
  execute 'reset role';
  if not v_expected_error or not exists (
    select 1 from public.timelogs
    where id = v_atomic_third_timelog_id
      and status = 'draft'::public.timelog_status
      and km = 5
      and updated_at = v_atomic_third_updated_at
  ) then
    raise exception 'verification failed: direct COO timelog update bypassed import RPC';
  end if;

  execute 'set local role authenticated';
  v_result := public.import_approved_timelog_atomic(
    v_atomic_third_timelog_id,
    v_atomic_event_id,
    v_profile_id,
    v_atomic_third_updated_at,
    'draft'::public.timelog_status,
    7,
    'approved import',
    '[{"date":"2099-03-03","time_from":"10:30","time_to":"18:30","day_type":"provoz","note":"approved"}]'::jsonb
  );
  v_atomic_third_updated_at := (v_result->>'updated_at')::timestamptz;
  if v_result->>'status' <> 'approved' then
    raise exception 'verification failed: draft import did not return approved status';
  end if;

  v_result := public.import_approved_timelog_atomic(
    v_atomic_third_timelog_id,
    v_atomic_event_id,
    v_profile_id,
    v_atomic_third_updated_at,
    'approved'::public.timelog_status,
    7,
    'approved import',
    '[{"date":"2099-03-03","time_from":"10:30","time_to":"18:30","day_type":"provoz","note":"approved"}]'::jsonb
  );
  if (v_result->>'updated_at')::timestamptz is distinct from v_atomic_third_updated_at then
    raise exception 'verification failed: approved import exact retry mutated the row';
  end if;

  v_expected_error := false;
  begin
    perform public.import_approved_timelog_atomic(
      v_atomic_third_timelog_id,
      v_atomic_event_id,
      v_profile_id,
      v_atomic_third_updated_at,
      'approved'::public.timelog_status,
      8,
      'changed approved import',
      '[{"date":"2099-03-03","time_from":"10:30","time_to":"18:30","day_type":"provoz","note":"approved"}]'::jsonb
    );
  exception
    when sqlstate '40001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'timelog_mutation_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: approved import accepted changed historical payload';
  end if;
  execute 'reset role';

  insert into public.events (name, status)
  values (
    'atomic COO invoice verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_atomic_event_id;

  execute 'set local role authenticated';
  v_result := public.save_timelog_atomic(
    null,
    v_atomic_event_id,
    v_profile_id,
    null,
    null,
    0,
    'pending COO source',
    'draft'::public.timelog_status,
    '[{"date":"2099-03-04","time_from":"08:00","time_to":"12:00","day_type":"instal"}]'::jsonb
  );
  v_atomic_fourth_timelog_id := (v_result->>'id')::uuid;
  v_atomic_fourth_updated_at := (v_result->>'updated_at')::timestamptz;

  v_result := public.transition_timelog_statuses_atomic(
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_atomic_fourth_timelog_id,
      'expected_updated_at', v_atomic_fourth_updated_at
    )),
    'draft'::public.timelog_status,
    'pending_ch'::public.timelog_status
  );
  v_atomic_fourth_updated_at := (v_result->0->>'updated_at')::timestamptz;

  execute 'reset role';
  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'crewhead'::public.app_role);

  execute 'set local role authenticated';
  v_result := public.transition_timelog_statuses_atomic(
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_atomic_fourth_timelog_id,
      'expected_updated_at', v_atomic_fourth_updated_at
    )),
    'pending_ch'::public.timelog_status,
    'pending_coo'::public.timelog_status
  );
  v_atomic_fourth_updated_at := (v_result->0->>'updated_at')::timestamptz;

  execute 'reset role';
  insert into public.receipts (
    contractor_id,
    event_id,
    job_number,
    name,
    amount,
    status
  ) values (
    v_profile_id,
    v_atomic_event_id,
    'VERIFY-AUTO',
    'auto invoice receipt',
    33,
    'approved'::public.receipt_status
  ) returning id, updated_at into v_event_receipt_id, v_invoice_receipt_updated_at;
  execute 'set local role authenticated';

  v_result := public.import_approved_timelog_atomic(
    v_atomic_fourth_timelog_id,
    v_atomic_event_id,
    v_profile_id,
    v_atomic_fourth_updated_at,
    'pending_coo'::public.timelog_status,
    3,
    'canonical invoice import',
    '[{"date":"2099-03-04","time_from":"08:00","time_to":"14:00","day_type":"instal","note":"invoice hours"}]'::jsonb
  );
  v_atomic_fourth_updated_at := (v_result->>'updated_at')::timestamptz;
  if v_result->>'status' <> 'invoiced' or not exists (
    select 1 from public.invoices where timelog_id = v_atomic_fourth_timelog_id
  ) then
    raise exception 'verification failed: pending COO import did not return canonical invoiced status';
  end if;

  select i.id, i.updated_at
  into v_delete_invoice_id, v_delete_invoice_updated_at
  from public.invoices i
  where i.timelog_id = v_atomic_fourth_timelog_id;
  if not exists (
    select 1
    from public.invoice_timelogs link
    where link.invoice_id = v_delete_invoice_id
      and link.timelog_id = v_atomic_fourth_timelog_id
  ) or not exists (
    select 1
    from public.invoice_receipts link
    where link.invoice_id = v_delete_invoice_id
      and link.receipt_id = v_event_receipt_id
  ) or not exists (
    select 1
    from public.invoice_items item
    where item.invoice_id = v_delete_invoice_id
      and item.amount_receipts = 33
  ) or not exists (
    select 1
    from public.receipts r
    where r.id = v_event_receipt_id
      and r.status = 'attached'::public.receipt_status
  ) then
    raise exception 'verification failed: timelog approval did not link and attach exact receipts';
  end if;

  v_result := public.import_approved_timelog_atomic(
    v_atomic_fourth_timelog_id,
    v_atomic_event_id,
    v_profile_id,
    v_atomic_fourth_updated_at,
    'invoiced'::public.timelog_status,
    3,
    'canonical invoice import',
    '[{"date":"2099-03-04","time_from":"08:00","time_to":"14:00","day_type":"instal","note":"invoice hours"}]'::jsonb
  );
  if (v_result->>'updated_at')::timestamptz is distinct from v_atomic_fourth_updated_at then
    raise exception 'verification failed: invoiced import exact retry mutated the row';
  end if;
  select pg_catalog.count(*) into v_count
  from public.invoices
  where timelog_id = v_atomic_fourth_timelog_id;
  if v_count <> 1 then
    raise exception 'verification failed: timelog approval receipt was refactured';
  end if;

  select pg_catalog.to_jsonb(deleted_invoice) into v_result
  from public.delete_invoice_atomic(
    v_delete_invoice_id,
    'draft'::public.invoice_status,
    v_delete_invoice_updated_at
  ) deleted_invoice;
  v_atomic_fourth_updated_at := (
    select t.updated_at from public.timelogs t where t.id = v_atomic_fourth_timelog_id
  );
  if exists (select 1 from public.invoices where id = v_delete_invoice_id)
    or not exists (
      select 1 from public.timelogs
      where id = v_atomic_fourth_timelog_id
        and status = 'approved'::public.timelog_status
    ) or not exists (
      select 1 from public.receipts
      where id = v_event_receipt_id
        and status = 'approved'::public.receipt_status
    ) then
    raise exception 'verification failed: invoice deletion did not reopen linked approval rows';
  end if;

  v_result := public.import_approved_timelog_atomic(
    v_atomic_fourth_timelog_id,
    v_atomic_event_id,
    v_profile_id,
    v_atomic_fourth_updated_at,
    'approved'::public.timelog_status,
    3,
    'canonical invoice import',
    '[{"date":"2099-03-04","time_from":"08:00","time_to":"14:00","day_type":"instal","note":"invoice hours"}]'::jsonb
  );
  if exists (
    select 1 from public.invoices where timelog_id = v_atomic_fourth_timelog_id
  ) then
    raise exception 'verification failed: timelog approval receipt was refactured';
  end if;

  insert into public.events (name, status)
  values (
    'atomic delete verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_atomic_event_id;

  v_result := public.save_timelog_atomic(
    null,
    v_atomic_event_id,
    v_profile_id,
    null,
    null,
    0,
    'delete source',
    'draft'::public.timelog_status,
    '[{"date":"2099-03-05","time_from":"08:00","time_to":"10:00","day_type":"deinstal"}]'::jsonb
  );
  v_atomic_delete_timelog_id := (v_result->>'id')::uuid;
  v_atomic_delete_updated_at := (v_result->>'updated_at')::timestamptz;
  perform public.delete_timelog_atomic(
    v_atomic_delete_timelog_id,
    v_atomic_delete_updated_at,
    'draft'::public.timelog_status
  );
  if exists (select 1 from public.timelogs where id = v_atomic_delete_timelog_id)
    or exists (select 1 from public.timelog_days where timelog_id = v_atomic_delete_timelog_id) then
    raise exception 'verification failed: atomic parent delete did not cascade days';
  end if;

  execute 'reset role';
  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'coo'::public.app_role;

  insert into public.events (name, status)
  values (
    'CrewHead direct event delete verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_delete_event_id;

  v_expected_error := false;
  execute 'set local role authenticated';
  begin
    delete from public.events where id = v_delete_event_id;
  exception
    when sqlstate '42501' then
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: CrewHead directly deleted an event';
  end if;

  select pg_catalog.to_jsonb(deleted) into v_result
  from public.delete_event_atomic(v_delete_event_id) deleted;
  execute 'reset role';
  if (v_result->>'event_id')::uuid is distinct from v_delete_event_id then
    raise exception 'verification failed: CrewHead event delete RPC failed';
  end if;

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'crewhead'::public.app_role;

  insert into public.events (name, status)
  values (
    'Crew unauthorized event delete verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_delete_event_id;

  v_expected_error := false;
  execute 'set local role authenticated';
  begin
    perform public.delete_event_atomic(v_delete_event_id);
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'event_delete_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  execute 'reset role';
  if not v_expected_error or not exists (
    select 1 from public.events where id = v_delete_event_id
  ) then
    raise exception 'verification failed: Crew-only user deleted an event through RPC';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  v_expected_error := false;
  execute 'set local role authenticated';
  begin
    perform public.delete_event_atomic(v_delete_event_id);
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'event_delete_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  execute 'reset role';
  if not v_expected_error or not exists (
    select 1 from public.events where id = v_delete_event_id
  ) then
    raise exception 'verification failed: unauthenticated caller deleted an event through RPC';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_manager_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_manager_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );
  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'coo'::public.app_role);
  execute 'set local role authenticated';

  insert into public.events (name, status)
  values (
    'atomic event delete verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_delete_event_id;

  v_result := public.save_timelog_atomic(
    null,
    v_delete_event_id,
    v_profile_id,
    null,
    null,
    0,
    'event delete disposable',
    'draft'::public.timelog_status,
    '[{"date":"2099-04-01","time_from":"08:00","time_to":"10:00","day_type":"deinstal"}]'::jsonb
  );
  v_atomic_delete_timelog_id := (v_result->>'id')::uuid;

  insert into public.receipts (
    contractor_id,
    event_id,
    name,
    amount,
    status
  ) values (
    v_profile_id,
    v_delete_event_id,
    'event delete receipt',
    10,
    'draft'::public.receipt_status
  ) returning id into v_event_receipt_id;

  v_expected_error := false;
  begin
    delete from public.events where id = v_delete_event_id;
  exception
    when sqlstate '42501' then
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: COO directly deleted an event';
  end if;

  select pg_catalog.to_jsonb(deleted) into v_result
  from public.delete_event_atomic(v_delete_event_id) deleted;

  if (v_result->>'event_id')::uuid is distinct from v_delete_event_id
    or exists (select 1 from public.events where id = v_delete_event_id)
    or exists (select 1 from public.receipts where id = v_event_receipt_id)
    or exists (select 1 from public.timelogs where id = v_atomic_delete_timelog_id)
    or exists (select 1 from public.timelog_days where timelog_id = v_atomic_delete_timelog_id) then
    raise exception 'verification failed: disposable event was not deleted atomically';
  end if;

  v_expected_error := false;
  begin
    perform public.delete_event_atomic(v_delete_event_id);
  exception
    when sqlstate 'P0002' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'event_not_found' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: event delete retry did not return not found';
  end if;

  insert into public.events (name, status)
  values (
    'protected event delete verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_protected_event_id;

  v_result := public.save_timelog_atomic(
    null,
    v_protected_event_id,
    v_profile_id,
    null,
    null,
    0,
    'event delete protected',
    'draft'::public.timelog_status,
    '[{"date":"2099-04-02","time_from":"08:00","time_to":"12:00","day_type":"provoz"}]'::jsonb
  );
  v_atomic_delete_timelog_id := (v_result->>'id')::uuid;
  v_atomic_delete_updated_at := (v_result->>'updated_at')::timestamptz;

  v_result := public.transition_timelog_statuses_atomic(
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_atomic_delete_timelog_id,
      'expected_updated_at', v_atomic_delete_updated_at
    )),
    'draft'::public.timelog_status,
    'pending_ch'::public.timelog_status
  );

  v_expected_error := false;
  begin
    perform public.delete_event_atomic(v_protected_event_id);
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'event_has_protected_timelogs' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error
    or not exists (select 1 from public.events where id = v_protected_event_id)
    or not exists (
      select 1
      from public.timelogs
      where id = v_atomic_delete_timelog_id
        and status = 'pending_ch'::public.timelog_status
    ) then
    raise exception 'verification failed: protected timelog allowed event deletion';
  end if;

  insert into public.events (name, status)
  values (
    'protected receipt event delete verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_protected_event_id;

  execute 'reset role';
  insert into public.receipts (contractor_id, event_id, name, amount, status)
  values (
    v_profile_id,
    v_protected_event_id,
    'protected event receipt',
    31,
    'approved'::public.receipt_status
  )
  returning id into v_event_receipt_id;
  select pg_catalog.to_jsonb(r) into v_receipt_before
  from public.receipts r
  where r.id = v_event_receipt_id;

  execute 'set local role authenticated';
  v_expected_error := false;
  begin
    update public.receipts
    set note = 'forbidden COO edit'
    where id = v_event_receipt_id;
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'receipt_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: protected receipt was mutated directly';
  end if;

  v_expected_error := false;
  begin
    update public.receipts
    set event_id = v_other_event_id
    where id = v_event_receipt_id;
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'receipt_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: COO moved protected receipt identity';
  end if;

  v_expected_error := false;
  begin
    update public.receipts
    set status = 'attached'::public.receipt_status
    where id = v_event_receipt_id;
  exception
    when sqlstate '42501' then
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: COO bypassed invoice receipt marker';
  end if;

  delete from public.receipts where id = v_event_receipt_id;
  get diagnostics v_status_count = row_count;
  if v_status_count <> 0 then
    raise exception 'verification failed: COO deleted protected receipt';
  end if;
  execute 'reset role';

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'coo'::public.app_role;
  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'crewhead'::public.app_role);
  execute 'set local role authenticated';
  update public.receipts set note = 'forbidden CrewHead edit'
  where id = v_event_receipt_id;
  get diagnostics v_status_count = row_count;
  delete from public.receipts where id = v_event_receipt_id;
  get diagnostics v_count = row_count;
  execute 'reset role';
  if v_status_count <> 0 or v_count <> 0 then
    raise exception 'verification failed: CrewHead mutated protected receipt';
  end if;

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'crewhead'::public.app_role;
  execute 'set local role authenticated';
  update public.receipts set note = 'forbidden Crew edit'
  where id = v_event_receipt_id;
  get diagnostics v_status_count = row_count;
  delete from public.receipts where id = v_event_receipt_id;
  get diagnostics v_count = row_count;
  execute 'reset role';
  if v_status_count <> 0 or v_count <> 0 then
    raise exception 'verification failed: Crew mutated protected receipt';
  end if;

  select pg_catalog.to_jsonb(r) into v_receipt_after
  from public.receipts r
  where r.id = v_event_receipt_id;
  if v_receipt_after is distinct from v_receipt_before then
    raise exception 'verification failed: protected receipt snapshot changed';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'coo'::public.app_role);
  execute 'set local role authenticated';
  v_expected_error := false;
  begin
    perform public.delete_event_atomic(v_protected_event_id);
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'event_has_protected_receipts' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: protected receipt allowed event deletion';
  end if;

  insert into public.events (name, status)
  values (
    'atomic invoice mutation verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_invoice_event_id;

  v_result := public.save_timelog_atomic(
    null,
    v_invoice_event_id,
    v_profile_id,
    null,
    null,
    0,
    'invoice create source',
    'draft'::public.timelog_status,
    '[{"date":"2099-04-03","time_from":"08:00","time_to":"16:00","day_type":"provoz"}]'::jsonb
  );
  v_invoice_timelog_id := (v_result->>'id')::uuid;
  v_invoice_timelog_updated_at := (v_result->>'updated_at')::timestamptz;

  v_result := public.import_approved_timelog_atomic(
    v_invoice_timelog_id,
    v_invoice_event_id,
    v_profile_id,
    v_invoice_timelog_updated_at,
    'draft'::public.timelog_status,
    0,
    'invoice create source',
    '[{"date":"2099-04-03","time_from":"08:00","time_to":"16:00","day_type":"provoz"}]'::jsonb
  );
  v_invoice_timelog_updated_at := (v_result->>'updated_at')::timestamptz;

  insert into public.receipts (
    contractor_id,
    event_id,
    job_number,
    name,
    amount,
    status
  ) values (
    v_profile_id,
    v_invoice_event_id,
    'VERIFY-INVOICE',
    'invoice create receipt',
    25,
    'approved'::public.receipt_status
  ) returning id, updated_at into v_invoice_receipt_id, v_invoice_receipt_updated_at;

  select pg_catalog.count(*) into v_count from public.invoices;
  v_expected_error := false;
  begin
    perform public.create_invoice_atomic(
      pg_catalog.jsonb_build_object(
        'contractor_id', v_profile_id,
        'event_id', v_invoice_event_id,
        'job_number', 'VERIFY-INVOICE',
        'total_hours', 8,
        'amount_hours', 800,
        'amount_km', 0,
        'amount_receipts', 25,
        'total_amount', 825,
        'invoice_number', 'VERIFY-' || pg_catalog.gen_random_uuid()::text,
        'issue_date', '2099-04-03',
        'taxable_supply_date', '2099-04-03',
        'due_date', '2099-04-17',
        'currency', 'CZK',
        'supplier_snapshot', pg_catalog.jsonb_build_object('profileId', v_profile_id),
        'customer_snapshot', pg_catalog.jsonb_build_object('name', 'Verifier')
      ),
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'job_number', 'VERIFY-INVOICE',
        'event_id', v_invoice_event_id,
        'hours', 8,
        'amount_hours', 800,
        'km', 0,
        'amount_km', 0,
        'amount_receipts', 25,
        'total_amount', 825
      )),
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', v_invoice_timelog_id,
        'expected_updated_at', v_invoice_timelog_updated_at
      )),
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id', v_invoice_receipt_id,
        'expected_updated_at', '2000-01-01T00:00:00Z'
      ))
    );
  exception
    when sqlstate '40001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'invoice_create_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  select pg_catalog.count(*) into v_status_count from public.invoices;
  if not v_expected_error
    or v_status_count <> v_count
    or not exists (
      select 1 from public.timelogs
      where id = v_invoice_timelog_id and status = 'approved'::public.timelog_status
    )
    or not exists (
      select 1 from public.receipts
      where id = v_invoice_receipt_id and status = 'approved'::public.receipt_status
    ) then
    raise exception 'verification failed: invoice create partially mutated rows';
  end if;

  select pg_catalog.to_jsonb(created) into v_result
  from public.create_invoice_atomic(
    pg_catalog.jsonb_build_object(
      'contractor_id', v_profile_id,
      'event_id', v_invoice_event_id,
      'job_number', 'VERIFY-INVOICE',
      'total_hours', 8,
      'amount_hours', 800,
      'amount_km', 0,
      'amount_receipts', 25,
      'total_amount', 825,
      'invoice_number', 'VERIFY-' || pg_catalog.gen_random_uuid()::text,
      'issue_date', '2099-04-03',
      'taxable_supply_date', '2099-04-03',
      'due_date', '2099-04-17',
      'currency', 'CZK',
      'supplier_snapshot', pg_catalog.jsonb_build_object('profileId', v_profile_id),
      'customer_snapshot', pg_catalog.jsonb_build_object('name', 'Verifier')
    ),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'job_number', 'VERIFY-INVOICE',
      'event_id', v_invoice_event_id,
      'hours', 8,
      'amount_hours', 800,
      'km', 0,
      'amount_km', 0,
      'amount_receipts', 25,
      'total_amount', 825
    )),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_invoice_timelog_id,
      'expected_updated_at', v_invoice_timelog_updated_at
    )),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_invoice_receipt_id,
      'expected_updated_at', v_invoice_receipt_updated_at
    ))
  ) created;
  v_invoice_id := (v_result->>'invoice_id')::uuid;
  v_invoice_updated_at := (v_result->>'invoice_updated_at')::timestamptz;

  if v_invoice_id is null
    or v_result->>'invoice_status' <> 'draft'
    or not exists (
      select 1 from public.timelogs
      where id = v_invoice_timelog_id and status = 'invoiced'::public.timelog_status
    )
    or not exists (
      select 1 from public.receipts
      where id = v_invoice_receipt_id and status = 'attached'::public.receipt_status
    ) then
    raise exception 'verification failed: invoice create canonical result is inconsistent';
  end if;

  select pg_catalog.jsonb_build_object(
    'invoice', (select pg_catalog.to_jsonb(i) from public.invoices i where i.id = v_invoice_id),
    'items', (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item_row) order by item_row.id),
        '[]'::jsonb
      ) from public.invoice_items item_row where item_row.invoice_id = v_invoice_id
    ),
    'timelogs', (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(link_row) order by link_row.id),
        '[]'::jsonb
      ) from public.invoice_timelogs link_row where link_row.invoice_id = v_invoice_id
    ),
    'receipts', (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(link_row) order by link_row.id),
        '[]'::jsonb
      ) from public.invoice_receipts link_row where link_row.invoice_id = v_invoice_id
    ),
    'receipt_rows', (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(receipt_row) order by receipt_row.id),
        '[]'::jsonb
      )
      from public.receipts receipt_row
      join public.invoice_receipts link_row on link_row.receipt_id = receipt_row.id
      where link_row.invoice_id = v_invoice_id
    )
  ) into v_invoice_relation_before;

  v_expected_error := false;
  begin
    update public.invoices
    set status = 'sent'::public.invoice_status
    where id = v_invoice_id;
  exception
    when sqlstate '42501' then
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: COO directly updated an invoice';
  end if;

  v_expected_error := false;
  begin
    delete from public.invoice_timelogs where invoice_id = v_invoice_id;
  exception
    when sqlstate '42501' then
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: COO directly deleted an invoice link';
  end if;

  v_expected_error := false;
  begin
    insert into public.invoice_items (invoice_id, job_number)
    values (v_invoice_id, 'FORBIDDEN');
  exception
    when sqlstate '42501' then
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: COO directly inserted an invoice item';
  end if;

  v_expected_error := false;
  begin
    update public.receipts
    set note = 'forbidden attached COO edit'
    where id = v_invoice_receipt_id;
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'receipt_lifecycle_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  delete from public.receipts where id = v_invoice_receipt_id;
  get diagnostics v_status_count = row_count;
  if not v_expected_error or v_status_count <> 0 then
    raise exception 'verification failed: COO mutated attached receipt';
  end if;
  execute 'reset role';

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'coo'::public.app_role;
  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'crewhead'::public.app_role);
  execute 'set local role authenticated';
  v_expected_error := false;
  begin
    perform public.mark_invoice_sent_atomic(
      v_invoice_id,
      v_invoice_updated_at,
      pg_catalog.now()
    );
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'invoice_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: CrewHead called invoice mutation RPC';
  end if;

  update public.receipts
  set note = 'forbidden attached CrewHead edit'
  where id = v_invoice_receipt_id;
  get diagnostics v_status_count = row_count;
  delete from public.receipts where id = v_invoice_receipt_id;
  get diagnostics v_count = row_count;
  if v_status_count <> 0 or v_count <> 0 then
    raise exception 'verification failed: CrewHead mutated attached receipt';
  end if;

  v_expected_error := false;
  begin
    delete from public.invoice_receipts where invoice_id = v_invoice_id;
  exception
    when sqlstate '42501' then
      v_expected_error := true;
  end;
  execute 'reset role';
  if not v_expected_error then
    raise exception 'verification failed: CrewHead changed invoice relation snapshot directly';
  end if;

  delete from public.user_roles
  where user_id = v_manager_user_id
    and role = 'crewhead'::public.app_role;
  execute 'set local role authenticated';
  v_expected_error := false;
  begin
    perform public.mark_invoice_sent_atomic(
      v_invoice_id,
      v_invoice_updated_at,
      pg_catalog.now()
    );
  exception
    when sqlstate '42501' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'invoice_unauthorized' then
        raise;
      end if;
      v_expected_error := true;
  end;
  execute 'reset role';
  if not v_expected_error then
    raise exception 'verification failed: Crew called invoice mutation RPC';
  end if;

  execute 'set local role authenticated';
  update public.receipts
  set note = 'forbidden attached Crew edit'
  where id = v_invoice_receipt_id;
  get diagnostics v_status_count = row_count;
  delete from public.receipts where id = v_invoice_receipt_id;
  get diagnostics v_count = row_count;
  execute 'reset role';
  if v_status_count <> 0 or v_count <> 0 then
    raise exception 'verification failed: Crew mutated attached receipt';
  end if;

  select pg_catalog.jsonb_build_object(
    'invoice', (select pg_catalog.to_jsonb(i) from public.invoices i where i.id = v_invoice_id),
    'items', (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item_row) order by item_row.id),
        '[]'::jsonb
      ) from public.invoice_items item_row where item_row.invoice_id = v_invoice_id
    ),
    'timelogs', (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(link_row) order by link_row.id),
        '[]'::jsonb
      ) from public.invoice_timelogs link_row where link_row.invoice_id = v_invoice_id
    ),
    'receipts', (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(link_row) order by link_row.id),
        '[]'::jsonb
      ) from public.invoice_receipts link_row where link_row.invoice_id = v_invoice_id
    ),
    'receipt_rows', (
      select pg_catalog.coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(receipt_row) order by receipt_row.id),
        '[]'::jsonb
      )
      from public.receipts receipt_row
      join public.invoice_receipts link_row on link_row.receipt_id = receipt_row.id
      where link_row.invoice_id = v_invoice_id
    )
  ) into v_invoice_relation_after;
  if v_invoice_relation_after is distinct from v_invoice_relation_before then
    raise exception 'verification failed: direct invoice DML changed relation snapshot';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_manager_user_id, 'coo'::public.app_role);
  execute 'set local role authenticated';
  v_invoice_paid_at := pg_catalog.now();
  select pg_catalog.to_jsonb(sent_result) into v_result
  from public.mark_invoice_sent_atomic(
    v_invoice_id,
    v_invoice_updated_at,
    v_invoice_paid_at
  ) sent_result;
  v_invoice_updated_at := (v_result->>'invoice_updated_at')::timestamptz;
  if v_result->>'invoice_status' <> 'sent' then
    raise exception 'verification failed: invoice sent RPC returned inconsistent status';
  end if;

  select pg_catalog.to_jsonb(sent_retry) into v_result
  from public.mark_invoice_sent_atomic(
    v_invoice_id,
    v_invoice_updated_at,
    v_invoice_paid_at
  ) sent_retry;
  if (v_result->>'invoice_updated_at')::timestamptz is distinct from v_invoice_updated_at then
    raise exception 'verification failed: sent invoice exact retry mutated the invoice';
  end if;

  v_invoice_paid_at := pg_catalog.now();
  v_expected_error := false;
  begin
    perform public.mark_invoice_paid_atomic(
      v_invoice_id,
      'sent'::public.invoice_status,
      '2000-01-01T00:00:00Z',
      v_invoice_paid_at
    );
  exception
    when sqlstate '40001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'invoice_paid_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error
    or not exists (
      select 1 from public.invoices
      where id = v_invoice_id and status = 'sent'::public.invoice_status
    )
    or not exists (
      select 1 from public.timelogs
      where id = v_invoice_timelog_id and status = 'invoiced'::public.timelog_status
    )
    or not exists (
      select 1 from public.receipts
      where id = v_invoice_receipt_id and status = 'attached'::public.receipt_status
    ) then
    raise exception 'verification failed: invoice payment partially mutated rows';
  end if;

  select pg_catalog.to_jsonb(paid_result) into v_result
  from public.mark_invoice_paid_atomic(
    v_invoice_id,
    'sent'::public.invoice_status,
    v_invoice_updated_at,
    v_invoice_paid_at
  ) paid_result;
  v_invoice_updated_at := (v_result->>'invoice_updated_at')::timestamptz;

  if v_result->>'invoice_status' <> 'paid'
    or v_result->>'paid_at' is null
    or exists (
      select 1 from public.timelogs
      where id = v_invoice_timelog_id and status <> 'paid'::public.timelog_status
    )
    or exists (
      select 1 from public.receipts
      where id = v_invoice_receipt_id and status <> 'reimbursed'::public.receipt_status
    ) then
    raise exception 'verification failed: invoice payment canonical result is inconsistent';
  end if;

  update public.receipts
  set note = 'forbidden reimbursed COO edit'
  where id = v_invoice_receipt_id;
  get diagnostics v_status_count = row_count;
  delete from public.receipts where id = v_invoice_receipt_id;
  get diagnostics v_count = row_count;
  if v_status_count <> 0
    or v_count <> 0
    or not exists (
      select 1
      from public.receipts
      where id = v_invoice_receipt_id
        and status = 'reimbursed'::public.receipt_status
    ) then
    raise exception 'verification failed: COO mutated reimbursed receipt';
  end if;

  select pg_catalog.to_jsonb(paid_retry) into v_result
  from public.mark_invoice_paid_atomic(
    v_invoice_id,
    'paid'::public.invoice_status,
    v_invoice_updated_at,
    v_invoice_paid_at
  ) paid_retry;
  if (v_result->>'invoice_updated_at')::timestamptz is distinct from v_invoice_updated_at then
    raise exception 'verification failed: paid invoice exact retry mutated the invoice';
  end if;

  insert into public.events (name, status)
  values (
    'atomic invoice delete verification ' || pg_catalog.gen_random_uuid()::text,
    'planning'::public.event_status
  )
  returning id into v_invoice_event_id;

  v_result := public.save_timelog_atomic(
    null,
    v_invoice_event_id,
    v_profile_id,
    null,
    null,
    0,
    'invoice delete source',
    'draft'::public.timelog_status,
    '[{"date":"2099-04-04","time_from":"08:00","time_to":"12:00","day_type":"provoz"}]'::jsonb
  );
  v_delete_invoice_timelog_id := (v_result->>'id')::uuid;
  v_delete_invoice_timelog_updated_at := (v_result->>'updated_at')::timestamptz;

  v_result := public.import_approved_timelog_atomic(
    v_delete_invoice_timelog_id,
    v_invoice_event_id,
    v_profile_id,
    v_delete_invoice_timelog_updated_at,
    'draft'::public.timelog_status,
    0,
    'invoice delete source',
    '[{"date":"2099-04-04","time_from":"08:00","time_to":"12:00","day_type":"provoz"}]'::jsonb
  );
  v_delete_invoice_timelog_updated_at := (v_result->>'updated_at')::timestamptz;

  insert into public.receipts (
    contractor_id,
    event_id,
    job_number,
    name,
    amount,
    status
  ) values (
    v_profile_id,
    v_invoice_event_id,
    'VERIFY-DELETE',
    'invoice delete receipt',
    15,
    'approved'::public.receipt_status
  ) returning id, updated_at
  into v_delete_invoice_receipt_id, v_delete_invoice_receipt_updated_at;

  select pg_catalog.to_jsonb(created) into v_result
  from public.create_invoice_atomic(
    pg_catalog.jsonb_build_object(
      'contractor_id', v_profile_id,
      'event_id', v_invoice_event_id,
      'job_number', 'VERIFY-DELETE',
      'total_hours', 4,
      'amount_hours', 400,
      'amount_km', 0,
      'amount_receipts', 15,
      'total_amount', 415,
      'invoice_number', 'VERIFY-' || pg_catalog.gen_random_uuid()::text,
      'issue_date', '2099-04-04',
      'taxable_supply_date', '2099-04-04',
      'due_date', '2099-04-18',
      'currency', 'CZK',
      'supplier_snapshot', pg_catalog.jsonb_build_object('profileId', v_profile_id),
      'customer_snapshot', pg_catalog.jsonb_build_object('name', 'Verifier')
    ),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'job_number', 'VERIFY-DELETE',
      'event_id', v_invoice_event_id,
      'hours', 4,
      'amount_hours', 400,
      'km', 0,
      'amount_km', 0,
      'amount_receipts', 15,
      'total_amount', 415
    )),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_delete_invoice_timelog_id,
      'expected_updated_at', v_delete_invoice_timelog_updated_at
    )),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_delete_invoice_receipt_id,
      'expected_updated_at', v_delete_invoice_receipt_updated_at
    ))
  ) created;
  v_delete_invoice_id := (v_result->>'invoice_id')::uuid;
  v_delete_invoice_updated_at := (v_result->>'invoice_updated_at')::timestamptz;

  v_expected_error := false;
  begin
    perform public.delete_invoice_atomic(
      v_delete_invoice_id,
      'draft'::public.invoice_status,
      '2000-01-01T00:00:00Z'
    );
  exception
    when sqlstate '40001' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'invoice_delete_conflict' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error
    or not exists (select 1 from public.invoices where id = v_delete_invoice_id)
    or not exists (
      select 1 from public.timelogs
      where id = v_delete_invoice_timelog_id and status = 'invoiced'::public.timelog_status
    )
    or not exists (
      select 1 from public.receipts
      where id = v_delete_invoice_receipt_id and status = 'attached'::public.receipt_status
    ) then
    raise exception 'verification failed: invoice deletion partially mutated rows';
  end if;

  select pg_catalog.to_jsonb(deleted_invoice) into v_result
  from public.delete_invoice_atomic(
    v_delete_invoice_id,
    'draft'::public.invoice_status,
    v_delete_invoice_updated_at
  ) deleted_invoice;

  if (v_result->>'invoice_id')::uuid is distinct from v_delete_invoice_id
    or exists (select 1 from public.invoices where id = v_delete_invoice_id)
    or exists (select 1 from public.invoice_timelogs where invoice_id = v_delete_invoice_id)
    or exists (select 1 from public.invoice_receipts where invoice_id = v_delete_invoice_id)
    or not exists (
      select 1 from public.timelogs
      where id = v_delete_invoice_timelog_id and status = 'approved'::public.timelog_status
    )
    or not exists (
      select 1 from public.receipts
      where id = v_delete_invoice_receipt_id and status = 'approved'::public.receipt_status
    ) then
    raise exception 'verification failed: invoice deletion canonical result is inconsistent';
  end if;

  v_expected_error := false;
  begin
    perform public.delete_invoice_atomic(
      v_delete_invoice_id,
      'draft'::public.invoice_status,
      v_delete_invoice_updated_at
    );
  exception
    when sqlstate 'P0002' then
      get stacked diagnostics v_error_message = message_text;
      if v_error_message <> 'invoice_not_found' then
        raise;
      end if;
      v_expected_error := true;
  end;
  if not v_expected_error then
    raise exception 'verification failed: invoice delete retry did not return not found';
  end if;

  execute 'reset role';

  raise notice 'timelog assignment lifecycle verification passed';
end
$$;

rollback;
