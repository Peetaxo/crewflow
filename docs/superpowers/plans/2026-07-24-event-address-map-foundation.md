# Event Address Map Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first usable address and map foundation for events: managers save an address, Supabase stores location metadata, Crew sees the address, and the mobile map opens Google Maps.

**Architecture:** Keep `city` as a temporary compatibility field while introducing `address`, `placeId`, `locationLat`, and `locationLng` on `Event`. Add pure location helpers for Google Maps URLs and location display, then wire them into Supabase mappers, event saves, `EventEditModal`, and the mobile event detail. Google Places autocomplete remains the next layer on top of this foundation because the fallback input must work without a Google API key.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Supabase SQL migrations, Google Maps URLs.

**Supabase deployment note:** The address SQL was applied directly with `supabase db query --linked -f supabase/migrations/20260724065642_add_event_address_location.sql`, and remote `information_schema` confirmed the columns exist. Migration history was reconciled afterward in commit `37cb8fd`; `supabase db push --dry-run` now reports `Remote database is up to date.`

---

### Task 1: Event Location Data And URL Helpers

**Files:**
- Modify: `src/types.ts`
- Create: `src/features/events/services/event-location.service.ts`
- Create: `src/features/events/services/event-location.service.test.ts`

- [x] **Step 1: Write failing helper tests**

Add tests for:
- address display preferring `address`, falling back to `city`, then `Místo bude doplněno`;
- Maps URL using coordinates when present;
- Maps URL using address fallback;
- Maps URL appending `query_place_id` when `placeId` is present.

- [x] **Step 2: Run helper tests and confirm RED**

Run:

```bash
npm test -- src/features/events/services/event-location.service.test.ts --reporter verbose
```

Expected: fails because helper module does not exist.

- [x] **Step 3: Implement helper and Event fields**

Add optional `address`, `placeId`, `locationLat`, and `locationLng` fields to `Event`. Implement `getEventAddressLabel()` and `buildGoogleMapsSearchUrl()`.

- [x] **Step 4: Run helper tests and confirm GREEN**

Run:

```bash
npm test -- src/features/events/services/event-location.service.test.ts --reporter verbose
```

Expected: all helper tests pass.

### Task 2: Supabase Mapping And Persistence

**Files:**
- Modify: `src/lib/database.types.ts`
- Modify: `src/lib/supabase-mappers.ts`
- Modify: `src/lib/supabase-mappers.test.ts`
- Modify: `src/features/events/services/events.service.ts`
- Modify: `src/features/events/services/events.service.test.ts`
- Create: `supabase/migrations/<timestamp>_add_event_address_location.sql`

- [x] **Step 1: Write failing mapper and payload tests**

Assert that `mapEvent()` maps `address`, `place_id`, `location_lat`, and `location_lng`, and that `saveEvent()` sends those fields while keeping `city = address`.

- [x] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test -- src/lib/supabase-mappers.test.ts src/features/events/services/events.service.test.ts --reporter verbose
```

Expected: fails because new fields are not mapped or persisted.

- [x] **Step 3: Implement mapping, payload, and migration**

Update generated database type shape manually for the new nullable columns, map rows into `Event`, write Supabase payload with address metadata, and add the SQL migration.

- [x] **Step 4: Run tests and confirm GREEN**

Run:

```bash
npm test -- src/lib/supabase-mappers.test.ts src/features/events/services/events.service.test.ts --reporter verbose
```

Expected: mapper and event service tests pass.

### Task 3: Event Edit Modal And Mobile Detail

**Files:**
- Modify: `src/components/modals/EventEditModal.tsx`
- Modify: `src/components/modals/EventEditModal.test.tsx`
- Modify: `src/views/EventDetailView.tsx`
- Modify: `src/views/EventDetailView.test.tsx`
- Modify: `src/index.css`

- [x] **Step 1: Write failing UI tests**

Assert that `EventEditModal` shows `Adresa` instead of `Mesto`, updates `address` and legacy `city` together, and clears precise map fields when typed manually. Assert that mobile event detail shows `Adresa` and exposes a Google Maps link.

- [x] **Step 2: Run UI tests and confirm RED**

Run:

```bash
npm test -- src/components/modals/EventEditModal.test.tsx src/views/EventDetailView.test.tsx --reporter verbose
```

Expected: fails because UI still uses `Mesto` and decorative map markup.

- [x] **Step 3: Implement UI changes**

Replace the city input with an address input, add a small map state preview, use address display helper in mobile detail, and wrap the map preview in a Google Maps link.

- [x] **Step 4: Run UI tests and confirm GREEN**

Run:

```bash
npm test -- src/components/modals/EventEditModal.test.tsx src/views/EventDetailView.test.tsx --reporter verbose
```

Expected: UI tests pass.

### Task 4: Verification, Commit, Push

**Files:**
- Verify all changed files.

- [x] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/features/events/services/event-location.service.test.ts src/lib/supabase-mappers.test.ts src/features/events/services/events.service.test.ts src/components/modals/EventEditModal.test.tsx src/views/EventDetailView.test.tsx --reporter verbose
```

- [x] **Step 2: Run build and lint**

Run:

```bash
npm run build
npm run lint
```

- [x] **Step 3: Check diff and commit**

Stage only files from this plan, commit:

```bash
git commit -m "feat: add event address map foundation"
```

- [x] **Step 4: Push**

Run:

```bash
git push
```
