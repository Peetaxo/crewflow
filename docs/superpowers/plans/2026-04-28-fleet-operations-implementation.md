# Fleet Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Fleet section with vehicle overview, detail, reservations, calendar, STK alerts, and visible conflict handling.

**Architecture:** Add fleet types to the shared domain model, seed local app state with sample vehicles/reservations, and implement a focused fleet service for derived rows and writes. `FleetView` owns the view state and modal state locally, matching the app's current local-data pattern.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, date-fns, lucide-react, existing local app state service.

---

### Task 1: Fleet Domain And Service

**Files:**
- Modify: `src/types.ts`
- Modify: `src/data.ts`
- Modify: `src/lib/app-data.ts`
- Create: `src/features/fleet/services/fleet.service.ts`
- Test: `src/features/fleet/services/fleet.service.test.ts`

- [ ] Add `FleetVehicle`, `FleetVehicleStatus`, `FleetReservation`, and `FleetReservationDraft` types.
- [ ] Add `fleetVehicles` and `fleetReservations` to `AppDataSnapshot`, `localAppState`, and `getLocalAppData`.
- [ ] Seed eight vehicles and several reservations in `src/data.ts`.
- [ ] Implement service functions:
  - `getFleetDependencies()`
  - `getFleetOverviewRows(referenceDate?)`
  - `getFleetVehicleDetail(vehicleId, referenceDate?)`
  - `createEmptyFleetReservation(vehicleId, responsibleProfileId)`
  - `findFleetReservationConflicts(reservation)`
  - `saveFleetReservation(reservation)`
- [ ] Write tests proving STK warnings, nearest reservation, default responsible person, and non-blocking conflict marking.

### Task 2: Fleet View And Reservation Modal

**Files:**
- Modify: `src/views/FleetView.tsx`
- Test: `src/views/FleetView.test.tsx`

- [ ] Replace the placeholder with a table overview.
- [ ] Add a vehicle detail view shown after clicking `Detail`.
- [ ] Add a month availability calendar in the detail view.
- [ ] Add a reservation modal with project, optional project-filtered event, responsible person, date/time range, and note.
- [ ] Show conflict warnings before save and keep saved conflict badges visible.
- [ ] Write view tests for overview columns, detail opening, STK alert, and conflict visibility.

### Task 3: Verification

**Files:**
- Verify: `src/features/fleet/services/fleet.service.test.ts`
- Verify: `src/views/FleetView.test.tsx`
- Verify: existing navigation tests

- [ ] Run targeted fleet/navigation tests.
- [ ] Run lint.
- [ ] Run production build.
- [ ] Inspect in the in-app browser at `http://localhost:8080/`.

