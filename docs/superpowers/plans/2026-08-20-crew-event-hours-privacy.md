# Crew Event Hours Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the approved mobile Crew event-detail behavior so a Crew member sees a timelog summary only for themselves, never for other assigned Crew members.

**Architecture:** Keep the existing assigned-Crew list, names, avatars, and manager behavior. Add a render-time role/profile guard around the secondary timelog summary only; do not alter Supabase policies, loaded data, workflow services, or desktop views.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Vite, Capacitor iOS, XcodeBuildMCP.

---

### Task 1: Hide Other Crew Timelog Summaries

**Files:**
- Modify: `src/views/EventDetailView.tsx`
- Test: `src/views/EventDetailView.test.tsx`

- [ ] **Step 1: Write the failing Crew privacy test**

Add a mobile Crew test with two assigned contractors and two submitted timelogs. Resolve each rendered row from the contractor name and assert that the current profile's row contains its hours while the other contractor's row contains neither hours nor `.nodu-mobile-event-crew-meta`:

```tsx
const ownCrewRow = screen.getByText('Petr Heitzer').closest('.nodu-mobile-event-crew-row');
const otherCrewRow = screen.getByText('Jana Nova').closest('.nodu-mobile-event-crew-row');

expect(ownCrewRow).toHaveTextContent('12.0h');
expect(ownCrewRow).toHaveTextContent('Ty');
expect(otherCrewRow).not.toHaveTextContent('6.0h');
expect(otherCrewRow?.querySelector('.nodu-mobile-event-crew-meta')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/views/EventDetailView.test.tsx -t "hides other assigned Crew hours"
```

Expected: FAIL because the other Crew row currently renders `6.0h`.

- [ ] **Step 3: Add the minimal render guard**

Inside the assigned-Crew map, derive whether the row belongs to the current profile and render the summary only for managers or the current Crew member:

```tsx
const isCurrentCrewMember = contractor.profileId === currentProfileId;

{(!isCrewRole || isCurrentCrewMember) && (
  <div className="nodu-mobile-event-crew-meta">{timelogSummary}</div>
)}
{isCurrentCrewMember && <span className="nodu-mobile-event-crew-chip">Ty</span>}
```

Do not change timelog loading, Supabase RLS, manager rows, or other event-detail sections.

- [ ] **Step 4: Run focused and broader tests**

Run:

```bash
npm test -- src/views/EventDetailView.test.tsx src/views/EventDetailView.lifecycle.test.tsx
npx tsc --noEmit
npx eslint src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx
```

Expected: all tests pass; TypeScript and ESLint exit 0.

- [ ] **Step 5: Commit the privacy fix**

```bash
git add src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx
git commit -m "fix: hide other crew hours in event detail"
```

### Task 2: Verify Mobile Visuals and iOS Simulator

**Files:**
- Reference: `docs/superpowers/specs/2026-07-23-mobile-event-detail-design.md`
- Reference worktree: `/Users/peetax/Projekty/crewflow/.worktrees/free-event-map-workflow`
- Current worktree: `/Users/peetax/Projekty/crewflow/.worktrees/mobile-lifecycle-integration`

- [ ] **Step 1: Inspect the current mobile Crew flow**

At the mobile viewport in `http://localhost:8080/app`, verify without mutating application data:

```text
role switch -> Přehled -> Akce -> detail Red Bull 400 -> assigned Crew list -> back navigation
```

Check the approved visual contract: mobile shell, bottom navigation outside detail, hidden global navigation inside detail, event hero/info sections, assigned-Crew names/avatars, floating event actions, and no hours on other Crew rows.

- [ ] **Step 2: Compare against the Mobile app reference**

Compare the current DOM/layout and screenshots with the saved reference worktree and `2026-07-23-mobile-event-detail-design.md`. Record any material visual difference; do not overwrite the dirty reference worktree.

- [ ] **Step 3: Build and synchronize the iOS app**

Run:

```bash
npm run build
npx cap sync ios
```

Expected: both commands exit 0. Review `git status --short` afterwards and do not commit generated changes unless they are required for the fix.

- [ ] **Step 4: Build and launch on the booted simulator**

With XcodeBuildMCP, show session defaults, select `ios/App/App.xcodeproj`, scheme `App`, and the booted simulator, then run `build_run_sim`.

Expected: the build succeeds and `cz.nodu.app` launches.

- [ ] **Step 5: Verify simulator UI**

Use the simulator UI snapshot and screenshot to confirm that the app displays its initial/authenticated screen and accepts basic navigation. If authentication is required, report that boundary without inventing credentials.

- [ ] **Step 6: Run final verification**

Run:

```bash
npm test -- src/views/EventDetailView.test.tsx src/views/EventDetailView.lifecycle.test.tsx
npx tsc --noEmit
npx eslint src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx
npm run build
git diff --check
git status --short
```

Report exact pass/fail counts, simulator/device used, and any unrelated pre-existing worktree changes.
