# Warehouse Reservations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable `Sklad` module with Supabase-ready warehouse tables, ten imported Booqable seed items, a local fallback service, an image catalog, and cart-based internal reservations for projects/events.

**Architecture:** Add a focused warehouse domain slice: shared types, local seed state, a feature service that hides Supabase/local fallback details, and a `WarehouseView` that owns catalog filters and cart draft state. Supabase is modelled first through a migration draft; the UI can still run locally when Supabase is unavailable.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Supabase SQL, Supabase JS, lucide-react, sonner, existing local app state service.

---

## File Structure

- Create `supabase/warehouse-reservations-migration-draft.sql`: warehouse tables, indexes, RLS, and seed inserts for the first ten Booqable items.
- Modify `src/types.ts`: warehouse item, reservation, reservation line, draft, and status types.
- Modify `src/data.ts`: `INITIAL_WAREHOUSE_ITEMS` and `INITIAL_WAREHOUSE_RESERVATIONS`.
- Modify `src/lib/app-data.ts`: include warehouse arrays in local snapshots and Supabase app snapshot.
- Create `src/features/warehouse/services/warehouse.service.ts`: derived catalog rows, conflict checks, local writes, Supabase read/write hooks prepared behind the same interface.
- Create `src/features/warehouse/services/warehouse.service.test.ts`: service coverage for availability, totals, validation, and price snapshots.
- Create `src/views/WarehouseView.tsx`: image catalog, filters, project/event/date selectors, cart panel, and reservation submit.
- Create `src/views/WarehouseView.test.tsx`: view coverage for catalog rendering, cart add, validation, and conflicts.
- Modify `src/constants.ts`: sidebar navigation item and role visibility.
- Modify `src/components/layout/AppLayout.tsx`: render `WarehouseView`.
- Modify `src/components/layout/AppLayout.test.tsx`: layout coverage for the warehouse tab.
- Modify `src/constants.test.ts`: role navigation coverage for `warehouse`.

## Task 1: Supabase Migration Draft

**Files:**
- Create: `supabase/warehouse-reservations-migration-draft.sql`

- [ ] **Step 1: Create the migration file with table definitions**

Use `apply_patch` to create `supabase/warehouse-reservations-migration-draft.sql` with this SQL:

```sql
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

create table if not exists public.warehouse_reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.warehouse_reservations(id) on delete cascade,
  warehouse_item_id uuid not null references public.warehouse_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  price_period_label text,
  line_total_cents integer not null check (line_total_cents >= 0),
  item_name_snapshot text not null,
  created_at timestamptz not null default now()
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
```

- [ ] **Step 2: Add operational RLS policies**

Append these policies to the same migration. They intentionally allow authenticated users for the first release, matching the current frontend role-gated app, while keeping RLS enabled for later tightening.

```sql
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
```

- [ ] **Step 3: Add idempotent seed items**

Append seed inserts for all ten Booqable items. Use fixed UUIDs so local docs, tests, and remote seed data can agree.

```sql
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
on conflict (booqable_product_id) do update set
  name = excluded.name,
  category = excluded.category,
  image_url = excluded.image_url,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  price_period_label = excluded.price_period_label,
  booqable_product_path = excluded.booqable_product_path,
  updated_at = now();
```

- [ ] **Step 4: Verify SQL syntax locally**

Run:

```bash
supabase db lint --linked
```

Expected: either lint passes, or the CLI reports that linked remote access is not available in this session. If remote access is unavailable, continue with app implementation and ask the human to run the same command from the terminal where `supabase projects list` succeeds.

- [ ] **Step 5: Commit the migration draft**

```bash
git add supabase/warehouse-reservations-migration-draft.sql
git commit -m "feat: add warehouse database draft"
```

## Task 2: Warehouse Domain Types And Local Seed Data

**Files:**
- Modify: `src/types.ts`
- Modify: `src/data.ts`
- Modify: `src/lib/app-data.ts`

- [ ] **Step 1: Add warehouse types**

Append these types to `src/types.ts` near the other operational domain types:

```ts
export type WarehouseItemStatus = 'active' | 'draft' | 'maintenance' | 'retired';
export type WarehouseReservationStatus = 'draft' | 'reserved' | 'picked_up' | 'returned' | 'cancelled';

export interface WarehouseItem {
  id: string;
  name: string;
  category: string | null;
  description?: string | null;
  imageUrl: string | null;
  priceCents: number;
  currency: 'CZK';
  pricePeriodLabel: string | null;
  quantityTotal: number;
  ownerClientId?: string | null;
  ownerLabel?: string | null;
  status: WarehouseItemStatus;
  booqableProductId?: string | null;
  booqableProductPath?: string | null;
}

export interface WarehouseReservationItem {
  id: string;
  reservationId: string;
  warehouseItemId: string;
  quantity: number;
  unitPriceCents: number;
  pricePeriodLabel: string | null;
  lineTotalCents: number;
  itemNameSnapshot: string;
}

export interface WarehouseReservation {
  id: string;
  projectId?: string | null;
  projectJobNumber: string;
  eventId?: string | null;
  eventLocalId?: number | null;
  reservedByProfileId?: string | null;
  startsAt: string;
  endsAt: string;
  status: WarehouseReservationStatus;
  note: string;
  totalCents: number;
  currency: 'CZK';
  booqableOrderId?: string | null;
  items: WarehouseReservationItem[];
}

export interface WarehouseCartItemDraft {
  warehouseItemId: string;
  quantity: number;
}

export interface WarehouseReservationDraft {
  projectJobNumber: string;
  projectId?: string | null;
  eventId?: string | null;
  eventLocalId?: number | null;
  reservedByProfileId?: string | null;
  startsAt: string;
  endsAt: string;
  note: string;
  items: WarehouseCartItemDraft[];
}
```

- [ ] **Step 2: Add data imports**

Update the import at the top of `src/data.ts` to include warehouse types:

```ts
import {
  Event,
  Contractor,
  Timelog,
  Invoice,
  Candidate,
  Project,
  Client,
  ReceiptItem,
  FleetReservation,
  FleetVehicle,
  WarehouseItem,
  WarehouseReservation,
} from './types';
```

- [ ] **Step 3: Add local warehouse seed constants**

Add `INITIAL_WAREHOUSE_ITEMS` and `INITIAL_WAREHOUSE_RESERVATIONS` near the other `INITIAL_*` exports in `src/data.ts`. Use the same ten IDs and values from Task 1, converted to camelCase:

```ts
export const INITIAL_WAREHOUSE_ITEMS: WarehouseItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'mix pult Pioneer DJM 900',
    category: 'Zvuk',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/0c40ef9e-a7e6-45c0-8109-9b614dc268fe/1718785126-670191252422062-0028-7678/upload.jpeg',
    priceCents: 200000,
    currency: 'CZK',
    pricePeriodLabel: '1 Den',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: 'e334ae21-6278-4c02-a95a-81b94e0a8991',
    booqableProductPath: '/products/mix-pult-pioneer-djm-900',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Stojan malirsky dreveny',
    category: 'Stojan',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/d0b5ab46-a826-425e-bac8-ae8f79a31c1e/1714394775-49287610891557-0010-8723/8291_dreveny-malirsky-stojan-a-dubovy.jpg',
    priceCents: 5000,
    currency: 'CZK',
    pricePeriodLabel: 'Opraveno',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: 'cfa03f1f-2ee5-4274-8486-930d52f825eb',
    booqableProductPath: '/products/stojan-malirsky-dreveny',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Makita DML 805 (venkovni led svetlo)',
    category: 'Svetlo',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/681f95e1-d8c8-4051-8572-5a2037787e07/591721213d867e4628e7427d3b478d31.jpg',
    priceCents: 5000,
    currency: 'CZK',
    pricePeriodLabel: '1 Den',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: '3e16ddb7-5ccc-4430-9300-8d6a8bef82bd',
    booqableProductPath: '/products/makita-dml-805-venkovni-led-svetlo',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Stojan - Malirsky A4 !CERNY!',
    category: 'Stojan',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/9a9965ad-9dcb-42ea-b990-d8a26b992b1f/upload.webp',
    priceCents: 5000,
    currency: 'CZK',
    pricePeriodLabel: '1 Den',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: '41547df6-a70e-4937-b70a-1091fa725b38',
    booqableProductPath: '/products/stojan-malirsky-a4-cerny',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Backstage - Easy Up 3 x 6m',
    category: 'Backstage',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/8fa09471-52b8-4b93-9c24-eb47b0ecf9af/upload.jpeg',
    priceCents: 150000,
    currency: 'CZK',
    pricePeriodLabel: '1 Den',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: 'cfe344ee-6169-49a6-976d-94ac4f669afc',
    booqableProductPath: '/products/backstage-easy-up-3-x-6m',
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'Mikrovlnna trouba "Tesco"',
    category: 'Backstage',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/cc68ccb4-9c55-45c2-a56d-c074d605fe42/upload.jpeg',
    priceCents: 10000,
    currency: 'CZK',
    pricePeriodLabel: '1 Den',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: '42511243-7569-4773-8ff0-466d1b71033d',
    booqableProductPath: '/products/mikrovlnna-trouba-tesco-obrazek-je-pouze-ilustracni',
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    name: 'AKU Tacker DST221S Makita',
    category: 'Naradi',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/92017a7b-4f23-4804-83f2-134982be186c/maxresdefault.jpg',
    priceCents: 35000,
    currency: 'CZK',
    pricePeriodLabel: '1 Den',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: '127c801e-2852-4b23-8772-05f3b16ca761',
    booqableProductPath: '/products/aku-tacker-dst221s-makita',
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    name: 'Stojan -malirsky,kovovy',
    category: 'Stojan',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/f8c86a4f-38f3-424f-b8df-005aae3a5a92/upload.png',
    priceCents: 10000,
    currency: 'CZK',
    pricePeriodLabel: '1 Den',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: 'f7f2479e-74f0-4a8f-a82b-e6a697d44b75',
    booqableProductPath: '/products/stojan-malirsky-kovovy',
  },
  {
    id: '99999999-9999-4999-8999-999999999999',
    name: 'Cable Cross "prejezdy"',
    category: 'Kabelaz',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/86114265-cda5-4032-a412-575ca28e94d7/upload.jpeg',
    priceCents: 20000,
    currency: 'CZK',
    pricePeriodLabel: '1 Den',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: '94d08ab1-5d7d-461a-951c-7963ad6c0c83',
    booqableProductPath: '/products/cable-cross-prejezdy',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Regal',
    category: 'Vybaveni',
    imageUrl: 'https://images.booqablecdn.com/w500/uploads/64d9181153af5ebc841e02c68b6c8c06/photo/photo/b02b1b4a-9923-4e98-9b9f-1a55f17576e7/upload.jpeg',
    priceCents: 400000,
    currency: 'CZK',
    pricePeriodLabel: 'Opraveno',
    quantityTotal: 1,
    ownerClientId: null,
    ownerLabel: null,
    status: 'active',
    booqableProductId: '88da6f0d-feca-4dd6-bbd4-9fbeeb44037a',
    booqableProductPath: '/products/regal',
  },
];

export const INITIAL_WAREHOUSE_RESERVATIONS: WarehouseReservation[] = [];
```

- [ ] **Step 4: Wire local app data and Supabase bootstrap**

In `src/lib/app-data.ts`, import `INITIAL_WAREHOUSE_ITEMS`, `INITIAL_WAREHOUSE_RESERVATIONS`, `WarehouseItem`, and `WarehouseReservation`. Add these fields to `AppDataSnapshot`:

```ts
warehouseItems: WarehouseItem[];
warehouseReservations: WarehouseReservation[];
```

Add them to `localAppState` and `getLocalAppData()`:

```ts
warehouseItems: INITIAL_WAREHOUSE_ITEMS,
warehouseReservations: INITIAL_WAREHOUSE_RESERVATIONS,
```

In `getSupabaseAppData()`, query warehouse tables through a narrow untyped Supabase client until generated database types are refreshed. Add these queries to the existing `Promise.all`:

```ts
const supabaseUntyped = supabase as NonNullable<typeof supabase> & {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
};

const [
  clientsResult,
  projectsResult,
  profilesResult,
  eventsResult,
  timelogsResult,
  timelogDaysResult,
  invoicesResult,
  receiptsResult,
  candidatesResult,
  warehouseItemsResult,
  warehouseReservationsResult,
  warehouseReservationItemsResult,
] = await Promise.all([
  supabase.from('clients').select('*').order('name'),
  supabase.from('projects').select('*').order('job_number'),
  supabase.from('profiles').select('*').order('last_name').order('first_name'),
  supabase.from('events').select('*').order('date_from').order('name'),
  supabase.from('timelogs').select('*').order('created_at'),
  supabase.from('timelog_days').select('*').order('date'),
  supabase.from('invoices').select('*').order('created_at'),
  supabase.from('receipts').select('*').order('created_at'),
  supabase.from('candidates').select('*').order('created_at'),
  supabaseUntyped.from('warehouse_items').select('*').order('name'),
  supabaseUntyped.from('warehouse_reservations').select('*').order('starts_at'),
  supabaseUntyped.from('warehouse_reservation_items').select('*').order('created_at'),
]);
```

Add local row types and mappers inside `src/lib/app-data.ts` near the other Supabase mapping logic:

```ts
interface WarehouseItemRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  currency: 'CZK';
  price_period_label: string | null;
  quantity_total: number;
  owner_client_id: string | null;
  owner_label: string | null;
  status: WarehouseItem['status'];
  booqable_product_id: string | null;
  booqable_product_path: string | null;
}

interface WarehouseReservationRow {
  id: string;
  project_id: string | null;
  project_job_number: string;
  event_id: string | null;
  event_local_id: number | null;
  reserved_by_profile_id: string | null;
  starts_at: string;
  ends_at: string;
  status: WarehouseReservation['status'];
  note: string | null;
  total_cents: number;
  currency: 'CZK';
  booqable_order_id: string | null;
}

interface WarehouseReservationItemRow {
  id: string;
  reservation_id: string;
  warehouse_item_id: string;
  quantity: number;
  unit_price_cents: number;
  price_period_label: string | null;
  line_total_cents: number;
  item_name_snapshot: string;
}

const mapWarehouseItem = (row: WarehouseItemRow): WarehouseItem => ({
  id: row.id,
  name: row.name,
  category: row.category,
  description: row.description,
  imageUrl: row.image_url,
  priceCents: row.price_cents,
  currency: row.currency,
  pricePeriodLabel: row.price_period_label,
  quantityTotal: row.quantity_total,
  ownerClientId: row.owner_client_id,
  ownerLabel: row.owner_label,
  status: row.status,
  booqableProductId: row.booqable_product_id,
  booqableProductPath: row.booqable_product_path,
});

const mapWarehouseReservationItem = (row: WarehouseReservationItemRow): WarehouseReservationItem => ({
  id: row.id,
  reservationId: row.reservation_id,
  warehouseItemId: row.warehouse_item_id,
  quantity: row.quantity,
  unitPriceCents: row.unit_price_cents,
  pricePeriodLabel: row.price_period_label,
  lineTotalCents: row.line_total_cents,
  itemNameSnapshot: row.item_name_snapshot,
});
```

After existing Supabase rows are mapped, group reservation lines and return warehouse data from Supabase when present:

```ts
const warehouseItemRows = (warehouseItemsResult.data ?? []) as WarehouseItemRow[];
const warehouseReservationRows = (warehouseReservationsResult.data ?? []) as WarehouseReservationRow[];
const warehouseReservationItemRows = (warehouseReservationItemsResult.data ?? []) as WarehouseReservationItemRow[];
const warehouseReservationItemsByReservationId = new Map<string, WarehouseReservationItem[]>();

warehouseReservationItemRows.forEach((row) => {
  const current = warehouseReservationItemsByReservationId.get(row.reservation_id) ?? [];
  current.push(mapWarehouseReservationItem(row));
  warehouseReservationItemsByReservationId.set(row.reservation_id, current);
});

const warehouseItems = warehouseItemRows.map(mapWarehouseItem);
const warehouseReservations = warehouseReservationRows.map((row): WarehouseReservation => ({
  id: row.id,
  projectId: row.project_id,
  projectJobNumber: row.project_job_number,
  eventId: row.event_id,
  eventLocalId: row.event_local_id,
  reservedByProfileId: row.reserved_by_profile_id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  status: row.status,
  note: row.note ?? '',
  totalCents: row.total_cents,
  currency: row.currency,
  booqableOrderId: row.booqable_order_id,
  items: warehouseReservationItemsByReservationId.get(row.id) ?? [],
}));
```

Add the three warehouse results to the existing `results` array used for error handling:

```ts
const results = [
  clientsResult,
  projectsResult,
  profilesResult,
  eventsResult,
  timelogsResult,
  timelogDaysResult,
  invoicesResult,
  receiptsResult,
  candidatesResult,
  warehouseItemsResult,
  warehouseReservationsResult,
  warehouseReservationItemsResult,
];
```

In the final `return` object from `getSupabaseAppData()`, return the mapped Supabase values:

```ts
warehouseItems,
warehouseReservations,
```

- [ ] **Step 5: Run type checks through tests**

Run:

```bash
npm test -- src/test/example.test.ts
```

Expected: PASS. This catches TypeScript compile errors through Vitest before service work begins.

- [ ] **Step 6: Commit domain and seed data**

```bash
git add src/types.ts src/data.ts src/lib/app-data.ts
git commit -m "feat: add warehouse domain seed data"
```

## Task 3: Warehouse Service With Tests

**Files:**
- Create: `src/features/warehouse/services/warehouse.service.ts`
- Create: `src/features/warehouse/services/warehouse.service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/features/warehouse/services/warehouse.service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

import {
  createWarehouseReservation,
  findWarehouseReservationConflicts,
  getWarehouseCatalogRows,
  getWarehouseDependencies,
} from './warehouse.service';

describe('warehouse service', () => {
  it('returns imported Booqable items as catalog rows', () => {
    const rows = getWarehouseCatalogRows({
      startsAt: '2026-05-02T09:00',
      endsAt: '2026-05-02T18:00',
    });

    expect(rows).toHaveLength(10);
    expect(rows[0].item.name).toBe('mix pult Pioneer DJM 900');
    expect(rows[0].availableQuantity).toBe(1);
    expect(rows[0].isAvailable).toBe(true);
  });

  it('blocks a reservation quantity above available count', async () => {
    await expect(createWarehouseReservation({
      projectJobNumber: 'TEST001',
      projectId: 'TEST001',
      eventLocalId: 1,
      startsAt: '2026-05-02T09:00',
      endsAt: '2026-05-02T18:00',
      note: '',
      items: [{ warehouseItemId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
    })).rejects.toThrow('Pozadovane mnozstvi neni dostupne.');
  });

  it('snapshots item names and prices into reservation lines', async () => {
    const saved = await createWarehouseReservation({
      projectJobNumber: 'TEST001',
      projectId: 'TEST001',
      eventLocalId: 1,
      startsAt: '2026-05-03T09:00',
      endsAt: '2026-05-03T18:00',
      note: 'Test skladu',
      items: [{ warehouseItemId: '33333333-3333-4333-8333-333333333333', quantity: 1 }],
    });

    expect(saved.totalCents).toBe(5000);
    expect(saved.items[0]).toMatchObject({
      warehouseItemId: '33333333-3333-4333-8333-333333333333',
      itemNameSnapshot: 'Makita DML 805 (venkovni led svetlo)',
      unitPriceCents: 5000,
      lineTotalCents: 5000,
    });
  });

  it('finds conflicts for overlapping reservations', async () => {
    await createWarehouseReservation({
      projectJobNumber: 'AKV104',
      projectId: 'AKV104',
      eventLocalId: 22,
      startsAt: '2026-05-04T09:00',
      endsAt: '2026-05-04T18:00',
      note: '',
      items: [{ warehouseItemId: '55555555-5555-4555-8555-555555555555', quantity: 1 }],
    });

    const conflicts = findWarehouseReservationConflicts({
      projectJobNumber: 'BNZ003',
      projectId: 'BNZ003',
      eventLocalId: 26,
      startsAt: '2026-05-04T12:00',
      endsAt: '2026-05-04T20:00',
      note: '',
      items: [{ warehouseItemId: '55555555-5555-4555-8555-555555555555', quantity: 1 }],
    });

    expect(conflicts).toEqual([
      expect.objectContaining({
        warehouseItemId: '55555555-5555-4555-8555-555555555555',
        requestedQuantity: 1,
        availableQuantity: 0,
      }),
    ]);
  });

  it('exposes projects and events as dependencies for the view', () => {
    const dependencies = getWarehouseDependencies();

    expect(dependencies.projects.length).toBeGreaterThan(0);
    expect(dependencies.events.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/features/warehouse/services/warehouse.service.test.ts
```

Expected: FAIL because `warehouse.service.ts` does not exist yet.

- [ ] **Step 3: Implement the service**

Create `src/features/warehouse/services/warehouse.service.ts`:

```ts
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type {
  Event,
  Project,
  WarehouseItem,
  WarehouseReservation,
  WarehouseReservationDraft,
  WarehouseReservationItem,
} from '../../../types';

export interface WarehouseRange {
  startsAt: string;
  endsAt: string;
}

export interface WarehouseCatalogRow {
  item: WarehouseItem;
  reservedQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
}

export interface WarehouseConflict {
  warehouseItemId: string;
  itemName: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export interface WarehouseDependencies {
  items: WarehouseItem[];
  reservations: WarehouseReservation[];
  projects: Project[];
  events: Event[];
}

const getTime = (value: string) => new Date(value).getTime();

const overlaps = (a: WarehouseRange, b: WarehouseRange) => (
  getTime(a.startsAt) < getTime(b.endsAt) && getTime(a.endsAt) > getTime(b.startsAt)
);

const createId = () => crypto.randomUUID();

export const subscribeToWarehouseChanges = subscribeToLocalAppState;

export const getWarehouseDependencies = (): WarehouseDependencies => {
  const snapshot = getLocalAppState();

  return {
    items: snapshot.warehouseItems ?? [],
    reservations: snapshot.warehouseReservations ?? [],
    projects: snapshot.projects ?? [],
    events: snapshot.events ?? [],
  };
};

export const getWarehouseCatalogRows = (range?: WarehouseRange): WarehouseCatalogRow[] => {
  const { items, reservations } = getWarehouseDependencies();

  return items
    .filter((item) => item.status === 'active')
    .map((item) => {
      const reservedQuantity = range
        ? reservations
          .filter((reservation) => reservation.status !== 'cancelled' && overlaps(range, reservation))
          .flatMap((reservation) => reservation.items)
          .filter((line) => line.warehouseItemId === item.id)
          .reduce((sum, line) => sum + line.quantity, 0)
        : 0;
      const availableQuantity = Math.max(0, item.quantityTotal - reservedQuantity);

      return {
        item,
        reservedQuantity,
        availableQuantity,
        isAvailable: availableQuantity > 0,
      };
    });
};

export const findWarehouseReservationConflicts = (
  draft: WarehouseReservationDraft,
): WarehouseConflict[] => {
  if (!draft.startsAt || !draft.endsAt) return [];

  const rows = getWarehouseCatalogRows({
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
  });

  return draft.items.flatMap((draftItem) => {
    const row = rows.find((item) => item.item.id === draftItem.warehouseItemId);
    if (!row || draftItem.quantity <= row.availableQuantity) return [];

    return [{
      warehouseItemId: draftItem.warehouseItemId,
      itemName: row?.item.name ?? 'Neznama polozka',
      requestedQuantity: draftItem.quantity,
      availableQuantity: row?.availableQuantity ?? 0,
    }];
  });
};

const saveWarehouseReservationToSupabase = async (reservation: WarehouseReservation) => {
  if (!supabase || !isSupabaseConfigured) return;

  const supabaseUntyped = supabase as NonNullable<typeof supabase> & {
    from: (table: string) => {
      insert: (payload: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };

  const reservationResult = await supabaseUntyped.from('warehouse_reservations').insert({
    id: reservation.id,
    project_id: reservation.projectId,
    project_job_number: reservation.projectJobNumber,
    event_id: reservation.eventId,
    event_local_id: reservation.eventLocalId,
    reserved_by_profile_id: reservation.reservedByProfileId,
    starts_at: reservation.startsAt,
    ends_at: reservation.endsAt,
    status: reservation.status,
    note: reservation.note,
    total_cents: reservation.totalCents,
    currency: reservation.currency,
    booqable_order_id: reservation.booqableOrderId,
  });

  if (reservationResult.error) throw new Error(reservationResult.error.message);

  const lineResult = await supabaseUntyped.from('warehouse_reservation_items').insert(
    reservation.items.map((line) => ({
      id: line.id,
      reservation_id: line.reservationId,
      warehouse_item_id: line.warehouseItemId,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      price_period_label: line.pricePeriodLabel,
      line_total_cents: line.lineTotalCents,
      item_name_snapshot: line.itemNameSnapshot,
    })),
  );

  if (lineResult.error) throw new Error(lineResult.error.message);
};

export const createWarehouseReservation = async (
  draft: WarehouseReservationDraft,
): Promise<WarehouseReservation> => {
  if (!draft.projectJobNumber.trim()) throw new Error('Vyberte projekt.');
  if (!draft.startsAt || !draft.endsAt) throw new Error('Vyplnte zacatek a konec rezervace.');
  if (getTime(draft.endsAt) <= getTime(draft.startsAt)) throw new Error('Konec rezervace musi byt po zacatku.');
  if (draft.items.length === 0) throw new Error('Kosik je prazdny.');
  if (draft.items.some((item) => item.quantity < 1)) throw new Error('Mnozstvi musi byt alespon 1.');

  const conflicts = findWarehouseReservationConflicts(draft);
  if (conflicts.length > 0) throw new Error('Pozadovane mnozstvi neni dostupne.');

  const snapshot = getLocalAppState();
  const lines: WarehouseReservationItem[] = draft.items.map((draftItem) => {
    const item = snapshot.warehouseItems.find((candidate) => candidate.id === draftItem.warehouseItemId);
    if (!item) throw new Error('Polozka skladu nebyla nalezena.');

    return {
      id: createId(),
      reservationId: '',
      warehouseItemId: item.id,
      quantity: draftItem.quantity,
      unitPriceCents: item.priceCents,
      pricePeriodLabel: item.pricePeriodLabel,
      lineTotalCents: item.priceCents * draftItem.quantity,
      itemNameSnapshot: item.name,
    };
  });
  const reservationId = createId();
  const saved: WarehouseReservation = {
    id: reservationId,
    projectId: draft.projectId ?? null,
    projectJobNumber: draft.projectJobNumber.trim(),
    eventId: draft.eventId ?? null,
    eventLocalId: draft.eventLocalId ?? null,
    reservedByProfileId: draft.reservedByProfileId ?? null,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    status: 'reserved',
    note: draft.note.trim(),
    totalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    currency: 'CZK',
    booqableOrderId: null,
    items: lines.map((line) => ({ ...line, reservationId })),
  };

  await saveWarehouseReservationToSupabase(saved);

  updateLocalAppState((state) => ({
    ...state,
    warehouseReservations: [...state.warehouseReservations, saved],
  }));

  return saved;
};
```

- [ ] **Step 4: Run service tests**

Run:

```bash
npm test -- src/features/warehouse/services/warehouse.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit service work**

```bash
git add src/features/warehouse/services/warehouse.service.ts src/features/warehouse/services/warehouse.service.test.ts
git commit -m "feat: add warehouse reservation service"
```

## Task 4: Warehouse Catalog View With Cart

**Files:**
- Create: `src/views/WarehouseView.tsx`
- Create: `src/views/WarehouseView.test.tsx`

- [ ] **Step 1: Write failing view tests**

Create `src/views/WarehouseView.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WarehouseView from './WarehouseView';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

describe('WarehouseView', () => {
  it('renders imported warehouse items as image cards', () => {
    render(<WarehouseView />);

    expect(screen.getByRole('heading', { name: 'Sklad' })).toBeInTheDocument();
    expect(screen.getByText('mix pult Pioneer DJM 900')).toBeInTheDocument();
    expect(screen.getByText('2 000 Kc')).toBeInTheDocument();
    expect(screen.getByAltText('mix pult Pioneer DJM 900')).toBeInTheDocument();
  });

  it('adds an item to the cart', () => {
    render(<WarehouseView />);

    const card = screen.getByText('Makita DML 805 (venkovni led svetlo)').closest('article');
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Pridat do kosiku' }));

    expect(screen.getByText('Kosik')).toBeInTheDocument();
    expect(screen.getByText('1 polozka')).toBeInTheDocument();
  });

  it('shows validation when confirming an incomplete cart', async () => {
    render(<WarehouseView />);

    fireEvent.click(screen.getByRole('button', { name: 'Vytvorit rezervaci' }));

    expect(await screen.findByText('Vyberte projekt.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run view tests to verify they fail**

Run:

```bash
npm test -- src/views/WarehouseView.test.tsx
```

Expected: FAIL because `WarehouseView.tsx` does not exist.

- [ ] **Step 3: Implement `WarehouseView`**

Create `src/views/WarehouseView.tsx` with a focused first release UI:

```tsx
import React, { useMemo, useState } from 'react';
import { CalendarDays, Package, Search, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import type { WarehouseCartItemDraft } from '../types';
import {
  createWarehouseReservation,
  getWarehouseCatalogRows,
  getWarehouseDependencies,
} from '../features/warehouse/services/warehouse.service';

const formatMoney = (cents: number) => `${new Intl.NumberFormat('cs-CZ').format(cents / 100)} Kc`;
const toInputDateTime = (date: Date) => date.toISOString().slice(0, 16);

const now = new Date();
now.setMinutes(0, 0, 0);
const later = new Date(now);
later.setHours(later.getHours() + 8);

const WarehouseView: React.FC = () => {
  const dependencies = getWarehouseDependencies();
  const [search, setSearch] = useState('');
  const [projectJobNumber, setProjectJobNumber] = useState('');
  const [eventLocalId, setEventLocalId] = useState('');
  const [startsAt, setStartsAt] = useState(toInputDateTime(now));
  const [endsAt, setEndsAt] = useState(toInputDateTime(later));
  const [note, setNote] = useState('');
  const [cartItems, setCartItems] = useState<WarehouseCartItemDraft[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const rows = getWarehouseCatalogRows({ startsAt, endsAt });

  const visibleRows = useMemo(() => rows.filter((row) => (
    row.item.name.toLowerCase().includes(search.toLowerCase())
    || (row.item.category ?? '').toLowerCase().includes(search.toLowerCase())
  )), [rows, search]);

  const selectedProject = dependencies.projects.find((project) => project.id === projectJobNumber);
  const availableEvents = dependencies.events.filter((event) => (
    !projectJobNumber || event.job === projectJobNumber
  ));
  const cartTotal = cartItems.reduce((sum, cartItem) => {
    const row = rows.find((candidate) => candidate.item.id === cartItem.warehouseItemId);
    return sum + ((row?.item.priceCents ?? 0) * cartItem.quantity);
  }, 0);

  const addToCart = (warehouseItemId: string) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.warehouseItemId === warehouseItemId);
      if (existing) {
        return current.map((item) => (
          item.warehouseItemId === warehouseItemId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));
      }

      return [...current, { warehouseItemId, quantity: 1 }];
    });
  };

  const submitReservation = async () => {
    setValidationMessage(null);
    try {
      const saved = await createWarehouseReservation({
        projectJobNumber,
        projectId: selectedProject?.supabaseId ?? projectJobNumber,
        eventLocalId: eventLocalId ? Number(eventLocalId) : null,
        startsAt,
        endsAt,
        note,
        items: cartItems,
      });
      toast.success('Rezervace skladu byla vytvorena.');
      setCartItems([]);
      setNote('');
      setValidationMessage(`Rezervace ${saved.projectJobNumber} ulozena.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rezervaci se nepodarilo ulozit.';
      setValidationMessage(message);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="nodu-dashboard-kicker">Operations</div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nodu-text)]">Sklad</h1>
          <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">
            Obrazkovy katalog polozek a rezervace pro projekty.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--nodu-border)] bg-white px-4 py-3 text-sm font-semibold text-[color:var(--nodu-text)]">
          <ShoppingCart size={16} />
          {cartItems.length} {cartItems.length === 1 ? 'polozka' : 'polozek'} · {formatMoney(cartTotal)}
        </div>
      </div>

      <section className="mb-5 grid grid-cols-1 gap-3 rounded-[24px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-4 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-[color:var(--nodu-text-soft)]">
          Projekt
          <select value={projectJobNumber} onChange={(event) => setProjectJobNumber(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 text-sm text-[color:var(--nodu-text)]">
            <option value="">Vyberte projekt</option>
            {dependencies.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.id} · {project.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-[color:var(--nodu-text-soft)]">
          Akce
          <select value={eventLocalId} onChange={(event) => setEventLocalId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 text-sm text-[color:var(--nodu-text)]">
            <option value="">Bez konkretni akce</option>
            {availableEvents.map((event) => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-[color:var(--nodu-text-soft)]">
          Od
          <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-semibold text-[color:var(--nodu-text-soft)]">
          Do
          <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-1" />
        </label>
        <label className="text-xs font-semibold text-[color:var(--nodu-text-soft)]">
          Hledat
          <div className="relative mt-1">
            <Search className="absolute left-3 top-3 text-[color:var(--nodu-text-soft)]" size={14} />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Nazev nebo kategorie" />
          </div>
        </label>
      </section>

      {validationMessage && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {validationMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visibleRows.map((row) => (
            <article key={row.item.id} className="overflow-hidden rounded-[24px] border border-[color:var(--nodu-border)] bg-white shadow-[0_14px_34px_rgba(47,38,31,0.08)]">
              <div className="aspect-[4/3] bg-[color:rgb(var(--nodu-text-rgb)/0.04)]">
                {row.item.imageUrl ? (
                  <img src={row.item.imageUrl} alt={row.item.name} className="h-full w-full object-contain p-3" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[color:var(--nodu-text-soft)]">
                    <Package size={28} />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="min-h-12 text-sm font-semibold text-[color:var(--nodu-text)]">{row.item.name}</div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-[color:var(--nodu-accent)]">{formatMoney(row.item.priceCents)}</span>
                  <span className="text-xs text-[color:var(--nodu-text-soft)]">{row.item.pricePeriodLabel}</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--nodu-text-soft)]">
                  <CalendarDays size={13} />
                  Dostupne: {row.availableQuantity}/{row.item.quantityTotal}
                </div>
                <Button type="button" onClick={() => addToCart(row.item.id)} disabled={!row.isAvailable} className="mt-4 w-full text-xs">
                  Pridat do kosiku
                </Button>
              </div>
            </article>
          ))}
        </section>

        <aside className="rounded-[24px] border border-[color:var(--nodu-border)] bg-white p-4 shadow-[0_14px_34px_rgba(47,38,31,0.08)]">
          <h2 className="text-sm font-semibold text-[color:var(--nodu-text)]">Kosik</h2>
          <div className="mt-3 space-y-3">
            {cartItems.map((cartItem) => {
              const row = rows.find((candidate) => candidate.item.id === cartItem.warehouseItemId);
              if (!row) return null;

              return (
                <div key={cartItem.warehouseItemId} className="rounded-xl border border-[color:var(--nodu-border)] p-3 text-sm">
                  <div className="font-semibold text-[color:var(--nodu-text)]">{row.item.name}</div>
                  <div className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
                    {cartItem.quantity} ks · {formatMoney(row.item.priceCents * cartItem.quantity)}
                  </div>
                </div>
              );
            })}
            {cartItems.length === 0 && (
              <div className="rounded-xl border border-dashed border-[color:var(--nodu-border)] p-4 text-sm text-[color:var(--nodu-text-soft)]">
                Kosik je prazdny.
              </div>
            )}
          </div>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-4 min-h-20 w-full rounded-xl border border-[color:var(--nodu-border)] p-3 text-sm" placeholder="Poznamka k rezervaci" />
          <Button type="button" onClick={submitReservation} className="mt-3 w-full text-xs">
            Vytvorit rezervaci
          </Button>
        </aside>
      </div>
    </div>
  );
};

export default WarehouseView;
```

- [ ] **Step 4: Run view tests**

Run:

```bash
npm test -- src/views/WarehouseView.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit view work**

```bash
git add src/views/WarehouseView.tsx src/views/WarehouseView.test.tsx
git commit -m "feat: add warehouse catalog view"
```

## Task 5: Navigation And Layout Integration

**Files:**
- Modify: `src/constants.ts`
- Modify: `src/constants.test.ts`
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/layout/AppLayout.test.tsx`

- [ ] **Step 1: Add failing navigation expectations**

In `src/constants.test.ts`, add expectations that `warehouse` appears for operational roles and not for crew:

```ts
expect(getNavItemsForRole('crewhead').map((item) => item.id)).toContain('warehouse');
expect(getNavItemsForRole('coo').map((item) => item.id)).toContain('warehouse');
expect(getNavItemsForRole('crew').map((item) => item.id)).not.toContain('warehouse');
```

In `src/components/layout/AppLayout.test.tsx`, mock the new view:

```ts
vi.mock('../../views/WarehouseView', () => ({
  default: () => <div data-testid="warehouse-view" />,
}));
```

Add a layout test:

```ts
it('renders the warehouse view for the warehouse tab', () => {
  renderWithContext({ currentTab: 'warehouse' });

  expect(screen.getByTestId('warehouse-view')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run navigation tests to verify they fail**

Run:

```bash
npm test -- src/constants.test.ts src/components/layout/AppLayout.test.tsx
```

Expected: FAIL because `warehouse` is not wired yet.

- [ ] **Step 3: Add sidebar item**

In `src/constants.ts`, import `Boxes` from `lucide-react`:

```ts
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Receipt,
  UserPlus,
  Clock,
  FolderKanban,
  Building2,
  Car,
  Boxes,
  Settings,
} from 'lucide-react';
```

Add this item after `fleet`:

```ts
{ id: 'warehouse', label: 'Sklad', icon: Boxes },
```

Add `warehouse` to `crewhead` and `coo` role arrays after `fleet`:

```ts
crewhead: ['dashboard', 'my-shifts', 'clients', 'projects', 'events', 'crew', 'fleet', 'warehouse', 'timelogs', 'invoices', 'receipts', 'recruitment'],
coo: ['dashboard', 'my-shifts', 'clients', 'projects', 'events', 'crew', 'fleet', 'warehouse', 'timelogs', 'invoices', 'receipts'],
```

- [ ] **Step 4: Render warehouse in layout**

In `src/components/layout/AppLayout.tsx`, import the view:

```ts
import WarehouseView from '../../views/WarehouseView';
```

Add a switch case after `fleet`:

```tsx
case 'warehouse':
  return <WarehouseView key="warehouse" />;
```

- [ ] **Step 5: Run navigation tests**

Run:

```bash
npm test -- src/constants.test.ts src/components/layout/AppLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit navigation work**

```bash
git add src/constants.ts src/constants.test.ts src/components/layout/AppLayout.tsx src/components/layout/AppLayout.test.tsx
git commit -m "feat: add warehouse navigation"
```

## Task 6: Final Verification And Supabase Handoff

**Files:**
- Verify: `supabase/warehouse-reservations-migration-draft.sql`
- Verify: `src/features/warehouse/services/warehouse.service.test.ts`
- Verify: `src/views/WarehouseView.test.tsx`
- Verify: `src/constants.test.ts`
- Verify: `src/components/layout/AppLayout.test.tsx`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/features/warehouse/services/warehouse.service.test.ts src/views/WarehouseView.test.tsx src/constants.test.ts src/components/layout/AppLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL such as `http://localhost:8080/` or `http://localhost:5173/`.

- [ ] **Step 6: Inspect the UI**

Open the local app URL in the in-app browser. Verify:

- Sidebar shows `Sklad` for `crewhead` and `coo`.
- Sidebar hides `Sklad` for `crew`.
- `Sklad` renders ten image cards.
- Adding an item updates the cart summary.
- Confirming without a project shows `Vyberte projekt.`
- Creating a valid reservation empties the cart and shows a success toast/message.

- [ ] **Step 7: Document Supabase apply command for the human**

If the remote CLI login is only available in the human's terminal, ask them to run:

```bash
cd /Users/peetax/Projekty/crewflow
supabase db query --linked --file supabase/warehouse-reservations-migration-draft.sql
```

If their installed Supabase CLI cannot use the linked project from the active terminal, ask them to paste the SQL file contents into the Supabase SQL Editor for project `gkxbluqkugprwcpdephk`.

- [ ] **Step 8: Commit verification notes if code changed during fixes**

If verification required fixes, commit those changed files:

```bash
git status --short
git add supabase/warehouse-reservations-migration-draft.sql src/types.ts src/data.ts src/lib/app-data.ts src/features/warehouse/services/warehouse.service.ts src/features/warehouse/services/warehouse.service.test.ts src/views/WarehouseView.tsx src/views/WarehouseView.test.tsx src/constants.ts src/constants.test.ts src/components/layout/AppLayout.tsx src/components/layout/AppLayout.test.tsx
git commit -m "fix: stabilize warehouse reservations"
```

Expected: only files related to warehouse, navigation, tests, or the migration are staged.
