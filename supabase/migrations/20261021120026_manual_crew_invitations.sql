-- Opt-in, local test invitations only. Capabilities never enter management responses.
alter table public.profiles alter column hourly_rate set default 250;
alter table crew_onboarding_private.invitations
  add column manual_request_id uuid unique,
  add column mail_captured_at timestamptz;

create function public.crew_onboarding_manual_status(p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles%rowtype; i crew_onboarding_private.invitations%rowtype; v_email text; v_state text; v_expires_at timestamptz;
begin
  select * into p from public.profiles where id=p_profile_id;
  if not found then return jsonb_build_object('error','profile_unavailable'); end if;
  v_email := lower(btrim(p.email));
  if v_email is null or v_email='' then return jsonb_build_object('error','missing_email'); end if;
  if length(v_email)>320 or v_email !~ '^[a-z0-9][a-z0-9._+-]*@crewflow-onboarding\.test$' then return jsonb_build_object('error','test_only'); end if;
  if (select count(*) from public.profiles p2 where lower(btrim(p2.email))=v_email)<>1 then return jsonb_build_object('error','profile_unavailable'); end if;
  select * into i from crew_onboarding_private.invitations where profile_id=p.id and state in ('pending','claiming');
  v_expires_at := i.expires_at;
  if p.user_id is not null or exists(select 1 from auth.users u where lower(btrim(u.email))=v_email) then v_state := 'active';
  elsif i.state='claiming' then v_state := 'activation_in_progress';
  elsif i.id is null then v_state := 'not_invited';
  -- Keep the old optimistic version, but never attribute its delivery or expiry to an edited recipient.
  elsif i.email is distinct from v_email then v_state := 'not_invited'; v_expires_at := null;
  elsif i.expires_at<=clock_timestamp() then v_state := 'expired';
  elsif i.mail_captured_at is null then v_state := 'preparing';
  else v_state := 'pending'; end if;
  return jsonb_build_object('profileId',p.id,'email',v_email,'state',v_state,'invitationId',i.id,'expiresAt',v_expires_at);
end $$;

create function public.crew_onboarding_manual_prepare(p_profile_id uuid,p_expected_email text,p_request_id uuid,p_expected_invitation_id uuid,p_replace_existing boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles%rowtype; i crew_onboarding_private.invitations%rowtype; replay crew_onboarding_private.invitations%rowtype; v_email text; created jsonb; result jsonb;
begin
  if p_profile_id is null or p_request_id is null or p_replace_existing is null or p_expected_email is null or length(p_expected_email)>320 then return jsonb_build_object('error','invalid_request'); end if;
  select lower(btrim(email)) into v_email from public.profiles where id=p_profile_id;
  if not found then return jsonb_build_object('error','profile_unavailable'); end if;
  if v_email is null or v_email='' then return jsonb_build_object('error','missing_email'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,714802));
  select * into p from public.profiles where id=p_profile_id for update;
  if not found then return jsonb_build_object('error','profile_unavailable'); end if;
  if lower(btrim(p.email)) is distinct from v_email or v_email is distinct from lower(btrim(p_expected_email)) then return jsonb_build_object('error','invitation_changed'); end if;
  if length(v_email)>320 or v_email !~ '^[a-z0-9][a-z0-9._+-]*@crewflow-onboarding\.test$' then return jsonb_build_object('error','test_only'); end if;
  if p.user_id is not null or exists(select 1 from auth.users u where lower(btrim(u.email))=v_email) then return jsonb_build_object('error','already_active'); end if;
  if (select count(*) from public.profiles p2 where lower(btrim(p2.email))=v_email)<>1 then return jsonb_build_object('error','profile_unavailable'); end if;
  select * into i from crew_onboarding_private.invitations where profile_id=p.id and state in ('pending','claiming') for update;
  if i.state='claiming' then return jsonb_build_object('error','activation_in_progress'); end if;
  select * into replay from crew_onboarding_private.invitations where manual_request_id=p_request_id;
  if found then
    if replay.profile_id is distinct from p.id or replay.email is distinct from v_email or replay.state='revoked' or replay.id is distinct from i.id then return jsonb_build_object('error','invitation_changed'); end if;
    if replay.mail_captured_at is null then return jsonb_build_object('error','invitation_in_progress'); end if;
    return public.crew_onboarding_manual_status(p.id);
  end if;
  if i.id is distinct from p_expected_invitation_id or (i.id is not null and not p_replace_existing) or (i.id is null and p_replace_existing) then return jsonb_build_object('error','invitation_changed'); end if;
  created := public.crew_onboarding_create(v_email,p.first_name,p.last_name,p.phone,p.id);
  if created ? 'error' then
    if created->>'error'='already_active' then return jsonb_build_object('error','already_active'); end if;
    return jsonb_build_object('error','invitation_unavailable');
  end if;
  update crew_onboarding_private.invitations set manual_request_id=p_request_id
    where profile_id=p.id and token_hash=encode(extensions.digest(created->>'token','sha256'),'hex') and state='pending';
  if not found then raise exception 'manual_preparation_unavailable'; end if;
  result := public.crew_onboarding_manual_status(p.id);
  return result || jsonb_build_object('token',created->>'token','firstName',coalesce(p.first_name,''));
exception when unique_violation then
  -- Global request UUID collisions (including another profile/email lock) roll back all preparation.
  return jsonb_build_object('error','invitation_changed');
end $$;

create function public.crew_onboarding_manual_capture(p_profile_id uuid,p_request_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i crew_onboarding_private.invitations%rowtype; p public.profiles%rowtype; v_email text;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','invitation_unavailable'); end if;
  select email into v_email from crew_onboarding_private.invitations where profile_id=p_profile_id and manual_request_id=p_request_id and token_hash=p_token_hash;
  if not found then return jsonb_build_object('error','invitation_changed'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,714802));
  select * into i from crew_onboarding_private.invitations where profile_id=p_profile_id and manual_request_id=p_request_id and token_hash=p_token_hash for update;
  select * into p from public.profiles where id=p_profile_id for update;
  if p.id is null or p.user_id is not null or lower(btrim(p.email)) is distinct from i.email or i.state<>'pending' or i.expires_at<=clock_timestamp()
     or (select count(*) from public.profiles p2 where lower(btrim(p2.email))=i.email)<>1
     or exists(select 1 from auth.users u where lower(btrim(u.email))=i.email)
     or exists(select 1 from crew_onboarding_private.invitations i2 where i2.profile_id=p.id and i2.state in ('pending','claiming') and i2.id<>i.id) then return jsonb_build_object('error','invitation_changed'); end if;
  update crew_onboarding_private.invitations set mail_captured_at=coalesce(mail_captured_at,clock_timestamp()) where id=i.id;
  return public.crew_onboarding_manual_status(p.id);
end $$;

-- Exact wrapper around the existing reviewed cancellation helper. Never cancel a claim or replacement.
create function public.crew_onboarding_manual_cancel(p_profile_id uuid,p_request_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i crew_onboarding_private.invitations%rowtype; v_email text;
begin
  select email into v_email from crew_onboarding_private.invitations where profile_id=p_profile_id and manual_request_id=p_request_id and token_hash=p_token_hash;
  if not found then return jsonb_build_object('error','invitation_changed'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,714802));
  select * into i from crew_onboarding_private.invitations where profile_id=p_profile_id and manual_request_id=p_request_id and token_hash=p_token_hash for update;
  if i.state<>'pending' or exists(select 1 from crew_onboarding_private.invitations i2 where i2.profile_id=p_profile_id and i2.state in ('pending','claiming') and i2.id<>i.id) then return jsonb_build_object('error','invitation_changed'); end if;
  return public.crew_onboarding_cancel(p_profile_id);
end $$;

revoke all on function public.crew_onboarding_manual_status(uuid) from public,anon,authenticated;
revoke all on function public.crew_onboarding_manual_prepare(uuid,text,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.crew_onboarding_manual_capture(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.crew_onboarding_manual_cancel(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.crew_onboarding_manual_status(uuid) to service_role;
grant execute on function public.crew_onboarding_manual_prepare(uuid,text,uuid,uuid,boolean) to service_role;
grant execute on function public.crew_onboarding_manual_capture(uuid,uuid,text) to service_role;
grant execute on function public.crew_onboarding_manual_cancel(uuid,uuid,text) to service_role;
alter function public.crew_onboarding_manual_status(uuid) owner to postgres;
alter function public.crew_onboarding_manual_prepare(uuid,text,uuid,uuid,boolean) owner to postgres;
alter function public.crew_onboarding_manual_capture(uuid,uuid,text) owner to postgres;
alter function public.crew_onboarding_manual_cancel(uuid,uuid,text) owner to postgres;
notify pgrst,'reload schema';
