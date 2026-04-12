begin;

alter table public.profiles
  add column if not exists reliable boolean not null default false,
  add column if not exists rating numeric(2,1);

alter table public.profiles
  drop constraint if exists profiles_rating_range;

alter table public.profiles
  add constraint profiles_rating_range
  check (rating is null or (rating >= 1.0 and rating <= 5.0));

comment on column public.profiles.reliable is
  'Jednoduchy interni tag: je tento clen crew povazovan za spolehliveho?';

comment on column public.profiles.rating is
  'Ciselne hodnoceni clena crew na skale 1.0 az 5.0.';

comment on column public.profiles.reliability is
  'Puvodni pole. Docasne ponechano kvuli prechodu na nova pole reliable + rating.';

alter table public.events
  alter column day_types set default '{}'::jsonb,
  alter column phase_schedules set default '{}'::jsonb;

comment on column public.events.day_types is
  'Mapa datum -> typ dne, napr. {"2026-04-10":"instal"}.';

comment on column public.events.phase_schedules is
  'Mapa typ -> pole slotu, napr. {"instal":[...],"provoz":[...]}.';

commit;
