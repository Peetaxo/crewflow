alter table public.events
  add column if not exists address text,
  add column if not exists place_id text,
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision;

update public.events
set address = city
where address is null
  and city is not null
  and length(trim(city)) > 0;
