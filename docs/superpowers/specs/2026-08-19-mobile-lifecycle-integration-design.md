# Mobile Lifecycle Integration — Design

**Date:** 2026-08-19
**Status:** Approved for planning
**Scope:** Preserve the mobile application experience from `feature/free-event-map-workflow` while retaining the database, identity, concurrency, and lifecycle hardening from `codex/timelog-assignment-lifecycle`. No production deployment or destructive change to either source worktree.

## Problem

The localhost preview was started from `codex/timelog-assignment-lifecycle`, while the earlier “Mobilní app” work ran from `feature/free-event-map-workflow`. The branches share commit `b380587f5943464700f77647a0c0c320b570ddf6` but have since accumulated 67 and 71 unique commits respectively. Thirty critical files were changed on both sides, including event, timelog, receipt, invoice, mapping, type, and detail-view code.

The mobile branch contains the expected Crew/CrewHead/COO preview switch, mobile management navigation, native shell work, maps, and approval UI. The lifecycle branch contains the newer RLS policies, atomic RPCs, stable UUID and optimistic-version handling, session-bound hydration, duplicate repair, and mutation ordering. A full merge or wholesale file replacement could restore the UI while silently removing data-integrity protections.

The current localhost also logs `permission denied for table timelogs` during Crew hydration and falls back to empty local data. The canonical Red Bull event and timelog still exist in Supabase, so the missing event must be treated as a hydration/authentication failure, not as missing production data.

## Goals

- Preserve the mobile layout and behavior built in the “Mobilní app” worktree.
- Restore the mobile Crew/CrewHead/COO switch and role-specific mobile navigation.
- Keep every lifecycle, RLS, RPC, UUID, version, queue, and stale-session protection from the hardened branch.
- Load the Red Bull event from Supabase for the authenticated test user without falling back to empty local data.
- Preserve all committed and uncommitted mobile work in a recoverable backup before integration.
- Run the integrated application from a separate clean worktree and leave both source worktrees untouched.
- Stop before any production database or frontend deployment.

## Non-Goals

- Rewriting the mobile design.
- Replacing hardened services with older mobile-branch service files.
- Reapplying already-deployed Supabase migrations.
- Cleaning unrelated Fleet or Warehouse baseline failures.
- Changing production data to make the preview look correct.

## Recovery Boundary

The committed mobile branch is preserved by both `backup/mobile-app-pre-integration-20260819` and a complete Git bundle. The twelve modified tracked files are preserved as a binary patch, and the untracked `src/assets/nodu-logo.svg` is preserved in a separate archive. SHA-256 checksums and archive contents are verified before integration.

The backup artifacts live outside the repository at:

`/Users/peetax/Projekty/crewflow-backups/mobile-app-pre-integration-20260819`

The source worktree `/Users/peetax/Projekty/crewflow/.worktrees/free-event-map-workflow` remains dirty but unchanged. Integration happens only in `/Users/peetax/Projekty/crewflow/.worktrees/mobile-lifecycle-integration` on `codex/mobile-lifecycle-integration`.

## Integration Architecture

The lifecycle branch is the source of truth for data access and mutation behavior. Mobile behavior is transferred in bounded slices rather than through a full branch merge.

### Mobile shell and role switching

Port the mobile role switch and management-aware bottom navigation from the mobile branch into the hardened `AppLayout` and `MobileCrewNav` components. Role changes continue through `AuthProvider.switchRole` and `set_current_user_role`; the UI must not simulate a role locally when Supabase authentication is required. Crew, CrewHead, and COO each receive their intended mobile navigation without reverting desktop behavior.

### Mobile views and styles

Transfer the mobile layout, styles, modal behavior, map/address presentation, dashboard presentation, login asset, and native Capacitor configuration as UI changes. Where a mobile component calls an event, timelog, receipt, or invoice service, adapt the component to the current typed API instead of copying the older service implementation.

### Data services

Keep the hardened event, timelog, receipt, invoice, mapper, generated database type, and Supabase migration files as the base. Review mobile-only service changes individually and reimplement only behavior that is not already present. Stable Supabase UUIDs, expected `updated_at` values, exact RPC result validation, mutation queues, authoritative recovery, and session epochs remain mandatory.

### Crew hydration and Red Bull visibility

Diagnose the current Crew loader independently from the visual merge. The loader must not query `timelogs` before an authenticated Supabase session is ready, mark an unauthenticated failure as loaded, or permanently retain an empty fallback after login. Table privileges and RLS are verified read-only before any schema change is proposed.

If the authenticated role has the reviewed SELECT privilege, fix the client bootstrap/hydration ordering and add a regression test. If the privilege is genuinely missing in the linked catalog, stop and present the exact catalog mismatch before creating a migration. No permission will be widened merely to silence the error.

## Error Handling

- Authentication or hydration failures remain visible in diagnostics and produce a stable Czech user-facing state; raw PostgreSQL/RLS text is not toasted.
- A discarded pre-login or pre-reset load may not commit local state or mark hydration complete.
- Role-switch errors restore the previous role and keep navigation consistent.
- The application must never replace a failed Supabase load with unrelated demo data while presenting it as live production data.

## Test Strategy

Implementation follows RED–GREEN–REFACTOR for each slice.

- Mobile layout tests prove the switch is visible at mobile width and that Crew, CrewHead, and COO navigation changes correctly.
- Auth tests prove role changes use the authenticated role RPC and recover from failure.
- Crew hydration tests reproduce the pre-session permission failure, successful post-session retry, reset race, and no false `loaded` state.
- Event integration tests prove the canonical Red Bull event remains visible after live hydration.
- Existing lifecycle tests protect atomic assignments, timelog create/save/status/delete, invoice and receipt transitions, UUID identity, optimistic concurrency, and stale-session handling.
- TypeScript, focused ESLint, production build, and scoped diff checks must pass.
- The final localhost smoke test verifies the role switch, Red Bull visibility, role navigation, and absence of `permission denied for table timelogs` in the browser console.

## Completion Criteria

The work is complete when a clean localhost preview from the integration worktree shows the mobile role switch, loads Red Bull from Supabase under the authenticated test session, preserves role-specific mobile navigation, and passes the mobile plus lifecycle verification matrix. The result is committed on the integration branch. Production deployment remains a separate, explicitly approved action.
