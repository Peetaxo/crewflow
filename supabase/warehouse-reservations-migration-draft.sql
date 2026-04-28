begin;

create extension if not exists "pgcrypto";

create table if not exists public.warehouse_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  image_url text,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'CZK',
  price_period_label text,
  quantity_total integer not null default 1 check (quantity_total >= 0),
  owner_client_id uuid references public.clients(id) on delete set null,
  owner_label text,
  status text not null default 'active' check (status in ('active', 'draft', 'maintenance', 'retired')),
  booqable_product_id text unique,
  booqable_product_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  project_job_number text not null,
  event_id uuid references public.events(id) on delete set null,
  event_local_id integer,
  reserved_by_profile_id uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'reserved' check (status in ('draft', 'reserved', 'picked_up', 'returned', 'cancelled')),
  note text,
  total_cents integer not null default 0 check (total_cents >= 0),
  currency text not null default 'CZK',
  booqable_order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_reservations_time_order check (ends_at > starts_at)
);

-- total_cents is an application-calculated price snapshot in this MVP.
-- DB-level aggregate enforcement should be added with the same future RPC/trigger/locking path
-- that prevents overbooking.
-- Overbooking prevention is intentionally deferred to the reservation RPC/locking layer.
create table if not exists public.warehouse_reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.warehouse_reservations(id) on delete cascade,
  warehouse_item_id uuid not null references public.warehouse_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  price_period_label text,
  line_total_cents integer not null check (line_total_cents >= 0),
  item_name_snapshot text not null,
  created_at timestamptz not null default now(),
  constraint warehouse_reservation_items_line_total check (line_total_cents = quantity * unit_price_cents)
);

create index if not exists warehouse_items_status_idx on public.warehouse_items(status);
create index if not exists warehouse_items_booqable_product_id_idx on public.warehouse_items(booqable_product_id);
create index if not exists warehouse_reservations_project_job_number_idx on public.warehouse_reservations(project_job_number);
create index if not exists warehouse_reservations_time_idx on public.warehouse_reservations(starts_at, ends_at);
create index if not exists warehouse_reservation_items_reservation_id_idx on public.warehouse_reservation_items(reservation_id);
create index if not exists warehouse_reservation_items_warehouse_item_id_idx on public.warehouse_reservation_items(warehouse_item_id);

alter table public.warehouse_items enable row level security;
alter table public.warehouse_reservations enable row level security;
alter table public.warehouse_reservation_items enable row level security;

-- First release uses frontend role-gating, so authenticated users can manage warehouse data.
-- RLS remains enabled so DB role scoping can be tightened in a later migration.
drop policy if exists "Authenticated users can read warehouse items" on public.warehouse_items;
create policy "Authenticated users can read warehouse items"
on public.warehouse_items for select
to authenticated
using (true);

drop policy if exists "Authenticated users can manage warehouse items" on public.warehouse_items;
create policy "Authenticated users can manage warehouse items"
on public.warehouse_items for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can read warehouse reservations" on public.warehouse_reservations;
create policy "Authenticated users can read warehouse reservations"
on public.warehouse_reservations for select
to authenticated
using (true);

drop policy if exists "Authenticated users can manage warehouse reservations" on public.warehouse_reservations;
create policy "Authenticated users can manage warehouse reservations"
on public.warehouse_reservations for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can read warehouse reservation items" on public.warehouse_reservation_items;
create policy "Authenticated users can read warehouse reservation items"
on public.warehouse_reservation_items for select
to authenticated
using (true);

drop policy if exists "Authenticated users can manage warehouse reservation items" on public.warehouse_reservation_items;
create policy "Authenticated users can manage warehouse reservation items"
on public.warehouse_reservation_items for all
to authenticated
using (true)
with check (true);

insert into public.warehouse_items (
  id, name, category, image_url, price_cents, currency, price_period_label,
  quantity_total, owner_label, status, booqable_product_id, booqable_product_path
) values
  ('11111111-1111-4111-8111-111111111111', 'mix pult Pioneer DJM 900', 'Zvuk', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/0c40ef9e-a7e6-45c0-8109-9b614dc268fe/1718785126-670191252422062-0028-7678/upload.jpeg', 200000, 'CZK', '1 Den', 1, null, 'active', 'e334ae21-6278-4c02-a95a-81b94e0a8991', '/products/mix-pult-pioneer-djm-900'),
  ('22222222-2222-4222-8222-222222222222', 'Stojan malirsky dreveny', 'Stojan', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/d0b5ab46-a826-425e-bac8-ae8f79a31c1e/1714394775-49287610891557-0010-8723/8291_dreveny-malirsky-stojan-a-dubovy.jpg', 5000, 'CZK', 'Opraveno', 1, null, 'active', 'cfa03f1f-2ee5-4274-8486-930d52f825eb', '/products/stojan-malirsky-dreveny'),
  ('33333333-3333-4333-8333-333333333333', 'Makita DML 805 (venkovni led svetlo)', 'Svetlo', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/681f95e1-d8c8-4051-8572-5a2037787e07/591721213d867e4628e7427d3b478d31.jpg', 5000, 'CZK', '1 Den', 1, null, 'active', '3e16ddb7-5ccc-4430-9300-8d6a8bef82bd', '/products/makita-dml-805-venkovni-led-svetlo'),
  ('44444444-4444-4444-8444-444444444444', 'Stojan - Malirsky A4 !CERNY!', 'Stojan', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/9a9965ad-9dcb-42ea-b990-d8a26b992b1f/upload.webp', 5000, 'CZK', '1 Den', 1, null, 'active', '41547df6-a70e-4937-b70a-1091fa725b38', '/products/stojan-malirsky-a4-cerny'),
  ('55555555-5555-4555-8555-555555555555', 'Backstage - Easy Up 3 x 6m', 'Backstage', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/8fa09471-52b8-4b93-9c24-eb47b0ecf9af/upload.jpeg', 150000, 'CZK', '1 Den', 1, null, 'active', 'cfe344ee-6169-49a6-976d-94ac4f669afc', '/products/backstage-easy-up-3-x-6m'),
  ('66666666-6666-4666-8666-666666666666', 'Mikrovlnna trouba "Tesco"', 'Backstage', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/cc68ccb4-9c55-45c2-a56d-c074d605fe42/upload.jpeg', 10000, 'CZK', '1 Den', 1, null, 'active', '42511243-7569-4773-8ff0-466d1b71033d', '/products/mikrovlnna-trouba-tesco-obrazek-je-pouze-ilustracni'),
  ('77777777-7777-4777-8777-777777777777', 'AKU Tacker DST221S Makita', 'Naradi', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/92017a7b-4f23-4804-83f2-134982be186c/maxresdefault.jpg', 35000, 'CZK', '1 Den', 1, null, 'active', '127c801e-2852-4b23-8772-05f3b16ca761', '/products/aku-tacker-dst221s-makita'),
  ('88888888-8888-4888-8888-888888888888', 'Stojan -malirsky,kovovy', 'Stojan', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/f8c86a4f-38f3-424f-b8df-005aae3a5a92/upload.png', 10000, 'CZK', '1 Den', 1, null, 'active', 'f7f2479e-74f0-4a8f-a82b-e6a697d44b75', '/products/stojan-malirsky-kovovy'),
  ('99999999-9999-4999-8999-999999999999', 'Cable Cross "prejezdy"', 'Kabelaz', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/86114265-cda5-4032-a412-575ca28e94d7/upload.jpeg', 20000, 'CZK', '1 Den', 1, null, 'active', '94d08ab1-5d7d-461a-951c-7963ad6c0c83', '/products/cable-cross-prejezdy'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Regal', 'Vybaveni', 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/b02b1b4a-9923-4e98-9b9f-1a55f17576e7/upload.jpeg', 400000, 'CZK', 'Opraveno', 1, null, 'active', '88da6f0d-feca-4dd6-bbd4-9fbeeb44037a', '/products/regal')
-- Reruns refresh catalog metadata, but intentionally preserve local quantity_total,
-- owner_label, and status edits.
on conflict (booqable_product_id) do update set
  name = excluded.name,
  category = excluded.category,
  image_url = excluded.image_url,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  price_period_label = excluded.price_period_label,
  booqable_product_path = excluded.booqable_product_path,
  updated_at = now();

commit;
