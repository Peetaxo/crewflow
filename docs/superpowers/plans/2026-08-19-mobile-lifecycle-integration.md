# Mobile Lifecycle Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine the complete mobile user experience from `feature/free-event-map-workflow` with the hardened Supabase lifecycle implementation, then prove the Crew/CH/COO switch and the Red Bull event work in a clean localhost preview.

**Architecture:** `codex/mobile-lifecycle-integration` remains based on `codex/timelog-assignment-lifecycle`; hardened services and migrations are the data source of truth. Mobile behavior is reintroduced in dependency-ordered slices with tests written and observed failing before production changes. The source mobile worktree is read-only reference material, and every linked Supabase check is read-only until a separately reviewed migration is demonstrably necessary.

**Tech Stack:** React 18, TypeScript, Vitest/Testing Library, Supabase JS/Postgres RLS/RPC, MapLibre GL, Capacitor 8, Vite 8, iOS and Android native shells.

---

## File Responsibility Map

- `src/features/crew/services/crew.service.ts`: authenticated Crew hydration and retry/reset boundary.
- `src/app/providers/AuthProvider.tsx`: session and role lifecycle; triggers post-auth and post-role hydration.
- `src/components/layout/AppLayout.tsx`: mobile shell and role switch.
- `src/components/layout/MobileCrewNav.tsx`: role-specific bottom navigation.
- `src/components/layout/MobileSettingsButton.tsx`: mobile settings/profile entry.
- `src/features/events/components/*`: free address lookup and map presentation.
- `src/views/EventsView.tsx`, `src/views/EventDetailView.tsx`: mobile event list/detail and manager/Crew actions.
- `src/components/modals/MobileTimelogEditModal.tsx`, `src/views/TimelogsView.tsx`, `src/views/MyShiftsView.tsx`: mobile timelog workflow.
- `src/features/timelogs/services/*`: pure labels, day matching, review summaries, and any targeted-approval adapter that survives the database contract audit.
- `src/index.css`: mobile shell, map, event, timelog, and safe-area styling.
- `capacitor.config.ts`, `ios/`, `android/`: native wrappers; never hold a committed local live-server URL.
- `supabase/migrations/`: hardened current migrations stay authoritative; the old targeted-approval migration is not copied without a catalog/spec gate.

## Task 1: Establish a Reproducible Baseline and Verify the Linked Read Boundary

**Files:**
- Read: `package.json`
- Read: `supabase/config.toml`
- Read: `src/features/crew/services/crew.service.ts`
- Test: existing focused suites only

- [ ] **Step 1: Install the exact locked dependencies in the integration worktree**

Run:

```bash
npm ci
```

Expected: exit 0 and no tracked file changes.

- [ ] **Step 2: Run the pre-integration focused baseline**

Run:

```bash
npm test -- \
  src/app/providers/AuthProvider.test.tsx \
  src/app/providers/AppDataBootstrap.test.tsx \
  src/features/crew/services/crew.service.test.ts \
  src/components/layout/AppLayout.test.tsx \
  src/components/layout/MobileCrewNav.test.tsx \
  src/features/events/services/events.service.test.ts \
  src/views/EventDetailView.lifecycle.test.tsx \
  src/features/timelogs/services/timelogs.service.test.ts
```

Expected: all current focused tests pass. Do not proceed if a lifecycle test fails.

- [ ] **Step 3: Verify the linked database grants and policies without changing them**

First discover the installed CLI syntax:

```bash
supabase --version
supabase db --help
supabase db query --help
```

Then run the already-linked read-only query:

```sql
select
  has_table_privilege('authenticated', 'public.timelogs', 'select') as authenticated_select,
  has_table_privilege('anon', 'public.timelogs', 'select') as anon_select;

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'timelogs'
order by policyname;
```

Expected: `authenticated_select = true`, `anon_select = false`, and the reviewed role-specific SELECT policies are present. If this expectation is false, stop before client edits and write a separate migration design; do not grant broad access ad hoc.

- [ ] **Step 4: Record the baseline in the task commentary**

Include test totals, CLI version, grant booleans, and policy names. This step creates no file and no commit.

## Task 2: Make Crew Hydration Wait for Authentication and Retry Safely

**Files:**
- Modify: `src/features/crew/services/crew.service.ts`
- Modify: `src/features/crew/services/crew.service.test.ts`
- Modify: `src/app/providers/AuthProvider.tsx`
- Modify: `src/app/providers/AuthProvider.test.tsx`
- Modify: `src/app/providers/AppDataBootstrap.test.tsx`

- [ ] **Step 1: Write failing service tests for pre-session load, post-session retry, and reset races**

Add tests that drive the real exported hydration API. The core assertion shape is:

```ts
it('does not query protected crew data until an authenticated session exists', async () => {
  getSession.mockResolvedValueOnce({ data: { session: null }, error: null });

  ensureSupabaseCrewLoaded();
  await flushPromises();

  expect(from).not.toHaveBeenCalledWith('timelogs');
  expect(updateLocalAppState).not.toHaveBeenCalled();
});

it('retries crew hydration after the authenticated session becomes ready', async () => {
  getSession
    .mockResolvedValueOnce({ data: { session: null }, error: null })
    .mockResolvedValueOnce({ data: { session: authenticatedSession }, error: null });

  ensureSupabaseCrewLoaded();
  await flushPromises();
  ensureSupabaseCrewLoaded();
  await flushPromises();

  expect(from).toHaveBeenCalledWith('timelogs');
  expect(updateLocalAppState).toHaveBeenCalledTimes(1);
});
```

Also add a deferred query test proving `resetSupabaseCrewHydration()` prevents a pre-reset result from committing.

- [ ] **Step 2: Run the new tests and confirm RED**

Run:

```bash
npm test -- src/features/crew/services/crew.service.test.ts src/app/providers/AuthProvider.test.tsx src/app/providers/AppDataBootstrap.test.tsx
```

Expected: the new tests fail because the current loader starts protected queries immediately and has no generation/epoch guard.

- [ ] **Step 3: Implement an authenticated, generation-guarded Crew loader**

Use this contract in `crew.service.ts`:

```ts
let crewHydrationPromise: Promise<boolean> | null = null;
let crewLoaded = false;
let crewHydrationEpoch = 0;

const hydrateCrewFromSupabase = async (epoch: number): Promise<boolean> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) return false;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!sessionData.session?.user || epoch !== crewHydrationEpoch) return false;

  const [profilesResult, timelogsResult] = await Promise.all([
    supabase.from('profiles').select('*').order('last_name').order('first_name'),
    supabase.from('timelogs').select('contractor_id, event_id'),
  ]);

  const firstError = profilesResult.error ?? timelogsResult.error;
  if (firstError) throw new Error(firstError.message);
  if (epoch !== crewHydrationEpoch) return false;

  commitMappedCrewRows(profilesResult.data ?? [], timelogsResult.data ?? []);
  return true;
};

export const resetSupabaseCrewHydration = () => {
  crewHydrationEpoch += 1;
  crewHydrationPromise = null;
  crewLoaded = false;
};
```

`ensureSupabaseCrewLoaded()` sets `crewLoaded` only when the promise resolves `true`. A missing session is not logged as an error and does not mark the loader complete.

- [ ] **Step 4: Refresh Crew after a successful authenticated role change**

After `set_current_user_role` succeeds in `AuthProvider.switchRole`, call:

```ts
resetSupabaseCrewHydration();
getContractors();
```

Do not call this when the RPC fails and the previous role is restored.

- [ ] **Step 5: Run GREEN and broader hydration tests**

Run:

```bash
npm test -- \
  src/features/crew/services/crew.service.test.ts \
  src/app/providers/AuthProvider.test.tsx \
  src/app/providers/AppDataBootstrap.test.tsx \
  src/features/events/services/events.service.test.ts
```

Expected: all tests pass with no unhandled promise warnings.

- [ ] **Step 6: Commit the hydration boundary**

```bash
git add src/features/crew/services/crew.service.ts src/features/crew/services/crew.service.test.ts src/app/providers/AuthProvider.tsx src/app/providers/AuthProvider.test.tsx src/app/providers/AppDataBootstrap.test.tsx
git commit -m "fix: hydrate crew after authentication"
```

## Task 3: Restore the Mobile Role Switch, Management Navigation, and Settings Entry

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/layout/AppLayout.test.tsx`
- Modify: `src/components/layout/MobileCrewNav.tsx`
- Modify: `src/components/layout/MobileCrewNav.test.tsx`
- Create: `src/components/layout/MobileSettingsButton.tsx`
- Create: `src/components/layout/MobileSettingsButton.test.tsx`
- Modify: `src/index.css`
- Modify: `src/index.css.test.ts`

- [ ] **Step 1: Add failing mobile-shell tests**

Port only the behavioral tests from the mobile branch that prove:

```ts
expect(screen.getByRole('button', { name: 'Crew' })).toHaveAttribute('aria-pressed', 'true');
expect(screen.getByRole('button', { name: 'CrewHead' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'COO' })).toBeInTheDocument();
expect(screen.getByTestId('mobile-crew-nav')).toHaveAttribute('data-role', 'crew');
```

Add authenticated mode coverage proving a click calls `switchRole('crewhead')` and never `setRole('crewhead')`. Add management navigation assertions for `dashboard`, `events`, `timelogs`, `projects`, and `crew`.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/components/layout/AppLayout.test.tsx src/components/layout/MobileCrewNav.test.tsx src/components/layout/MobileSettingsButton.test.tsx src/views/uuid-mine-scope-identity.test.tsx
```

Expected: missing role switch, missing settings component, and management nav assertions fail.

- [ ] **Step 3: Implement the role-aware mobile shell**

In `AppLayout.tsx`, use the authenticated role as the pressed state and route real role changes through the RPC:

```tsx
const mobileRoleOptions = ['crew', 'crewhead', 'coo'] as const;
const effectiveRole = authRole ?? role;
const isMobileAppShell = isMobile;
const isMobileEventDetail = isMobileAppShell && currentTab === 'events' && Boolean(selectedEventId);

const handleMobileRoleChange = async (nextRole: Role) => {
  if (nextRole === effectiveRole || (isAuthRequired && isRoleSwitching)) return;
  if (!isAuthRequired) {
    setRole(nextRole);
    return;
  }
  await switchRole(nextRole);
};
```

Render the three accessible buttons in `nodu-mobile-role-switcher`, suppress the desktop sidebar at mobile width for all three roles, and render:

```tsx
{!isMobileEventDetail && <MobileCrewNav badgeCounts={badgeCounts} role={role} />}
```

- [ ] **Step 4: Implement role-specific navigation and mobile settings**

`MobileCrewNav` receives `role: Role`, derives Crew or management item IDs from `getNavItemsForRole(role)`, and exposes `data-role={role}`. `MobileSettingsButton` resolves initials from the stable authenticated profile/contractor identity and opens `settings/menu`.

- [ ] **Step 5: Port only the relevant role-switch, nav, settings, and safe-area CSS blocks**

Use `git show feature/free-event-map-workflow:src/index.css` as read-only reference. Copy the selectors beginning with `.nodu-mobile-role-switcher`, the role button state, the four/five-item mobile navigation grid, and mobile settings avatar. Do not replace the full hardened stylesheet.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm test -- src/components/layout/AppLayout.test.tsx src/components/layout/MobileCrewNav.test.tsx src/components/layout/MobileSettingsButton.test.tsx src/views/uuid-mine-scope-identity.test.tsx src/index.css.test.ts
git add src/components/layout/AppLayout.tsx src/components/layout/AppLayout.test.tsx src/components/layout/MobileCrewNav.tsx src/components/layout/MobileCrewNav.test.tsx src/components/layout/MobileSettingsButton.tsx src/components/layout/MobileSettingsButton.test.tsx src/index.css src/index.css.test.ts
git commit -m "feat: restore mobile role navigation"
```

Expected: all focused tests pass.

## Task 4: Restore Free Event Geocoding and Map Presentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/events/components/EventLocationPickerModal.tsx`
- Create: `src/features/events/components/EventLocationPickerModal.test.tsx`
- Create: `src/features/events/components/EventMapPreview.tsx`
- Create: `src/features/events/components/EventMapPreview.test.tsx`
- Create: `src/features/events/components/event-map-attribution.ts`
- Create: `src/features/events/components/event-map-rendering.ts`
- Create: `src/features/events/components/event-map-style.ts`
- Create: `src/features/events/components/maplibre-version.test.ts`
- Create: `src/features/events/services/event-geocoding.service.ts`
- Create: `src/features/events/services/event-geocoding.service.test.ts`
- Modify: `src/features/events/components/EventAddressField.tsx`
- Modify: `src/features/events/components/EventAddressField.test.tsx`
- Modify: `src/features/events/services/event-location.service.ts`
- Modify: `src/features/events/services/event-location.service.test.ts`
- Modify: `src/index.css`

- [ ] **Step 1: Port the pure tests first and run RED**

Transfer the map/geocoding tests from commits `dd41c2e..ddf22f3` and the current mobile branch. Required behaviors:

```ts
expect(buildGoogleMapsUrl({ lat: 50.0755, lng: 14.4378, address: 'Praha' }))
  .toContain('query=50.0755%2C14.4378');
expect(normalizeGeocodingQuery('  Red Bull Ring  ')).toBe('red bull ring');
expect(MAPLIBRE_VERSION).toBe('5.6.2');
```

Component tests must cover explicit search only, provider failure without blocking manual save, attribution, draggable/manual pin, and text fallback without coordinates.

Run:

```bash
npm test -- \
  src/features/events/services/event-geocoding.service.test.ts \
  src/features/events/services/event-location.service.test.ts \
  src/features/events/components/EventAddressField.test.tsx \
  src/features/events/components/EventLocationPickerModal.test.tsx \
  src/features/events/components/EventMapPreview.test.tsx \
  src/features/events/components/maplibre-version.test.ts
```

Expected: missing modules/components and free-map behavior fail.

- [ ] **Step 2: Add the pinned map dependency**

```bash
npm install --save-exact maplibre-gl@5.6.2
```

Expected: only `package.json` and `package-lock.json` change.

- [ ] **Step 3: Implement the free-map unit**

Port the production modules from the mobile branch only after RED. Keep the public contract:

```ts
export type EventLocationValue = {
  address: string;
  placeId?: string;
  locationLat: number | null;
  locationLng: number | null;
};

export const geocodeEventAddress = async (query: string): Promise<GeocodingCandidate[]>;
export const buildGoogleMapsUrl = (location: EventLocationValue): string;
```

Nominatim requests happen only on explicit action, include required identification headers where browser rules permit, normalize candidates, enforce the existing cooldown/cache, and map provider errors to stable Czech text.

- [ ] **Step 4: Integrate the picker and preview without replacing hardened event writes**

`EventAddressField` emits the current address plus coordinates. `EventEditModal` and event saves continue through the current UUID/CAS `saveEvent` contract. No old `events.service.ts` file is copied.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- \
  src/features/events/services/event-geocoding.service.test.ts \
  src/features/events/services/event-location.service.test.ts \
  src/features/events/components/EventAddressField.test.tsx \
  src/features/events/components/EventLocationPickerModal.test.tsx \
  src/features/events/components/EventMapPreview.test.tsx \
  src/features/events/components/maplibre-version.test.ts \
  src/components/modals/EventEditModal.test.tsx
git add package.json package-lock.json src/features/events/components src/features/events/services/event-geocoding.service.ts src/features/events/services/event-geocoding.service.test.ts src/features/events/services/event-location.service.ts src/features/events/services/event-location.service.test.ts src/index.css
git commit -m "feat: restore free event maps"
```

## Task 5: Restore the Mobile Event List, Detail, and Manager Actions

**Files:**
- Modify: `src/views/EventsView.tsx`
- Modify: `src/views/EventsView.test.tsx`
- Modify: `src/views/EventDetailView.tsx`
- Modify: `src/views/EventDetailView.test.tsx`
- Preserve: `src/views/EventDetailView.lifecycle.test.tsx`
- Preserve: `src/views/EventDetailView.receipt-draft.test.tsx`
- Modify: `src/components/modals/AssignCrewModal.tsx`
- Modify: `src/components/modals/uuid-contractor-modal-identity.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add failing mobile event behavior tests**

Port focused assertions from commits `5382aad..8bf5f49`, not the old service mocks. Cover:

```ts
expect(screen.getByRole('button', { name: 'Evidence práce' })).toBeInTheDocument();
expect(screen.queryByRole('navigation', { name: /Mobilní navigace/ })).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Opravdu požádat o odhlášení?' })).toBeInTheDocument();
```

Also cover mobile Crew/CH/COO list cards, management applicant approval/removal, stable contractor UUID callbacks, swipe-back cleanup, and disabled pending action guards.

- [ ] **Step 2: Run RED**

```bash
npm test -- \
  src/views/EventsView.test.tsx \
  src/views/EventDetailView.test.tsx \
  src/views/EventDetailView.lifecycle.test.tsx \
  src/views/EventDetailView.receipt-draft.test.tsx \
  src/components/modals/uuid-contractor-modal-identity.test.tsx
```

Expected: new mobile presentation tests fail while hardened lifecycle tests remain green.

- [ ] **Step 3: Port presentation branches around the current lifecycle callbacks**

Use existing hardened calls unchanged:

```ts
await assignCrewToEvent(eventSupabaseId, contractorProfileId);
await removeCrewFromEvent(eventSupabaseId, contractorProfileId);
await approveEventWithdrawal(eventSupabaseId, contractorProfileId, applicationSupabaseId);
```

Mobile components may rearrange controls but may not call direct Supabase table mutations. Preserve the current mounted refs, synchronous request locks, global navigation guard, stable UUID resolution, generation checks, and recovery loaders.

- [ ] **Step 4: Port mobile event CSS selectively**

Transfer only selectors used by the integrated JSX. Keep desktop selectors and current modal disabled/focus styling intact.

- [ ] **Step 5: Run GREEN and commit**

```bash
npm test -- \
  src/views/EventsView.test.tsx \
  src/views/EventDetailView.test.tsx \
  src/views/EventDetailView.lifecycle.test.tsx \
  src/views/EventDetailView.receipt-draft.test.tsx \
  src/components/modals/uuid-contractor-modal-identity.test.tsx \
  src/features/events/services/event-assignment-lifecycle.service.test.ts
git add src/views/EventsView.tsx src/views/EventsView.test.tsx src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx src/components/modals/AssignCrewModal.tsx src/components/modals/uuid-contractor-modal-identity.test.tsx src/index.css
git commit -m "feat: restore mobile event workflows"
```

## Task 6: Restore the Mobile Timelog Editor and Review Presentation

**Files:**
- Modify: `src/components/modals/MobileTimelogEditModal.tsx`
- Modify: `src/components/modals/MobileTimelogEditModal.test.tsx`
- Modify: `src/components/modals/TimelogEditModal.tsx`
- Modify: `src/components/modals/TimelogEditModal.test.tsx`
- Modify: `src/features/timelogs/services/timelog-day-ui.ts`
- Modify: `src/features/timelogs/services/timelog-day-ui.test.ts`
- Create: `src/features/timelogs/services/timelog-change-summary.ts`
- Create: `src/features/timelogs/services/timelog-change-summary.test.ts`
- Create: `src/features/timelogs/services/timelog-status-labels.ts`
- Create: `src/features/timelogs/services/timelog-status-labels.test.ts`
- Modify: `src/views/MyShiftsView.tsx`
- Modify: `src/views/TimelogsView.tsx`
- Modify: `src/views/TimelogsView.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add failing pure helper and mobile editor tests**

Port the latest row-ID-first day matching tests from commits `aae3d67..9447daa` and the uncommitted mobile patch. The matching contract is:

```ts
const matchKey = day.supabaseId ?? day.id ?? `${day.date}|${day.from}|${day.to}|${day.type}`;
```

Add tests for preparation phase selection, 15-minute inputs, outside-event dates, optional note, returned-review note, disabled full editor while saving, and exact stable timelog UUID writes.

- [ ] **Step 2: Run RED**

```bash
npm test -- \
  src/features/timelogs/services/timelog-day-ui.test.ts \
  src/features/timelogs/services/timelog-change-summary.test.ts \
  src/features/timelogs/services/timelog-status-labels.test.ts \
  src/components/modals/MobileTimelogEditModal.test.tsx \
  src/components/modals/TimelogEditModal.test.tsx \
  src/views/TimelogsView.test.tsx
```

- [ ] **Step 3: Implement pure mobile presentation helpers**

Port helpers without Supabase access. They accept domain objects and return labels/matches/summaries only. Do not introduce direct REST writes or positional row lookup.

- [ ] **Step 4: Port mobile editor/view JSX around the hardened mutation API**

Every save/status/delete continues through:

```ts
saveTimelog(updatedTimelog);
updateTimelogStatus(timelogId, nextStatus);
updateTimelogStatusesBatch(timelogIds, expectedStatus, nextStatus);
deleteTimelog(timelogId);
```

The service resolves stable UUID/version and coordinates atomic RPCs. UI code must not recreate `.from('timelogs').update(...)` or child `timelog_days` request chains.

- [ ] **Step 5: Run GREEN plus atomic regression suites and commit**

```bash
npm test -- \
  src/features/timelogs/services/timelog-day-ui.test.ts \
  src/features/timelogs/services/timelog-change-summary.test.ts \
  src/features/timelogs/services/timelog-status-labels.test.ts \
  src/components/modals/MobileTimelogEditModal.test.tsx \
  src/components/modals/TimelogEditModal.test.tsx \
  src/views/TimelogsView.test.tsx \
  src/features/timelogs/services/timelogs.service.test.ts \
  src/features/timelogs/services/timelog-mutation-rpc.service.test.ts \
  src/features/uuid-write-flows.integration.test.ts
git add src/components/modals/MobileTimelogEditModal.tsx src/components/modals/MobileTimelogEditModal.test.tsx src/components/modals/TimelogEditModal.tsx src/components/modals/TimelogEditModal.test.tsx src/features/timelogs/services/timelog-day-ui.ts src/features/timelogs/services/timelog-day-ui.test.ts src/features/timelogs/services/timelog-change-summary.ts src/features/timelogs/services/timelog-change-summary.test.ts src/features/timelogs/services/timelog-status-labels.ts src/features/timelogs/services/timelog-status-labels.test.ts src/views/MyShiftsView.tsx src/views/TimelogsView.tsx src/views/TimelogsView.test.tsx src/index.css
git commit -m "feat: restore mobile timelog workflows"
```

## Task 7: Reconcile Targeted Approvals Against the Hardened Database Contract

**Files:**
- Read: `supabase/migrations/20260811114621_targeted_timelog_approvals.sql` from the mobile branch
- Read: `supabase/migrations/20260817074631_timelog_assignment_lifecycle.sql`
- Read: `supabase/verify-timelog_assignment_lifecycle.sql`
- Potentially create only after a separate approved database design: a new Supabase migration generated by `supabase migration new`
- Modify after contract approval: `src/features/timelogs/services/timelogs.service.ts`
- Modify after contract approval: `src/lib/database.types.ts`
- Create after contract approval: `src/features/timelogs/services/timelog-final-approvers.ts`
- Modify: `src/views/ApprovalsView.tsx`

- [ ] **Step 1: Run a read-only catalog comparison**

Query exact production existence, columns, constraints, RLS, ACL, and function signatures for `timelog_approvals` and any targeted-approval RPCs. Compare that result to both migration histories.

- [ ] **Step 2: Choose the deterministic path from evidence**

If the linked database already has the exact hardened targeted-approval contract, restore its tracked migration history and add static/verifier coverage before client code. If it does not exist or conflicts with the lifecycle RPCs, stop this task and write a dedicated targeted-approvals design/spec for user approval. Do not silently omit the feature and do not apply the old migration unchanged.

- [ ] **Step 3: Write RED tests for the catalog-backed contract**

Tests must prove exact approver UUID routing, empty/missing approver denial, exact result sets, no automatic invoicing during targeted approval, and cache refresh through the global lifecycle coordinator.

- [ ] **Step 4: Implement only the approved catalog-backed adapter/UI**

No direct timelog status REST updates are allowed. Any new RPC follows the existing empty-search-path, exact ACL, stable-token, optimistic-version, and verifier conventions.

- [ ] **Step 5: Run the migration/verifier/client matrix and commit**

Expected commit messages are separated by responsibility:

```bash
git commit -m "fix: reconcile targeted approval schema"
git commit -m "feat: restore targeted mobile approvals"
```

This task is an explicit database review gate and may not be combined with Tasks 3–6.

## Task 8: Restore Dashboard Polish, Login Asset, and Native Shells

**Files:**
- Modify: `src/views/DashboardView.tsx`
- Modify: `src/views/DashboardView.test.tsx`
- Modify: `src/views/LoginView.tsx`
- Create: `src/assets/nodu-logo.svg`
- Modify: `src/index.css`
- Modify: `src/index.css.test.ts`
- Create: `capacitor.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `ios/**`
- Create: `android/**`
- Create: `src/nativeAppIconAssets.test.ts`

- [ ] **Step 1: Add/port RED tests for the uncommitted mobile presentation work**

Restore the backed-up tests for the mobile dashboard, timelog-day UI, and bundled login logo before applying their production counterparts. Add a static native asset test that checks bundle identifiers, icon/splash files, and the absence of committed `server.url`.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/views/DashboardView.test.tsx src/index.css.test.ts src/nativeAppIconAssets.test.ts
```

- [ ] **Step 3: Apply the backed-up UI patch selectively**

Use `/Users/peetax/Projekty/crewflow-backups/mobile-app-pre-integration-20260819/uncommitted-tracked.patch` as read-only evidence. Apply only dashboard, login, CSS, and already-reviewed UI hunks. Do not apply the backed-up `events.service.ts` wholesale.

- [ ] **Step 4: Add Capacitor and native projects with reproducible configuration**

```bash
npm install --save-exact @capacitor/core@8.4.2 @capacitor/cli@8.4.2 @capacitor/ios@8.4.2 @capacitor/android@8.4.2
```

`capacitor.config.ts` must contain the stable app ID/name/web directory only:

```ts
const config: CapacitorConfig = {
  appId: 'cz.nodu.app',
  appName: 'nodu',
  webDir: 'dist',
};
```

Live server URLs are injected locally by the existing sync workflow and are never committed.

- [ ] **Step 5: Run web/native static tests and commit**

```bash
npm test -- src/views/DashboardView.test.tsx src/index.css.test.ts src/nativeAppIconAssets.test.ts
npm run build
npx cap sync ios
npx cap sync android
git add src/views/DashboardView.tsx src/views/DashboardView.test.tsx src/views/LoginView.tsx src/assets/nodu-logo.svg src/index.css src/index.css.test.ts src/nativeAppIconAssets.test.ts capacitor.config.ts package.json package-lock.json ios android
git commit -m "feat: restore native mobile application"
```

Before commit, confirm generated native files do not contain the Mac LAN address or a localhost live URL.

## Task 9: Full Verification and Localhost Acceptance

**Files:**
- Modify if needed: focused tests only
- No production deployment files

- [ ] **Step 1: Run the combined feature matrix**

```bash
npm test -- \
  src/app/providers/AuthProvider.test.tsx \
  src/app/providers/AppDataBootstrap.test.tsx \
  src/features/crew/services/crew.service.test.ts \
  src/components/layout/AppLayout.test.tsx \
  src/components/layout/MobileCrewNav.test.tsx \
  src/features/events/services/events.service.test.ts \
  src/views/EventsView.test.tsx \
  src/views/EventDetailView.test.tsx \
  src/views/EventDetailView.lifecycle.test.tsx \
  src/features/timelogs/services/timelogs.service.test.ts \
  src/features/timelogs/services/timelog-mutation-rpc.service.test.ts \
  src/features/receipts/services/receipts.service.test.ts \
  src/features/invoices/services/invoices.service.test.ts \
  src/features/uuid-write-flows.integration.test.ts
```

Expected: all lifecycle and mobile focused tests pass.

- [ ] **Step 2: Run static gates**

```bash
npx tsc --noEmit
npx eslint src/app/providers/AuthProvider.tsx src/features/crew/services/crew.service.ts src/components/layout src/features/events src/features/timelogs src/views/EventsView.tsx src/views/EventDetailView.tsx src/views/TimelogsView.tsx src/views/DashboardView.tsx
npm run build
git diff --check codex/timelog-assignment-lifecycle..HEAD
```

Expected: exit 0. Existing unrelated warning-only output must be called out; no new error is accepted.

- [ ] **Step 3: Run the full suite and classify only known unrelated baseline failures**

```bash
npm test
```

Expected: no failure in a changed or lifecycle/mobile file. If the historical Fleet/Warehouse fixture failures remain, record their exact unchanged count and prove them in isolation; do not claim the full suite is green.

- [ ] **Step 4: Start the integration preview**

Link the existing ignored environment file without reading or printing secrets, then run:

```bash
npm run dev -- --host 0.0.0.0 --port 8080
```

Expected: `http://localhost:8080/app` loads from the integration worktree.

- [ ] **Step 5: Perform the browser acceptance smoke**

At a mobile viewport, verify:

1. Crew, CrewHead, and COO switch buttons are visible.
2. Switching roles calls the authenticated role path and changes mobile navigation.
3. `Red Bull 400` dated `2026-08-15` appears in Events.
4. Browser console contains no `permission denied for table timelogs`.
5. Crew can open the Red Bull detail and its existing draft without creating a duplicate.

This is read-only except for role switching; do not submit, approve, remove, or delete production rows during smoke testing.

- [ ] **Step 6: Final review and handoff**

Run:

```bash
git status --short
git log --oneline codex/timelog-assignment-lifecycle..HEAD
```

Expected: clean worktree and a sequence of focused commits. Report the backup path, branch, test totals, known unrelated baseline failures, and localhost URL. Production deploy remains unperformed.
