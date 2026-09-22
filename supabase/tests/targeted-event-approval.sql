-- Rollback-only integration proof for targeted event timelog approval.
\set ON_ERROR_STOP on
begin;
-- The supplied schema-only baseline leaves row_security=off in its psql
-- session. Tests intentionally exercise RLS as anon/authenticated roles.
set local row_security = on;

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000006');

insert into public.profiles (id, user_id, first_name, last_name, phone) values
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'Synthetic', 'CH', '+420111'),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', 'Intended', 'COO', '+420222'),
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000003', 'Other', 'COO', '+420333'),
  ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000004', 'Crew', 'Author', '+420444'),
  ('10000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000005', 'Wrong', 'Role', '+420555'),
  ('10000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000006', 'Other', 'Crew', '+420666'),
  ('10000000-0000-4000-8000-000000000017', null, 'Unlinked', 'Contact', '+420777');

insert into public.user_roles (user_id, role) values
  ('10000000-0000-4000-8000-000000000001', 'crewhead'),
  ('10000000-0000-4000-8000-000000000001', 'coo'),
  ('10000000-0000-4000-8000-000000000002', 'coo'),
  ('10000000-0000-4000-8000-000000000003', 'coo'),
  ('10000000-0000-4000-8000-000000000004', 'crew'),
  ('10000000-0000-4000-8000-000000000004', 'coo'),
  ('10000000-0000-4000-8000-000000000005', 'crew'),
  ('10000000-0000-4000-8000-000000000006', 'crew');

insert into public.events (
  id, name, contact_profile_id, contact_approves_hours, timelog_approver_profile_id
) values
  ('10000000-0000-4000-8000-000000000101', 'Contact approval', '10000000-0000-4000-8000-000000000012', true, null),
  ('10000000-0000-4000-8000-000000000102', 'Separate approval', '10000000-0000-4000-8000-000000000013', false, '10000000-0000-4000-8000-000000000012'),
  ('10000000-0000-4000-8000-000000000103', 'No target', '10000000-0000-4000-8000-000000000012', false, null),
  ('10000000-0000-4000-8000-000000000104', 'Unlinked target', '10000000-0000-4000-8000-000000000017', true, null),
  ('10000000-0000-4000-8000-000000000105', 'Wrong role target', '10000000-0000-4000-8000-000000000015', true, null),
  ('10000000-0000-4000-8000-000000000106', 'Self target', '10000000-0000-4000-8000-000000000011', true, null),
  ('10000000-0000-4000-8000-000000000107', 'Author target', '10000000-0000-4000-8000-000000000014', true, null),
  ('10000000-0000-4000-8000-000000000108', 'Return cycle', '10000000-0000-4000-8000-000000000012', true, null),
  ('10000000-0000-4000-8000-000000000109', 'Mixed batch', '10000000-0000-4000-8000-000000000012', true, null),
  ('10000000-0000-4000-8000-000000000110', 'Legacy', null, true, null),
  ('10000000-0000-4000-8000-000000000111', 'Batch rollback', '10000000-0000-4000-8000-000000000012', true, null);

insert into public.timelogs (id, event_id, contractor_id, status, km, note) values
  ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000014', 'pending_ch', 3, 'contact'),
  ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000014', 'pending_ch', 4, 'separate'),
  ('10000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000014', 'pending_ch', 0, ''),
  ('10000000-0000-4000-8000-000000000204', '10000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000014', 'pending_ch', 0, ''),
  ('10000000-0000-4000-8000-000000000205', '10000000-0000-4000-8000-000000000105', '10000000-0000-4000-8000-000000000014', 'pending_ch', 0, ''),
  ('10000000-0000-4000-8000-000000000206', '10000000-0000-4000-8000-000000000106', '10000000-0000-4000-8000-000000000014', 'pending_ch', 0, ''),
  ('10000000-0000-4000-8000-000000000207', '10000000-0000-4000-8000-000000000107', '10000000-0000-4000-8000-000000000014', 'pending_ch', 0, ''),
  ('10000000-0000-4000-8000-000000000208', '10000000-0000-4000-8000-000000000111', '10000000-0000-4000-8000-000000000014', 'pending_ch', 0, 'batch rollback'),
  ('10000000-0000-4000-8000-000000000209', '10000000-0000-4000-8000-000000000108', '10000000-0000-4000-8000-000000000014', 'pending_ch', 0, 'return me'),
  ('10000000-0000-4000-8000-000000000210', '10000000-0000-4000-8000-000000000109', '10000000-0000-4000-8000-000000000014', 'pending_coo', 0, 'legacy mixed'),
  ('10000000-0000-4000-8000-000000000211', '10000000-0000-4000-8000-000000000110', '10000000-0000-4000-8000-000000000014', 'pending_coo', 0, 'legacy direct');

insert into public.timelog_days (id, timelog_id, date, time_from, time_to, day_type)
select
  ('20000000-0000-4000-8000-' || pg_catalog.lpad((200 + n)::text, 12, '0'))::uuid,
  ('10000000-0000-4000-8000-' || pg_catalog.lpad((200 + n)::text, 12, '0'))::uuid,
  ('2099-01-' || pg_catalog.lpad(n::text, 2, '0'))::date,
  '08:00', '17:00', 'provoz'::public.timelog_type
from pg_catalog.generate_series(1, 11) n;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
begin
  if not exists (
    select 1 from public.list_event_contact_options()
    where profile_id = '10000000-0000-4000-8000-000000000012' and can_approve_hours
  ) or not exists (
    select 1 from public.list_event_contact_options()
    where profile_id = '10000000-0000-4000-8000-000000000017' and not can_approve_hours
  ) then
    raise exception 'contact option capability assertion failed';
  end if;
end
$$;

-- A new handoff cannot bypass the staged approval through direct, generic, or save paths.
do $$
declare v_t public.timelogs%rowtype;
begin
  begin
    update public.timelogs set status = 'pending_coo' where id = '10000000-0000-4000-8000-000000000208';
    raise exception 'direct handoff bypass succeeded';
  exception when sqlstate '42501' then
    if sqlerrm <> 'timelog_approval_unauthorized' then raise; end if;
  end;
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000208';
  begin
    perform public.transition_timelog_statuses_atomic(
      jsonb_build_array(jsonb_build_object('id', v_t.id, 'expected_updated_at', v_t.updated_at)),
      'pending_ch', 'pending_coo'
    );
    raise exception 'generic handoff bypass succeeded';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.save_timelog_atomic(
      v_t.id, v_t.event_id, v_t.contractor_id, v_t.updated_at, v_t.status,
      v_t.km, v_t.note, 'pending_coo',
      '[{"date":"2099-01-08","time_from":"08:00","time_to":"17:00","day_type":"provoz"}]'::jsonb
    );
    raise exception 'save handoff bypass succeeded';
  exception when sqlstate '42501' then null;
  end;
end
$$;

-- Chosen target validation: absent, unlinked, wrong-role, sender, and author.
do $$
declare v_id uuid; v_expected timestamptz; v_error text;
begin
  foreach v_id in array array[
    '10000000-0000-4000-8000-000000000203'::uuid,
    '10000000-0000-4000-8000-000000000204'::uuid,
    '10000000-0000-4000-8000-000000000205'::uuid,
    '10000000-0000-4000-8000-000000000206'::uuid,
    '10000000-0000-4000-8000-000000000207'::uuid
  ] loop
    select updated_at into v_expected from public.timelogs where id = v_id;
    v_error := case when v_id in (
      '10000000-0000-4000-8000-000000000203'::uuid,
      '10000000-0000-4000-8000-000000000204'::uuid,
      '10000000-0000-4000-8000-000000000205'::uuid
    ) then 'timelog_approver_unavailable' else 'timelog_approval_unauthorized' end;
    begin
      perform public.handoff_timelogs_for_approval_atomic(jsonb_build_array(jsonb_build_object(
        'id', v_id, 'expected_updated_at', v_expected,
        'approval_id', gen_random_uuid(), 'approval_round_id', gen_random_uuid()
      )));
      raise exception 'invalid target succeeded for %', v_id;
    exception
      when sqlstate '22023' then
        if v_error <> 'timelog_approver_unavailable' or sqlerrm <> v_error then raise; end if;
      when sqlstate '42501' then
        if v_error <> 'timelog_approval_unauthorized' or sqlerrm <> v_error then raise; end if;
    end;
  end loop;
end
$$;

-- Contact and separate target selection; exact whole-batch retry is idempotent.
do $$
declare v_targets jsonb; v_first jsonb; v_retry jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'id', t.id, 'expected_updated_at', t.updated_at,
    'approval_id', case t.id
      when '10000000-0000-4000-8000-000000000201' then '10000000-0000-4000-8000-000000000401'::uuid
      else '10000000-0000-4000-8000-000000000402'::uuid end,
    'approval_round_id', case t.id
      when '10000000-0000-4000-8000-000000000201' then '10000000-0000-4000-8000-000000000501'::uuid
      else '10000000-0000-4000-8000-000000000502'::uuid end
  ) order by t.id) into v_targets
  from public.timelogs t
  where t.id in ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000202');
  v_first := public.handoff_timelogs_for_approval_atomic(v_targets);
  v_retry := public.handoff_timelogs_for_approval_atomic(v_targets);
  begin
    perform public.handoff_timelogs_for_approval_atomic(jsonb_build_array(v_targets->0));
    raise exception 'strict subset handoff retry succeeded';
  exception when sqlstate '40001' then
    if sqlerrm <> 'timelog_approval_conflict' then raise; end if;
  end;
  if jsonb_array_length(v_first) <> 2 or jsonb_array_length(v_retry) <> 2
    or (select count(*) from public.timelog_approvals
        where id in ('10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000402')
          and approver_profile_id = '10000000-0000-4000-8000-000000000012'
          and approver_user_id = '10000000-0000-4000-8000-000000000002'
          and requested_by_profile_id = '10000000-0000-4000-8000-000000000011'
          and requested_by_user_id = '10000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'handoff snapshot/idempotency assertion failed';
  end if;
end
$$;

-- Partial batch retries, reused IDs, and stale versions conflict atomically.
do $$
declare v_payload jsonb; v_208 timestamptz;
begin
  select updated_at into v_208 from public.timelogs where id = '10000000-0000-4000-8000-000000000208';
  select jsonb_build_array(
    jsonb_build_object(
      'id', '10000000-0000-4000-8000-000000000201',
      'expected_updated_at', t.updated_at - interval '1 second',
      'approval_id', '10000000-0000-4000-8000-000000000401',
      'approval_round_id', '10000000-0000-4000-8000-000000000501'
    ),
    jsonb_build_object(
      'id', '10000000-0000-4000-8000-000000000208',
      'expected_updated_at', v_208,
      'approval_id', '10000000-0000-4000-8000-000000000408',
      'approval_round_id', '10000000-0000-4000-8000-000000000508'
    )
  ) into v_payload from public.timelogs t where t.id = '10000000-0000-4000-8000-000000000201';
  begin
    perform public.handoff_timelogs_for_approval_atomic(v_payload);
    raise exception 'partial retry succeeded';
  exception when sqlstate '40001' then
    if sqlerrm <> 'timelog_approval_conflict' then raise; end if;
  end;

  begin
    perform public.handoff_timelogs_for_approval_atomic(jsonb_build_array(jsonb_build_object(
      'id', '10000000-0000-4000-8000-000000000208', 'expected_updated_at', v_208,
      'approval_id', '10000000-0000-4000-8000-000000000401',
      'approval_round_id', '10000000-0000-4000-8000-000000000508'
    )));
    raise exception 'approval id reuse succeeded';
  exception when sqlstate '40001' then null;
  end;

  begin
    perform public.handoff_timelogs_for_approval_atomic(jsonb_build_array(jsonb_build_object(
      'id', '10000000-0000-4000-8000-000000000208', 'expected_updated_at', v_208 - interval '1 second',
      'approval_id', '10000000-0000-4000-8000-000000000408',
      'approval_round_id', '10000000-0000-4000-8000-000000000508'
    )));
    raise exception 'stale handoff succeeded';
  exception when sqlstate '40001' then null;
  end;

  if exists (select 1 from public.timelog_approvals where timelog_id = '10000000-0000-4000-8000-000000000208')
    or (select status from public.timelogs where id = '10000000-0000-4000-8000-000000000208') <> 'pending_ch' then
    raise exception 'failed handoff was not atomic';
  end if;
end
$$;

-- Contact changes do not redirect an active round.
reset role;
update public.events set contact_profile_id = '10000000-0000-4000-8000-000000000013'
where id = '10000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$
declare v_t public.timelogs%rowtype; v_a public.timelog_approvals%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000201';
  select * into v_a from public.timelog_approvals where id = '10000000-0000-4000-8000-000000000401';
  if v_a.approver_profile_id <> '10000000-0000-4000-8000-000000000012' then
    raise exception 'active round was redirected';
  end if;
  begin
    perform public.resolve_timelog_approvals_atomic(jsonb_build_array(jsonb_build_object(
      'id', v_t.id, 'expected_updated_at', v_t.updated_at,
      'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at
    )), 'approved');
    raise exception 'wrong actor resolved approval';
  exception when sqlstate '42501' then
    if sqlerrm <> 'timelog_approval_unauthorized' then raise; end if;
  end;
end
$$;

-- Rebinding the assigned profile cannot impersonate its frozen auth snapshot.
reset role;
update public.profiles set user_id = null where id = '10000000-0000-4000-8000-000000000013';
update public.profiles set user_id = '10000000-0000-4000-8000-000000000003'
where id = '10000000-0000-4000-8000-000000000012';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$
declare v_t public.timelogs%rowtype; v_a public.timelog_approvals%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000201';
  select * into v_a from public.timelog_approvals where id = '10000000-0000-4000-8000-000000000401';
  begin
    perform public.resolve_timelog_approvals_atomic(jsonb_build_array(jsonb_build_object(
      'id', v_t.id, 'expected_updated_at', v_t.updated_at,
      'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at
    )), 'approved');
    raise exception 'profile rebind impersonation succeeded';
  exception when sqlstate '42501' then null;
  end;
end
$$;
reset role;
update public.profiles set user_id = '10000000-0000-4000-8000-000000000002'
where id = '10000000-0000-4000-8000-000000000012';
update public.profiles set user_id = '10000000-0000-4000-8000-000000000003'
where id = '10000000-0000-4000-8000-000000000013';

-- Pending targeted approval blocks direct, generic, save, and import resolution.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
declare v_t public.timelogs%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000201';
  begin
    update public.timelogs set status = 'approved' where id = v_t.id;
    raise exception 'direct resolution bypass succeeded';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.transition_timelog_statuses_atomic(
      jsonb_build_array(jsonb_build_object('id', v_t.id, 'expected_updated_at', v_t.updated_at)),
      'pending_coo', 'approved'
    );
    raise exception 'generic resolution bypass succeeded';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.save_timelog_atomic(
      v_t.id, v_t.event_id, v_t.contractor_id, v_t.updated_at, v_t.status,
      v_t.km, v_t.note, 'approved',
      '[{"date":"2099-01-01","time_from":"08:00","time_to":"17:00","day_type":"provoz"}]'::jsonb
    );
    raise exception 'save resolution bypass succeeded';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.import_approved_timelog_atomic(
      v_t.id, v_t.event_id, v_t.contractor_id, v_t.updated_at, v_t.status,
      v_t.km, v_t.note,
      '[{"date":"2099-01-01","time_from":"08:00","time_to":"17:00","day_type":"provoz"}]'::jsonb
    );
    raise exception 'approved import bypass succeeded';
  exception when sqlstate '42501' then null;
  end;
end
$$;

-- Frozen actor resolves, exact retry is idempotent, and a different retry conflicts.
do $$
declare v_t public.timelogs%rowtype; v_a public.timelog_approvals%rowtype; v_payload jsonb; v_result jsonb;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000201';
  select * into v_a from public.timelog_approvals where id = '10000000-0000-4000-8000-000000000401';
  v_payload := jsonb_build_array(jsonb_build_object(
    'id', v_t.id, 'expected_updated_at', v_t.updated_at,
    'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at
  ));
  v_result := public.resolve_timelog_approvals_atomic(v_payload, 'approved');
  v_result := public.resolve_timelog_approvals_atomic(v_payload, 'approved');
  if v_result->0->>'status' <> 'approved' then raise exception 'approved retry result wrong'; end if;
  begin
    perform public.resolve_timelog_approvals_atomic(v_payload, 'returned', 'different');
    raise exception 'different resolution retry succeeded';
  exception when sqlstate '40001' then null;
  end;
end
$$;

do $$
begin
  if (select status from public.timelogs where id = '10000000-0000-4000-8000-000000000201') <> 'approved'
    or exists (select 1 from public.invoices where timelog_id = '10000000-0000-4000-8000-000000000201')
    or exists (select 1 from public.invoice_timelogs where timelog_id = '10000000-0000-4000-8000-000000000201')
    or (select count(*) from public.timelog_days where timelog_id = '10000000-0000-4000-8000-000000000201') <> 1
    or (select status from public.timelog_approvals where id = '10000000-0000-4000-8000-000000000401') <> 'approved' then
    raise exception 'approval changed finance/days or wrong final state';
  end if;
end
$$;

-- Return requires a note and is idempotent for the exact frozen actor/payload.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
declare v_t public.timelogs%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000209';
  perform public.handoff_timelogs_for_approval_atomic(jsonb_build_array(jsonb_build_object(
    'id', v_t.id, 'expected_updated_at', v_t.updated_at,
    'approval_id', '10000000-0000-4000-8000-000000000409',
    'approval_round_id', '10000000-0000-4000-8000-000000000509'
  )));
end
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
declare v_t public.timelogs%rowtype; v_a public.timelog_approvals%rowtype; v_payload jsonb;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000209';
  select * into v_a from public.timelog_approvals where id = '10000000-0000-4000-8000-000000000409';
  begin
    perform public.resolve_timelog_approvals_atomic(jsonb_build_array(jsonb_build_object(
      'id', v_t.id, 'expected_updated_at', v_t.updated_at,
      'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at
    )), null, '');
    raise exception 'null resolution succeeded';
  exception when sqlstate '22023' then null;
  end;
  if (select status from public.timelogs where id = v_t.id) <> 'pending_coo'
    or (select status from public.timelog_approvals where id = v_a.id) <> 'pending' then
    raise exception 'null targeted resolution mutated state';
  end if;
  begin
    perform public.resolve_timelog_approvals_atomic(jsonb_build_array(jsonb_build_object(
      'id', v_t.id, 'expected_updated_at', v_t.updated_at,
      'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at
    )), 'returned', '   ');
    raise exception 'blank return note succeeded';
  exception when sqlstate '22023' then null;
  end;
  v_payload := jsonb_build_array(jsonb_build_object(
    'id', v_t.id, 'expected_updated_at', v_t.updated_at,
    'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at
  ));
  perform public.resolve_timelog_approvals_atomic(v_payload, 'returned', ' Fix hours ');
  perform public.resolve_timelog_approvals_atomic(v_payload, 'returned', 'Fix hours');
  if (select review_note from public.timelogs where id = v_t.id) <> 'Fix hours' then
    raise exception 'return note was not normalized and persisted';
  end if;
end
$$;

-- Import cannot revive or same-status edit a returned targeted report.
do $$
declare v_t public.timelogs%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000209';
  begin
    perform public.import_approved_timelog_atomic(
      v_t.id, v_t.event_id, v_t.contractor_id, v_t.updated_at, v_t.status,
      v_t.km, v_t.note,
      '[{"date":"2099-01-09","time_from":"08:00","time_to":"17:00","day_type":"provoz"}]'::jsonb
    );
    raise exception 'returned import succeeded';
  exception when sqlstate '42501' then null;
  end;
end
$$;

-- Crew edits and resubmits; the new handoff uses current event configuration.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
do $$
declare v_t public.timelogs%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000209';
  perform public.save_timelog_atomic(
    v_t.id, v_t.event_id, v_t.contractor_id, v_t.updated_at, v_t.status,
    v_t.km, 'hours fixed', 'pending_ch',
    '[{"date":"2099-01-09","time_from":"09:00","time_to":"17:00","day_type":"provoz"}]'::jsonb
  );
end
$$;

reset role;
update public.events set contact_profile_id = '10000000-0000-4000-8000-000000000013'
where id = '10000000-0000-4000-8000-000000000108';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
declare v_t public.timelogs%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000209';
  perform public.handoff_timelogs_for_approval_atomic(jsonb_build_array(jsonb_build_object(
    'id', v_t.id, 'expected_updated_at', v_t.updated_at,
    'approval_id', '10000000-0000-4000-8000-000000000410',
    'approval_round_id', '10000000-0000-4000-8000-000000000510'
  )));
  if not exists (
    select 1 from public.timelog_approvals
    where id = '10000000-0000-4000-8000-000000000409' and superseded_at is not null
  ) or not exists (
    select 1 from public.timelog_approvals
    where id = '10000000-0000-4000-8000-000000000410'
      and approver_profile_id = '10000000-0000-4000-8000-000000000013'
      and status = 'pending'
  ) then raise exception 'rehandoff did not supersede and use current config'; end if;
end
$$;

-- A delayed retry of the superseded handoff must not masquerade as the active round.
do $$
declare v_t public.timelogs%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000209';
  begin
    perform public.handoff_timelogs_for_approval_atomic(jsonb_build_array(jsonb_build_object(
      'id', v_t.id, 'expected_updated_at', v_t.updated_at - interval '1 second',
      'approval_id', '10000000-0000-4000-8000-000000000409',
      'approval_round_id', '10000000-0000-4000-8000-000000000509'
    )));
    raise exception 'superseded handoff retry succeeded';
  exception when sqlstate '40001' then
    if sqlerrm <> 'timelog_approval_conflict' then raise; end if;
  end;
end
$$;

-- Active approvals from different original calls cannot be combined as a retry.
do $$
declare v_payload jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'id', a.timelog_id,
    'expected_updated_at', t.updated_at,
    'approval_id', a.id,
    'approval_round_id', a.approval_round_id
  ) order by a.timelog_id)
  into v_payload
  from public.timelog_approvals a
  join public.timelogs t on t.id = a.timelog_id
  where a.id in (
    '10000000-0000-4000-8000-000000000401',
    '10000000-0000-4000-8000-000000000410'
  );

  begin
    perform public.handoff_timelogs_for_approval_atomic(v_payload);
    raise exception 'mixed historical handoff retry succeeded';
  exception when sqlstate '40001' then
    if sqlerrm <> 'timelog_approval_conflict' then raise; end if;
  end;
end
$$;

-- A retry against the superseded returned round is a conflict, not legacy/auth fallback.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
declare v_t public.timelogs%rowtype; v_a public.timelog_approvals%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000209';
  select * into v_a from public.timelog_approvals where id = '10000000-0000-4000-8000-000000000409';
  begin
    perform public.resolve_timelog_approvals_atomic(jsonb_build_array(jsonb_build_object(
      'id', v_t.id, 'expected_updated_at', v_t.updated_at,
      'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at
    )), 'returned', 'Fix hours');
    raise exception 'superseded resolution retry succeeded';
  exception when sqlstate '40001' then
    if sqlerrm <> 'timelog_approval_conflict' then raise; end if;
  end;
end
$$;

-- Mixed targeted/legacy resolution rolls back entirely on one stale row.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$
declare v_l public.timelogs%rowtype;
begin
  select * into v_l from public.timelogs where id = '10000000-0000-4000-8000-000000000210';
  begin
    perform public.resolve_timelog_approvals_atomic(jsonb_build_array(jsonb_build_object(
      'id', v_l.id,
      'expected_updated_at', v_l.updated_at,
      'approval_id', null,
      'approval_updated_at', null
    )), null, '');
    raise exception 'null legacy resolution succeeded';
  exception when sqlstate '22023' then null;
  end;
  if (select status from public.timelogs where id = v_l.id) <> 'pending_coo'
    or exists (select 1 from public.timelog_approvals where timelog_id = v_l.id) then
    raise exception 'null legacy resolution mutated state';
  end if;
end
$$;
do $$
declare v_t public.timelogs%rowtype; v_l public.timelogs%rowtype; v_a public.timelog_approvals%rowtype; v_payload jsonb;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000209';
  select * into v_l from public.timelogs where id = '10000000-0000-4000-8000-000000000210';
  select * into v_a from public.timelog_approvals where id = '10000000-0000-4000-8000-000000000410';
  v_payload := jsonb_build_array(
    jsonb_build_object('id', v_t.id, 'expected_updated_at', v_t.updated_at,
      'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at),
    jsonb_build_object('id', v_l.id, 'expected_updated_at', v_l.updated_at - interval '1 second',
      'approval_id', null, 'approval_updated_at', null)
  );
  begin
    perform public.resolve_timelog_approvals_atomic(v_payload, 'approved');
    raise exception 'stale mixed resolution succeeded';
  exception when sqlstate '40001' then null;
  end;
  if (select status from public.timelog_approvals where id = v_a.id) <> 'pending'
    or (select status from public.timelogs where id = v_t.id) <> 'pending_coo' then
    raise exception 'mixed failure partially committed';
  end if;

  v_payload := jsonb_build_array(
    jsonb_build_object('id', v_t.id, 'expected_updated_at', v_t.updated_at,
      'approval_id', v_a.id, 'approval_updated_at', v_a.updated_at),
    jsonb_build_object('id', v_l.id, 'expected_updated_at', v_l.updated_at,
      'approval_id', null, 'approval_updated_at', null)
  );
  perform public.resolve_timelog_approvals_atomic(v_payload, 'approved');
end
$$;

-- Existing zero-history pending_coo remains global-COO legacy behavior.
do $$
begin
  update public.timelogs set status = 'approved'
  where id = '10000000-0000-4000-8000-000000000211';
  if (select status from public.timelogs where id = '10000000-0000-4000-8000-000000000211') <> 'approved'
    or exists (select 1 from public.timelog_approvals where timelog_id = '10000000-0000-4000-8000-000000000211') then
    raise exception 'legacy global COO behavior changed';
  end if;
end
$$;

-- Omitting approval IDs for a report with any targeted history never falls back.
do $$
declare v_t public.timelogs%rowtype;
begin
  select * into v_t from public.timelogs where id = '10000000-0000-4000-8000-000000000202';
  begin
    perform public.resolve_timelog_approvals_atomic(jsonb_build_array(jsonb_build_object(
      'id', v_t.id, 'expected_updated_at', v_t.updated_at,
      'approval_id', null, 'approval_updated_at', null
    )), 'approved');
    raise exception 'targeted report fell back to legacy';
  exception when sqlstate '40001' then null;
  end;
end
$$;

-- Crew author can read own rows; unrelated Crew cannot write or read them.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
do $$ begin
  if (select count(*) from public.timelog_approvals) = 0 then raise exception 'crew author cannot read approvals'; end if;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
do $$ begin
  if (select count(*) from public.timelog_approvals) <> 0 then raise exception 'unrelated crew can read approvals'; end if;
  begin
    insert into public.timelog_approvals (
      id, approval_round_id, timelog_id, approver_profile_id, approver_user_id,
      requested_by_profile_id, requested_by_user_id, status
    ) values (
      gen_random_uuid(), gen_random_uuid(), '10000000-0000-4000-8000-000000000208',
      '10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', 'pending'
    );
    raise exception 'authenticated table write succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Anonymous and PUBLIC have neither RPC execution nor table writes. Use catalog
-- assertions here; a PostgreSQL 15 test-process bug can segfault when a DO block
-- catches multiple SET ROLE anon permission errors in the same subtransaction.
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.list_event_contact_options()', 'EXECUTE')
    or has_function_privilege('anon', 'public.handoff_timelogs_for_approval_atomic(jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.resolve_timelog_approvals_atomic(jsonb,text,text)', 'EXECUTE')
    or has_function_privilege('public', 'public.list_event_contact_options()', 'EXECUTE')
    or has_table_privilege('anon', 'public.timelog_approvals', 'INSERT')
    or has_table_privilege('anon', 'public.timelog_approvals', 'UPDATE')
    or has_table_privilege('anon', 'public.timelog_approvals', 'DELETE') then
    raise exception 'anonymous/public approval privileges are too broad';
  end if;
  if (select count(*) from public.user_roles where user_id::text like '10000000-0000-4000-8000-%') <> 8 then
    raise exception 'approval workflow created or changed roles';
  end if;
  if exists (select 1 from public.invoices where timelog_id in (
      '10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000209',
      '10000000-0000-4000-8000-000000000210', '10000000-0000-4000-8000-000000000211'
    )) then raise exception 'approval auto-created invoice'; end if;
end
$$;

rollback;
