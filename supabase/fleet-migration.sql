begin;

do $$
begin
  create type public.fleet_vehicle_status as enum (
    'available',
    'reserved',
    'service',
    'out_of_order'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  plate text not null,
  type text not null,
  status public.fleet_vehicle_status not null default 'available',
  capacity text not null default '',
  inspection_valid_until date not null,
  insurance_valid_until date,
  service_due_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fleet_reservations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  event_id uuid references public.events(id) on delete set null,
  responsible_profile_id uuid not null references public.profiles(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  has_conflict boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_reservations_valid_range check (ends_at > starts_at)
);

create table if not exists public.fleet_vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete cascade,
  file_name text not null,
  storage_path text,
  content_type text,
  size_bytes bigint,
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_fleet_reservations_vehicle_time
  on public.fleet_reservations(vehicle_id, starts_at, ends_at);

create index if not exists idx_fleet_reservations_project
  on public.fleet_reservations(project_id);

create index if not exists idx_fleet_vehicle_documents_vehicle
  on public.fleet_vehicle_documents(vehicle_id);

alter table public.fleet_vehicles enable row level security;
alter table public.fleet_reservations enable row level security;
alter table public.fleet_vehicle_documents enable row level security;

drop policy if exists "Crewhead and COO can read fleet vehicles" on public.fleet_vehicles;
drop policy if exists "Crewhead and COO can manage fleet vehicles" on public.fleet_vehicles;
drop policy if exists "Crewhead and COO can read fleet reservations" on public.fleet_reservations;
drop policy if exists "Crewhead and COO can manage fleet reservations" on public.fleet_reservations;
drop policy if exists "Crewhead and COO can read fleet documents" on public.fleet_vehicle_documents;
drop policy if exists "Crewhead and COO can manage fleet documents" on public.fleet_vehicle_documents;

create policy "Crewhead and COO can read fleet vehicles"
  on public.fleet_vehicles
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  );

create policy "Crewhead and COO can manage fleet vehicles"
  on public.fleet_vehicles
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  )
  with check (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  );

create policy "Crewhead and COO can read fleet reservations"
  on public.fleet_reservations
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  );

create policy "Crewhead and COO can manage fleet reservations"
  on public.fleet_reservations
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  )
  with check (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  );

create policy "Crewhead and COO can read fleet documents"
  on public.fleet_vehicle_documents
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  );

create policy "Crewhead and COO can manage fleet documents"
  on public.fleet_vehicle_documents
  for all
  to authenticated
  using (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  )
  with check (
    public.has_role(auth.uid(), 'crewhead'::public.app_role)
    or public.has_role(auth.uid(), 'coo'::public.app_role)
  );

comment on table public.fleet_vehicles is
  'Vehicle registry for operational fleet planning.';

comment on table public.fleet_reservations is
  'Fleet reservations linked to vehicle, project, optional event, and responsible profile.';

comment on table public.fleet_vehicle_documents is
  'Metadata for documents related to a vehicle. Storage upload is handled separately.';

insert into public.fleet_vehicles (
  slug,
  name,
  plate,
  type,
  status,
  capacity,
  inspection_valid_until,
  insurance_valid_until,
  service_due_at,
  note
)
values
  ('crafter-1', 'Crafter 1', '4AK 1234', 'Dodavka 12 m3', 'available', '3 mista / 12 m3', '2026-05-11', '2026-11-30', '2026-07-15', 'Hlavni dodavka pro vetsi instalace.'),
  ('transit-1', 'Transit 1', '5AX 7788', 'Dodavka 9 m3', 'available', '3 mista / 9 m3', '2026-08-20', '2026-12-10', '2026-06-30', 'Univerzalni auto pro mensi projekty.'),
  ('octavia-1', 'Octavia 1', '6AB 2020', 'Osobni', 'available', '5 mist', '2027-02-15', '2026-10-01', '2026-09-01', 'Produkcni auto.'),
  ('octavia-2', 'Octavia 2', '7AC 4040', 'Osobni', 'service', '5 mist', '2026-12-01', '2026-12-01', '2026-04-30', 'Aktualne v servisu.'),
  ('trailer-1', 'Vozik 1', '1AZ 9090', 'Vozik', 'available', '750 kg', '2026-06-05', '2027-01-01', '2026-08-01', 'Brzdeny vozik pro material.'),
  ('sprinter-1', 'Sprinter', '2AS 5656', 'Dodavka 14 m3', 'available', '3 mista / 14 m3', '2026-09-12', '2027-02-01', '2026-06-20', 'Vetsi dodavka pro scenografii.'),
  ('pickup-1', 'Pickup', '8AP 3131', 'Pickup', 'available', '5 mist / korba', '2026-10-05', '2027-03-01', '2026-10-01', 'Vhodne pro venkovni akce.'),
  ('van-crew', 'Crew Van', '9AV 1111', 'Minibus', 'available', '8 mist', '2026-07-18', '2026-12-18', '2026-06-18', 'Prevoz crew.')
on conflict (slug) do update
set
  name = excluded.name,
  plate = excluded.plate,
  type = excluded.type,
  capacity = excluded.capacity,
  inspection_valid_until = excluded.inspection_valid_until,
  insurance_valid_until = excluded.insurance_valid_until,
  service_due_at = excluded.service_due_at,
  note = excluded.note,
  updated_at = now();

commit;
