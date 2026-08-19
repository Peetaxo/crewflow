# Crew Event Visibility and Timelog Recovery Design

**Date:** 2026-08-19  
**Status:** Approved  
**Scope:** Crew mobile Přehled, public event feed and history, role-scoped hydration, and rejected timelog resubmission

## Problem

The Crew mobile experience currently combines four regressions:

1. The `Crew can view assigned events` RLS policy only exposes events with a current `event_assignments` row. A Crew member can still own a draft or rejected timelog after an assignment lifecycle change, but the related event becomes invisible.
2. Event and timelog snapshots use temporary numeric IDs derived from independently filtered result sets. After a role change or RLS visibility change, those IDs can be re-indexed differently. Event detail then misses an existing rejected timelog, constructs a new draft without a stable event UUID, and saving fails with `Nepodarilo se sparovat akci s databazovym zaznamem.`
3. The integrated `MyShiftsView` markup uses the `nodu-my-shifts-*` class family, but its stylesheet was not included in the integration branch.
4. The same RLS policy hides every public event that has no current assignment or owned timelog. The mobile UI already supports event applications, but Crew cannot see the event rows needed to use that workflow.

The mobile Crew events feed also defaults to a start date of today, which hides all earlier visible events even when Crew is entitled to see them.

## Approved Approach

### Database visibility

The pending, not-yet-deployed migration replaces the Crew event SELECT policy. A Crew member may view an event when any of these conditions is true:

- the event is published for Crew with status `upcoming` or `full`,
- they have a current row in `event_assignments`, or
- they own a timelog for that event in any lifecycle status, or
- they own an application for that event in any lifecycle status.

The policy retains the explicit Crew role check and does not expand event write privileges. Unrelated `planning` and `past` rows remain hidden, while draft, rejected, submitted, approved, invoiced, and paid history stays readable to the owning Crew profile.

### Stable identity and resubmission

Match event-related timelogs by `eventSupabaseId` whenever both records have stable UUIDs, falling back to the numeric ID only for local-data mode. Generated drafts carry the event UUID.

When `saveTimelog` cannot find the row in the current local snapshot, it must not immediately INSERT. In Supabase mode it reloads the authoritative timelog snapshot and resolves the exact `(event UUID, contractor profile UUID)` pair. If the rejected row exists, the existing timelog UUID, version, and status are passed to the atomic save RPC. Only a truly absent pair is created.

### Role-scoped hydration

Role switching changes database visibility. The app therefore changes the local role only after `set_current_user_role` succeeds, resets all Supabase hydration guards, and invalidates active query caches. Events and timelogs then reload under the new role in one consistent visibility scope.

### Event history

The mobile Crew event feed defaults to all visible events. The date picker remains an optional “show from this date” filter and gains a clear “Všechny akce” action. Past events remain subject to RLS and the existing Crew filters.

The application action is available only for a published `upcoming` event with free capacity. A `full` event remains visible but shows `Obsazeno`; an owned historical event remains visible without a new-application action.

### Přehled styling

Move the existing mobile My Shifts stylesheet from the source mobile branch into `src/styles/mobile-my-shifts.css` and import it from `src/main.tsx`. No visual redesign is introduced.

## Error Handling

- Missing stable UUIDs in Supabase mode remain fail-closed.
- A missing local match triggers one authoritative lookup by stable identity before deciding between update and create.
- Database details stay in diagnostics; the UI receives the existing stable Czech domain messages.
- A failed role switch leaves the previous role and data scope active.

## Verification

- Static migration test for the exact Crew SELECT predicate: published `upcoming/full` events or an owned assignment, timelog, or application, with unchanged event write ACL.
- Mobile events regressions proving a public unassigned event is visible and actionable, a full event is visible but not actionable, and unrelated planning/past events remain hidden by the database contract.
- Timelog service regression proving a stale/missing local row updates the existing rejected UUID rather than inserting.
- Event detail regression proving UUID-first matching and UUID-bearing drafts.
- Auth/bootstrap regression proving successful role switching reloads the role-scoped queries only after the RPC.
- Mobile events regression proving past visible events are shown by default and the date filter can be cleared.
- CSS contract test proving the My Shifts stylesheet is imported and contains the required class families.
- Focused tests, TypeScript, ESLint, production build, then localhost Crew smoke test. No production deployment.
