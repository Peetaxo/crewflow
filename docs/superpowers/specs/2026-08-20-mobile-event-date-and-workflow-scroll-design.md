# Mobile Event Date and Workflow Scroll Design

**Date:** 2026-08-20

## Goal

Keep the mobile Events feed focused on relevant current and future work, while preventing the Crew dashboard Workflow list from growing into a long page section.

Desktop event month navigation and desktop dashboard layouts remain unchanged.

## Mobile Events Date Boundary

The mobile list view uses a shared start-date boundary for Crew, CrewHead, and COO.

- The initial boundary is the device's current local calendar date.
- A calendar icon is available in the mobile Events header for all three roles.
- Selecting a date changes the boundary and displays events from that date onward.
- The calendar's reset action is labelled and implemented as “Dnes a dál”. It restores today's boundary; it does not remove the date boundary entirely.
- The selected boundary remains active while the Events view stays mounted, including role switches.
- Opening an already selected event detail must not make that event disappear from the backing list before the detail can render.

The mobile feed remains sorted by start date and then event name.

## Role-Specific Multi-Day Event Rules

Crew browsing should not be crowded by already-started, fully staffed multi-day events that are unrelated to the signed-in member.

For Crew:

- A regular browse result is visible when `event.startDate >= selectedStartDate`.
- An event that started before the boundary but has not ended remains visible only when the signed-in Crew member is assigned to it or has a pending application/confirmation workflow for it.
- Selecting an older boundary through the calendar makes events whose start date is on or after that boundary visible normally.

For CrewHead and COO:

- An event is visible when `event.endDate >= selectedStartDate`.
- This keeps already-started but still active events available for operational management.

Status/participation filters continue to refine the date-filtered result. The date boundary is always applied first.

## Mobile Header and Calendar Interaction

The existing mobile Crew date picker is generalized for all mobile roles without changing the desktop month controls.

- The mobile list header shows the calendar action on the left.
- Crew keeps its current participation filter action on the right.
- CrewHead and COO retain their management actions and status filtering; only the shared date boundary and calendar entry point are added.
- The create-event action for managers remains available.
- Empty-state copy explains that no events exist from the selected date.

## Crew Dashboard Workflow Height

Only the mobile `Přehled → Workflow → Výkazy` card list becomes internally scrollable.

- The heading and status tabs stay outside the scroll viewport.
- The active tab's card grid receives a mobile-only maximum height of `min(26rem, 52dvh)` and vertical overflow.
- Normal content height is preserved when the active tab has fewer items than the maximum height.
- The chosen height should show roughly two complete typical single-day cards and the beginning of the next card, making scrollability discoverable.
- Touch momentum scrolling and overscroll containment keep the gesture inside the list.
- Tablet and desktop grid layouts keep their existing unconstrained height.
- The action-required panel above Workflow is not changed.

## Accessibility

- Calendar controls retain explicit Czech accessible labels.
- The scrollable Workflow list remains keyboard-focusable through its existing card controls.
- Focused cards must remain reachable by scrolling; content is not truncated or removed from the DOM.
- The partial third card is only a visual scroll cue and must not block interaction.

## Testing

Add focused regressions covering:

1. All mobile roles start with today's date boundary.
2. Crew hides an unrelated multi-day event that began before today.
3. Crew retains an already-started event when the signed-in profile is assigned or has a pending workflow.
4. CrewHead and COO retain already-started events that still overlap today.
5. Choosing an older calendar date exposes the corresponding historical events.
6. The reset action restores today rather than an unbounded “all events” state.
7. Desktop month filtering and navigation remain unchanged.
8. The mobile Workflow card grid has a bounded vertical scroll viewport while tablet/desktop layouts remain unconstrained.

Run the focused Events and Crew overview tests, TypeScript, ESLint, the production build, and physical-iPhone verification. No Supabase schema change or production deployment is part of this work.
