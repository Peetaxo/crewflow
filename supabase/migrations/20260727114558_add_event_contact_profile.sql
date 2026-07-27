alter table public.events
  add column if not exists contact_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_events_contact_profile_id
  on public.events(contact_profile_id);

comment on column public.events.contact_profile_id is
  'Profile selected as the event contact person. contact_person and contact_phone remain readable snapshots for compatibility.';
