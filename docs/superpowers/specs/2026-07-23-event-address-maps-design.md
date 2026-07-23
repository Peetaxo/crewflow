# Event Address And Maps Design

## Goal

Replace the current event `Mesto` field with a real event address workflow: CH/COO selects an address from autocomplete, the event stores the address and map coordinates, Crew sees the address in event detail, and tapping the map opens Google Maps with a pin for that address.

## Current State

Events currently store `city` as a free text field and optionally `meetingLocation`. The mobile event detail uses `meetingLocation || city` as the place text and renders a decorative map preview without real coordinates. Supabase `events` currently has `city` and `meeting_point`, but no `address`, `place_id`, `location_lat`, or `location_lng`.

## Product Behavior

In `EventEditModal`, the current `Mesto` field becomes `Adresa`.

When a manager starts typing, the field offers address suggestions through Google Places Autocomplete. Selecting a suggestion fills the formatted address and stores Google place metadata. If Google Maps is not configured or the request fails, the field still works as a normal text input so event creation is never blocked.

After a valid address is selected, the modal shows a small map preview with a pin. If only typed text exists without coordinates, the preview shows a neutral placeholder and a short state such as `Mapa se zobrazí po výběru adresy`.

In event detail, the info row label changes from `Misto` to `Adresa`. The displayed value uses `event.address` first, then falls back to legacy `event.city` for older events. The mobile map preview uses saved coordinates when available. Tapping the map opens Google Maps in a new tab/app using a Maps URL.

## Data Model

Add these fields to `Event`:

```ts
address?: string;
placeId?: string;
locationLat?: number | null;
locationLng?: number | null;
```

Keep `city` temporarily as a legacy compatibility field. During the first implementation, new saves should write `city = address` so existing views, reports, filters, and tests that still read `city` do not break. After all UI and service references are migrated from `city` to `address`, a later cleanup will remove `city` from the app model and then from Supabase.

## Supabase Migration

Add nullable columns to `public.events`:

```sql
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
```

Do not drop `city` in this migration. Dropping it belongs to the later compatibility cleanup.

## Google Maps Integration

Use Google Maps Platform for the enhanced behavior:

- Places Autocomplete for address suggestions and selected place details.
- Maps JavaScript API for the in-app map preview and marker.
- Google Maps URLs for the external click target.

Configuration should use `VITE_GOOGLE_MAPS_API_KEY`. The key should be browser-restricted to the production domains and local development origins. The app must render without this key.

The Google Maps URL should prefer precise data:

```ts
const query = lat != null && lng != null ? `${lat},${lng}` : address;
const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
```

When a `placeId` is available, append `query_place_id` for better precision.

## Components

Create a small event location unit rather than scattering Google code through the modal:

- `src/features/events/components/EventAddressField.tsx`
  Handles text input, Google autocomplete, selected place extraction, fallback states, and change callbacks.

- `src/features/events/components/EventMapPreview.tsx`
  Renders either a real Google map with a marker or the existing style-compatible placeholder when no coordinates/API key are available.

- `src/features/events/services/event-location.service.ts`
  Builds Maps URLs, normalizes selected place data, and exposes small pure helpers that can be unit tested without loading Google Maps.

`EventEditModal` should use `EventAddressField` and `EventMapPreview`. `EventDetailView` should use `EventMapPreview` plus the shared URL helper for click-through behavior.

## Fallbacks And Edge Cases

If the manager types an address but does not select a suggestion, store the text in `address`, clear `placeId/locationLat/locationLng`, and keep the map placeholder.

If an older event has only `city`, display it as the address fallback and open Google Maps by text query. This keeps legacy events useful while we migrate.

If Google scripts fail to load, show the plain input and no suggestion menu. The user can still create or update the event.

If both `address` and `city` are empty, keep the current empty-state wording: `Místo bude doplněno`.

## Testing

Add unit tests for:

- mapping Supabase event rows into `address`, `placeId`, `locationLat`, and `locationLng`;
- writing event payloads with new address fields and legacy `city = address`;
- Maps URL helper using coordinates, address fallback, and optional `query_place_id`;
- `EventEditModal` rendering `Adresa` instead of `Mesto`, preserving manual text fallback, and accepting a mocked autocomplete selection;
- `EventDetailView` showing `Adresa`, using address before city fallback, and exposing the clickable map link.

Run targeted tests around event services, modal, detail view, mappers, then build and lint.

## Sources

- Google Place Autocomplete: https://developers.google.com/maps/documentation/javascript/place-autocomplete-new
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- Google Maps markers: https://developers.google.com/maps/documentation/javascript/advanced-markers/overview
