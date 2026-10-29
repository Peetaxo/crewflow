-- RLS controls which profile may be updated; this guard controls sensitive fields.
-- Keep contact/billing edits and unchanged fields in existing form payloads valid.
create function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Check the effective SQL role, never a JWT role claim or session_user.
  -- Existing postgres-owned onboarding functions/handle_new_user and service
  -- writes must still attach an Auth identity to an existing historical profile.
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'profile_identity_change_forbidden' using errcode = '42501';
  end if;

  if new.hourly_rate is distinct from old.hourly_rate then
    if current_user <> 'authenticated' or auth.uid() is null
      or not (
        public.has_role(auth.uid(), 'crewhead'::public.app_role)
        or public.has_role(auth.uid(), 'coo'::public.app_role)
      ) then
      raise exception 'profile_hourly_rate_change_forbidden' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_sensitive_fields() from public, anon, authenticated, service_role;
create trigger protect_profile_sensitive_fields
before update on public.profiles
for each row execute function public.protect_profile_sensitive_fields();
