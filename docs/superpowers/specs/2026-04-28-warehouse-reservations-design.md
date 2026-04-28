# Warehouse Reservations Design

## Context

NODU will add a new `Sklad` module for reserving warehouse items for projects and events. The current warehouse catalog lives in Booqable at `hala-19.booqableshop.com`, but the target direction is for NODU to become the primary operational system. Booqable API access is not available right now, so the first release should not depend on it.

The first imported dataset will use the public Booqable catalog page as a seed source for ten products. The public page exposes product names, prices, rental period labels, Booqable product IDs, product URLs, and image URLs. It does not reliably expose stock quantities, ownership, item condition, or precise availability.

## Goals

- Add `Sklad` to the sidebar for `crewhead` and `coo` roles.
- Build an image-led warehouse catalog, closer to an e-shop than the fleet table.
- Let an internal user select a project, optional event, date/time range, and reserve one or more items through a cart-like flow.
- Store prices on items and snapshot prices on reservations so project costs remain stable even if catalog prices change later.
- Make Supabase the planned source of truth from the beginning.
- Keep local fallback data for development and demos when Supabase is not configured.
- Preserve Booqable identifiers so future import or sync can be added without remodelling the feature.

## Non-Goals

- Public customer checkout.
- Online payments or deposits.
- Direct Booqable API sync in the first release.
- Tracking individual physical units, serial numbers, service history, or damage reports.
- Full warehouse admin CRUD beyond the data needed to seed and reserve the first items.

## Users and Permissions

`crewhead` and `coo` can open the warehouse catalog and create reservations. `crew` will not see `Sklad` in the first release, because the workflow is operational planning rather than self-service crew booking.

The first implementation can rely on the existing role-gated frontend navigation. Supabase row-level security should still be prepared around authenticated users and operational roles so the backend model is ready for production use.

## Data Model

### `warehouse_items`

Represents catalog items available for reservation.

Fields:

- `id` UUID primary key.
- `name` text, required.
- `category` text, nullable. Initial value can be inferred from name prefixes such as `Backstage`, `Stage`, `Kabelaz`, or left empty.
- `description` text, nullable.
- `image_url` text, nullable.
- `price_cents` integer, required.
- `currency` text, default `CZK`.
- `price_period_label` text, nullable, for labels such as `1 Den`, `3 dny`, or `Opraveno`.
- `quantity_total` integer, default `1`.
- `owner_client_id` UUID nullable reference to `clients`.
- `owner_label` text nullable fallback when a client record is not known yet.
- `status` text enum-like value: `active`, `draft`, `maintenance`, `retired`.
- `booqable_product_id` text nullable.
- `booqable_product_path` text nullable.
- `created_at` and `updated_at` timestamps.

### `warehouse_reservations`

Represents a reservation cart committed for a project and optional event.

Fields:

- `id` UUID primary key.
- `project_id` UUID nullable reference to Supabase `projects`.
- `project_job_number` text required as a stable local reference.
- `event_id` UUID nullable reference to Supabase `events`.
- `event_local_id` integer nullable for local fallback compatibility.
- `reserved_by_profile_id` UUID nullable reference to `profiles`.
- `starts_at` timestamptz required.
- `ends_at` timestamptz required.
- `status` text enum-like value: `draft`, `reserved`, `picked_up`, `returned`, `cancelled`.
- `note` text nullable.
- `total_cents` integer required.
- `currency` text default `CZK`.
- `booqable_order_id` text nullable.
- `created_at` and `updated_at` timestamps.

### `warehouse_reservation_items`

Represents line items inside a reservation.

Fields:

- `id` UUID primary key.
- `reservation_id` UUID required reference to `warehouse_reservations`.
- `warehouse_item_id` UUID required reference to `warehouse_items`.
- `quantity` integer required.
- `unit_price_cents` integer required.
- `price_period_label` text nullable.
- `line_total_cents` integer required.
- `item_name_snapshot` text required.
- `created_at` timestamp.

## Seed Items

The first seed will import these ten Booqable products:

| Name | Price | Period | Booqable Product ID |
| --- | ---: | --- | --- |
| mix pult Pioneer DJM 900 | 200000 | 1 Den | e334ae21-6278-4c02-a95a-81b94e0a8991 |
| Stojan malirsky dreveny | 5000 | Opraveno | cfa03f1f-2ee5-4274-8486-930d52f825eb |
| Makita DML 805 (venkovni led svetlo) | 5000 | 1 Den | 3e16ddb7-5ccc-4430-9300-8d6a8bef82bd |
| Stojan - Malirsky A4 !CERNY! | 5000 | 1 Den | 41547df6-a70e-4937-b70a-1091fa725b38 |
| Backstage - Easy Up 3 x 6m | 150000 | 1 Den | cfe344ee-6169-49a6-976d-94ac4f669afc |
| Mikrovlnna trouba "Tesco" | 10000 | 1 Den | 42511243-7569-4773-8ff0-466d1b71033d |
| AKU Tacker DST221S Makita | 35000 | 1 Den | 127c801e-2852-4b23-8772-05f3b16ca761 |
| Stojan -malirsky,kovovy | 10000 | 1 Den | f7f2479e-74f0-4a8f-a82b-e6a697d44b75 |
| Cable Cross "prejezdy" | 20000 | 1 Den | 94d08ab1-5d7d-461a-951c-7963ad6c0c83 |
| Regal | 400000 | Opraveno | 88da6f0d-feca-4dd6-bbd4-9fbeeb44037a |

Image URLs and Booqable product paths will be stored in the seed. Initial `quantity_total` will be `1`, `status` will be `active`, and ownership will be left empty until real owner/client mapping is known.

## UI Design

The `Sklad` view opens to a dense image catalog:

- Header with title, project/event date context, and cart summary.
- Filter row for search, category, owner/client, and availability for selected date range.
- Responsive grid of item cards.
- Each card shows image, name, price, period label, owner/client label, available quantity, and an add-to-cart button.
- Cart drawer or side panel shows selected items, quantities, project, optional event, reservation window, note, and total price.

The user flow:

1. User opens `Sklad`.
2. User chooses project, optional event, and date/time range.
3. Catalog availability recalculates for the selected range.
4. User adds items to cart and adjusts quantities.
5. User confirms the reservation.
6. The reservation is saved with item price snapshots and appears as unavailable for overlapping future reservations.

For the first release, availability is computed from `quantity_total` minus overlapping reservation quantities. If requested quantity exceeds availability, the UI blocks confirmation and explains which items conflict.

## Services and Data Flow

Create a warehouse feature service:

- `getWarehouseItems()`
- `getWarehouseReservations()`
- `getWarehouseCatalogRows(range)`
- `createWarehouseReservation(draft)`
- `findWarehouseReservationConflicts(draft)`
- `subscribeToWarehouseChanges()`

The service should read from Supabase when configured and fall back to local app data when not configured. UI components should use this service rather than calling Supabase directly.

Local app data will be extended with:

- `warehouseItems`
- `warehouseReservations`

Supabase mapping will be added after the database types are updated. Until generated database types exist, service code can use narrow typed insert/select payloads to keep the first implementation contained.

## Supabase Migration

Add a SQL migration draft that creates the three warehouse tables, indexes common lookup fields, enables RLS, and adds policies for authenticated operational users. The migration should also insert the first ten Booqable seed items.

Recommended indexes:

- `warehouse_items(status)`
- `warehouse_items(booqable_product_id)`
- `warehouse_reservations(project_job_number)`
- `warehouse_reservations(starts_at, ends_at)`
- `warehouse_reservation_items(reservation_id)`
- `warehouse_reservation_items(warehouse_item_id)`

## Error Handling

Validation errors:

- Missing project.
- Missing start or end date/time.
- End date/time not after start.
- Empty cart.
- Quantity below one.
- Quantity above available count.

Save errors should show a toast and keep the cart draft intact. Conflict detection should run before save and again during save, because another reservation may be created while the user is editing.

## Testing

Service tests:

- Computes availability from overlapping reservations.
- Allows non-overlapping reservations.
- Blocks quantity above available count.
- Snapshots item names and prices into reservation lines.
- Computes total reservation price.

View tests:

- Renders imported item cards with images and prices.
- Adds an item to cart.
- Shows validation when project/date/cart data is missing.
- Shows conflict feedback when selected quantity is unavailable.

Navigation tests:

- `Sklad` appears for `crewhead` and `coo`.
- `Sklad` does not appear for `crew`.
- App layout renders `WarehouseView` for the `warehouse` tab.

## Future Extensions

- CSV import for Booqable exports.
- Booqable API sync using `booqable_product_id` and `booqable_order_id`.
- `warehouse_stock_units` for individual units, serial numbers, condition, and service state.
- Pickup and return workflow.
- Reservation packing list.
- Public client-facing catalog or request flow.
- Project cost rollups that include warehouse reservations.
