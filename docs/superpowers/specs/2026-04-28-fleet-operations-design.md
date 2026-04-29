# Fleet Operations Design

## Goal

Build a Fleet section for crewhead and COO users that tracks company vehicles, their operational state, and project-based reservations.

## Scope

The first version is an operational fleet tool, not a full vehicle accounting system. It covers:

- A fleet overview table with columns: Auto, SPZ, Typ, Nejblizsi rezervace, Stav, Detail.
- STK shown in the overview only when attention is needed.
- A vehicle detail view with core vehicle information, STK/service details, upcoming reservations, and an availability calendar.
- Reservation creation tied to a required project and optional event.
- Required responsible person, defaulting to the signed-in profile.
- Conflict detection that warns but does not block saving. Conflicting reservations stay marked.

Out of scope for this version:

- Fuel tracking.
- Cost tracking.
- Document uploads.
- Service history records.
- Supabase persistence for fleet-specific tables.

## Data Model

`FleetVehicle` represents one company vehicle. It stores a display name, license plate, vehicle type, operational status, optional capacity/notes, STK date, insurance date, and service date.

`FleetReservation` represents one vehicle reservation. It stores vehicle ID, required project ID, optional event ID, responsible profile ID, date/time range, note, and `hasConflict`.

Reservations are valid even when they overlap. Conflict state is visible in the UI so managers can intentionally keep operational exceptions.

## UX

The fleet overview is a table on desktop and remains readable on narrower screens through horizontal overflow. It is optimized for quick comparison across roughly eight vehicles.

Vehicle detail opens inside the Fleet section after clicking Detail. It shows:

- Vehicle identity and current status.
- STK/insurance/service details.
- Upcoming reservations.
- A month calendar with reservation markers.
- A button for a new reservation.

The reservation modal defaults the responsible person to the current signed-in profile. Project selection is required. Event selection is optional and filtered to events belonging to the selected project.

## Testing

Tests should cover:

- Navigation access already covered by constants/layout tests.
- Fleet service conflict detection and default reservation creation.
- Fleet view rendering of overview, detail, STK warning, and conflict marker.

