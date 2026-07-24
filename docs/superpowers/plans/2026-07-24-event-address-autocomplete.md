# Event Address Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Places address suggestions to event editing while preserving manual address entry when Google Maps is not configured.

**Architecture:** Keep Google-specific code in a small service and expose a reusable `EventAddressField` component to `EventEditModal`. The component calls the service only after a manager types at least three characters, writes manual text immediately with precise map fields cleared, and writes `address/placeId/locationLat/locationLng` after a suggestion is selected.

**Tech Stack:** React, TypeScript, Vite env vars, Vitest, Testing Library, Google Maps JavaScript Places Autocomplete Data API.

---

### Task 1: Google Places Service

**Files:**
- Create: `src/features/events/services/event-location-google.service.ts`
- Create: `src/features/events/services/event-location-google.service.test.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `.env.example`

- [x] **Step 1: Write failing service tests**

Cover:
- autocomplete is unavailable when no API key is configured;
- manual text is preserved by a plain fallback path;
- Google suggestions are normalized from a mocked `AutocompleteSuggestion.fetchAutocompleteSuggestions`;
- selected place details are normalized into `address/placeId/locationLat/locationLng`.

- [x] **Step 2: Run service tests and confirm RED**

Run:

```bash
npm test -- src/features/events/services/event-location-google.service.test.ts --reporter verbose
```

Expected: fails because the service file does not exist.

- [x] **Step 3: Implement service and env documentation**

Implement a Google Maps JS loader, `isGooglePlacesConfigured()`, `fetchGoogleAddressSuggestions()`, and `resolveGoogleAddressSuggestion()`. Add `VITE_GOOGLE_MAPS_API_KEY` to `.env.example` and typed Vite env declarations.

- [x] **Step 4: Run service tests and confirm GREEN**

Run:

```bash
npm test -- src/features/events/services/event-location-google.service.test.ts --reporter verbose
```

Expected: service tests pass.

### Task 2: Address Field Component

**Files:**
- Create: `src/features/events/components/EventAddressField.tsx`
- Create: `src/features/events/components/EventAddressField.test.tsx`
- Modify: `src/components/modals/EventEditModal.tsx`
- Modify: `src/components/modals/EventEditModal.test.tsx`

- [x] **Step 1: Write failing component tests**

Cover:
- manual typing calls `onChange` with `address` and clears `placeId/locationLat/locationLng`;
- typing at least three characters shows mocked suggestions;
- selecting a suggestion calls `onChange` with precise location metadata;
- when autocomplete is disabled, the field still renders as a plain address input.

- [x] **Step 2: Run component tests and confirm RED**

Run:

```bash
npm test -- src/features/events/components/EventAddressField.test.tsx src/components/modals/EventEditModal.test.tsx --reporter verbose
```

Expected: fails because the component does not exist and the modal still uses an inline input.

- [x] **Step 3: Implement component and wire modal**

Render a styled address input, suggestion popover, status text, and callback wiring. Replace the inline `Adresa` input in `EventEditModal` with `EventAddressField`.

- [x] **Step 4: Run component tests and confirm GREEN**

Run:

```bash
npm test -- src/features/events/components/EventAddressField.test.tsx src/components/modals/EventEditModal.test.tsx --reporter verbose
```

Expected: component and modal tests pass.

### Task 3: Verification And Commit

**Files:**
- Verify all changed files.

- [x] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/features/events/services/event-location-google.service.test.ts src/features/events/components/EventAddressField.test.tsx src/components/modals/EventEditModal.test.tsx src/features/events/services/event-location.service.test.ts src/views/EventDetailView.test.tsx --reporter verbose
```

- [x] **Step 2: Run build and lint**

Run:

```bash
npm run build
npm run lint
```

- [x] **Step 3: Check diff and commit**

Stage only files from this plan and the CH/COO mobile note, then commit:

```bash
git commit -m "feat: add event address autocomplete"
```

- [x] **Step 4: Push**

Run:

```bash
git push
```
