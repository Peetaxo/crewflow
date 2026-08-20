# Crew Event Visibility and Timelog Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Crew Přehled layout, show the public event offer plus Crew-owned history, and let an existing rejected timelog be resubmitted without creating a duplicate.

**Architecture:** Add one forward-only RLS migration that exposes published `upcoming/full` events or Crew-owned lifecycle rows, keep all writes on stable UUIDs, and refresh query/hydration state only after a role switch succeeds. Preserve the restored mobile UI and add the missing My Shifts stylesheet plus an optional date cutoff instead of a today-only feed.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest/Testing Library, Supabase/Postgres RLS, CSS

---

## File Structure

- Create `supabase/migrations/20260819144500_restore_crew_event_history_visibility.sql`: forward-only Crew event SELECT policy.
- Create `src/features/events/services/event-visibility-policy-migration.test.ts`: exact RLS policy contract.
- Create `src/app/providers/reset-supabase-data-scope.ts`: one role/session scoped hydration reset and query invalidation boundary.
- Modify `src/app/providers/AuthProvider.tsx` and provider tests: switch the database role first, then publish the UI role and reload data.
- Modify `src/app/providers/AppDataBootstrap.tsx` and tests: use the shared reset boundary for auth scope changes.
- Modify `src/features/events/services/events.service.ts` and tests: UUID-first event detail child matching.
- Modify `src/views/EventDetailView.tsx` and lifecycle tests: generated timelog drafts retain the event UUID.
- Modify `src/features/timelogs/services/timelogs.service.ts` and tests: authoritative pair recovery before choosing update versus create.
- Modify `src/views/EventsView.tsx` and tests: show all visible history by default and make the date cutoff clearable.
- Create `src/styles/mobile-my-shifts.css`; modify `src/main.tsx` and `src/index.css.test.ts`: restore the approved My Shifts presentation.
- Modify the pending event-visibility migration and its contract test: expose published events plus owned assignments, timelogs, and applications.
- Modify `src/views/EventsView.tsx` and `src/views/EventsView.test.tsx`: restrict the application CTA to a published, non-full `upcoming` event.

### Task 1: Restore Crew Event Read Visibility

**Files:**
- Create: `supabase/migrations/20260819144500_restore_crew_event_history_visibility.sql`
- Create: `src/features/events/services/event-visibility-policy-migration.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

Read the migration as text and assert that the Crew SELECT policy contains both exact ownership branches while event DML remains absent:

```ts
expect(sql).toContain("drop policy if exists \"Crew can view assigned events\" on public.events");
expect(sql).toContain("assignment.profile_id = public.current_profile_id()");
expect(sql).toContain("timelog.contractor_id = public.current_profile_id()");
expect(sql).not.toMatch(/grant\s+(?:delete|all)\s+on\s+table\s+public\.events/i);
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- src/features/events/services/event-visibility-policy-migration.test.ts`  
Expected: FAIL because the forward migration does not exist.

- [ ] **Step 3: Add the forward-only policy migration**

Create the Crew SELECT policy with the existing Crew role guard and this ownership predicate:

```sql
and (
  exists (
    select 1 from public.event_assignments assignment
    where assignment.event_id = events.id
      and assignment.profile_id = public.current_profile_id()
  )
  or exists (
    select 1 from public.timelogs timelog
    where timelog.event_id = events.id
      and timelog.contractor_id = public.current_profile_id()
  )
)
```

- [ ] **Step 4: Run the policy test and confirm GREEN**

Run: `npm test -- src/features/events/services/event-visibility-policy-migration.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260819144500_restore_crew_event_history_visibility.sql src/features/events/services/event-visibility-policy-migration.test.ts
git commit -m "fix: restore crew event history visibility"
```

### Task 2: Reload Data After a Successful Role Switch

**Files:**
- Create: `src/app/providers/reset-supabase-data-scope.ts`
- Modify: `src/app/providers/AuthProvider.tsx`
- Modify: `src/app/providers/AuthProvider.test.tsx`
- Modify: `src/app/providers/AppDataBootstrap.tsx`
- Modify: `src/app/providers/AppDataBootstrap.test.tsx`

- [ ] **Step 1: Write failing role-scope tests**

Assert that a successful `set_current_user_role` call resets hydration and invalidates queries before the new role becomes observable, while a rejected RPC keeps the previous role and does not reset data.

```ts
expect(rpcMock).toHaveBeenCalledWith('set_current_user_role', { p_role: 'crew' });
expect(resetSupabaseDataScope).toHaveBeenCalledTimes(1);
expect(screen.getByTestId('role')).toHaveTextContent('crew');
```

- [ ] **Step 2: Run provider tests and confirm RED**

Run: `npm test -- src/app/providers/AuthProvider.test.tsx src/app/providers/AppDataBootstrap.test.tsx`  
Expected: FAIL because only crew hydration is reset and the UI role is changed before the RPC succeeds.

- [ ] **Step 3: Implement the shared data-scope reset**

The new module first awaits `queryClient.cancelQueries()`, calls every existing `resetSupabase*Hydration`, and then awaits `queryClient.invalidateQueries()`. `AuthProvider.switchRole` calls it only after a successful RPC and then calls `setRole(nextRole)`.

- [ ] **Step 4: Run provider tests and confirm GREEN**

Run: `npm test -- src/app/providers/AuthProvider.test.tsx src/app/providers/AppDataBootstrap.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/providers/reset-supabase-data-scope.ts src/app/providers/AuthProvider.tsx src/app/providers/AuthProvider.test.tsx src/app/providers/AppDataBootstrap.tsx src/app/providers/AppDataBootstrap.test.tsx
git commit -m "fix: reload data after role changes"
```

### Task 3: Recover and Resubmit the Existing Rejected Timelog

**Files:**
- Modify: `src/features/events/services/events.service.ts`
- Modify: `src/features/events/services/events.service.test.ts`
- Modify: `src/views/EventDetailView.tsx`
- Modify: `src/views/EventDetailView.lifecycle.test.tsx`
- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Modify: `src/features/timelogs/services/timelogs.service.test.ts`

- [ ] **Step 1: Write failing stable-identity tests**

Cover a re-indexed event whose numeric ID no longer matches its existing rejected timelog. Assert that event detail still returns the timelog by UUID and that a generated draft contains `eventSupabaseId`.

```ts
expect(detail.timelogs).toEqual([
  expect.objectContaining({ supabaseId: rejectedTimelogId, eventSupabaseId: eventId }),
]);
expect(openedDraft).toEqual(expect.objectContaining({ eventSupabaseId: eventId }));
```

Add a service test where local state lacks the row but the authoritative reload contains the rejected pair. Assert `save_timelog_atomic` receives that row UUID, `p_expected_status: 'rejected'`, and no create call is made.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -- src/features/events/services/events.service.test.ts src/views/EventDetailView.lifecycle.test.tsx src/features/timelogs/services/timelogs.service.test.ts`  
Expected: FAIL on numeric-only matching, missing event UUID, and INSERT selection.

- [ ] **Step 3: Implement UUID-first matching and authoritative pair recovery**

Use stable identity when available:

```ts
const eventTimelogs = (snapshot.timelogs ?? []).filter((timelog) => (
  event.supabaseId && timelog.eventSupabaseId
    ? timelog.eventSupabaseId === event.supabaseId
    : timelog.eid === event.id
));
```

Generated drafts copy `event.supabaseId`. In `saveTimelog`, if the local row is absent but `(eventSupabaseId, contractorProfileId)` is complete, reload once and resolve that exact pair before calling either the atomic update or create path.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run the same command from Step 2.  
Expected: PASS, with the rejected row transitioning through the update RPC.

- [ ] **Step 5: Commit**

```bash
git add src/features/events/services/events.service.ts src/features/events/services/events.service.test.ts src/views/EventDetailView.tsx src/views/EventDetailView.lifecycle.test.tsx src/features/timelogs/services/timelogs.service.ts src/features/timelogs/services/timelogs.service.test.ts
git commit -m "fix: resubmit rejected timelogs by UUID"
```

### Task 4: Restore Crew History and Přehled Styling

**Files:**
- Modify: `src/views/EventsView.tsx`
- Modify: `src/views/EventsView.test.tsx`
- Create: `src/styles/mobile-my-shifts.css`
- Modify: `src/main.tsx`
- Modify: `src/index.css.test.ts`

- [ ] **Step 1: Write failing history and CSS contract tests**

Render a mobile Crew feed with one past and one future visible event and assert both are initially present. Select a cutoff date, assert older rows disappear, click `Všechny akce`, and assert history returns. Read `main.tsx` and the new stylesheet and assert the `nodu-my-shifts-shell`, `nodu-my-shifts-next-card`, `nodu-my-shifts-tabs`, and `nodu-my-shifts-billing-panel` contracts.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- src/views/EventsView.test.tsx src/index.css.test.ts`  
Expected: FAIL because the feed starts today and the My Shifts stylesheet is absent.

- [ ] **Step 3: Implement optional cutoff and restore the existing stylesheet**

Represent no cutoff as an empty string. Apply `event.endDate >= mobileCrewStartDate` only when the cutoff exists, pass `undefined` to occurrence generation otherwise, and add a `Všechny akce` button to clear the filter. Copy the established `nodu-my-shifts-*` rules without redesign and import `./styles/mobile-my-shifts.css` from `main.tsx`.

- [ ] **Step 4: Run tests and confirm GREEN**

Run the same command from Step 2.  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/EventsView.tsx src/views/EventsView.test.tsx src/styles/mobile-my-shifts.css src/main.tsx src/index.css.test.ts
git commit -m "fix: restore crew mobile history layout"
```

### Task 5: Verify the Integrated Fix Without Deployment

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: Run the focused regression matrix**

```bash
npm test -- src/features/events/services/event-visibility-policy-migration.test.ts src/app/providers/AuthProvider.test.tsx src/app/providers/AppDataBootstrap.test.tsx src/features/events/services/events.service.test.ts src/views/EventDetailView.lifecycle.test.tsx src/features/timelogs/services/timelogs.service.test.ts src/views/EventsView.test.tsx src/index.css.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run static gates**

```bash
npx tsc --noEmit
npx eslint src/app/providers/reset-supabase-data-scope.ts src/app/providers/AuthProvider.tsx src/app/providers/AppDataBootstrap.tsx src/features/events/services/events.service.ts src/views/EventDetailView.tsx src/features/timelogs/services/timelogs.service.ts src/views/EventsView.tsx
npm run build
git diff --check
```

Expected: exit 0; only already-documented build warnings are acceptable.

- [ ] **Step 3: Run the broader lifecycle regression set**

Run the existing event/timelog/mobile lifecycle test matrix and compare any full-suite failures with the known Fleet/Warehouse baseline.  
Expected: no new feature-scope failure.

- [ ] **Step 4: Smoke-test localhost as Crew**

Verify in the mobile viewport:

1. Přehled has the restored card, stats, tabs, and billing layout.
2. Akce initially shows entitled past and future events, including Red Bull through its own timelog.
3. The date cutoff still works and can be cleared with `Všechny akce`.
4. Open the rejected Vyzvedávky timelog and resubmit it; the app must call the update path and must not display the pairing error.

Do not push the migration and do not deploy the frontend.

- [ ] **Step 5: Record final evidence**

Report commits, focused/full gate results, localhost observations, and the explicit remaining production step: schema dry-run/verifier before any deployment.

### Task 6: Expose the Public Crew Event Offer Safely

**Files:**
- Modify: `supabase/migrations/20260819144500_restore_crew_event_history_visibility.sql`
- Modify: `src/features/events/services/event-visibility-policy-migration.test.ts`
- Modify: `src/views/EventsView.tsx`
- Modify: `src/views/EventsView.test.tsx`

- [ ] **Step 1: Write failing policy and CTA tests**

Extend the migration contract to require the public status branch and the owned-application branch:

```ts
expect(sql).toContain("events.status in ('upcoming'::public.event_status, 'full'::public.event_status)");
expect(sql).toContain('application.event_id = events.id');
expect(sql).toContain('application.profile_id = public.current_profile_id()');
```

In the existing mobile Crew feed regression, assert that the unassigned `upcoming` card contains `Prihlasit na akci`, the `full` card contains disabled `Obsazeno`, and the owned `past` card contains neither application action.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
npm test -- src/features/events/services/event-visibility-policy-migration.test.ts src/views/EventsView.test.tsx
```

Expected: FAIL because the policy lacks published/application branches and the past card currently offers a new application.

- [ ] **Step 3: Expand only the pending SELECT policy**

Use this exact visibility predicate under the existing Crew role guard:

```sql
events.status in ('upcoming'::public.event_status, 'full'::public.event_status)
or exists (
  select 1 from public.event_assignments assignment
  where assignment.event_id = events.id
    and assignment.profile_id = public.current_profile_id()
)
or exists (
  select 1 from public.timelogs timelog
  where timelog.event_id = events.id
    and timelog.contractor_id = public.current_profile_id()
)
or exists (
  select 1 from public.event_applications application
  where application.event_id = events.id
    and application.profile_id = public.current_profile_id()
)
```

Do not add event INSERT, UPDATE, or DELETE privileges.

- [ ] **Step 4: Restrict the application action to published availability**

Derive one card-level guard and reuse it for both optional time inputs and the application button:

```ts
const canApplyToEvent = event.status === 'upcoming' && !isFullyStaffed;
```

Owned `past` rows stay readable but cannot create a new application. `full` rows remain visible and render disabled `Obsazeno`.

- [ ] **Step 5: Run tests and confirm GREEN**

Run the same focused command from Step 2.
Expected: both files PASS.

- [ ] **Step 6: Verify without deployment**

```bash
npx tsc --noEmit
npx eslint src/views/EventsView.tsx src/views/EventsView.test.tsx src/features/events/services/event-visibility-policy-migration.test.ts
npm run build
supabase db push --linked --dry-run
supabase db lint --linked --level error --fail-on error
git diff --check
```

Expected: all static gates pass; dry-run lists only `20260819144500_restore_crew_event_history_visibility.sql`; no database write occurs.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260819144500_restore_crew_event_history_visibility.sql src/features/events/services/event-visibility-policy-migration.test.ts src/views/EventsView.tsx src/views/EventsView.test.tsx
git commit -m "fix: expose published events to crew"
```
