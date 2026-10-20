-- Local opt-in pilot. Invitations are capabilities; no Auth user exists before completion.
create schema if not exists crew_onboarding_private;
revoke all on schema crew_onboarding_private from public, anon, authenticated;

create table crew_onboarding_private.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  -- Retain reserved UUID tombstones after normal crew deletion. Cascading invitations
  -- away would let a delayed Auth insert use the unrelated-user legacy path.
  profile_id uuid references public.profiles(id) on delete set null,
  email text not null check (email = lower(btrim(email))),
  reserved_user_id uuid not null unique,
  state text not null default 'pending' check (state in ('pending','claiming','consumed','revoked')),
  claim_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  claimed_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz
);
create unique index crew_onboarding_one_current_invite on crew_onboarding_private.invitations(profile_id) where state in ('pending','claiming');
alter table crew_onboarding_private.invitations enable row level security;
revoke all on crew_onboarding_private.invitations from public, anon, authenticated, service_role;

-- This table is written only by a service-only claim RPC. User metadata is never trusted.
create table crew_onboarding_private.trusted_intents (
  reserved_user_id uuid primary key,
  invitation_id uuid not null unique references crew_onboarding_private.invitations(id),
  email text not null,
  claim_id uuid not null,
  created_at timestamptz not null default now()
);
alter table crew_onboarding_private.trusted_intents enable row level security;
revoke all on crew_onboarding_private.trusted_intents from public, anon, authenticated, service_role;

create function crew_onboarding_private.protect_invitation_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email
     or (new.profile_id is distinct from old.profile_id and not (
       new.profile_id is null and old.profile_id is not null
       and pg_catalog.pg_trigger_depth()>1
       and not exists(select 1 from public.profiles p where p.id=old.profile_id)
     ))
     or new.reserved_user_id is distinct from old.reserved_user_id or new.token_hash is distinct from old.token_hash then
    raise exception 'invitation_identity_immutable' using errcode='23514';
  end if;
  return new;
end $$;
create trigger crew_onboarding_identity_immutable before update on crew_onboarding_private.invitations
for each row execute function crew_onboarding_private.protect_invitation_identity();
revoke all on function crew_onboarding_private.protect_invitation_identity() from public, anon, authenticated;

create function public.crew_onboarding_create(p_email text, p_first_name text default '', p_last_name text default '', p_phone text default null, p_profile_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email)); v_profile public.profiles%rowtype;
  v_token text; v_expiry timestamptz; v_count integer;
begin
  if v_email is null or length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(coalesce(p_first_name,''))>200 or length(coalesce(p_last_name,''))>200 or length(coalesce(p_phone,''))>100 then
    return jsonb_build_object('error','invalid_invitation');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 714802));
  if exists(select 1 from auth.users u where lower(btrim(u.email))=v_email) then return jsonb_build_object('error','already_active'); end if;
  select count(*) into v_count from public.profiles p where lower(btrim(p.email))=v_email;
  if p_profile_id is null then
    -- A matching imported profile must be selected explicitly; identity is never inferred.
    if v_count<>0 then return jsonb_build_object('error','invalid_invitation'); end if;
    insert into public.profiles(user_id,email,first_name,last_name,phone,hourly_rate)
      values(null,v_email,coalesce(p_first_name,''),coalesce(p_last_name,''),p_phone,250) returning * into v_profile;
  else
    select * into v_profile from public.profiles p where p.id=p_profile_id for update;
    if not found or v_count<>1 or v_profile.user_id is not null or lower(btrim(v_profile.email)) is distinct from v_email then return jsonb_build_object('error','invalid_invitation'); end if;
  end if;
  update crew_onboarding_private.invitations set state='revoked',revoked_at=clock_timestamp()
    where profile_id=v_profile.id and state in ('pending','claiming');
  delete from crew_onboarding_private.trusted_intents t using crew_onboarding_private.invitations i where t.invitation_id=i.id and i.profile_id=v_profile.id;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_expiry := clock_timestamp()+interval '48 hours';
  insert into crew_onboarding_private.invitations(token_hash,profile_id,email,reserved_user_id,expires_at)
    values(encode(extensions.digest(v_token,'sha256'),'hex'),v_profile.id,v_email,gen_random_uuid(),v_expiry);
  -- The raw token is returned once to the authorized invitation sender and never stored.
  return jsonb_build_object('token',v_token,'profileId',v_profile.id,'email',v_email,'expiresAt',v_expiry);
end $$;

create function public.crew_onboarding_preview(p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare i crew_onboarding_private.invitations%rowtype; p public.profiles%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','invalid_invitation'); end if;
  select * into i from crew_onboarding_private.invitations where token_hash=p_token_hash;
  if not found or i.state='revoked' or i.profile_id is null then return jsonb_build_object('error','invalid_invitation'); end if;
  if i.state='consumed' then return jsonb_build_object('error','already_active'); end if;
  if i.expires_at<=statement_timestamp() then return jsonb_build_object('error','expired_invitation'); end if;
  select * into p from public.profiles where id=i.profile_id;
  if not found or p.user_id is not null or lower(btrim(p.email)) is distinct from i.email
     or (select count(*) from public.profiles p2 where lower(btrim(p2.email))=i.email)<>1
     or exists(select 1 from auth.users u where lower(btrim(u.email))=i.email) then return jsonb_build_object('error','invalid_invitation'); end if;
  if i.state='claiming' then return jsonb_build_object('error','activation_in_progress'); end if;
  return jsonb_build_object('email',i.email,'firstName',p.first_name,'lastName',p.last_name,'phone',coalesce(p.phone,''),'expiresAt',i.expires_at);
end $$;

create function public.crew_onboarding_claim(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i crew_onboarding_private.invitations%rowtype; p public.profiles%rowtype; v_email text; v_claim uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','invalid_invitation'); end if;
  select email into v_email from crew_onboarding_private.invitations where token_hash=p_token_hash;
  if not found then return jsonb_build_object('error','invalid_invitation'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,714802));
  select * into i from crew_onboarding_private.invitations where token_hash=p_token_hash for update;
  if i.state='revoked' or i.profile_id is null then return jsonb_build_object('error','invalid_invitation'); end if;
  if i.state='consumed' then return jsonb_build_object('error','already_active'); end if;
  if i.expires_at<=clock_timestamp() then return jsonb_build_object('error','expired_invitation'); end if;
  if i.state='claiming' then return jsonb_build_object('error','activation_in_progress'); end if;
  select * into p from public.profiles where id=i.profile_id for update;
  if not found or p.user_id is not null or lower(btrim(p.email)) is distinct from i.email
     or (select count(*) from public.profiles p2 where lower(btrim(p2.email))=i.email)<>1
     or exists(select 1 from auth.users u where lower(btrim(u.email))=i.email) then return jsonb_build_object('error','invalid_invitation'); end if;
  v_claim := gen_random_uuid();
  update crew_onboarding_private.invitations set state='claiming',claim_id=v_claim,claimed_at=clock_timestamp() where id=i.id;
  insert into crew_onboarding_private.trusted_intents(reserved_user_id,invitation_id,email,claim_id) values(i.reserved_user_id,i.id,i.email,v_claim);
  return jsonb_build_object('email',i.email,'firstName',p.first_name,'lastName',p.last_name,'phone',coalesce(p.phone,''),'expiresAt',i.expires_at,'reservedUserId',i.reserved_user_id,'profileId',i.profile_id,'claimId',v_claim);
end $$;

create function public.crew_onboarding_verify(p_token_hash text,p_reserved_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare i crew_onboarding_private.invitations%rowtype;
begin
  select * into i from crew_onboarding_private.invitations where token_hash=p_token_hash and reserved_user_id=p_reserved_user_id;
  if found and i.state='consumed' and exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id where p.id=i.profile_id and p.user_id=i.reserved_user_id and lower(btrim(p.email))=i.email and u.email=i.email)
     and (select count(*) from public.user_roles r where r.user_id=i.reserved_user_id)=1
     and exists(select 1 from public.user_roles r where r.user_id=i.reserved_user_id and r.role='crew')
     and not exists(select 1 from crew_onboarding_private.trusted_intents t where t.invitation_id=i.id) then
    return jsonb_build_object('status','active','email',i.email,'profileId',i.profile_id);
  end if;
  return jsonb_build_object('error','activation_unavailable');
end $$;

-- Only use after a definitive Auth rejection AND a reserved-user 404. Never release an ambiguous request.
create function public.crew_onboarding_release(p_token_hash text,p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i crew_onboarding_private.invitations%rowtype; v_email text;
begin
  select email into v_email from crew_onboarding_private.invitations where token_hash=p_token_hash;
  if not found then return jsonb_build_object('error','invalid_invitation'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,714802));
  select * into i from crew_onboarding_private.invitations where token_hash=p_token_hash for update;
  if i.state='claiming' and i.profile_id is not null and i.claim_id=p_claim_id and not exists(select 1 from auth.users u where u.id=i.reserved_user_id) then
    delete from crew_onboarding_private.trusted_intents where invitation_id=i.id and claim_id=p_claim_id;
    update crew_onboarding_private.invitations set state='pending',claim_id=null,claimed_at=null where id=i.id;
    return jsonb_build_object('status','released');
  end if;
  return jsonb_build_object('error','activation_unavailable');
end $$;

create function public.crew_onboarding_cancel(p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text; v_changed integer;
begin
  select email into v_email from crew_onboarding_private.invitations where profile_id=p_profile_id and state in ('pending','claiming');
  if not found then return jsonb_build_object('error','invalid_invitation'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,714802));
  update crew_onboarding_private.invitations set state='revoked',revoked_at=clock_timestamp() where profile_id=p_profile_id and state in ('pending','claiming');
  get diagnostics v_changed = row_count;
  if v_changed=0 then
    if exists(select 1 from crew_onboarding_private.invitations where profile_id=p_profile_id and state='consumed') then return jsonb_build_object('error','already_active'); end if;
    return jsonb_build_object('error','invalid_invitation');
  end if;
  delete from crew_onboarding_private.trusted_intents t using crew_onboarding_private.invitations i where t.invitation_id=i.id and i.profile_id=p_profile_id;
  return jsonb_build_object('status','revoked');
end $$;

-- Keep the existing unrelated-user path. Only a PRIVATE trusted intent may bind an existing profile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare i crew_onboarding_private.invitations%rowtype; p public.profiles%rowtype; v_email text;
begin
  select email into v_email from crew_onboarding_private.invitations where reserved_user_id=new.id;
  if found then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email,714802));
    select * into i from crew_onboarding_private.invitations where reserved_user_id=new.id for update;
    if i.profile_id is null or i.state<>'claiming' or i.expires_at<=clock_timestamp() or new.email is distinct from i.email
       or not exists(select 1 from crew_onboarding_private.trusted_intents t where t.invitation_id=i.id and t.reserved_user_id=new.id and t.email=new.email and t.claim_id=i.claim_id) then
      raise exception 'invalid_onboarding_intent' using errcode='23514';
    end if;
    select * into p from public.profiles where id=i.profile_id for update;
    if not found or p.user_id is not null or lower(btrim(p.email)) is distinct from i.email
       or (select count(*) from public.profiles p2 where lower(btrim(p2.email))=i.email)<>1 then
      raise exception 'invalid_onboarding_binding' using errcode='23514';
    end if;
    update public.profiles set user_id=new.id where id=i.profile_id;
    insert into public.user_roles(user_id,role) values(new.id,'crew');
    update crew_onboarding_private.invitations set state='consumed',consumed_at=clock_timestamp() where id=i.id;
    delete from crew_onboarding_private.trusted_intents where invitation_id=i.id;
  else
    insert into public.profiles(user_id,email,first_name,last_name)
      values(new.id,new.email,coalesce(new.raw_user_meta_data->>'first_name',''),coalesce(new.raw_user_meta_data->>'last_name',''));
    insert into public.user_roles(user_id,role) values(new.id,'crew');
  end if;
  return new;
end $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
-- Also supports a schema-only local restore where triggers in the auth schema were omitted.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

revoke all on function public.crew_onboarding_create(text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.crew_onboarding_preview(text) from public,anon,authenticated;
revoke all on function public.crew_onboarding_claim(text) from public,anon,authenticated;
revoke all on function public.crew_onboarding_verify(text,uuid) from public,anon,authenticated;
revoke all on function public.crew_onboarding_release(text,uuid) from public,anon,authenticated;
revoke all on function public.crew_onboarding_cancel(uuid) from public,anon,authenticated;
grant execute on function public.crew_onboarding_create(text,text,text,text,uuid) to service_role;
grant execute on function public.crew_onboarding_preview(text) to service_role;
grant execute on function public.crew_onboarding_claim(text) to service_role;
grant execute on function public.crew_onboarding_verify(text,uuid) to service_role;
grant execute on function public.crew_onboarding_release(text,uuid) to service_role;
grant execute on function public.crew_onboarding_cancel(uuid) to service_role;
-- Supabase migrations normally run as postgres. Keep the same owner when a disposable
-- schema-only restore requires supabase_admin, so the existing postgres-owned Auth
-- trigger can access its private intent tables without broad grants.
alter schema crew_onboarding_private owner to postgres;
alter table crew_onboarding_private.invitations owner to postgres;
alter table crew_onboarding_private.trusted_intents owner to postgres;
alter function crew_onboarding_private.protect_invitation_identity() owner to postgres;
alter function public.crew_onboarding_create(text,text,text,text,uuid) owner to postgres;
alter function public.crew_onboarding_preview(text) owner to postgres;
alter function public.crew_onboarding_claim(text) owner to postgres;
alter function public.crew_onboarding_verify(text,uuid) owner to postgres;
alter function public.crew_onboarding_release(text,uuid) owner to postgres;
alter function public.crew_onboarding_cancel(uuid) owner to postgres;
notify pgrst,'reload schema';
