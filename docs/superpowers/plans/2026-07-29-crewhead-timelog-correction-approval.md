# CrewHead Timelog Correction Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require Crew confirmation after a CrewHead changes a submitted timelog before the report can move onward to COO approval.

**Architecture:** Add `pending_crew_confirmation` as a first-class timelog status in TypeScript and Supabase. Keep status-only approval separate from data edits: CH can approve `pending_ch` onward, but CH data edits of `pending_ch` save the report into the new Crew confirmation state. Crew can edit or confirm that state back to `pending_ch`.

**Tech Stack:** React, TypeScript, Vitest, Supabase Postgres/RLS, existing timelog service and modal components.

---

### Task 1: Types, Labels, And Permissions

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/database.types.ts`
- Modify: `src/components/shared/StatusBadge.tsx`
- Modify: `src/features/timelogs/services/timelog-permissions.ts`
- Test: `src/features/timelogs/services/timelog-permissions.test.ts`

- [x] **Step 1: Write failing permission tests**

Add tests asserting:

```ts
expect(canEditTimelogData('crew', pendingCrewConfirmationOwn)).toBe(true);
expect(canSubmitTimelog('crew', pendingCrewConfirmationOwn)).toBe(true);
expect(canEditTimelogData('crewhead', pendingCrewConfirmation)).toBe(false);
expect(canSubmitTimelog('crewhead', pendingCrewConfirmation)).toBe(false);
expect(canSubmitTimelog('coo', pendingCrewConfirmation)).toBe(false);
```

- [x] **Step 2: Run tests to verify RED**

Run: `npm test -- src/features/timelogs/services/timelog-permissions.test.ts`

Expected: FAIL because `pending_crew_confirmation` is not a known status and permissions are missing.

- [x] **Step 3: Implement status support**

Add `'pending_crew_confirmation'` to `TimelogStatus` and database enum types, add UI label `Čeká na souhlas Crew`, then allow Crew edit/submit while blocking CH/COO approval from that status.

- [x] **Step 4: Run tests to verify GREEN**

Run: `npm test -- src/features/timelogs/services/timelog-permissions.test.ts`

Expected: PASS.

### Task 2: Supabase Policy Contract

**Files:**
- Create: `supabase/migrations/*_add_pending_crew_confirmation_timelog_status.sql`
- Create: `supabase/migrations/*_update_timelog_confirmation_policies.sql`
- Modify: `supabase/timelog-role-workflow-policies-2026-07.sql`
- Test: `src/features/timelogs/services/timelog-supabase-policy.test.ts`

- [x] **Step 1: Write failing SQL policy test**

Add assertions that the policy SQL contains:

```ts
expect(sql).toContain("'pending_crew_confirmation'");
expect(sql).toContain("pending_crew_confirmation");
expect(sql).toContain("timelog_update_is_status_only");
```

and specifically verifies Crew can move the new state back to `pending_ch`, while CrewHead cannot approve that new state to `pending_coo`.

- [x] **Step 2: Run test to verify RED**

Run: `npm test -- src/features/timelogs/services/timelog-supabase-policy.test.ts`

Expected: FAIL because SQL does not yet mention the new status.

- [x] **Step 3: Create migrations through Supabase CLI**

Run:

```bash
supabase migration new add_pending_crew_confirmation_timelog_status
supabase migration new update_timelog_confirmation_policies
```

Expected: two timestamped SQL files under `supabase/migrations/`.

- [x] **Step 4: Implement SQL**

First migration adds enum value:

```sql
alter type public.timelog_status add value if not exists 'pending_crew_confirmation';
```

Second migration updates `can_edit_timelog_data`, `enforce_timelog_update_permissions`, and timelog/timelog_days policies so the role rules from the spec are enforced.

- [x] **Step 5: Run test to verify GREEN**

Run: `npm test -- src/features/timelogs/services/timelog-supabase-policy.test.ts`

Expected: PASS.

### Task 3: Service And Save Transitions

**Files:**
- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Test: `src/features/timelogs/services/timelogs.service.test.ts`
- Modify: `src/components/modals/MobileTimelogEditModal.tsx`
- Modify: `src/components/modals/TimelogEditModal.tsx`
- Test: `src/components/modals/MobileTimelogEditModal.test.tsx`

- [x] **Step 1: Write failing tests for CH correction and Crew confirmation**

Cover:

```ts
// CH saving changed pending_ch data persists status pending_crew_confirmation.
// Crew submitting pending_crew_confirmation persists status pending_ch.
```

- [x] **Step 2: Run tests to verify RED**

Run: `npm test -- src/features/timelogs/services/timelogs.service.test.ts src/components/modals/MobileTimelogEditModal.test.tsx`

Expected: FAIL because the modal/service do not yet use the new status.

- [x] **Step 3: Implement transitions**

When role is `crewhead`, the edited timelog status is `pending_ch`, and data/report values changed, save with `pending_crew_confirmation`. When role is `crew` and status is `pending_crew_confirmation`, the submit action sends `pending_ch`.

- [x] **Step 4: Run tests to verify GREEN**

Run: `npm test -- src/features/timelogs/services/timelogs.service.test.ts src/components/modals/MobileTimelogEditModal.test.tsx`

Expected: PASS.

### Task 4: Approval UI

**Files:**
- Modify: `src/views/EventDetailView.tsx`
- Test: `src/views/EventDetailView.test.tsx`
- Modify: `src/views/TimelogsView.tsx`
- Test: `src/views/TimelogsView.test.tsx`

- [x] **Step 1: Write failing UI tests**

Cover:

```ts
// CH approval modal shows pending_crew_confirmation as waiting for Crew, without Schválit.
// Crew timelog list shows pending_crew_confirmation with action "Potvrdit úpravy a odeslat CH".
// COO approval scope excludes pending_crew_confirmation.
```

- [x] **Step 2: Run tests to verify RED**

Run: `npm test -- src/views/EventDetailView.test.tsx src/views/TimelogsView.test.tsx`

Expected: FAIL because the new state is not rendered correctly.

- [x] **Step 3: Implement UI rules**

Update filters, counts, badges, helper copy, approval buttons, and crew submit labels while keeping COO clean.

- [x] **Step 4: Run tests to verify GREEN**

Run: `npm test -- src/views/EventDetailView.test.tsx src/views/TimelogsView.test.tsx`

Expected: PASS.

### Task 5: Verification And Native Sync

**Files:**
- Verify only unless generated native assets change.

- [x] **Step 1: Run targeted test suite**

Run:

```bash
npm test -- src/features/timelogs/services/timelog-permissions.test.ts src/features/timelogs/services/timelog-supabase-policy.test.ts src/features/timelogs/services/timelogs.service.test.ts src/components/modals/MobileTimelogEditModal.test.tsx src/views/EventDetailView.test.tsx src/views/TimelogsView.test.tsx
```

Expected: PASS.

- [x] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [x] **Step 3: Sync Capacitor**

Run: `npm run cap:sync`

Expected: PASS.

- [x] **Step 4: Apply Supabase migrations to linked database if CLI credentials are available**

Run:

```bash
supabase db query --linked -f supabase/migrations/<enum-migration>.sql
supabase db query --linked -f supabase/migrations/<policy-migration>.sql
```

Expected: PASS, or report the exact credential/network blocker.

Applied on 2026-07-29 with `supabase db query --workdir /Users/peetax/Projekty/crewflow --linked ...`; verified `pending_crew_confirmation` enum exists and the current timelog/timelog_days policies are present. Full `npm test -- --reporter=dot` still has unrelated failures in Fleet and Warehouse tests; targeted workflow tests and production build passed.
