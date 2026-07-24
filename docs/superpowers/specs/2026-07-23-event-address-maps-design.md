# Event Address And Free Maps Design

## Goal

Replace the current event `Mesto` field with a real event location workflow that does not require paid Google Maps Platform APIs. CH/COO enters an address or place, resolves it to coordinates only on explicit action, can manually move a pin to the exact meeting/loading point, and the event stores the readable address plus precise coordinates. Crew sees the address and map preview in event detail, and tapping the map opens Google Maps with a pin at the saved coordinates.

## Current State

Events currently store `city` as a free text field and optionally `meetingLocation`. The mobile event detail uses `meetingLocation || city` as the place text and renders a decorative map preview without real coordinates. Supabase `events` currently has `city` and `meeting_point`, but no `address`, `place_id`, `location_lat`, or `location_lng`.

## Product Behavior

In `EventEditModal`, the current `Mesto` field becomes `Adresa`.

The address field is a normal controlled text input. There is no live paid autocomplete. The manager can type an address, venue name, city, or internal place label manually.

Next to or below the field, the modal exposes an explicit action such as `Najit na mape`. This action sends the current address text to a free geocoding provider and returns candidate coordinates. The app should avoid querying on every keystroke.

After coordinates are available, the modal shows a map preview with a draggable pin. CH/COO can move the pin to the exact meeting point, entry gate, loading zone, backstage, or other practical location. Moving the pin updates only `locationLat` and `locationLng` by default; it should not automatically rewrite the human-readable address. The UI can show a subtle state such as `Poloha upravena rucne`.

If only typed text exists without coordinates, the preview shows a neutral placeholder and a short state such as `Mapa se zobrazi po nalezeni polohy`.

In event detail, the info row label changes from `Misto` to `Adresa`. The displayed value uses `event.address` first, then falls back to legacy `event.city` for older events. The mobile map preview uses saved coordinates when available. Tapping the map opens Google Maps in a new tab/app using a Maps URL.

## Data Model

Add these fields to `Event`:

```ts
address?: string;
placeId?: string;
locationLat?: number | null;
locationLng?: number | null;
```

Keep `placeId` temporarily optional for compatibility with the earlier Google-oriented implementation, but the free-only workflow does not require it. Keep `city` temporarily as a legacy compatibility field. During the first implementation, new saves should write `city = address` so existing views, reports, filters, and tests that still read `city` do not break. After all UI and service references are migrated from `city` to `address`, a later cleanup will remove `city` from the app model and then from Supabase.

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

## Free Maps Integration

Do not use paid Google Maps Platform APIs for in-app entry, geocoding, autocomplete, or preview maps.

The app should use a free-first map flow:

- address entry stays manual;
- free geocoding runs only after an explicit user action, with OSM Nominatim as the first provider;
- map preview uses a free/open map renderer such as Leaflet or MapLibre;
- map tiles must show required attribution;
- repeated geocoding for the same normalized address should be cached where practical.

The first implementation should enforce the public Nominatim usage rules in product behavior: no autocomplete, no repeated queries while typing, a client-side cooldown/rate guard, and graceful failure when the provider is unavailable. If this becomes too limiting after real usage grows, the provider can be replaced behind the same service interface without changing the rest of the app.

Google Maps is used only as the external click target through Maps URLs. This does not require an API key.

The Google Maps URL should prefer precise data:

```ts
const query = lat != null && lng != null ? `${lat},${lng}` : address;
const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
```

If a future provider returns a stable place identifier and the product decides to keep it, the URL helper can append provider-specific precision data where supported. For the free-only workflow, latitude and longitude are the source of truth.

## Components

Create a small event location unit rather than scattering provider code through the modal:

- `src/features/events/components/EventAddressField.tsx`
  Handles manual text input, free geocoding action state, selected/typed address values, and change callbacks.

- `src/features/events/components/EventMapPreview.tsx`
  Renders either a free map with a draggable marker or the existing style-compatible placeholder when no coordinates are available.

- `src/features/events/services/event-location.service.ts`
  Builds Maps URLs, normalizes address/location data, and exposes small pure helpers that can be unit tested without loading map libraries.

- `src/features/events/services/event-geocoding.service.ts`
  Owns free geocoding calls, normalization, throttling/caching policy, and provider errors.

`EventEditModal` should use `EventAddressField` and `EventMapPreview`. `EventDetailView` should use `EventMapPreview` plus the shared URL helper for click-through behavior.

## Fallbacks And Edge Cases

If the manager types an address but does not resolve it, store the text in `address`, clear `placeId/locationLat/locationLng`, and keep the map placeholder.

If geocoding finds multiple candidates, show a compact candidate list and let the manager choose one. If no candidate is good enough, the manager can keep the typed address and place the pin manually. Manual pin placement can start from the last saved event coordinates, the selected candidate, or a Czech Republic default map center.

If an older event has only `city`, display it as the address fallback and open Google Maps by text query. This keeps legacy events useful while we migrate.

If the free geocoding provider is unavailable or rate limited, show a clear non-blocking state. The user can still create or update the event with manual address text.

If map tiles fail to load, keep the saved coordinates and show the external Google Maps link as the escape hatch.

If both `address` and `city` are empty, keep the current empty-state wording: `Místo bude doplněno`.

## Cost Guardrails

The production app must not require `VITE_GOOGLE_MAPS_API_KEY`.

The free-only workflow must not:

- call Google Places, Google Geocoding, or Google Maps JavaScript APIs;
- run live autocomplete against public free geocoding services;
- geocode on every keypress;
- hide required OpenStreetMap/provider attribution;
- depend on a provider plan that can start billing without an explicit owner decision.

## Testing

Add unit tests for:

- mapping Supabase event rows into `address`, `placeId`, `locationLat`, and `locationLng`;
- writing event payloads with new address fields and legacy `city = address`;
- Maps URL helper using coordinates, address fallback, and optional `query_place_id`;
- geocoding service behavior for explicit search, empty input, provider errors, and normalized candidates;
- `EventEditModal` rendering `Adresa` instead of `Mesto`, preserving manual text fallback, resolving a mocked geocoding result, and saving manually adjusted coordinates;
- `EventDetailView` showing `Adresa`, using address before city fallback, and exposing the clickable map link.

Run targeted tests around event services, modal, detail view, mappers, then build and lint.

## Sources

- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- OpenStreetMap Tile Usage Policy: https://operations.osmfoundation.org/policies/tiles/
- Nominatim Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
- Leaflet: https://leafletjs.com/
