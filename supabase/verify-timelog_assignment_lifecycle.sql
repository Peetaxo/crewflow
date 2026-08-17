begin;

do $$
declare
  v_authenticated_role_oid oid;
  v_function_signature pg_catalog.regprocedure;
  v_function_owner_oid oid;
  v_authenticated_can_execute boolean;
  v_has_unexpected_execute_grantee boolean;
  v_manager_user_id uuid;
  v_crewhead_user_id uuid;
  v_coo_user_id uuid;
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
  v_event_after jsonb;
  v_days_after jsonb;
begin
  select oid into v_authenticated_role_oid
  from pg_catalog.pg_roles
  where rolname = 'authenticated';

  if v_authenticated_role_oid is null then
    raise exception 'verification failed: authenticated role does not exist';
  end if;

  foreach v_function_signature in array array[
    'public.assign_event_crew(uuid, uuid, uuid, jsonb)'::pg_catalog.regprocedure,
    'public.remove_event_crew(uuid, uuid)'::pg_catalog.regprocedure,
    'public.approve_event_withdrawal(uuid, uuid, uuid)'::pg_catalog.regprocedure
  ] loop
    select
      p.proowner,
      coalesce(
        pg_catalog.bool_or(
          acl.privilege_type = 'EXECUTE'
          and acl.grantee = v_authenticated_role_oid
        ),
        false
      ),
      coalesce(
        pg_catalog.bool_or(
          acl.privilege_type = 'EXECUTE'
          and acl.grantee <> p.proowner
          and acl.grantee <> v_authenticated_role_oid
        ),
        false
      )
    into
      v_function_owner_oid,
      v_authenticated_can_execute,
      v_has_unexpected_execute_grantee
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_function_signature::oid
    group by p.proowner;

    if v_function_owner_oid is null then
      raise exception 'verification failed: lifecycle function does not exist: %',
        v_function_signature;
    end if;
    if not v_authenticated_can_execute then
      raise exception 'verification failed: authenticated lacks EXECUTE on %',
        v_function_signature;
    end if;
    if v_has_unexpected_execute_grantee then
      raise exception 'verification failed: unexpected EXECUTE grantee on %',
        v_function_signature;
    end if;
  end loop;

  select
    p.proowner,
    coalesce(
      pg_catalog.bool_or(acl.grantee <> p.proowner),
      false
    )
  into v_function_owner_oid, v_has_unexpected_execute_grantee
  from pg_catalog.pg_proc p
  cross join lateral pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) acl
  where p.oid = 'public.enforce_event_application_lifecycle_update()'::pg_catalog.regprocedure
  group by p.proowner;

  if v_function_owner_oid is null then
    raise exception 'verification failed: event application lifecycle trigger function does not exist';
  end if;
  if v_has_unexpected_execute_grantee then
    raise exception 'verification failed: event application lifecycle trigger function is directly executable';
  end if;

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

  select ur.user_id
  into v_crewhead_user_id
  from public.user_roles ur
  where ur.role = 'crewhead'::public.app_role
  order by ur.user_id
  limit 1;

  if v_crewhead_user_id is null then
    raise exception 'verification fixture missing: no crewhead user exists';
  end if;

  select ur.user_id
  into v_coo_user_id
  from public.user_roles ur
  where ur.role = 'coo'::public.app_role
    and not exists (
      select 1
      from public.user_roles crewhead_role
      where crewhead_role.user_id = ur.user_id
        and crewhead_role.role = 'crewhead'::public.app_role
    )
  order by ur.user_id
  limit 1;

  if v_coo_user_id is null then
    raise exception 'verification fixture missing: no coo user exists';
  end if;

  v_manager_user_id := v_crewhead_user_id;

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

  perform pg_catalog.set_config('request.jwt.claim.sub', v_coo_user_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_coo_user_id::text,
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

  if not exists (
    select 1
    from public.event_applications
    where id = v_application_id
      and event_id = v_event_id
      and profile_id = v_profile_id
      and status = 'approved'
  ) or not exists (
    select 1
    from public.event_assignments
    where id = v_assignment_id
      and event_id = v_event_id
      and profile_id = v_profile_id
  ) or not exists (
    select 1
    from public.timelogs
    where id = v_blocked_timelog_id
      and event_id = v_event_id
      and contractor_id = v_profile_id
  ) then
    raise exception 'verification failed: Crew application attacks changed lifecycle rows';
  end if;

  update public.event_applications
  set status = 'withdrawal_requested'
  where id = v_application_id and status = 'approved';
  if not found then
    raise exception 'verification failed: valid Crew withdrawal request was rejected';
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

  raise notice 'timelog assignment lifecycle verification passed';
end
$$;

rollback;
